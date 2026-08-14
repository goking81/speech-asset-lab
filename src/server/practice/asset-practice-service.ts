import { Prisma, type PrismaClient } from '@prisma/client';

import {
  canSaveOralAttempt,
  canSubmitTextAnswer,
  type CompletionRating,
  type DifficultyRating,
} from '@/lib/practice-gates';

const LOCAL_USER_ID = 'local-user';

export const P05_STEPS = [
  'READING',
  'KEYWORD_RECALL',
  'LOGIC_SKELETON_RECALL',
  'NO_HINT_RECALL',
  'ANCHOR_TEXT',
] as const;

export type P05Step = (typeof P05_STEPS)[number];
export type HintLevel =
  | 'H0_NONE'
  | 'H1_ANGLE'
  | 'H2_ASSET_NAME'
  | 'H3_LOGIC_NODES'
  | 'H4_ENGLISH_CHUNKS'
  | 'H5_FULL_FLOW';

type CheckpointPayload = {
  oralAttemptConfirmed?: boolean;
  completionRating?: CompletionRating | null;
  difficultyRating?: DifficultyRating | null;
  highestHintLevel?: HintLevel;
  textDraft?: string;
  stepStartedAt?: string;
};

export type StartAssetPracticeSessionInput = {
  trainingTaskId?: string;
  retrainFromSessionId?: string;
  userId?: string;
};

export type SaveAssetPracticeCheckpointInput = {
  assetPracticeSessionId: string;
  currentStep: P05Step;
  payload: CheckpointPayload;
  userId?: string;
};

export type SaveAssetPracticeAttemptInput = {
  assetPracticeSessionId: string;
  stepType: P05Step;
  oralAttemptConfirmed?: boolean;
  completionRating?: CompletionRating | null;
  difficultyRating?: DifficultyRating | null;
  highestHintLevel?: HintLevel;
  textAnswer?: string;
  idempotencyKey: string;
  userId?: string;
};

export class AssetPracticeValidationError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'INVALID_INPUT'
      | 'SESSION_NOT_FOUND'
      | 'SESSION_NOT_ACTIVE'
      | 'STEP_MISMATCH'
      | 'TASK_NOT_SUPPORTED'
      | 'TASK_INVALID'
      | 'IDEMPOTENCY_CONFLICT',
  ) {
    super(message);
    this.name = 'AssetPracticeValidationError';
  }
}

/**
 * P05 的状态裁决全部在本地完成。该服务只保存自报和文字；不读取、推断或评价口头过程。
 */
export class AssetPracticeService {
  constructor(private readonly prisma: PrismaClient) {}

  async start(input: StartAssetPracticeSessionInput) {
    const userId = input.userId ?? LOCAL_USER_ID;
    if (Boolean(input.trainingTaskId) === Boolean(input.retrainFromSessionId)) {
      throw new AssetPracticeValidationError(
        '请从一项单资产训练任务开始，或从已有训练会话重新开始。',
        'INVALID_INPUT',
      );
    }

    const source = input.trainingTaskId
      ? await this.resolveTaskSource(userId, input.trainingTaskId)
      : await this.resolveRetrainSource(userId, input.retrainFromSessionId!);

    if (!input.retrainFromSessionId) {
      const existing = await this.prisma.assetPracticeSession.findFirst({
        where: {
          userId,
          trainingTaskId: source.trainingTaskId,
          personalAssetVersionId: source.personalAssetVersionId,
          status: 'IN_PROGRESS',
        },
        orderBy: { updatedAt: 'desc' },
        select: { id: true },
      });
      if (existing) return { sessionId: existing.id, reused: true };
    }

    const now = new Date();
    const session = await this.prisma.assetPracticeSession.create({
      data: {
        userId,
        personalAssetId: source.personalAssetId,
        personalAssetVersionId: source.personalAssetVersionId,
        trainingTaskId: source.trainingTaskId,
        checkpoint: {
          create: {
            currentStep: 'READING',
            payloadJson: JSON.stringify({ stepStartedAt: now.toISOString() }),
          },
        },
      },
      select: { id: true },
    });
    return { sessionId: session.id, reused: false };
  }

  async getSnapshot(assetPracticeSessionId: string, userId = LOCAL_USER_ID) {
    const session = await this.prisma.assetPracticeSession.findFirst({
      where: { id: assetPracticeSessionId, userId },
      include: {
        checkpoint: true,
        attempts: { orderBy: { startedAt: 'asc' } },
        personalAssetVersion: {
          include: {
            nodes: { orderBy: { sequence: 'asc' } },
            expressionUnits: { orderBy: { id: 'asc' } },
            flowSpans: { orderBy: { sequence: 'asc' } },
          },
        },
        personalAsset: {
          include: {
            sourceAsset: {
              include: {
                versions: {
                  where: { status: 'CONFIRMED' },
                  orderBy: { version: 'desc' },
                  take: 1,
                  select: { title: true, coreFlow: true, extendedFlow: true, version: true },
                },
              },
            },
          },
        },
      },
    });
    if (!session) {
      throw new AssetPracticeValidationError('资产训练会话不存在。', 'SESSION_NOT_FOUND');
    }

    return {
      id: session.id,
      currentStep: session.currentStep as P05Step,
      status: session.status,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      checkpoint: session.checkpoint
        ? {
            currentStep: session.checkpoint.currentStep as P05Step,
            payload: parseCheckpointPayload(session.checkpoint.payloadJson),
            updatedAt: session.checkpoint.updatedAt,
          }
        : null,
      personalAsset: {
        id: session.personalAsset.id,
        sourceReference: session.personalAsset.sourceAsset.versions[0]
          ? {
              title: session.personalAsset.sourceAsset.versions[0].title,
              coreFlow: session.personalAsset.sourceAsset.versions[0].coreFlow,
              extendedFlow: session.personalAsset.sourceAsset.versions[0].extendedFlow,
              version: session.personalAsset.sourceAsset.versions[0].version,
            }
          : null,
      },
      personalAssetVersion: session.personalAssetVersion,
      attempts: session.attempts,
      anchorQuestion: `在一个你真实遇到的情境中，你会如何调用「${session.personalAssetVersion.triggerName}」这项个人语流？`,
    };
  }

  async saveCheckpoint(input: SaveAssetPracticeCheckpointInput) {
    const userId = input.userId ?? LOCAL_USER_ID;
    assertP05Step(input.currentStep);
    const payload = sanitizeCheckpointPayload(input.payload);
    assertCheckpointHintForStep(input.currentStep, payload.highestHintLevel);

    return this.prisma.$transaction(async (transaction) => {
      const session = await transaction.assetPracticeSession.findFirst({
        where: { id: input.assetPracticeSessionId, userId },
        include: { checkpoint: true },
      });
      assertActiveSession(session);
      if (session.currentStep !== input.currentStep) {
        throw new AssetPracticeValidationError(
          '训练步骤已变化，请先刷新当前会话。',
          'STEP_MISMATCH',
        );
      }

      const currentPayload = parseCheckpointPayload(session.checkpoint?.payloadJson ?? null);
      const nextPayload = {
        ...currentPayload,
        ...payload,
        stepStartedAt: currentPayload.stepStartedAt ?? new Date().toISOString(),
      } satisfies CheckpointPayload;

      return transaction.assetPracticeCheckpoint.upsert({
        where: { assetPracticeSessionId: session.id },
        update: { currentStep: input.currentStep, payloadJson: JSON.stringify(nextPayload) },
        create: {
          assetPracticeSessionId: session.id,
          currentStep: input.currentStep,
          payloadJson: JSON.stringify(nextPayload),
        },
      });
    });
  }

  async saveAttempt(input: SaveAssetPracticeAttemptInput) {
    const userId = input.userId ?? LOCAL_USER_ID;
    assertP05Step(input.stepType);
    if (!input.idempotencyKey.trim()) {
      throw new AssetPracticeValidationError('保存请求缺少幂等键。', 'INVALID_INPUT');
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.assetPracticeAttempt.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (existing) return assertMatchingAttempt(existing, input);

        const session = await transaction.assetPracticeSession.findFirst({
          where: { id: input.assetPracticeSessionId, userId },
          include: { checkpoint: true },
        });
        assertActiveSession(session);
        if (session.currentStep !== input.stepType) {
          throw new AssetPracticeValidationError('当前步骤与提交内容不一致。', 'STEP_MISMATCH');
        }

        const attemptData = attemptDataFor(
          input,
          durationFor(session.startedAt, session.checkpoint),
        );
        const nextStep = nextP05Step(input.stepType);
        const completedAt = nextStep ? null : new Date();
        const checkpointPayload = nextStep
          ? JSON.stringify({ stepStartedAt: new Date().toISOString() })
          : JSON.stringify({});

        const attempt = await transaction.assetPracticeAttempt.create({
          data: { assetPracticeSessionId: session.id, ...attemptData },
        });
        await transaction.assetPracticeSession.update({
          where: { id: session.id },
          data: {
            currentStep: nextStep ?? 'ANCHOR_TEXT',
            status: nextStep ? 'IN_PROGRESS' : 'COMPLETED',
            completedAt,
          },
        });
        await transaction.assetPracticeCheckpoint.upsert({
          where: { assetPracticeSessionId: session.id },
          update: {
            currentStep: nextStep ?? 'ANCHOR_TEXT',
            payloadJson: checkpointPayload,
          },
          create: {
            assetPracticeSessionId: session.id,
            currentStep: nextStep ?? 'ANCHOR_TEXT',
            payloadJson: checkpointPayload,
          },
        });
        return attempt;
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }

      const existing = await this.prisma.assetPracticeAttempt.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) return assertMatchingAttempt(existing, input);
      throw error;
    }
  }

  private async resolveTaskSource(userId: string, trainingTaskId: string) {
    const task = await this.prisma.trainingTask.findFirst({
      where: { id: trainingTaskId, dailyPlan: { userId } },
      include: { dailyPlan: { select: { userId: true } } },
    });
    if (!task || !task.targetEntityId) {
      throw new AssetPracticeValidationError(
        '本地训练任务不存在或不包含个人资产。',
        'TASK_INVALID',
      );
    }
    if (task.taskType === 'ASSET_STITCHING') {
      throw new AssetPracticeValidationError(
        '多资产拼贴不属于本轮单资产训练会话。',
        'TASK_NOT_SUPPORTED',
      );
    }
    if (
      !['ASSET_READING', 'ASSET_REPRODUCTION', 'SINGLE_ASSET_INVOCATION'].includes(task.taskType)
    ) {
      throw new AssetPracticeValidationError(
        '该训练任务不能进入 P05 五步会话。',
        'TASK_NOT_SUPPORTED',
      );
    }

    const personalAssetVersionId = versionIdFromTask(task.eligibilityJson);
    const version = await this.prisma.personalAssetVersion.findFirst({
      where: {
        id: personalAssetVersionId,
        personalAssetId: task.targetEntityId,
        status: 'CONFIRMED',
        personalAsset: { userId },
      },
      select: { id: true, personalAssetId: true },
    });
    if (!version) {
      throw new AssetPracticeValidationError('训练任务的个人资产版本已不可用。', 'TASK_INVALID');
    }
    return {
      trainingTaskId: task.id,
      personalAssetId: version.personalAssetId,
      personalAssetVersionId: version.id,
    };
  }

  private async resolveRetrainSource(userId: string, sessionId: string) {
    const session = await this.prisma.assetPracticeSession.findFirst({
      where: { id: sessionId, userId },
      select: { trainingTaskId: true, personalAssetId: true, personalAssetVersionId: true },
    });
    if (!session) {
      throw new AssetPracticeValidationError('原训练会话不存在。', 'SESSION_NOT_FOUND');
    }
    return session;
  }
}

function attemptDataFor(input: SaveAssetPracticeAttemptInput, durationMs: number) {
  if (input.stepType === 'READING') {
    return {
      stepType: input.stepType,
      modality: 'READ_ONLY' as const,
      status: 'COMPLETED' as const,
      durationMs,
      completedAt: new Date(),
      idempotencyKey: input.idempotencyKey,
    };
  }

  if (isOralStep(input.stepType)) {
    const oralAttemptConfirmed = input.oralAttemptConfirmed ?? false;
    const completionRating = input.completionRating ?? null;
    const difficultyRating = input.difficultyRating ?? null;
    if (
      !canSaveOralAttempt({
        oralAttemptConfirmed,
        completionRating,
        difficultyRating,
        isSaving: false,
      })
    ) {
      throw new AssetPracticeValidationError('口头尝试尚未完成必填确认与自评。', 'INVALID_INPUT');
    }
    const highestHintLevel = input.highestHintLevel ?? 'H0_NONE';
    assertHintLevelForStep(input.stepType, highestHintLevel);
    return {
      stepType: input.stepType,
      modality: 'ORAL_SELF_REPORT' as const,
      status: 'COMPLETED' as const,
      oralAttemptConfirmed,
      completionRating,
      difficultyRating,
      highestHintLevel,
      durationMs,
      completedAt: new Date(),
      idempotencyKey: input.idempotencyKey,
    };
  }

  const textAnswer = input.textAnswer?.trim() ?? '';
  if (
    !canSubmitTextAnswer({ text: textAnswer, sessionVersionIsCurrent: true, isSubmitting: false })
  ) {
    throw new AssetPracticeValidationError('提交文字去除首尾空白后不能为空。', 'INVALID_INPUT');
  }
  return {
    stepType: input.stepType,
    modality: 'TEXT' as const,
    status: 'COMPLETED' as const,
    textAnswer,
    durationMs,
    completedAt: new Date(),
    idempotencyKey: input.idempotencyKey,
  };
}

function assertMatchingAttempt(
  attempt: { assetPracticeSessionId: string; stepType: string },
  input: SaveAssetPracticeAttemptInput,
) {
  if (
    attempt.assetPracticeSessionId !== input.assetPracticeSessionId ||
    attempt.stepType !== input.stepType
  ) {
    throw new AssetPracticeValidationError(
      '幂等键不能复用于另一项训练尝试。',
      'IDEMPOTENCY_CONFLICT',
    );
  }
  return attempt;
}

function assertActiveSession(
  session: { status: string; currentStep: string } | null,
): asserts session is {
  status: string;
  currentStep: P05Step;
  startedAt: Date;
  checkpoint: { payloadJson: string | null } | null;
} {
  if (!session) {
    throw new AssetPracticeValidationError('资产训练会话不存在。', 'SESSION_NOT_FOUND');
  }
  if (session.status !== 'IN_PROGRESS') {
    throw new AssetPracticeValidationError('资产训练会话已经结束或失效。', 'SESSION_NOT_ACTIVE');
  }
}

function nextP05Step(step: P05Step): P05Step | null {
  const index = P05_STEPS.indexOf(step);
  return P05_STEPS[index + 1] ?? null;
}

function isOralStep(step: P05Step) {
  return step === 'KEYWORD_RECALL' || step === 'LOGIC_SKELETON_RECALL' || step === 'NO_HINT_RECALL';
}

function assertP05Step(step: string): asserts step is P05Step {
  if (!P05_STEPS.includes(step as P05Step)) {
    throw new AssetPracticeValidationError('这不是本轮可保存的 P05 步骤。', 'INVALID_INPUT');
  }
}

function assertHintLevelForStep(step: P05Step, hintLevel: HintLevel) {
  if (!isHintLevel(hintLevel)) {
    throw new AssetPracticeValidationError('主动提示等级无效。', 'INVALID_INPUT');
  }
  if (step !== 'LOGIC_SKELETON_RECALL' && hintLevel !== 'H0_NONE') {
    throw new AssetPracticeValidationError('本步骤不允许记录主动展开提示。', 'INVALID_INPUT');
  }
}

function assertCheckpointHintForStep(step: P05Step, hintLevel: HintLevel | undefined) {
  if (!hintLevel || hintLevel === 'H0_NONE') return;
  if (step !== 'LOGIC_SKELETON_RECALL') {
    throw new AssetPracticeValidationError('当前步骤不允许保存主动展开提示。', 'INVALID_INPUT');
  }
}

function isHintLevel(value: unknown): value is HintLevel {
  return (
    typeof value === 'string' &&
    [
      'H0_NONE',
      'H1_ANGLE',
      'H2_ASSET_NAME',
      'H3_LOGIC_NODES',
      'H4_ENGLISH_CHUNKS',
      'H5_FULL_FLOW',
    ].includes(value)
  );
}

function versionIdFromTask(eligibilityJson: string | null) {
  try {
    const parsed = JSON.parse(eligibilityJson ?? '{}') as { personalAssetVersionId?: unknown };
    if (typeof parsed.personalAssetVersionId === 'string' && parsed.personalAssetVersionId) {
      return parsed.personalAssetVersionId;
    }
  } catch {
    // 继续使用统一任务无效错误，避免把不可信 JSON 作为版本引用。
  }
  throw new AssetPracticeValidationError('训练任务缺少已冻结的个人资产版本。', 'TASK_INVALID');
}

function durationFor(startedAt: Date, checkpoint: { payloadJson: string | null } | null) {
  const payload = parseCheckpointPayload(checkpoint?.payloadJson ?? null);
  const checkpointStartedAt = payload.stepStartedAt
    ? new Date(payload.stepStartedAt).getTime()
    : NaN;
  const start = Number.isNaN(checkpointStartedAt) ? startedAt.getTime() : checkpointStartedAt;
  return Math.max(0, Date.now() - start);
}

function sanitizeCheckpointPayload(payload: CheckpointPayload) {
  if (typeof payload !== 'object' || payload === null) {
    throw new AssetPracticeValidationError('Checkpoint 内容无效。', 'INVALID_INPUT');
  }
  const result: CheckpointPayload = {};
  if (typeof payload.oralAttemptConfirmed === 'boolean') {
    result.oralAttemptConfirmed = payload.oralAttemptConfirmed;
  }
  if (payload.completionRating === null || isCompletionRating(payload.completionRating)) {
    result.completionRating = payload.completionRating;
  }
  if (payload.difficultyRating === null || isDifficultyRating(payload.difficultyRating)) {
    result.difficultyRating = payload.difficultyRating;
  }
  if (payload.highestHintLevel !== undefined) {
    if (!isHintLevel(payload.highestHintLevel)) {
      throw new AssetPracticeValidationError('Checkpoint 提示等级无效。', 'INVALID_INPUT');
    }
    result.highestHintLevel = payload.highestHintLevel;
  }
  if (payload.textDraft !== undefined) {
    if (typeof payload.textDraft !== 'string') {
      throw new AssetPracticeValidationError('Checkpoint 文字草稿无效。', 'INVALID_INPUT');
    }
    result.textDraft = payload.textDraft;
  }
  return result;
}

function parseCheckpointPayload(value: string | null): CheckpointPayload {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as CheckpointPayload;
    const payload = sanitizeCheckpointPayload({
      oralAttemptConfirmed: parsed.oralAttemptConfirmed,
      completionRating: parsed.completionRating,
      difficultyRating: parsed.difficultyRating,
      highestHintLevel: parsed.highestHintLevel,
      textDraft: parsed.textDraft,
    });
    if (typeof parsed.stepStartedAt === 'string') {
      payload.stepStartedAt = parsed.stepStartedAt;
    }
    return payload;
  } catch {
    return {};
  }
}

function isCompletionRating(value: unknown): value is CompletionRating {
  return (
    typeof value === 'string' && ['COMPLETE', 'BASIC', 'PARTIAL', 'NOT_COMPLETED'].includes(value)
  );
}

function isDifficultyRating(value: unknown): value is DifficultyRating {
  return typeof value === 'string' && ['EASY', 'RIGHT', 'DIFFICULT'].includes(value);
}
