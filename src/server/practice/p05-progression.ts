import type { AssetPracticeStep, Prisma, PrismaClient } from '@prisma/client';

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export const P05_COMPLETION_STEPS = [
  'READING',
  'KEYWORD_RECALL',
  'LOGIC_SKELETON_RECALL',
  'NO_HINT_RECALL',
  'ANCHOR_TEXT',
] as const satisfies readonly AssetPracticeStep[];

const promotableStages = ['S0', 'S1'] as const;

/**
 * 完整 P05 是进入单资产调用期的本地确定性门槛。
 * 只晋级早期活动资产，避免回写或降低后续训练阶段。
 */
export async function promoteCompletedP05Asset(
  client: DatabaseClient,
  userId: string,
  personalAssetId: string,
) {
  return client.userAssetState.updateMany({
    where: {
      userId,
      personalAssetId,
      isActive: true,
      internalStage: { in: [...promotableStages] },
      learningState: { not: 'ARCHIVED' },
    },
    data: {
      internalStage: 'S2',
      visibleStage: 'SINGLE_ASSET_INVOCATION',
      learningState: 'CALLABLE',
    },
  });
}

/**
 * 兼容此前完成 P05 但未同步资格状态的历史会话。
 * 仅以五个已完成步骤为依据；不从时长或 AI 输出推断训练结果。
 */
export async function reconcileCompletedP05Assets(client: DatabaseClient, userId: string) {
  const sessions = await client.assetPracticeSession.findMany({
    where: { userId, status: 'COMPLETED' },
    select: {
      personalAssetId: true,
      attempts: {
        where: { status: 'COMPLETED' },
        select: { stepType: true },
      },
    },
  });

  const completedAssetIds = [
    ...new Set(
      sessions.flatMap((session) =>
        P05_COMPLETION_STEPS.every((step) =>
          session.attempts.some((attempt) => attempt.stepType === step),
        )
          ? [session.personalAssetId]
          : [],
      ),
    ),
  ];
  if (completedAssetIds.length === 0) return { count: 0 };

  return client.userAssetState.updateMany({
    where: {
      userId,
      personalAssetId: { in: completedAssetIds },
      isActive: true,
      internalStage: { in: [...promotableStages] },
      learningState: { not: 'ARCHIVED' },
    },
    data: {
      internalStage: 'S2',
      visibleStage: 'SINGLE_ASSET_INVOCATION',
      learningState: 'CALLABLE',
    },
  });
}
