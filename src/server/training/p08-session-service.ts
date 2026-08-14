import { createHash } from 'node:crypto';

import { Prisma, type PrismaClient } from '@prisma/client';

import { canSubmitTextAnswer } from '@/lib/practice-gates';
import { ensureLocalTrainingRelease } from '@/server/ai/r6-release-service';

const LOCAL_USER_ID = 'local-user';

export type P08AnswerType = 'FIRST_ANSWER' | 'SECOND_ANSWER';
export type P08DraftPhase = 'FIRST_ANSWER' | 'FOLLOW_UP_ANSWER' | 'SECOND_ANSWER';
export type TrainingPhase = 'FIRST_ANSWER' | 'AWAITING_FOLLOW_UP' | 'SECOND_ANSWER' | 'COMPLETED';
export type P08HintLevel =
  'H1_ANGLE' | 'H2_ASSET_NAME' | 'H3_LOGIC_NODES' | 'H4_ENGLISH_CHUNKS' | 'H5_FULL_FLOW';

const activeSessionStatuses = [
  'QUESTION_READY',
  'FIRST_ANSWER_SUBMITTED',
  'FOLLOW_UP_IN_PROGRESS',
  'FOLLOW_UP_COMPLETE',
] as const;

export type StartP08SessionInput = {
  questionPlanId: string;
  userId?: string;
};

export type SaveP08AnswerInput = {
  trainingSessionId: string;
  expectedBusinessVersion: number;
  answerType: P08AnswerType;
  text: string;
  idempotencyKey: string;
  userId?: string;
};

export type SaveP08CheckpointInput = {
  trainingSessionId: string;
  expectedBusinessVersion: number;
  phase: P08DraftPhase;
  draft: string;
  followUpIndex?: number;
  userId?: string;
};

export type SaveP08FollowUpAnswerInput = {
  trainingSessionId: string;
  expectedBusinessVersion: number;
  followUpId: string;
  text: string;
  idempotencyKey: string;
  userId?: string;
};

export type AdvanceToSecondAnswerInput = {
  trainingSessionId: string;
  expectedBusinessVersion: number;
  userId?: string;
};

export type SaveP08HintInput = {
  trainingSessionId: string;
  expectedBusinessVersion: number;
  phase: P08DraftPhase;
  followUpIndex?: number;
  level: P08HintLevel;
  userId?: string;
};

export class P08SessionValidationError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'PLAN_NOT_AVAILABLE'
      | 'SESSION_NOT_FOUND'
      | 'SESSION_STALE'
      | 'SESSION_STATE_INVALID'
      | 'ANSWER_INVALID'
      | 'ANSWER_ALREADY_SAVED'
      | 'IDEMPOTENCY_CONFLICT'
      | 'HINT_INVALID',
  ) {
    super(message);
    this.name = 'P08SessionValidationError';
  }
}

/**
 * P08 的本地状态机。它只保存用户真实输入和用户主动请求的提示事件；R6/R7 由后续任务接入。
 */
export class P08SessionService {
  constructor(private readonly prisma: PrismaClient) {}

  async start(input: StartP08SessionInput) {
    const userId = input.userId ?? LOCAL_USER_ID;
    await this.ensurePlanAvailable(userId, input.questionPlanId);
    const releaseBundle = await ensureLocalTrainingRelease(this.prisma);

    const existing = await this.prisma.trainingSession.findFirst({
      where: {
        userId,
        questionPlanId: input.questionPlanId,
        status: { in: [...activeSessionStatuses] },
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    if (existing) return { sessionId: existing.id, reused: true };

    const session = await this.prisma.trainingSession.create({
      data: {
        userId,
        questionPlanId: input.questionPlanId,
        releaseBundleId: releaseBundle.id,
        status: 'QUESTION_READY',
        checkpoints: {
          create: {
            checkpointType: checkpointTypeFor('FIRST_ANSWER'),
            payloadJson: JSON.stringify({ draft: '' }),
          },
        },
      },
      select: { id: true },
    });
    return { sessionId: session.id, reused: false };
  }

  async getSnapshot(trainingSessionId: string, userId = LOCAL_USER_ID) {
    const session = await this.prisma.trainingSession.findFirst({
      where: { id: trainingSessionId, userId },
      include: {
        answers: { orderBy: { createdAt: 'asc' } },
        followUps: { orderBy: { issuedIndex: 'asc' } },
        hints: { orderBy: { createdAt: 'asc' } },
        checkpoints: { orderBy: { createdAt: 'desc' } },
        aiTasks: { where: { role: 'R6' }, orderBy: { updatedAt: 'desc' }, take: 1 },
        questionPlan: {
          include: {
            assets: { orderBy: { role: 'asc' } },
            obligations: { include: { supports: true }, orderBy: { sequence: 'asc' } },
          },
        },
      },
    });
    if (!session) {
      throw new P08SessionValidationError('问题回答会话不存在。', 'SESSION_NOT_FOUND');
    }

    const versionIds = session.questionPlan.assets.map((asset) => asset.personalAssetVersionId);
    const versions = await this.prisma.personalAssetVersion.findMany({
      where: { id: { in: versionIds }, personalAsset: { userId } },
      select: {
        id: true,
        version: true,
        triggerName: true,
        coreFlow: true,
        nodes: { select: { id: true, text: true } },
      },
    });
    const versionsById = new Map(versions.map((version) => [version.id, version]));
    if (
      session.questionPlan.assets.some((asset) => !versionsById.has(asset.personalAssetVersionId))
    ) {
      throw new P08SessionValidationError('问题计划的资产快照已不可用。', 'PLAN_NOT_AVAILABLE');
    }

    const nodesById = new Map(
      versions.flatMap((version) => version.nodes.map((node) => [node.id, node.text])),
    );
    const firstAnswer =
      session.answers.find((answer) => answer.answerType === 'FIRST_ANSWER') ?? null;
    const secondAnswer =
      session.answers.find((answer) => answer.answerType === 'SECOND_ANSWER') ?? null;
    const phase = phaseForStatus(session.status);
    const currentFollowUp = session.followUps.find((item) => item.status === 'READY') ?? null;
    const latestFollowUp = session.followUps.at(-1) ?? null;
    const currentDraftPhase = draftPhaseForStatus(session.status);
    const latestCheckpoint = checkpointForPhase(
      session.checkpoints,
      currentDraftPhase,
      currentFollowUp?.issuedIndex,
    );
    const followUpState = followUpStateFromCheckpoint(session.checkpoints);
    const r6Task = session.aiTasks[0] ?? null;

    return {
      id: session.id,
      businessVersion: session.businessVersion,
      status: session.status,
      phase,
      question: session.questionPlan.questionText,
      questionPlanId: session.questionPlanId,
      assets: session.questionPlan.assets.map((asset) => {
        const version = versionsById.get(asset.personalAssetVersionId)!;
        return {
          role: asset.role,
          triggerName: version.triggerName,
          version: version.version,
          coreFlow: version.coreFlow,
        };
      }),
      obligations: session.questionPlan.obligations.map((obligation) => {
        const nodeSupport = obligation.supports.find(
          (support) => support.supportType === 'PERSONAL_ASSET_NODE',
        );
        return {
          id: obligation.id,
          sequence: obligation.sequence,
          description: obligation.description,
          englishExpression: nodeSupport
            ? (nodesById.get(nodeSupport.supportReferenceId) ?? null)
            : null,
        };
      }),
      answers: { first: firstAnswer, second: secondAnswer },
      checkpoint: latestCheckpoint
        ? {
            type: latestCheckpoint.checkpointType,
            draft: draftFromCheckpoint(latestCheckpoint.payloadJson),
            createdAt: latestCheckpoint.createdAt,
          }
        : null,
      hints: session.hints.map((hint) => ({
        id: hint.id,
        level: hint.level as P08HintLevel,
        context: hint.context,
        createdAt: hint.createdAt,
      })),
      followUp: {
        current: currentFollowUp
          ? {
              id: currentFollowUp.id,
              issuedIndex: currentFollowUp.issuedIndex,
              questionText: currentFollowUp.questionText,
              support: supportFromFollowUp(currentFollowUp.supportProofJson),
            }
          : null,
        issuedCount: session.followUps.length,
        endReason:
          latestFollowUp?.endReason ?? followUpState?.endReason ?? r6Task?.resultReference ?? null,
        taskStatus: r6Task?.status ?? null,
      },
    };
  }

  async saveCheckpoint(input: SaveP08CheckpointInput) {
    const userId = input.userId ?? LOCAL_USER_ID;
    if (!isDraftPhase(input.phase) || typeof input.draft !== 'string') {
      throw new P08SessionValidationError('回答草稿内容无效。', 'ANSWER_INVALID');
    }

    return this.prisma.$transaction(async (transaction) => {
      const session = await transaction.trainingSession.findFirst({
        where: { id: input.trainingSessionId, userId },
        select: { id: true, status: true, businessVersion: true },
      });
      assertSessionVersion(session, input.expectedBusinessVersion);
      await assertPhaseAllowsDraft(transaction, session, input.phase, input.followUpIndex);
      return transaction.sessionCheckpoint.create({
        data: {
          trainingSessionId: session.id,
          checkpointType: checkpointTypeFor(input.phase, input.followUpIndex),
          payloadJson: JSON.stringify({ draft: input.draft }),
        },
      });
    });
  }

  async submitAnswer(input: SaveP08AnswerInput) {
    const userId = input.userId ?? LOCAL_USER_ID;
    const text = input.text.trim();
    if (!input.idempotencyKey.trim()) {
      throw new P08SessionValidationError('提交回答时缺少幂等键。', 'ANSWER_INVALID');
    }
    if (!canSubmitTextAnswer({ text, sessionVersionIsCurrent: true, isSubmitting: false })) {
      throw new P08SessionValidationError('回答去除首尾空白后不能为空。', 'ANSWER_INVALID');
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.trainingAnswer.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (existing) return assertMatchingAnswer(existing, input);

        const session = await transaction.trainingSession.findFirst({
          where: { id: input.trainingSessionId, userId },
          select: { id: true, status: true, businessVersion: true },
        });
        assertSessionVersion(session, input.expectedBusinessVersion);
        assertAnswerAllowed(session.status, input.answerType);

        const existingType = await transaction.trainingAnswer.findUnique({
          where: {
            trainingSessionId_answerType_sequence: {
              trainingSessionId: session.id,
              answerType: input.answerType,
              sequence: 1,
            },
          },
        });
        if (existingType) {
          throw new P08SessionValidationError(
            '该阶段回答已经保存，不能覆盖历史回答。',
            'ANSWER_ALREADY_SAVED',
          );
        }

        const answer = await transaction.trainingAnswer.create({
          data: {
            trainingSessionId: session.id,
            answerType: input.answerType,
            sequence: 1,
            text,
            normalizedHash: fingerprint(text),
            idempotencyKey: input.idempotencyKey,
          },
        });
        const update = await transaction.trainingSession.updateMany({
          where: {
            id: session.id,
            userId,
            businessVersion: input.expectedBusinessVersion,
            status: input.answerType === 'FIRST_ANSWER' ? 'QUESTION_READY' : 'FOLLOW_UP_COMPLETE',
          },
          data: {
            status:
              input.answerType === 'FIRST_ANSWER'
                ? 'FIRST_ANSWER_SUBMITTED'
                : 'SECOND_ANSWER_SUBMITTED',
            businessVersion: { increment: 1 },
          },
        });
        if (update.count !== 1) {
          throw new P08SessionValidationError('会话状态已变化，请刷新后重试。', 'SESSION_STALE');
        }
        return answer;
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
      const existing = await this.prisma.trainingAnswer.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) return assertMatchingAnswer(existing, input);
      throw error;
    }
  }

  async submitFollowUpAnswer(input: SaveP08FollowUpAnswerInput) {
    const userId = input.userId ?? LOCAL_USER_ID;
    const text = input.text.trim();
    if (!input.idempotencyKey.trim()) {
      throw new P08SessionValidationError('提交追问回答时缺少幂等键。', 'ANSWER_INVALID');
    }
    if (!canSubmitTextAnswer({ text, sessionVersionIsCurrent: true, isSubmitting: false })) {
      throw new P08SessionValidationError('回答去除首尾空白后不能为空。', 'ANSWER_INVALID');
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.trainingAnswer.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (existing) return assertMatchingFollowUpAnswer(existing, input);

        const session = await transaction.trainingSession.findFirst({
          where: { id: input.trainingSessionId, userId },
          select: { id: true, status: true, businessVersion: true },
        });
        assertSessionVersion(session, input.expectedBusinessVersion);
        if (session.status !== 'FOLLOW_UP_IN_PROGRESS') {
          throw new P08SessionValidationError(
            '当前会话没有可提交的追问回答。',
            'SESSION_STATE_INVALID',
          );
        }
        const followUp = await transaction.followUpItem.findFirst({
          where: { id: input.followUpId, trainingSessionId: session.id, status: 'READY' },
        });
        if (!followUp) {
          throw new P08SessionValidationError('当前追问已结束或已提交。', 'SESSION_STATE_INVALID');
        }
        const answer = await transaction.trainingAnswer.create({
          data: {
            trainingSessionId: session.id,
            answerType: 'FOLLOW_UP_ANSWER',
            sequence: followUp.issuedIndex,
            text,
            normalizedHash: fingerprint(text),
            idempotencyKey: input.idempotencyKey,
          },
        });

        if (followUp.issuedIndex >= 3) {
          await transaction.followUpItem.update({
            where: { id: followUp.id },
            data: { status: 'ENDED', endReason: 'MAX_ROUNDS_REACHED' },
          });
          await transitionToSecondAnswer(
            transaction,
            session.id,
            userId,
            input.expectedBusinessVersion,
            {
              expectedStatus: 'FOLLOW_UP_IN_PROGRESS',
              endReason: 'MAX_ROUNDS_REACHED',
            },
          );
          return answer;
        }

        await transaction.followUpItem.update({
          where: { id: followUp.id },
          data: { status: 'ANSWERED' },
        });
        const update = await transaction.trainingSession.updateMany({
          where: {
            id: session.id,
            userId,
            businessVersion: input.expectedBusinessVersion,
            status: 'FOLLOW_UP_IN_PROGRESS',
          },
          data: { businessVersion: { increment: 1 } },
        });
        if (update.count !== 1) {
          throw new P08SessionValidationError('会话状态已变化，请刷新后重试。', 'SESSION_STALE');
        }
        return answer;
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
      const existing = await this.prisma.trainingAnswer.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) return assertMatchingFollowUpAnswer(existing, input);
      throw error;
    }
  }

  async advanceToSecondAnswer(input: AdvanceToSecondAnswerInput) {
    const userId = input.userId ?? LOCAL_USER_ID;
    return this.prisma.$transaction(async (transaction) => {
      const session = await transaction.trainingSession.findFirst({
        where: { id: input.trainingSessionId, userId },
        select: { id: true, status: true, businessVersion: true },
      });
      assertSessionVersion(session, input.expectedBusinessVersion);
      if (!['FIRST_ANSWER_SUBMITTED', 'FOLLOW_UP_IN_PROGRESS'].includes(session.status)) {
        throw new P08SessionValidationError(
          '当前会话不能直接进入第二次回答。',
          'SESSION_STATE_INVALID',
        );
      }
      const firstAnswer = await transaction.trainingAnswer.findUnique({
        where: {
          trainingSessionId_answerType_sequence: {
            trainingSessionId: session.id,
            answerType: 'FIRST_ANSWER',
            sequence: 1,
          },
        },
        select: { id: true },
      });
      if (!firstAnswer) {
        throw new P08SessionValidationError('第一次回答尚未保存。', 'SESSION_STATE_INVALID');
      }
      if (session.status === 'FOLLOW_UP_IN_PROGRESS') {
        const currentFollowUp = await transaction.followUpItem.findFirst({
          where: {
            trainingSessionId: session.id,
            status: { in: ['READY', 'ANSWERED'] },
          },
          orderBy: { issuedIndex: 'desc' },
        });
        if (currentFollowUp) {
          await transaction.followUpItem.update({
            where: { id: currentFollowUp.id },
            data: {
              status: currentFollowUp.status === 'READY' ? 'SKIPPED' : 'ENDED',
              endReason: 'USER_ENDED',
            },
          });
        }
      }
      await transitionToSecondAnswer(
        transaction,
        session.id,
        userId,
        input.expectedBusinessVersion,
        {
          expectedStatus: session.status,
          endReason:
            session.status === 'FOLLOW_UP_IN_PROGRESS' ? 'USER_ENDED' : 'R6_SKIPPED_BEFORE_ISSUE',
        },
      );
      await transaction.aiTask.updateMany({
        where: {
          trainingSessionId: session.id,
          role: 'R6',
          status: { in: ['QUEUED', 'RUNNING', 'AWAITING_USER_CONFIRMATION'] },
        },
        data: { status: 'SUPERSEDED', resultReference: 'R6_USER_ENDED' },
      });
      return { nextBusinessVersion: input.expectedBusinessVersion + 1 };
    });
  }

  async saveHint(input: SaveP08HintInput) {
    const userId = input.userId ?? LOCAL_USER_ID;
    if (!isHintLevel(input.level) || !isDraftPhase(input.phase)) {
      throw new P08SessionValidationError('提示等级或阶段无效。', 'HINT_INVALID');
    }
    return this.prisma.$transaction(async (transaction) => {
      const session = await transaction.trainingSession.findFirst({
        where: { id: input.trainingSessionId, userId },
        select: { id: true, status: true, businessVersion: true },
      });
      assertSessionVersion(session, input.expectedBusinessVersion);
      await assertPhaseAllowsDraft(transaction, session, input.phase, input.followUpIndex);
      return transaction.hintEvent.create({
        data: {
          trainingSessionId: session.id,
          level: input.level,
          context:
            input.phase === 'FOLLOW_UP_ANSWER'
              ? `P08_FOLLOW_UP_ANSWER_${input.followUpIndex}`
              : `P08_${input.phase}`,
        },
      });
    });
  }

  private async ensurePlanAvailable(userId: string, questionPlanId: string) {
    const plan = await this.prisma.questionPlan.findUnique({
      where: { id: questionPlanId },
      include: { assets: true },
    });
    if (
      !plan ||
      plan.status !== 'VALIDATED' ||
      !plan.assets.some((asset) => asset.role === 'PRIMARY')
    ) {
      throw new P08SessionValidationError(
        '问题准备不存在或尚未通过本地验证。',
        'PLAN_NOT_AVAILABLE',
      );
    }
    const versions = await this.prisma.personalAssetVersion.count({
      where: {
        id: { in: plan.assets.map((asset) => asset.personalAssetVersionId) },
        status: 'CONFIRMED',
        personalAsset: { userId },
      },
    });
    if (versions !== plan.assets.length) {
      throw new P08SessionValidationError('问题准备不属于当前本地用户。', 'PLAN_NOT_AVAILABLE');
    }
  }
}

function assertMatchingAnswer<
  T extends { trainingSessionId: string; answerType: string; sequence: number },
>(answer: T, input: SaveP08AnswerInput): T {
  if (
    answer.trainingSessionId !== input.trainingSessionId ||
    answer.answerType !== input.answerType ||
    answer.sequence !== 1
  ) {
    throw new P08SessionValidationError('幂等键不能复用于另一条回答。', 'IDEMPOTENCY_CONFLICT');
  }
  return answer;
}

function assertMatchingFollowUpAnswer<
  T extends { trainingSessionId: string; answerType: string; sequence: number },
>(answer: T, input: SaveP08FollowUpAnswerInput): T {
  if (
    answer.trainingSessionId !== input.trainingSessionId ||
    answer.answerType !== 'FOLLOW_UP_ANSWER'
  ) {
    throw new P08SessionValidationError('幂等键不能复用于另一条回答。', 'IDEMPOTENCY_CONFLICT');
  }
  return answer;
}

function assertSessionVersion(
  session: { status: string; businessVersion: number } | null,
  expectedBusinessVersion: number,
): asserts session is { id: string; status: string; businessVersion: number } {
  if (!session) {
    throw new P08SessionValidationError('问题回答会话不存在。', 'SESSION_NOT_FOUND');
  }
  if (session.businessVersion !== expectedBusinessVersion) {
    throw new P08SessionValidationError('会话版本已失效，请刷新后重试。', 'SESSION_STALE');
  }
}

function assertAnswerAllowed(status: string, answerType: P08AnswerType) {
  const allowed =
    (answerType === 'FIRST_ANSWER' && status === 'QUESTION_READY') ||
    (answerType === 'SECOND_ANSWER' && status === 'FOLLOW_UP_COMPLETE');
  if (!allowed) {
    throw new P08SessionValidationError('当前会话阶段不允许提交该回答。', 'SESSION_STATE_INVALID');
  }
}

async function assertPhaseAllowsDraft(
  transaction: Prisma.TransactionClient,
  session: { id: string; status: string },
  phase: P08DraftPhase,
  followUpIndex?: number,
) {
  const allowed =
    (phase === 'FIRST_ANSWER' && session.status === 'QUESTION_READY') ||
    (phase === 'SECOND_ANSWER' && session.status === 'FOLLOW_UP_COMPLETE');
  if (phase === 'FOLLOW_UP_ANSWER') {
    const followUp =
      session.status === 'FOLLOW_UP_IN_PROGRESS' && Number.isInteger(followUpIndex)
        ? await transaction.followUpItem.findFirst({
            where: {
              trainingSessionId: session.id,
              issuedIndex: followUpIndex,
              status: 'READY',
            },
            select: { id: true },
          })
        : null;
    if (followUp) return;
  }
  if (!allowed) {
    throw new P08SessionValidationError(
      '当前会话阶段不能保存该草稿或提示。',
      'SESSION_STATE_INVALID',
    );
  }
}

function phaseForStatus(status: string): TrainingPhase {
  if (status === 'QUESTION_READY' || status === 'PREPARING') return 'FIRST_ANSWER';
  if (status === 'FIRST_ANSWER_SUBMITTED' || status === 'FOLLOW_UP_IN_PROGRESS') {
    return 'AWAITING_FOLLOW_UP';
  }
  if (status === 'FOLLOW_UP_COMPLETE') return 'SECOND_ANSWER';
  if (status === 'SECOND_ANSWER_SUBMITTED' || status === 'REVIEW_READY' || status === 'COMPLETED') {
    return 'COMPLETED';
  }
  throw new P08SessionValidationError('问题回答会话状态不受支持。', 'SESSION_STATE_INVALID');
}

function checkpointTypeFor(phase: P08DraftPhase, followUpIndex?: number) {
  if (phase === 'FIRST_ANSWER') return 'P08_FIRST_ANSWER_DRAFT';
  if (phase === 'SECOND_ANSWER') return 'P08_SECOND_ANSWER_DRAFT';
  if (!Number.isInteger(followUpIndex) || (followUpIndex ?? 0) < 1) {
    throw new P08SessionValidationError('追问草稿缺少有效轮次。', 'ANSWER_INVALID');
  }
  return `P08_FOLLOW_UP_${followUpIndex}_DRAFT`;
}

function draftPhaseForStatus(status: string): P08DraftPhase | null {
  if (status === 'QUESTION_READY') return 'FIRST_ANSWER';
  if (status === 'FOLLOW_UP_IN_PROGRESS') return 'FOLLOW_UP_ANSWER';
  if (status === 'FOLLOW_UP_COMPLETE') return 'SECOND_ANSWER';
  return null;
}

function checkpointForPhase(
  checkpoints: Array<{ checkpointType: string; payloadJson: string | null; createdAt: Date }>,
  phase: P08DraftPhase | null,
  followUpIndex?: number,
) {
  if (!phase || (phase === 'FOLLOW_UP_ANSWER' && !followUpIndex)) return null;
  const checkpointType = checkpointTypeFor(phase, followUpIndex);
  return checkpoints.find((checkpoint) => checkpoint.checkpointType === checkpointType) ?? null;
}

function followUpStateFromCheckpoint(
  checkpoints: Array<{ checkpointType: string; payloadJson: string | null }>,
) {
  const checkpoint = checkpoints.find((item) => item.checkpointType === 'P08_FOLLOW_UP_STATE');
  if (!checkpoint?.payloadJson) return null;
  try {
    const parsed = JSON.parse(checkpoint.payloadJson) as { endReason?: unknown };
    return { endReason: typeof parsed.endReason === 'string' ? parsed.endReason : null };
  } catch {
    return null;
  }
}

function supportFromFollowUp(value: string) {
  try {
    const parsed = JSON.parse(value) as {
      obligationDescription?: unknown;
      supports?: Array<{ type?: unknown; text?: unknown }>;
    };
    return {
      obligationDescription:
        typeof parsed.obligationDescription === 'string' ? parsed.obligationDescription : null,
      supportLabels: Array.isArray(parsed.supports)
        ? parsed.supports
            .map((item) => (typeof item.text === 'string' ? item.text : null))
            .filter((text): text is string => Boolean(text))
        : [],
    };
  } catch {
    return { obligationDescription: null, supportLabels: [] };
  }
}

async function transitionToSecondAnswer(
  transaction: Prisma.TransactionClient,
  sessionId: string,
  userId: string,
  expectedBusinessVersion: number,
  input: { expectedStatus: string; endReason: string },
) {
  const update = await transaction.trainingSession.updateMany({
    where: {
      id: sessionId,
      userId,
      businessVersion: expectedBusinessVersion,
      status: input.expectedStatus as 'FIRST_ANSWER_SUBMITTED' | 'FOLLOW_UP_IN_PROGRESS',
    },
    data: { status: 'FOLLOW_UP_COMPLETE', businessVersion: { increment: 1 } },
  });
  if (update.count !== 1) {
    throw new P08SessionValidationError('会话状态已变化，请刷新后重试。', 'SESSION_STALE');
  }
  await transaction.sessionCheckpoint.createMany({
    data: [
      {
        trainingSessionId: sessionId,
        checkpointType: 'P08_FOLLOW_UP_STATE',
        payloadJson: JSON.stringify({ state: 'COMPLETE', endReason: input.endReason }),
      },
      {
        trainingSessionId: sessionId,
        checkpointType: checkpointTypeFor('SECOND_ANSWER'),
        payloadJson: JSON.stringify({ draft: '' }),
      },
    ],
  });
}

function draftFromCheckpoint(payloadJson: string | null) {
  if (!payloadJson) return '';
  try {
    const payload = JSON.parse(payloadJson) as { draft?: unknown };
    return typeof payload.draft === 'string' ? payload.draft : '';
  } catch {
    return '';
  }
}

function fingerprint(text: string) {
  return createHash('sha256').update(text).digest('hex');
}

function isDraftPhase(value: string): value is P08DraftPhase {
  return value === 'FIRST_ANSWER' || value === 'FOLLOW_UP_ANSWER' || value === 'SECOND_ANSWER';
}

function isHintLevel(value: string): value is P08HintLevel {
  return [
    'H1_ANGLE',
    'H2_ASSET_NAME',
    'H3_LOGIC_NODES',
    'H4_ENGLISH_CHUNKS',
    'H5_FULL_FLOW',
  ].includes(value);
}
