import { createHash } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';

import { AiProviderError, type AiProviderAdapter } from '@/ai/provider';

import { AnswerUnitService } from './answer-unit-service';

const LOCAL_USER_ID = 'local-user';

export const R7B_DIMENSIONS = [
  { id: 'ASSET_USAGE', label: '资产调用', weight: 25, source: 'R7A_LOCAL' },
  { id: 'OBLIGATION_COVERAGE', label: '问题义务覆盖', weight: 20, source: 'R7A_LOCAL' },
  { id: 'QUESTION_RELEVANCE', label: '问题相关性', weight: 15, source: 'R7B_DRAFT' },
  { id: 'LOGICAL_COHERENCE', label: '逻辑连贯性', weight: 15, source: 'R7B_DRAFT' },
  { id: 'TEXT_CLARITY', label: '文字表达清晰度', weight: 15, source: 'R7B_DRAFT' },
  { id: 'SUPPORTING_DETAIL', label: '支撑细节充分度', weight: 10, source: 'R7B_DRAFT' },
] as const;

type DimensionId = (typeof R7B_DIMENSIONS)[number]['id'];
type ModelDimensionId = Exclude<DimensionId, 'ASSET_USAGE' | 'OBLIGATION_COVERAGE'>;
type RatingStatus = 'VALID' | 'PARTIAL' | 'NOT_EVALUABLE';
type EvidenceType = 'ANSWER_UNIT' | 'QUESTION_OBLIGATION' | 'PERSONAL_ASSET_NODE' | 'RULE';

type EvidenceReference = {
  type: EvidenceType;
  referenceId: string;
  explanation?: string;
};

type R7BDraft = {
  dimensions: Array<{
    dimension: ModelDimensionId;
    rating: number;
    evidence: EvidenceReference[];
  }>;
  issues: Array<{
    dimension: ModelDimensionId;
    issueCode: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    explanation: string;
    evidence: EvidenceReference[];
  }>;
  recommendations: Array<{
    dimension: ModelDimensionId;
    issueIndex?: number | null;
    text: string;
    evidence: EvidenceReference[];
  }>;
  corrections: Array<{
    dimension: ModelDimensionId;
    recommendationIndex?: number | null;
    answerUnitSequence: number;
    replacementText: string;
    explanation: string;
    evidence: EvidenceReference[];
  }>;
};

type RatingDraft = {
  dimension: DimensionId;
  rating: number | null;
  status: RatingStatus;
  source: string;
  evidence: EvidenceReference[];
};

type R7BContext = Awaited<ReturnType<R7BEvaluationService['loadContext']>>;

export type RequestR7BInput = {
  trainingSessionId: string;
  answerId: string;
  userId?: string;
};

export type R7BEvaluationView = {
  status: string;
  taskId: string | null;
  resultId: string | null;
  totalScore: number | null;
};

export class R7BEvaluationValidationError extends Error {
  constructor(
    message: string,
    readonly code: 'SESSION_NOT_FOUND' | 'ANSWER_NOT_AVAILABLE' | 'ANSWER_STATE_INVALID',
  ) {
    super(message);
    this.name = 'R7BEvaluationValidationError';
  }
}

/**
 * R7B 只保存可定位的评价草稿。本地锁定 R7A 两项事实，并独立裁决是否可写总分。
 */
export class R7BEvaluationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly provider: AiProviderAdapter,
  ) {}

  async requestForAnswer(input: RequestR7BInput): Promise<R7BEvaluationView> {
    const userId = input.userId ?? LOCAL_USER_ID;
    await new AnswerUnitService(this.prisma).ensure(input.answerId);
    const context = await this.loadContext(input.trainingSessionId, input.answerId, userId);
    const bundle = context.session.releaseBundleId
      ? await this.prisma.aiReleaseBundle.findUnique({
          where: { id: context.session.releaseBundleId },
          include: { prompts: { where: { role: 'R7B' }, select: { id: true } } },
        })
      : null;

    if (!bundle || bundle.status !== 'ACTIVE' || bundle.prompts.length === 0) {
      return this.recordFallback(context, 'UNAVAILABLE', 'R7B_RELEASE_NOT_AVAILABLE');
    }
    if (!context.usageResult) {
      return this.recordFallback(context, 'UNAVAILABLE', 'R7A_RESULT_NOT_AVAILABLE');
    }

    const inputFingerprint = fingerprint(context);
    const task = await this.prisma.aiTask.upsert({
      where: {
        role_entityId_entityVersion_releaseBundleId_inputFingerprint: {
          role: 'R7B',
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
        role: 'R7B',
        entityType: 'TrainingAnswer',
        entityId: context.answer.id,
        entityVersion: context.answer.sequence,
        inputFingerprint,
      },
    });

    if (task.status === 'QUEUED' || task.status === 'RUNNING')
      return this.process(task.id, context);
    return this.currentResult(context, task.id);
  }

  private async process(taskId: string, context: R7BContext): Promise<R7BEvaluationView> {
    const claimed = await this.prisma.aiTask.updateMany({
      where: { id: taskId, status: 'QUEUED' },
      data: { status: 'RUNNING' },
    });
    if (claimed.count === 0) return this.currentResult(context, taskId, 'PROCESSING');

    const task = await this.prisma.aiTask.findUniqueOrThrow({
      where: { id: taskId },
      include: { releaseBundle: true },
    });
    const attemptNo = (await this.prisma.aiTaskAttempt.count({ where: { aiTaskId: task.id } })) + 1;
    let attemptRecorded = false;

    try {
      const response = await this.provider.execute({
        taskId: task.id,
        role: 'R7B',
        releaseBundleVersion: task.releaseBundle.version,
        text: r7bPromptInput(context),
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
        attemptRecorded = true;
        const local = await this.recordFallback(context, 'INSUFFICIENT_TEXT', response.detail);
        await this.prisma.aiTask.update({
          where: { id: task.id },
          data: { status: 'NEEDS_REVIEW', resultReference: 'R7B_INSUFFICIENT_TEXT' },
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
      attemptRecorded = true;
      const result = await this.persistDraft(context, draft);
      await this.prisma.aiTask.update({
        where: { id: task.id },
        data: { status: 'AWAITING_USER_CONFIRMATION', resultReference: 'R7B_EVALUATION_DRAFT' },
      });
      return {
        status: result.status,
        taskId: task.id,
        resultId: result.id,
        totalScore: result.totalScore,
      };
    } catch (error) {
      const isProviderError = error instanceof AiProviderError;
      if (!attemptRecorded) {
        await this.prisma.aiTaskAttempt.create({
          data: {
            aiTaskId: task.id,
            attemptNo,
            attemptType: 'INITIAL',
            provider: this.provider.name,
            status: isProviderError ? error.code : 'INVALID_DRAFT',
            rawResponse: isProviderError
              ? 'R7B Provider 不可用。'
              : 'R7B 草稿未通过本地评分与证据校验。',
          },
        });
      }
      const status = isProviderError ? 'UNAVAILABLE' : 'NEEDS_REVIEW';
      const reason = isProviderError ? 'R7B_PROVIDER_UNAVAILABLE' : 'R7B_INVALID_DRAFT';
      const local = await this.recordFallback(context, status, reason);
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

  private async persistDraft(context: R7BContext, draft: R7BDraft) {
    const ratings = [...localRatings(context), ...draft.dimensions.map(toModelRating)];
    const totalScore = calculateTotalScore(ratings);
    const status = totalScore === null ? 'PARTIAL' : 'DRAFT_READY';
    return this.prisma.$transaction(async (transaction) => {
      await transaction.answerEvaluationResult.updateMany({
        where: {
          trainingSessionId: context.session.id,
          answerId: context.answer.id,
          isCurrent: true,
        },
        data: { isCurrent: false },
      });
      const result = await transaction.answerEvaluationResult.create({
        data: {
          trainingSessionId: context.session.id,
          answerId: context.answer.id,
          status,
          totalScore,
          resultJson: JSON.stringify({
            ruleVersion: 'r7b-six-dimension-v1',
            source: 'LOCAL_R7A_AND_AI_DRAFT',
            usageResultId: context.usageResult?.id ?? null,
          }),
          ratings: {
            create: ratings.map((rating) => ({
              dimension: rating.dimension,
              rating: rating.rating,
              status: rating.status,
              source: rating.source,
              evidenceJson: JSON.stringify(rating.evidence),
            })),
          },
        },
      });
      const issues = await Promise.all(
        draft.issues.map((issue) =>
          transaction.evaluationIssue.create({
            data: {
              answerEvaluationResultId: result.id,
              dimension: issue.dimension,
              issueCode: issue.issueCode,
              severity: issue.severity,
              explanation: issue.explanation,
              evidenceJson: JSON.stringify(issue.evidence),
            },
          }),
        ),
      );
      const recommendations = await Promise.all(
        draft.recommendations.map((recommendation) =>
          transaction.recommendation.create({
            data: {
              answerEvaluationResultId: result.id,
              evaluationIssueId:
                recommendation.issueIndex === null || recommendation.issueIndex === undefined
                  ? null
                  : issues[recommendation.issueIndex]!.id,
              dimension: recommendation.dimension,
              text: recommendation.text,
              evidenceJson: JSON.stringify(recommendation.evidence),
            },
          }),
        ),
      );
      await Promise.all(
        draft.corrections.map((correction) =>
          transaction.correction.create({
            data: {
              answerEvaluationResultId: result.id,
              recommendationId:
                correction.recommendationIndex === null ||
                correction.recommendationIndex === undefined
                  ? null
                  : recommendations[correction.recommendationIndex]!.id,
              dimension: correction.dimension,
              answerUnitId: context.unitsBySequence.get(correction.answerUnitSequence)!.id,
              replacementText: correction.replacementText,
              explanation: correction.explanation,
              evidenceJson: JSON.stringify(correction.evidence),
            },
          }),
        ),
      );
      return result;
    });
  }

  private async recordFallback(context: R7BContext, status: string, reason: string) {
    const resultJson = JSON.stringify({ ruleVersion: 'r7b-six-dimension-v1', reason });
    const existing = await this.prisma.answerEvaluationResult.findFirst({
      where: {
        trainingSessionId: context.session.id,
        answerId: context.answer.id,
        isCurrent: true,
        status,
        resultJson,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      return {
        status: existing.status,
        taskId: null,
        resultId: existing.id,
        totalScore: existing.totalScore,
      };
    }

    const local = localRatings(context);
    const ratings: RatingDraft[] = [
      ...local,
      ...modelDimensions.map((dimension) => ({
        dimension,
        rating: null,
        status: 'NOT_EVALUABLE' as const,
        source: 'R7B_UNAVAILABLE',
        evidence: [{ type: 'RULE' as const, referenceId: reason }],
      })),
    ];
    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.answerEvaluationResult.updateMany({
        where: {
          trainingSessionId: context.session.id,
          answerId: context.answer.id,
          isCurrent: true,
        },
        data: { isCurrent: false },
      });
      return transaction.answerEvaluationResult.create({
        data: {
          trainingSessionId: context.session.id,
          answerId: context.answer.id,
          status,
          resultJson,
          ratings: {
            create: ratings.map((rating) => ({
              dimension: rating.dimension,
              rating: rating.rating,
              status: rating.status,
              source: rating.source,
              evidenceJson: JSON.stringify(rating.evidence),
            })),
          },
        },
      });
    });
    return {
      status: result.status,
      taskId: null,
      resultId: result.id,
      totalScore: result.totalScore,
    };
  }

  private async currentResult(context: R7BContext, taskId: string | null, fallbackStatus?: string) {
    const result = await this.prisma.answerEvaluationResult.findFirst({
      where: {
        trainingSessionId: context.session.id,
        answerId: context.answer.id,
        isCurrent: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      status: result?.status ?? fallbackStatus ?? 'NEEDS_REVIEW',
      taskId,
      resultId: result?.id ?? null,
      totalScore: result?.totalScore ?? null,
    };
  }

  private async loadContext(trainingSessionId: string, answerId: string, userId: string) {
    const session = await this.prisma.trainingSession.findFirst({
      where: { id: trainingSessionId, userId },
      include: {
        questionPlan: {
          include: { assets: true, obligations: { orderBy: { sequence: 'asc' } } },
        },
      },
    });
    if (!session)
      throw new R7BEvaluationValidationError('问题回答会话不存在。', 'SESSION_NOT_FOUND');
    const answer = await this.prisma.trainingAnswer.findFirst({
      where: {
        id: answerId,
        trainingSessionId: session.id,
        answerType: { in: ['FIRST_ANSWER', 'FOLLOW_UP_ANSWER', 'SECOND_ANSWER'] },
      },
      include: { units: { orderBy: { sequence: 'asc' } } },
    });
    if (!answer || !answer.text.trim() || answer.units.length === 0) {
      throw new R7BEvaluationValidationError(
        '回答尚未保存为可评价文字单元。',
        'ANSWER_NOT_AVAILABLE',
      );
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
      throw new R7BEvaluationValidationError('冻结资产快照不可用于 R7B。', 'ANSWER_STATE_INVALID');
    }
    const usageResult = await this.prisma.assetUsageResult.findFirst({
      where: { trainingSessionId: session.id, answerId: answer.id, isCurrent: true },
      include: { assessments: true, obligationCoverage: true },
      orderBy: { createdAt: 'desc' },
    });
    return {
      session,
      answer,
      assets,
      obligations: session.questionPlan.obligations,
      usageResult,
      unitsBySequence: new Map(answer.units.map((unit) => [unit.sequence, unit])),
      nodesById: new Set(assets.flatMap((asset) => asset.nodes.map((node) => node.id))),
    };
  }
}

const modelDimensions: ModelDimensionId[] = [
  'QUESTION_RELEVANCE',
  'LOGICAL_COHERENCE',
  'TEXT_CLARITY',
  'SUPPORTING_DETAIL',
];

const allowedRuleCodes = new Set(['R7B_TEXT_ONLY', 'R7B_NO_HINT_SCORING', 'R7B_R7A_LOCKED']);

function localRatings(context: R7BContext): RatingDraft[] {
  const usage = context.usageResult;
  if (!usage) {
    return [
      unavailableLocalRating('ASSET_USAGE', 'R7A_RESULT_NOT_AVAILABLE'),
      unavailableLocalRating('OBLIGATION_COVERAGE', 'R7A_RESULT_NOT_AVAILABLE'),
    ];
  }

  const completeAssets = usage.assessments.filter((assessment) => assessment.isCompleteInvocation);
  const assetUsageValid = usage.status === 'DRAFT_READY' && context.assets.length > 0;
  const assetRating: RatingDraft = assetUsageValid
    ? {
        dimension: 'ASSET_USAGE',
        rating: Math.round((completeAssets.length / context.assets.length) * 100),
        status: 'VALID',
        source: 'R7A_LOCAL',
        evidence: [
          {
            type: 'RULE',
            referenceId: 'R7A_COMPLETE_INVOCATION',
            explanation: `完整调用资产 ${completeAssets.length}/${context.assets.length}`,
          },
        ],
      }
    : {
        dimension: 'ASSET_USAGE',
        rating: null,
        status: usage.status === 'PARTIAL' ? 'PARTIAL' : 'NOT_EVALUABLE',
        source: 'R7A_LOCAL',
        evidence: [{ type: 'RULE', referenceId: `R7A_${usage.status}` }],
      };

  const coverage = usage.obligationCoverage;
  const coverageValid =
    coverage.length === context.obligations.length &&
    coverage.length > 0 &&
    coverage.every((item) => item.status !== 'NOT_EVALUABLE');
  const coveredCount = coverage.filter((item) => item.status === 'COVERED').length;
  const coverageRating: RatingDraft = coverageValid
    ? {
        dimension: 'OBLIGATION_COVERAGE',
        rating: Math.round((coveredCount / context.obligations.length) * 100),
        status: 'VALID',
        source: 'R7A_LOCAL',
        evidence: [
          {
            type: 'RULE',
            referenceId: 'R7A_OBLIGATION_COVERAGE',
            explanation: `已覆盖义务 ${coveredCount}/${context.obligations.length}`,
          },
        ],
      }
    : {
        dimension: 'OBLIGATION_COVERAGE',
        rating: null,
        status: coverage.some((item) => item.status === 'COVERED' || item.status === 'NOT_COVERED')
          ? 'PARTIAL'
          : 'NOT_EVALUABLE',
        source: 'R7A_LOCAL',
        evidence: [{ type: 'RULE', referenceId: `R7A_${usage.status}` }],
      };
  return [assetRating, coverageRating];
}

function unavailableLocalRating(dimension: 'ASSET_USAGE' | 'OBLIGATION_COVERAGE', reason: string) {
  return {
    dimension,
    rating: null,
    status: 'NOT_EVALUABLE' as const,
    source: 'R7A_LOCAL',
    evidence: [{ type: 'RULE' as const, referenceId: reason }],
  };
}

export function calculateTotalScore(ratings: RatingDraft[]) {
  if (
    ratings.length !== R7B_DIMENSIONS.length ||
    ratings.some((rating) => rating.status !== 'VALID' || rating.rating === null)
  ) {
    return null;
  }
  const weightByDimension = new Map(
    R7B_DIMENSIONS.map((dimension) => [dimension.id, dimension.weight]),
  );
  return Math.round(
    ratings.reduce(
      (total, rating) => total + (rating.rating! * weightByDimension.get(rating.dimension)!) / 100,
      0,
    ),
  );
}

function toModelRating(dimension: R7BDraft['dimensions'][number]): RatingDraft {
  return {
    dimension: dimension.dimension,
    rating: dimension.rating,
    status: 'VALID',
    source: 'R7B_DRAFT',
    evidence: dimension.evidence,
  };
}

function parseDraft(value: string, context: R7BContext): R7BDraft {
  const parsed = JSON.parse(value) as {
    dimensions?: unknown;
    issues?: unknown;
    recommendations?: unknown;
    corrections?: unknown;
  };
  if (
    !Array.isArray(parsed.dimensions) ||
    !Array.isArray(parsed.issues) ||
    !Array.isArray(parsed.recommendations) ||
    !Array.isArray(parsed.corrections)
  ) {
    throw new Error('R7B 草稿结构不完整。');
  }

  const dimensions = parseDimensions(parsed.dimensions, context);
  const issues = parsed.issues.map((item) => parseIssue(item, context));
  const recommendations = parsed.recommendations.map((item) =>
    parseRecommendation(item, context, issues.length),
  );
  const corrections = parsed.corrections.map((item) =>
    parseCorrection(item, context, recommendations.length),
  );
  return { dimensions, issues, recommendations, corrections };
}

function parseDimensions(value: unknown[], context: R7BContext): R7BDraft['dimensions'] {
  if (value.length !== modelDimensions.length) throw new Error('R7B 必须返回四个模型维度。');
  const seen = new Set<string>();
  const dimensions = value.map((item) => {
    const draft = item as { dimension?: unknown; rating?: unknown; evidence?: unknown };
    if (
      !isModelDimension(draft.dimension) ||
      seen.has(draft.dimension) ||
      !Number.isInteger(draft.rating) ||
      (draft.rating as number) < 0 ||
      (draft.rating as number) > 100
    ) {
      throw new Error('R7B 维度或分数无效。');
    }
    seen.add(draft.dimension);
    return {
      dimension: draft.dimension,
      rating: draft.rating as number,
      evidence: parseEvidence(draft.evidence, context),
    };
  });
  if (modelDimensions.some((dimension) => !seen.has(dimension))) {
    throw new Error('R7B 缺少必需维度。');
  }
  return dimensions;
}

function parseIssue(value: unknown, context: R7BContext): R7BDraft['issues'][number] {
  const issue = value as {
    dimension?: unknown;
    issueCode?: unknown;
    severity?: unknown;
    explanation?: unknown;
    evidence?: unknown;
  };
  if (
    !isModelDimension(issue.dimension) ||
    !isShortToken(issue.issueCode) ||
    (issue.severity !== 'LOW' && issue.severity !== 'MEDIUM' && issue.severity !== 'HIGH') ||
    !isNonEmptyText(issue.explanation, 1200)
  ) {
    throw new Error('R7B 问题归因无效。');
  }
  return {
    dimension: issue.dimension,
    issueCode: issue.issueCode,
    severity: issue.severity,
    explanation: issue.explanation.trim(),
    evidence: parseEvidence(issue.evidence, context),
  };
}

function parseRecommendation(
  value: unknown,
  context: R7BContext,
  issueCount: number,
): R7BDraft['recommendations'][number] {
  const recommendation = value as {
    dimension?: unknown;
    issueIndex?: unknown;
    text?: unknown;
    evidence?: unknown;
  };
  if (
    !isModelDimension(recommendation.dimension) ||
    !isNonEmptyText(recommendation.text, 500) ||
    !isOptionalIndex(recommendation.issueIndex, issueCount)
  ) {
    throw new Error('R7B 建议无效。');
  }
  return {
    dimension: recommendation.dimension,
    issueIndex: typeof recommendation.issueIndex === 'number' ? recommendation.issueIndex : null,
    text: recommendation.text.trim(),
    evidence: parseEvidence(recommendation.evidence, context),
  };
}

function parseCorrection(
  value: unknown,
  context: R7BContext,
  recommendationCount: number,
): R7BDraft['corrections'][number] {
  const correction = value as {
    dimension?: unknown;
    recommendationIndex?: unknown;
    answerUnitSequence?: unknown;
    replacementText?: unknown;
    explanation?: unknown;
    evidence?: unknown;
  };
  if (
    !isModelDimension(correction.dimension) ||
    !isOptionalIndex(correction.recommendationIndex, recommendationCount) ||
    typeof correction.answerUnitSequence !== 'number' ||
    !context.unitsBySequence.has(correction.answerUnitSequence) ||
    !isNonEmptyText(correction.replacementText, 1000) ||
    !isNonEmptyText(correction.explanation, 1200)
  ) {
    throw new Error('R7B 修正草稿无效。');
  }
  return {
    dimension: correction.dimension,
    recommendationIndex:
      typeof correction.recommendationIndex === 'number' ? correction.recommendationIndex : null,
    answerUnitSequence: correction.answerUnitSequence,
    replacementText: correction.replacementText.trim(),
    explanation: correction.explanation.trim(),
    evidence: parseEvidence(correction.evidence, context),
  };
}

function parseEvidence(value: unknown, context: R7BContext): EvidenceReference[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('R7B 项目缺少证据。');
  const keys = new Set<string>();
  return value.map((item) => {
    const evidence = item as {
      type?: unknown;
      sequence?: unknown;
      id?: unknown;
      code?: unknown;
      explanation?: unknown;
    };
    let referenceId: string;
    if (evidence.type === 'ANSWER_UNIT') {
      if (
        typeof evidence.sequence !== 'number' ||
        !context.unitsBySequence.has(evidence.sequence)
      ) {
        throw new Error('R7B 回答单元证据无效。');
      }
      referenceId = context.unitsBySequence.get(evidence.sequence)!.id;
    } else if (evidence.type === 'QUESTION_OBLIGATION') {
      if (
        typeof evidence.id !== 'string' ||
        !context.obligations.some((obligation) => obligation.id === evidence.id)
      ) {
        throw new Error('R7B 问题义务证据无效。');
      }
      referenceId = evidence.id;
    } else if (evidence.type === 'PERSONAL_ASSET_NODE') {
      if (typeof evidence.id !== 'string' || !context.nodesById.has(evidence.id)) {
        throw new Error('R7B 资产节点证据无效。');
      }
      referenceId = evidence.id;
    } else if (evidence.type === 'RULE') {
      if (typeof evidence.code !== 'string' || !allowedRuleCodes.has(evidence.code)) {
        throw new Error('R7B 规则证据无效。');
      }
      referenceId = evidence.code;
    } else {
      throw new Error('R7B 证据类型无效。');
    }
    const key = `${evidence.type}:${referenceId}`;
    if (keys.has(key)) throw new Error('R7B 项目包含重复证据。');
    keys.add(key);
    return {
      type: evidence.type,
      referenceId,
      explanation:
        typeof evidence.explanation === 'string'
          ? evidence.explanation.trim() || undefined
          : undefined,
    } as EvidenceReference;
  });
}

function fingerprint(context: R7BContext) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        sessionId: context.session.id,
        answerId: context.answer.id,
        answerHash: context.answer.normalizedHash,
        units: [...context.unitsBySequence.values()].map((unit) => [
          unit.id,
          unit.sequence,
          unit.text,
        ]),
        usage: context.usageResult
          ? {
              id: context.usageResult.id,
              status: context.usageResult.status,
              assessments: context.usageResult.assessments.map((item) => [
                item.personalAssetVersionId,
                item.isCompleteInvocation,
              ]),
              coverage: context.usageResult.obligationCoverage.map((item) => [
                item.questionObligationId,
                item.status,
              ]),
            }
          : null,
      }),
    )
    .digest('hex');
}

function r7bPromptInput(context: R7BContext) {
  return [
    'Return JSON only with dimensions, issues, recommendations, and corrections arrays.',
    'Return exactly these four 0-100 dimensions once each: QUESTION_RELEVANCE, LOGICAL_COHERENCE, TEXT_CLARITY, SUPPORTING_DETAIL.',
    'Do not return ASSET_USAGE, OBLIGATION_COVERAGE, a total score, a performance label, a mastery update, an oral-performance claim, or a score derived from hints or follow-ups.',
    'Every dimension, issue, recommendation, and correction needs at least one supplied evidence reference. Corrections must target one supplied answerUnitSequence and remain a draft.',
    'Evidence JSON uses ANSWER_UNIT with sequence, QUESTION_OBLIGATION with id, PERSONAL_ASSET_NODE with id, or RULE with code R7B_TEXT_ONLY|R7B_NO_HINT_SCORING|R7B_R7A_LOCKED.',
    `Question: ${context.session.questionPlan.questionText}`,
    `Saved answer: ${context.answer.text}`,
    'Answer units:',
    ...[...context.unitsBySequence.values()].map((unit) =>
      JSON.stringify({ sequence: unit.sequence, text: unit.text }),
    ),
    'Frozen obligations:',
    ...context.obligations.map((obligation) =>
      JSON.stringify({ id: obligation.id, description: obligation.description }),
    ),
    'Frozen asset nodes:',
    ...context.assets.flatMap((asset) =>
      asset.nodes.map((node) => JSON.stringify({ id: node.id, text: node.text })),
    ),
    'Locked local R7A facts:',
    JSON.stringify(
      context.usageResult
        ? {
            status: context.usageResult.status,
            completeAssetVersionIds: context.usageResult.assessments
              .filter((assessment) => assessment.isCompleteInvocation)
              .map((assessment) => assessment.personalAssetVersionId),
            obligationCoverage: context.usageResult.obligationCoverage.map((coverage) => ({
              obligationId: coverage.questionObligationId,
              status: coverage.status,
            })),
          }
        : null,
    ),
  ].join('\n');
}

function isModelDimension(value: unknown): value is ModelDimensionId {
  return typeof value === 'string' && modelDimensions.includes(value as ModelDimensionId);
}

function isOptionalIndex(value: unknown, length: number) {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < length)
  );
}

function isShortToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/u.test(value);
}

function isNonEmptyText(value: unknown, maximumLength: number): value is string {
  return (
    typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maximumLength
  );
}
