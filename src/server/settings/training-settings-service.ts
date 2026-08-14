import type { PrismaClient } from '@prisma/client';

export const LOCAL_USER_ID = 'local-user';

export type TrainingTargets = {
  dailyTargetMinutes: number;
  dailyNewAssetTarget: number;
  dailyNewAssetMax: number;
  activeAssetLimit: number;
};

const trainingTargetSelect = {
  dailyTargetMinutes: true,
  dailyNewAssetTarget: true,
  dailyNewAssetMax: true,
  activeAssetLimit: true,
} as const;

/** 训练目标只影响本地计划容量；阶段和解锁仍由本地规则裁决。 */
export class TrainingSettingsService {
  constructor(private readonly prisma: PrismaClient) {}

  async get(userId = LOCAL_USER_ID): Promise<TrainingTargets> {
    const user = await this.prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, displayName: 'Local User' },
      select: trainingTargetSelect,
    });
    return user;
  }

  async save(input: TrainingTargets, userId = LOCAL_USER_ID): Promise<TrainingTargets> {
    validateTrainingTargets(input);
    await this.prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, displayName: 'Local User' },
      select: { id: true },
    });
    return this.prisma.user.update({
      where: { id: userId },
      data: input,
      select: trainingTargetSelect,
    });
  }
}

export function validateTrainingTargets(value: TrainingTargets) {
  const labels: Record<keyof TrainingTargets, string> = {
    dailyTargetMinutes: '每日目标时长',
    dailyNewAssetTarget: '每日新增目标',
    dailyNewAssetMax: '每日新增上限',
    activeAssetLimit: '活跃资产上限',
  };

  for (const [key, label] of Object.entries(labels) as Array<[keyof TrainingTargets, string]>) {
    const target = value[key];
    if (!Number.isSafeInteger(target) || target < 0) {
      throw new Error(`${label}必须是非负整数。`);
    }
  }

  if (value.dailyNewAssetTarget > value.dailyNewAssetMax) {
    throw new Error('每日新增目标不能大于每日新增上限。');
  }
}
