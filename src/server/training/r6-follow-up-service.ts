import { createHash } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';

import { AiProviderError, type AiProviderAdapter } from '@/ai/provider';
import { ensureLocalTrainingRelease } from '@/server/ai/r6-release-service';

const LOCAL_USER_ID = 'local-user';
const maxFollowUpRounds = 3;

export type R6EndReason =
  | 'CONTENT_COMPLETE'
  | 'NO_PROGRESS'
  | 'NO_SUPPORTED_GAP'
  | 'MAX_ROUNDS_REACHED'
  | 'R6_UNAVAILABLE'
  | 'R6_INVALID_DRAFT'
  | 'R6_RELEASE_MISMATCH';

export type RequestR6FollowUpInput = {
  trainingSessionId: string;
  answerId: string;
  userId?: string;
};

export type R6FollowUpResult = {
  status: 'FOLLOW_UP_READY' | 'FOLLOW_UP_COMPLETE' | 'PROCESSING';
  taskId: string | null;
  endReason: R6EndReason | null;
};

type SupportItem = {
  type: string;
  referenceId: string;
  explanation: string | null;
  text: string | null;
};

type SupportedObligation = {
  id: string;
  sequence: number;
  description: string;
  supports: SupportItem[];
};

type R6Decision =
  | { action: 'ASK'; questionText: string; supportObligationId: string }
  | {
      action: 'END';
      endReason: Extract<R6EndReason, 'CONTENT_COMPLETE' | 'NO_PROGRESS' | 'NO_SUPPORTED_GAP'>;
    };

export class R6FollowUpValidationError extends Error {
  constructor(
    message: string,
    readonly code: 'SESSION_NOT_FOUND' | 'ANSWER_NOT_AVAILABLE' | 'SESSION_STATE_INVALID',
  ) {
    super(message);
    this.name = 'R6FollowUpValidationError';
  }
}

/**
 * R6 只把已经冻结的问题义务和支撑证明交给模型选择。
 * 模型返回的义务 ID 仍需本地校验，不能把它的文字当作新的事实或资产发布。
 */
export class R6FollowUpService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly provider: AiProviderAdapter,
  ) {}

  async requestForAnswer(input: RequestR6FollowUpInput): Promise<R6FollowUpResult> {
    const userId = input.userId ?? LOCAL_USER_ID;
    let context = await this.loadContext(input.trainingSessionId, input.answerId, userId);
    if (!canAnswerTriggerR6(context)) {
      const existingTask = await this.prisma.aiTask.findFirst({
        where: { trainingSessionId: context.session.id, role: 'R6', entityId: context.answer.id },
        orderBy: { updatedAt: 'desc' },
        select: { id: true },
      });
      if (existingTask || context.session.status === 'FOLLOW_UP_COMPLETE') {
        return currentResult(context, existingTask?.id ?? null);
      }
      throw new R6FollowUpValidationError(
        '当前会话阶段不能继续生成追问。',
        'SESSION_STATE_INVALID',
      );
    }

    if (context.obligations.length === 0) {
      return this.finishWithoutTask(context, 'NO_SUPPORTED_GAP');
    }

    if (
      context.answer.answerType === 'FOLLOW_UP_ANSWER' &&
      context.answer.sequence >= maxFollowUpRounds
    ) {
      return this.finishWithoutTask(context, 'MAX_ROUNDS_REACHED');
    }

    let bundle = context.session.releaseBundleId
      ? await this.prisma.aiReleaseBundle.findUnique({
          where: { id: context.session.releaseBundleId },
          include: { prompts: { where: { role: 'R6' }, select: { id: true } } },
        })
      : null;
    if (!context.session.releaseBundleId) {
      const createdBundle = await ensureLocalTrainingRelease(this.prisma);
      await this.prisma.trainingSession.updateMany({
        where: {
          id: context.session.id,
          userId,
          businessVersion: context.session.businessVersion,
          releaseBundleId: null,
        },
        data: { releaseBundleId: createdBundle.id },
      });
      bundle = await this.prisma.aiReleaseBundle.findUnique({
        where: { id: createdBundle.id },
        include: { prompts: { where: { role: 'R6' }, select: { id: true } } },
      });
      context = await this.loadContext(input.trainingSessionId, input.answerId, userId);
      if (!canAnswerTriggerR6(context)) return currentResult(context, null);
    }
    if (!bundle || bundle.status !== 'ACTIVE' || bundle.prompts.length === 0) {
      return this.finishWithoutTask(context, 'R6_RELEASE_MISMATCH');
    }

    const inputFingerprint = fingerprint(context);
    const task = await this.prisma.aiTask.upsert({
      where: {
        role_entityId_entityVersion_releaseBundleId_inputFingerprint: {
          role: 'R6',
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
        role: 'R6',
        entityType: 'TrainingAnswer',
        entityId: context.answer.id,
        entityVersion: context.answer.sequence,
        inputFingerprint,
      },
    });

    if (task.status === 'RUNNING' || task.status === 'QUEUED') {
      return this.process(task.id, context);
    }
    return currentResult(context, task.id);
  }

  private async process(
    taskId: string,
    context: Awaited<ReturnType<R6FollowUpService['loadContext']>>,
  ) {
    const claimed = await this.prisma.aiTask.updateMany({
      where: { id: taskId, status: 'QUEUED' },
      data: { status: 'RUNNING' },
    });
    if (claimed.count === 0) return currentResult(context, taskId);

    const task = await this.prisma.aiTask.findUniqueOrThrow({
      where: { id: taskId },
      include: { releaseBundle: true },
    });
    const attemptNo = (await this.prisma.aiTaskAttempt.count({ where: { aiTaskId: task.id } })) + 1;

    let result;
    try {
      result = await this.provider.execute({
        taskId: task.id,
        role: 'R6',
        releaseBundleVersion: task.releaseBundle.version,
        text: r6PromptInput(context),
      });
    } catch (error) {
      const providerCode = error instanceof AiProviderError ? error.code : 'FAILED';
      await this.prisma.aiTaskAttempt.create({
        data: {
          aiTaskId: task.id,
          attemptNo,
          attemptType: 'INITIAL',
          provider: this.provider.name,
          status: providerCode,
          rawResponse: 'R6 Provider 不可用，已安全进入第二次回答。',
        },
      });
      return this.finishWithTask(context, task.id, 'R6_UNAVAILABLE', 'FAILED_RETRYABLE');
    }

    if (result.kind === 'INSUFFICIENT_TEXT') {
      await this.prisma.aiTaskAttempt.create({
        data: {
          aiTaskId: task.id,
          attemptNo,
          attemptType: 'INITIAL',
          provider: this.provider.name,
          status: 'INSUFFICIENT_TEXT',
          parsedJson: JSON.stringify(result),
        },
      });
      return this.finishWithTask(context, task.id, 'R6_UNAVAILABLE', 'NEEDS_REVIEW');
    }

    let decision: R6Decision;
    try {
      decision = parseDecision(result.draft, context.obligations);
    } catch {
      await this.prisma.aiTaskAttempt.create({
        data: {
          aiTaskId: task.id,
          attemptNo,
          attemptType: 'INITIAL',
          provider: this.provider.name,
          status: 'INVALID_DRAFT',
          rawResponse: 'R6 草稿未通过本地支撑校验。',
        },
      });
      return this.finishWithTask(context, task.id, 'R6_INVALID_DRAFT', 'NEEDS_REVIEW');
    }

    await this.prisma.aiTaskAttempt.create({
      data: {
        aiTaskId: task.id,
        attemptNo,
        attemptType: 'INITIAL',
        provider: this.provider.name,
        status: 'DRAFT_READY',
        parsedJson: JSON.stringify(decision),
      },
    });

    if (decision.action === 'END') {
      return this.finishWithTask(context, task.id, decision.endReason, 'VALIDATED');
    }
    return this.issueFollowUp(context, task.id, decision);
  }

  private async issueFollowUp(
    context: Awaited<ReturnType<R6FollowUpService['loadContext']>>,
    taskId: string,
    decision: Extract<R6Decision, { action: 'ASK' }>,
  ): Promise<R6FollowUpResult> {
    const obligation = context.obligations.find((item) => item.id === decision.supportObligationId);
    if (!obligation)
      return this.finishWithTask(context, taskId, 'R6_INVALID_DRAFT', 'NEEDS_REVIEW');
    const issuedIndex = context.session.followUps.length + 1;
    if (issuedIndex > maxFollowUpRounds) {
      return this.finishWithTask(context, taskId, 'MAX_ROUNDS_REACHED', 'VALIDATED');
    }

    const applied = await this.prisma.$transaction(async (transaction) => {
      const session = await transaction.trainingSession.findFirst({
        where: {
          id: context.session.id,
          userId: context.session.userId,
          businessVersion: context.session.businessVersion,
          status:
            context.answer.answerType === 'FIRST_ANSWER'
              ? 'FIRST_ANSWER_SUBMITTED'
              : 'FOLLOW_UP_IN_PROGRESS',
        },
        include: { followUps: { orderBy: { issuedIndex: 'asc' } } },
      });
      if (!session || session.followUps.length !== issuedIndex - 1) return false;
      if (context.answer.answerType === 'FOLLOW_UP_ANSWER') {
        const last = session.followUps.at(-1);
        if (last?.status !== 'ANSWERED' || last.issuedIndex !== context.answer.sequence)
          return false;
      }

      await transaction.followUpItem.create({
        data: {
          trainingSessionId: session.id,
          issuedIndex,
          questionText: decision.questionText,
          supportProofJson: JSON.stringify({
            ruleVersion: 'r6-supported-follow-up-v1',
            questionPlanId: context.session.questionPlanId,
            obligationId: obligation.id,
            obligationSequence: obligation.sequence,
            obligationDescription: obligation.description,
            supports: obligation.supports,
          }),
        },
      });
      await transaction.trainingSession.update({
        where: { id: session.id },
        data: { status: 'FOLLOW_UP_IN_PROGRESS', businessVersion: { increment: 1 } },
      });
      await transaction.sessionCheckpoint.create({
        data: {
          trainingSessionId: session.id,
          checkpointType: `P08_FOLLOW_UP_${issuedIndex}_DRAFT`,
          payloadJson: JSON.stringify({ draft: '' }),
        },
      });
      await transaction.aiTask.update({
        where: { id: taskId },
        data: { status: 'AWAITING_USER_CONFIRMATION', resultReference: 'R6_FOLLOW_UP_READY' },
      });
      return true;
    });

    if (!applied) {
      await this.prisma.aiTask.update({
        where: { id: taskId },
        data: { status: 'SUPERSEDED', resultReference: 'R6_SESSION_ADVANCED' },
      });
      return currentResult(context, taskId);
    }
    return { status: 'FOLLOW_UP_READY', taskId, endReason: null };
  }

  private async finishWithoutTask(
    context: Awaited<ReturnType<R6FollowUpService['loadContext']>>,
    reason: R6EndReason,
  ) {
    return this.finish(context, null, reason, null);
  }

  private async finishWithTask(
    context: Awaited<ReturnType<R6FollowUpService['loadContext']>>,
    taskId: string,
    reason: R6EndReason,
    taskStatus: 'FAILED_RETRYABLE' | 'NEEDS_REVIEW' | 'VALIDATED',
  ) {
    return this.finish(context, taskId, reason, taskStatus);
  }

  private async finish(
    context: Awaited<ReturnType<R6FollowUpService['loadContext']>>,
    taskId: string | null,
    reason: R6EndReason,
    taskStatus: 'FAILED_RETRYABLE' | 'NEEDS_REVIEW' | 'VALIDATED' | null,
  ): Promise<R6FollowUpResult> {
    const advanced = await this.prisma.$transaction(async (transaction) => {
      const session = await transaction.trainingSession.findFirst({
        where: {
          id: context.session.id,
          userId: context.session.userId,
          businessVersion: context.session.businessVersion,
          status:
            context.answer.answerType === 'FIRST_ANSWER'
              ? 'FIRST_ANSWER_SUBMITTED'
              : 'FOLLOW_UP_IN_PROGRESS',
        },
        include: { followUps: { orderBy: { issuedIndex: 'asc' } } },
      });
      if (!session) return false;

      if (context.answer.answerType === 'FOLLOW_UP_ANSWER') {
        const current = session.followUps.at(-1);
        if (current?.status !== 'ANSWERED' || current.issuedIndex !== context.answer.sequence) {
          return false;
        }
        await transaction.followUpItem.update({
          where: { id: current.id },
          data: { status: 'ENDED', endReason: reason },
        });
      }
      await transaction.trainingSession.update({
        where: { id: session.id },
        data: { status: 'FOLLOW_UP_COMPLETE', businessVersion: { increment: 1 } },
      });
      await transaction.sessionCheckpoint.createMany({
        data: [
          {
            trainingSessionId: session.id,
            checkpointType: 'P08_FOLLOW_UP_STATE',
            payloadJson: JSON.stringify({ state: 'COMPLETE', endReason: reason }),
          },
          {
            trainingSessionId: session.id,
            checkpointType: 'P08_SECOND_ANSWER_DRAFT',
            payloadJson: JSON.stringify({ draft: '' }),
          },
        ],
      });
      if (taskId && taskStatus) {
        await transaction.aiTask.update({
          where: { id: taskId },
          data: { status: taskStatus, resultReference: `R6_${reason}` },
        });
      }
      return true;
    });

    if (!advanced && taskId) {
      await this.prisma.aiTask.update({
        where: { id: taskId },
        data: { status: 'SUPERSEDED', resultReference: 'R6_SESSION_ADVANCED' },
      });
    }
    return {
      status: advanced ? 'FOLLOW_UP_COMPLETE' : 'PROCESSING',
      taskId,
      endReason: advanced ? reason : null,
    };
  }

  private async loadContext(trainingSessionId: string, answerId: string, userId: string) {
    const session = await this.prisma.trainingSession.findFirst({
      where: { id: trainingSessionId, userId },
      include: {
        answers: { orderBy: [{ answerType: 'asc' }, { sequence: 'asc' }] },
        followUps: { orderBy: { issuedIndex: 'asc' } },
        questionPlan: {
          include: {
            assets: true,
            obligations: { include: { supports: true }, orderBy: { sequence: 'asc' } },
          },
        },
      },
    });
    if (!session) {
      throw new R6FollowUpValidationError('问题回答会话不存在。', 'SESSION_NOT_FOUND');
    }
    const answer = session.answers.find((item) => item.id === answerId);
    if (!answer || !['FIRST_ANSWER', 'FOLLOW_UP_ANSWER'].includes(answer.answerType)) {
      throw new R6FollowUpValidationError('该回答不能触发受支撑追问。', 'ANSWER_NOT_AVAILABLE');
    }

    const versionIds = session.questionPlan.assets.map((asset) => asset.personalAssetVersionId);
    const versions = await this.prisma.personalAssetVersion.findMany({
      where: { id: { in: versionIds }, personalAsset: { userId } },
      include: { nodes: { select: { id: true, text: true } } },
    });
    const knownNodes = new Map(
      versions.flatMap((version) => version.nodes.map((node) => [node.id, node.text])),
    );
    const factIds = session.questionPlan.obligations.flatMap((obligation) =>
      obligation.supports
        .filter((support) => support.supportType === 'CONFIRMED_USER_FACT')
        .map((support) => support.supportReferenceId),
    );
    const facts = await this.prisma.userFact.findMany({
      where: { id: { in: factIds }, userId, status: 'CONFIRMED' },
      select: { id: true, text: true },
    });
    const knownFacts = new Map(facts.map((fact) => [fact.id, fact.text]));
    const obligations = session.questionPlan.obligations.flatMap((obligation) => {
      const supports = obligation.supports.flatMap<SupportItem>((support) => {
        if (support.supportType === 'PERSONAL_ASSET_NODE') {
          const text = knownNodes.get(support.supportReferenceId);
          return text
            ? [
                {
                  type: support.supportType,
                  referenceId: support.supportReferenceId,
                  explanation: support.explanation,
                  text,
                },
              ]
            : [];
        }
        if (support.supportType === 'CONFIRMED_USER_FACT') {
          const text = knownFacts.get(support.supportReferenceId);
          return text
            ? [
                {
                  type: support.supportType,
                  referenceId: support.supportReferenceId,
                  explanation: support.explanation,
                  text,
                },
              ]
            : [];
        }
        if (support.supportType === 'QUESTION_CONTEXT') {
          return support.supportReferenceId === session.questionPlan.questionId
            ? [
                {
                  type: support.supportType,
                  referenceId: support.supportReferenceId,
                  explanation: support.explanation,
                  text: session.questionPlan.questionText,
                },
              ]
            : [];
        }
        return [];
      });
      return supports.length
        ? [
            {
              id: obligation.id,
              sequence: obligation.sequence,
              description: obligation.description,
              supports,
            },
          ]
        : [];
    });
    return { session, answer, obligations };
  }
}

function canAnswerTriggerR6(context: Awaited<ReturnType<R6FollowUpService['loadContext']>>) {
  return (
    (context.answer.answerType === 'FIRST_ANSWER' &&
      context.session.status === 'FIRST_ANSWER_SUBMITTED') ||
    (context.answer.answerType === 'FOLLOW_UP_ANSWER' &&
      context.session.status === 'FOLLOW_UP_IN_PROGRESS' &&
      context.session.followUps.at(-1)?.issuedIndex === context.answer.sequence &&
      context.session.followUps.at(-1)?.status === 'ANSWERED')
  );
}

function parseDecision(value: string, obligations: SupportedObligation[]): R6Decision {
  const parsed = JSON.parse(value) as Record<string, unknown>;
  if (parsed.action === 'END') {
    const endReason =
      parsed.endReason === 'CONTENT_COMPLETE' ||
      parsed.endReason === 'NO_PROGRESS' ||
      parsed.endReason === 'NO_SUPPORTED_GAP'
        ? parsed.endReason
        : null;
    if (!endReason) throw new Error('R6 结束原因无效。');
    return { action: 'END', endReason };
  }
  if (
    parsed.action !== 'ASK' ||
    typeof parsed.questionText !== 'string' ||
    !parsed.questionText.trim() ||
    parsed.questionText.trim().length > 500 ||
    typeof parsed.supportObligationId !== 'string' ||
    !obligations.some((obligation) => obligation.id === parsed.supportObligationId)
  ) {
    throw new Error('R6 追问草稿无效或没有本地支撑。');
  }
  return {
    action: 'ASK',
    questionText: parsed.questionText.trim(),
    supportObligationId: parsed.supportObligationId,
  };
}

function fingerprint(context: Awaited<ReturnType<R6FollowUpService['loadContext']>>) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        sessionId: context.session.id,
        questionPlanId: context.session.questionPlanId,
        answer: {
          id: context.answer.id,
          answerType: context.answer.answerType,
          sequence: context.answer.sequence,
          normalizedHash: context.answer.normalizedHash,
        },
        issued: context.session.followUps.map((item) => ({
          index: item.issuedIndex,
          questionText: item.questionText,
          status: item.status,
        })),
        obligations: context.obligations.map((item) => ({
          id: item.id,
          supports: item.supports.map((support) => [support.type, support.referenceId]),
        })),
      }),
    )
    .digest('hex');
}

function r6PromptInput(context: Awaited<ReturnType<R6FollowUpService['loadContext']>>) {
  const previousRounds = context.session.followUps.map((item) => {
    const answer = context.session.answers.find(
      (candidate) =>
        candidate.answerType === 'FOLLOW_UP_ANSWER' && candidate.sequence === item.issuedIndex,
    );
    return {
      issuedIndex: item.issuedIndex,
      question: item.questionText,
      answer: answer?.text ?? null,
    };
  });
  return [
    'Return JSON only.',
    'For one safe follow-up use {"action":"ASK","questionText":"","supportObligationId":""}.',
    'To stop use {"action":"END","endReason":"CONTENT_COMPLETE|NO_PROGRESS|NO_SUPPORTED_GAP"}.',
    'Ask at most one question. Choose only one supplied supportObligationId. Do not introduce assets, facts, topics, or evaluation not present below.',
    `Original question: ${context.session.questionPlan.questionText}`,
    `Latest saved answer: ${context.answer.text}`,
    `Previous rounds: ${JSON.stringify(previousRounds)}`,
    'Supported obligations:',
    ...context.obligations.map((obligation) =>
      JSON.stringify({
        id: obligation.id,
        sequence: obligation.sequence,
        description: obligation.description,
        supports: obligation.supports,
      }),
    ),
  ].join('\n');
}

function currentResult(
  context: Awaited<ReturnType<R6FollowUpService['loadContext']>>,
  taskId: string | null,
): R6FollowUpResult {
  if (context.session.status === 'FOLLOW_UP_COMPLETE') {
    return { status: 'FOLLOW_UP_COMPLETE', taskId, endReason: null };
  }
  if (context.session.followUps.at(-1)?.status === 'READY') {
    return { status: 'FOLLOW_UP_READY', taskId, endReason: null };
  }
  return { status: 'PROCESSING', taskId, endReason: null };
}
