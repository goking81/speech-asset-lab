import type { InternalStage, PrismaClient, VisibleStage } from '@prisma/client';

import {
  individualEligibilityFor,
  LOCAL_ELIGIBILITY_RULE_VERSION,
  type LocalTrainingTaskType,
} from './local-eligibility';

type PlanInput = {
  userId?: string;
  now?: Date;
};

type PlannedAsset = {
  personalAssetId: string;
  personalAssetVersionId: string;
  triggerName: string;
  internalStage: InternalStage;
  visibleStage: VisibleStage;
  nextReviewAt: Date | null;
};

type EligibilitySnapshot = {
  ruleVersion: typeof LOCAL_ELIGIBILITY_RULE_VERSION;
  source: 'LOCAL_RULE';
  internalStage: InternalStage;
  visibleStage: VisibleStage;
  reasonCode: string;
  personalAssetVersionId: string;
  triggerName: string;
  participantPersonalAssetIds?: string[];
  participantTriggerNames?: string[];
};

export type LocalDailyPlanTask = {
  id: string;
  taskType: LocalTrainingTaskType;
  sequence: number;
  status: string;
  reason: string | null;
  targetEntityId: string | null;
  assetName: string | null;
  internalStage: InternalStage | null;
  visibleStage: VisibleStage | null;
  participantNames: string[];
};

export type LocalDailyPlan = {
  id: string;
  planDate: Date;
  status: string;
  reason: string | null;
  tasks: LocalDailyPlanTask[];
};

/**
 * 只根据本地已确认个人资产和 UserAssetState 生成日计划。
 * AI 既不参与阶段判断，也不能修改这里生成的资格快照。
 */
export class LocalDailyPlanService {
  constructor(private readonly prisma: PrismaClient) {}

  async getOrCreateTodayPlan(input: PlanInput = {}): Promise<LocalDailyPlan> {
    const userId = input.userId ?? 'local-user';
    const planDate = startOfShanghaiDay(input.now ?? new Date());
    await this.ensureUser(userId);

    const existingPlan = await this.prisma.dailyPlan.findUnique({
      where: { userId_planDate: { userId, planDate } },
      include: { tasks: { orderBy: { sequence: 'asc' } } },
    });
    if (existingPlan) {
      // 导入或确认资产可能发生在当天首次打开训练页之后；此前的空计划不能阻止新资产进入训练。
      if (existingPlan.tasks.length > 0 || !isRegenerableEmptyPlan(existingPlan.reason)) {
        return toLocalDailyPlan(existingPlan);
      }
      await this.prisma.dailyPlan.delete({ where: { id: existingPlan.id } });
    }

    await this.ensureStatesForConfirmedAssets(userId);
    const [assets, confirmedAssetCount] = await Promise.all([
      this.findEligibleAssets(userId),
      this.prisma.personalAsset.count({
        where: { userId, versions: { some: { status: 'CONFIRMED' } } },
      }),
    ]);
    const taskData = buildTaskData(assets);

    const plan = await this.prisma.dailyPlan.upsert({
      where: { userId_planDate: { userId, planDate } },
      update: {},
      create: {
        userId,
        planDate,
        reason: planReasonFor(assets, confirmedAssetCount),
        tasks: { create: taskData },
      },
      include: { tasks: { orderBy: { sequence: 'asc' } } },
    });

    return toLocalDailyPlan(plan);
  }

  private async ensureUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (user) return;

    if (userId === 'local-user') {
      await this.prisma.user.upsert({
        where: { id: 'local-user' },
        update: {},
        create: { id: 'local-user', displayName: 'Local User' },
      });
      return;
    }

    throw new LocalDailyPlanValidationError('本地用户不存在，无法生成日计划。');
  }

  private async ensureStatesForConfirmedAssets(userId: string) {
    await this.prisma.$transaction(async (transaction) => {
      const [user, confirmedAssets, activeStateCount] = await Promise.all([
        transaction.user.findUniqueOrThrow({
          where: { id: userId },
          select: { activeAssetLimit: true },
        }),
        transaction.personalAsset.findMany({
          where: { userId, versions: { some: { status: 'CONFIRMED' } } },
          select: { id: true, createdAt: true, state: { select: { id: true } } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        }),
        transaction.userAssetState.count({ where: { userId, isActive: true } }),
      ]);

      let availableSlots = Math.max(0, user.activeAssetLimit - activeStateCount);
      for (const asset of confirmedAssets) {
        if (asset.state) continue;

        await transaction.userAssetState.create({
          data: {
            userId,
            personalAssetId: asset.id,
            isActive: availableSlots > 0,
          },
        });
        availableSlots -= 1;
      }
    });
  }

  private async findEligibleAssets(userId: string): Promise<PlannedAsset[]> {
    const states = await this.prisma.userAssetState.findMany({
      where: {
        userId,
        isActive: true,
        learningState: { not: 'ARCHIVED' },
        personalAsset: { versions: { some: { status: 'CONFIRMED' } } },
      },
      select: {
        personalAssetId: true,
        internalStage: true,
        visibleStage: true,
        nextReviewAt: true,
        personalAsset: {
          select: {
            versions: {
              where: { status: 'CONFIRMED' },
              orderBy: { version: 'desc' },
              take: 1,
              select: { id: true, triggerName: true },
            },
          },
        },
      },
    });

    return states
      .flatMap((state) => {
        const version = state.personalAsset.versions[0];
        if (!version) return [];
        return [
          {
            personalAssetId: state.personalAssetId,
            personalAssetVersionId: version.id,
            triggerName: version.triggerName,
            internalStage: state.internalStage,
            visibleStage: state.visibleStage,
            nextReviewAt: state.nextReviewAt,
          },
        ];
      })
      .sort(compareAssetsForPlan);
  }
}

export class LocalDailyPlanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalDailyPlanValidationError';
  }
}

function buildTaskData(assets: PlannedAsset[]) {
  const stitchableAssets = assets.filter(
    (asset) =>
      asset.internalStage === 'S3' || asset.internalStage === 'S4' || asset.internalStage === 'S5',
  );
  const stitchingUnlocked = stitchableAssets.length >= 2;
  const taskInputs: Array<{
    taskType: LocalTrainingTaskType;
    sequence: number;
    targetEntityId: string;
    reason: string;
    eligibilityJson: string;
  }> = [];

  for (const asset of assets) {
    const eligibility = individualEligibilityFor(asset.internalStage, stitchableAssets.length);
    if (eligibility.taskType === 'ASSET_STITCHING' && stitchingUnlocked) continue;

    taskInputs.push({
      taskType: eligibility.taskType,
      sequence: taskInputs.length + 1,
      targetEntityId: asset.personalAssetId,
      reason: eligibility.reason,
      eligibilityJson: JSON.stringify(snapshotFor(asset, eligibility)),
    });
  }

  if (stitchingUnlocked) {
    const participants = stitchableAssets.slice(0, 2);
    const primary = participants[0];
    const eligibility = individualEligibilityFor(primary.internalStage, stitchableAssets.length);
    taskInputs.push({
      taskType: 'ASSET_STITCHING',
      sequence: taskInputs.length + 1,
      targetEntityId: primary.personalAssetId,
      reason: eligibility.reason,
      eligibilityJson: JSON.stringify({
        ...snapshotFor(primary, eligibility),
        participantPersonalAssetIds: participants.map((asset) => asset.personalAssetId),
        participantTriggerNames: participants.map((asset) => asset.triggerName),
      } satisfies EligibilitySnapshot),
    });
  }

  return taskInputs;
}

function snapshotFor(
  asset: PlannedAsset,
  eligibility: ReturnType<typeof individualEligibilityFor>,
) {
  return {
    ruleVersion: LOCAL_ELIGIBILITY_RULE_VERSION,
    source: 'LOCAL_RULE' as const,
    internalStage: asset.internalStage,
    visibleStage: eligibility.visibleStage,
    reasonCode: eligibility.reasonCode,
    personalAssetVersionId: asset.personalAssetVersionId,
    triggerName: asset.triggerName,
  } satisfies EligibilitySnapshot;
}

function planReasonFor(assets: PlannedAsset[], confirmedAssetCount: number) {
  if (confirmedAssetCount === 0) return 'NO_CONFIRMED_PERSONAL_ASSETS';
  if (assets.length === 0) return 'NO_ACTIVE_CONFIRMED_PERSONAL_ASSETS';
  return 'LOCAL_ELIGIBILITY_RULES_V1';
}

function isRegenerableEmptyPlan(reason: string | null) {
  return (
    reason === 'NO_CONFIRMED_PERSONAL_ASSETS' || reason === 'NO_ACTIVE_CONFIRMED_PERSONAL_ASSETS'
  );
}

function compareAssetsForPlan(left: PlannedAsset, right: PlannedAsset) {
  const leftDueAt = left.nextReviewAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  const rightDueAt = right.nextReviewAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  if (leftDueAt !== rightDueAt) return leftDueAt - rightDueAt;
  return left.personalAssetId.localeCompare(right.personalAssetId);
}

function toLocalDailyPlan(plan: {
  id: string;
  planDate: Date;
  status: string;
  reason: string | null;
  tasks: Array<{
    id: string;
    taskType: string;
    sequence: number;
    status: string;
    reason: string | null;
    targetEntityId: string | null;
    eligibilityJson: string | null;
  }>;
}): LocalDailyPlan {
  return {
    id: plan.id,
    planDate: plan.planDate,
    status: plan.status,
    reason: plan.reason,
    tasks: plan.tasks.map((task) => {
      const snapshot = parseSnapshot(task.eligibilityJson);
      return {
        id: task.id,
        taskType: task.taskType as LocalTrainingTaskType,
        sequence: task.sequence,
        status: task.status,
        reason: task.reason,
        targetEntityId: task.targetEntityId,
        assetName: snapshot?.triggerName ?? null,
        internalStage: snapshot?.internalStage ?? null,
        visibleStage: snapshot?.visibleStage ?? null,
        participantNames: snapshot?.participantTriggerNames ?? [],
      };
    }),
  };
}

function parseSnapshot(value: string | null): EligibilitySnapshot | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<EligibilitySnapshot>;
    if (
      parsed.ruleVersion !== LOCAL_ELIGIBILITY_RULE_VERSION ||
      typeof parsed.triggerName !== 'string' ||
      !isInternalStage(parsed.internalStage) ||
      !isVisibleStage(parsed.visibleStage)
    ) {
      return null;
    }
    return {
      ruleVersion: LOCAL_ELIGIBILITY_RULE_VERSION,
      source: 'LOCAL_RULE',
      internalStage: parsed.internalStage,
      visibleStage: parsed.visibleStage,
      reasonCode: typeof parsed.reasonCode === 'string' ? parsed.reasonCode : 'LOCAL_SNAPSHOT',
      personalAssetVersionId:
        typeof parsed.personalAssetVersionId === 'string' ? parsed.personalAssetVersionId : '',
      triggerName: parsed.triggerName,
      participantPersonalAssetIds: Array.isArray(parsed.participantPersonalAssetIds)
        ? parsed.participantPersonalAssetIds.filter(
            (item): item is string => typeof item === 'string',
          )
        : undefined,
      participantTriggerNames: Array.isArray(parsed.participantTriggerNames)
        ? parsed.participantTriggerNames.filter((item): item is string => typeof item === 'string')
        : undefined,
    };
  } catch {
    return null;
  }
}

function isInternalStage(value: unknown): value is InternalStage {
  return typeof value === 'string' && ['S0', 'S1', 'S2', 'S3', 'S4', 'S5'].includes(value);
}

function isVisibleStage(value: unknown): value is VisibleStage {
  return (
    typeof value === 'string' &&
    ['ASSET_ACCUMULATION', 'SINGLE_ASSET_INVOCATION', 'STITCHING'].includes(value)
  );
}

function startOfShanghaiDay(now: Date) {
  const values = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});

  return new Date(
    Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), 0, 0, 0),
  );
}
