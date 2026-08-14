import { createHash } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';

import { AiProviderError, type AiProviderAdapter } from '@/ai/provider';

import { AnswerUnitService } from './answer-unit-service';

const LOCAL_USER_ID = 'local-user';

type EvidenceType = 'DIRECT' | 'PARAPHRASE';
type CoverageStatus = 'COVERED' | 'NOT_COVERED' | 'NOT_EVALUABLE';

type R7ADraft = {
  assets: Array<{
    personalAssetVersionId: string;
    explanation?: string;
    nodeEvidence: Array<{
      personalAssetNodeId: string;
      answerUnitSequence: number;
      evidenceType: EvidenceType;
      explanation?: string;
    }>;
  }>;
  obligationCoverage: Array<{
    questionObligationId: string;
    status: CoverageStatus;
    answerUnitSequence?: number | null;
    explanation?: string;
  }>;
};

type R7AContext = Awaited<ReturnType<R7AUsageService['loadContext']>>;

export type RequestR7AInput = {
  trainingSessionId: string;
  answerId: string;
  userId?: string;
};

export type R7AUsageView = {
  status: string;
  taskId: string | null;
  resultId: string | null;
};

export class R7AUsageValidationError extends Error {
  constructor(
    message: string,
    readonly code: 'SESSION_NOT_FOUND' | 'ANSWER_NOT_AVAILABLE' | 'ANSWER_STATE_INVALID',
  ) {
    super(message);
    this.name = 'R7AUsageValidationError';
  }
}

/**
 * R7A 只生产可回链的调用证据草稿；完整资产调用由本地“至少两个不同节点”规则裁决。
 */
export class R7AUsageService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly provider: AiProviderAdapter,
  ) {}

  async requestForAnswer(input: RequestR7AInput): Promise<R7AUsageView> {
    const userId = input.userId ?? LOCAL_USER_ID;
    await new AnswerUnitService(this.prisma).ensure(input.answerId);
    const context = await this.loadContext(input.trainingSessionId, input.answerId, userId);
    const bundle = context.session.releaseBundleId
      ? await this.prisma.aiReleaseBundle.findUnique({
          where: { id: context.session.releaseBundleId },
          include: { prompts: { where: { role: 'R7A' }, select: { id: true } } },
        })
      : null;

    if (!bundle || bundle.status !== 'ACTIVE' || bundle.prompts.length === 0) {
      return this.recordLocalResult(context, 'UNAVAILABLE', 'R7A_RELEASE_NOT_AVAILABLE');
    }

    const inputFingerprint = fingerprint(context);
    const task = await this.prisma.aiTask.upsert({
      where: {
        role_entityId_entityVersion_releaseBundleId_inputFingerprint: {
          role: 'R7A',
          entityId: context.answer.id,
          entityVersion: context.answer.sequence,
          releaseBundleId: bundle.id,
          inputFingerprint,
        },
      },
      update: {},
      create: {
        trainingSessionId: context.session.id,
        releaseBundleId: bundle.id,
        role: 'R7A',
        entityType: 'TrainingAnswer',
        entityId: context.answer.id,
        entityVersion: context.answer.sequence,
        inputFingerprint,
      },
    });

    if (task.status === 'QUEUED' || task.status === 'RUNNING') {
      return this.process(task.id, context);
    }
    const result = await this.prisma.assetUsageResult.findFirst({
      where: {
        trainingSessionId: context.session.id,
        answerId: context.answer.id,
        isCurrent: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      status: result?.status ?? 'NEEDS_REVIEW',
      taskId: task.id,
      resultId: result?.id ?? null,
    };
  }

  private async process(taskId: string, context: R7AContext): Promise<R7AUsageView> {
    const claimed = await this.prisma.aiTask.updateMany({
      where: { id: taskId, status: 'QUEUED' },
      data: { status: 'RUNNING' },
    });
    if (claimed.count === 0) {
      const result = await this.prisma.assetUsageResult.findFirst({
        where: {
          trainingSessionId: context.session.id,
          answerId: context.answer.id,
          isCurrent: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      return { status: result?.status ?? 'PROCESSING', taskId, resultId: result?.id ?? null };
    }
    const task = await this.prisma.aiTask.findUniqueOrThrow({
      where: { id: taskId },
      include: { releaseBundle: true },
    });
    const attemptNo = (await this.prisma.aiTaskAttempt.count({ where: { aiTaskId: task.id } })) + 1;

    try {
      const response = await this.provider.execute({
        taskId: task.id,
        role: 'R7A',
        releaseBundleVersion: task.releaseBundle.version,
        text: r7aPromptInput(context),
      });
      if (response.kind === 'INSUFFICIENT_TEXT') {
        await this.prisma.aiTaskAttempt.create({
          data: {
            aiTaskId: task.id,
            attemptNo,
            attemptType: 'INITIAL',
            provider: this.provider.name,
            status: 'INSUFFICIENT_TEXT',
            parsedJson: JSON.stringify(response),
          },
        });
        const local = await this.recordLocalResult(context, 'INSUFFICIENT_TEXT', response.detail);
        await this.prisma.aiTask.update({
          where: { id: task.id },
          data: { status: 'NEEDS_REVIEW', resultReference: 'R7A_INSUFFICIENT_TEXT' },
        });
        return { ...local, taskId: task.id };
      }

      const draft = parseDraft(response.draft, context);
      await this.prisma.aiTaskAttempt.create({
        data: {
          aiTaskId: task.id,
          attemptNo,
          attemptType: 'INITIAL',
          provider: this.provider.name,
          status: 'DRAFT_READY',
          parsedJson: JSON.stringify(draft),
        },
      });
      const result = await this.persistDraft(context, draft);
      await this.prisma.aiTask.update({
        where: { id: task.id },
        data: { status: 'AWAITING_USER_CONFIRMATION', resultReference: 'R7A_USAGE_DRAFT' },
      });
      return { status: result.status, taskId: task.id, resultId: result.id };
    } catch (error) {
      const isProviderError = error instanceof AiProviderError;
      await this.prisma.aiTaskAttempt.create({
        data: {
          aiTaskId: task.id,
          attemptNo,
          attemptType: 'INITIAL',
          provider: this.provider.name,
          status: isProviderError ? error.code : 'INVALID_DRAFT',
          rawResponse: isProviderError ? 'R7A Provider 不可用。' : 'R7A 草稿未通过本地证据校验。',
        },
      });
      const status = isProviderError ? 'UNAVAILABLE' : 'NEEDS_REVIEW';
      const reason = isProviderError ? 'R7A_PROVIDER_UNAVAILABLE' : 'R7A_INVALID_DRAFT';
      const local = await this.recordLocalResult(context, status, reason);
      await this.prisma.aiTask.update({
        where: { id: task.id },
        data: {
          status: isProviderError ? 'FAILED_RETRYABLE' : 'NEEDS_REVIEW',
          resultReference: reason,
        },
      });
      return { ...local, taskId: task.id };
    }
  }

  private async persistDraft(context: R7AContext, draft: R7ADraft) {
    const draftByAsset = new Map(
      draft.assets.map((asset) => [asset.personalAssetVersionId, asset]),
    );
    const coverageByObligation = new Map(
      draft.obligationCoverage.map((coverage) => [coverage.questionObligationId, coverage]),
    );
    const resultStatus = [...draftByAsset.values()].some(
      (asset) =>
        new Set(asset.nodeEvidence.map((evidence) => evidence.personalAssetNodeId)).size >= 2,
    )
      ? 'DRAFT_READY'
      : 'PARTIAL';

    return this.prisma.$transaction(async (transaction) => {
      await transaction.assetUsageResult.updateMany({
        where: {
          trainingSessionId: context.session.id,
          answerId: context.answer.id,
          isCurrent: true,
        },
        data: { isCurrent: false },
      });
      return transaction.assetUsageResult.create({
        data: {
          trainingSessionId: context.session.id,
          answerId: context.answer.id,
          status: resultStatus,
          resultJson: JSON.stringify({ ruleVersion: 'r7a-usage-evidence-v1', source: 'AI_DRAFT' }),
          assessments: {
            create: context.assets.map((asset) => {
              const assessment = draftByAsset.get(asset.id);
              const evidence = assessment?.nodeEvidence ?? [];
              const distinctNodes = new Set(evidence.map((item) => item.personalAssetNodeId));
              return {
                personalAssetVersionId: asset.id,
                status:
                  distinctNodes.size >= 2 ? 'COMPLETE_INVOCATION_DRAFT' : 'PARTIAL_EVIDENCE_DRAFT',
                isCompleteInvocation: distinctNodes.size >= 2,
                explanation: assessment?.explanation?.trim() || null,
                nodeEvidence: {
                  create: evidence.map((item) => ({
                    personalAssetNodeId: item.personalAssetNodeId,
                    answerUnitId: context.unitsBySequence.get(item.answerUnitSequence)!.id,
                    evidenceType: item.evidenceType,
                    explanation: item.explanation?.trim() || null,
                  })),
                },
              };
            }),
          },
          obligationCoverage: {
            create: context.obligations.map((obligation) => {
              const coverage = coverageByObligation.get(obligation.id);
              return {
                questionObligationId: obligation.id,
                answerUnitId:
                  coverage?.status === 'COVERED' && coverage.answerUnitSequence
                    ? context.unitsBySequence.get(coverage.answerUnitSequence)!.id
                    : null,
                status: coverage?.status ?? 'NOT_EVALUABLE',
                explanation: coverage?.explanation?.trim() || null,
              };
            }),
          },
        },
      });
    });
  }

  private async recordLocalResult(context: R7AContext, status: string, reason: string) {
    const existing = await this.prisma.assetUsageResult.findFirst({
      where: {
        trainingSessionId: context.session.id,
        answerId: context.answer.id,
        isCurrent: true,
        status,
        resultJson: JSON.stringify({ ruleVersion: 'r7a-usage-evidence-v1', reason }),
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return { status: existing.status, taskId: null, resultId: existing.id };

    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.assetUsageResult.updateMany({
        where: {
          trainingSessionId: context.session.id,
          answerId: context.answer.id,
          isCurrent: true,
        },
        data: { isCurrent: false },
      });
      return transaction.assetUsageResult.create({
        data: {
          trainingSessionId: context.session.id,
          answerId: context.answer.id,
          status,
          resultJson: JSON.stringify({ ruleVersion: 'r7a-usage-evidence-v1', reason }),
          assessments: {
            create: context.assets.map((asset) => ({
              personalAssetVersionId: asset.id,
              status: 'NOT_EVALUABLE',
              isCompleteInvocation: false,
              explanation: reason,
            })),
          },
          obligationCoverage: {
            create: context.obligations.map((obligation) => ({
              questionObligationId: obligation.id,
              status: 'NOT_EVALUABLE',
              explanation: reason,
            })),
          },
        },
      });
    });
    return { status: result.status, taskId: null, resultId: result.id };
  }

  private async loadContext(trainingSessionId: string, answerId: string, userId: string) {
    const session = await this.prisma.trainingSession.findFirst({
      where: { id: trainingSessionId, userId },
      include: {
        questionPlan: { include: { assets: true, obligations: { orderBy: { sequence: 'asc' } } } },
      },
    });
    if (!session) throw new R7AUsageValidationError('问题回答会话不存在。', 'SESSION_NOT_FOUND');
    const answer = await this.prisma.trainingAnswer.findFirst({
      where: {
        id: answerId,
        trainingSessionId: session.id,
        answerType: { in: ['FIRST_ANSWER', 'FOLLOW_UP_ANSWER', 'SECOND_ANSWER'] },
      },
      include: { units: { orderBy: { sequence: 'asc' } } },
    });
    if (!answer || !answer.text.trim() || answer.units.length === 0) {
      throw new R7AUsageValidationError('回答尚未保存为可分析文字单元。', 'ANSWER_NOT_AVAILABLE');
    }
    const assets = await this.prisma.personalAssetVersion.findMany({
      where: {
        id: { in: session.questionPlan.assets.map((asset) => asset.personalAssetVersionId) },
        status: 'CONFIRMED',
        personalAsset: { userId },
      },
      include: { nodes: { orderBy: { sequence: 'asc' } } },
    });
    if (assets.length !== session.questionPlan.assets.length) {
      throw new R7AUsageValidationError('冻结资产快照不可用于 R7A。', 'ANSWER_STATE_INVALID');
    }
    return {
      session,
      answer,
      assets,
      obligations: session.questionPlan.obligations,
      unitsBySequence: new Map(answer.units.map((unit) => [unit.sequence, unit])),
      nodesByAsset: new Map(
        assets.map((asset) => [asset.id, new Set(asset.nodes.map((node) => node.id))]),
      ),
    };
  }
}

function parseDraft(value: string, context: R7AContext): R7ADraft {
  const parsed = JSON.parse(value) as { assets?: unknown; obligationCoverage?: unknown };
  if (!Array.isArray(parsed.assets) || !Array.isArray(parsed.obligationCoverage)) {
    throw new Error('R7A 草稿缺少资产或义务列表。');
  }
  const assetIds = new Set<string>();
  const assets = parsed.assets.map((item) => {
    const asset = item as {
      personalAssetVersionId?: unknown;
      explanation?: unknown;
      nodeEvidence?: unknown;
    };
    if (
      typeof asset.personalAssetVersionId !== 'string' ||
      !context.nodesByAsset.has(asset.personalAssetVersionId) ||
      assetIds.has(asset.personalAssetVersionId) ||
      !Array.isArray(asset.nodeEvidence)
    ) {
      throw new Error('R7A 草稿引用了无效资产。');
    }
    const assetVersionId = asset.personalAssetVersionId;
    assetIds.add(assetVersionId);
    const evidenceKeys = new Set<string>();
    const nodeEvidence: R7ADraft['assets'][number]['nodeEvidence'] = asset.nodeEvidence.map(
      (entry) => {
        const evidence = entry as {
          personalAssetNodeId?: unknown;
          answerUnitSequence?: unknown;
          evidenceType?: unknown;
          explanation?: unknown;
        };
        const nodeId = evidence.personalAssetNodeId;
        const unitSequence = evidence.answerUnitSequence;
        const evidenceType = evidence.evidenceType;
        if (
          typeof nodeId !== 'string' ||
          !context.nodesByAsset.get(assetVersionId)!.has(nodeId) ||
          typeof unitSequence !== 'number' ||
          !context.unitsBySequence.has(unitSequence) ||
          (evidenceType !== 'DIRECT' && evidenceType !== 'PARAPHRASE')
        ) {
          throw new Error('R7A 节点证据无法回链。');
        }
        const key = `${nodeId}:${unitSequence}`;
        if (evidenceKeys.has(key)) throw new Error('R7A 草稿包含重复节点证据。');
        evidenceKeys.add(key);
        return {
          personalAssetNodeId: nodeId,
          answerUnitSequence: unitSequence,
          evidenceType: evidenceType as EvidenceType,
          explanation: typeof evidence.explanation === 'string' ? evidence.explanation : undefined,
        };
      },
    );
    return {
      personalAssetVersionId: assetVersionId,
      explanation: typeof asset.explanation === 'string' ? asset.explanation : undefined,
      nodeEvidence,
    };
  });

  const obligationIds = new Set<string>();
  const obligationCoverage = parsed.obligationCoverage.map((item) => {
    const coverage = item as {
      questionObligationId?: unknown;
      status?: unknown;
      answerUnitSequence?: unknown;
      explanation?: unknown;
    };
    const covered = coverage.status === 'COVERED';
    if (
      typeof coverage.questionObligationId !== 'string' ||
      !context.obligations.some((obligation) => obligation.id === coverage.questionObligationId) ||
      obligationIds.has(coverage.questionObligationId) ||
      (coverage.status !== 'COVERED' &&
        coverage.status !== 'NOT_COVERED' &&
        coverage.status !== 'NOT_EVALUABLE') ||
      (covered &&
        (typeof coverage.answerUnitSequence !== 'number' ||
          !context.unitsBySequence.has(coverage.answerUnitSequence)))
    ) {
      throw new Error('R7A 义务覆盖无法回链。');
    }
    obligationIds.add(coverage.questionObligationId);
    return {
      questionObligationId: coverage.questionObligationId,
      status: coverage.status as CoverageStatus,
      answerUnitSequence: covered ? (coverage.answerUnitSequence as number) : null,
      explanation: typeof coverage.explanation === 'string' ? coverage.explanation : undefined,
    };
  });
  return { assets, obligationCoverage };
}

function fingerprint(context: R7AContext) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        sessionId: context.session.id,
        answerId: context.answer.id,
        answerHash: context.answer.normalizedHash,
        units: [...context.unitsBySequence.values()].map((unit) => [
          unit.sequence,
          unit.startOffset,
          unit.endOffset,
          unit.text,
        ]),
        assets: context.assets.map((asset) => [asset.id, asset.nodes.map((node) => node.id)]),
        obligations: context.obligations.map((obligation) => obligation.id),
      }),
    )
    .digest('hex');
}

function r7aPromptInput(context: R7AContext) {
  return [
    'Return JSON only: {"assets":[{"personalAssetVersionId":"","nodeEvidence":[{"personalAssetNodeId":"","answerUnitSequence":1,"evidenceType":"DIRECT|PARAPHRASE"}]}],"obligationCoverage":[{"questionObligationId":"","status":"COVERED|NOT_COVERED|NOT_EVALUABLE","answerUnitSequence":1}]}.',
    'Identify evidence only. Do not score, calculate a total, infer oral performance, update user state, invent assets, or use IDs not supplied.',
    'A single word, phrase, or one node is only partial evidence and never a complete asset invocation.',
    `Saved answer: ${context.answer.text}`,
    'Answer units:',
    ...[...context.unitsBySequence.values()].map((unit) =>
      JSON.stringify({ sequence: unit.sequence, text: unit.text }),
    ),
    'Frozen assets and nodes:',
    ...context.assets.map((asset) =>
      JSON.stringify({
        personalAssetVersionId: asset.id,
        triggerName: asset.triggerName,
        nodes: asset.nodes.map((node) => ({ id: node.id, text: node.text })),
      }),
    ),
    'Frozen obligations:',
    ...context.obligations.map((obligation) =>
      JSON.stringify({ id: obligation.id, description: obligation.description }),
    ),
  ].join('\n');
}
