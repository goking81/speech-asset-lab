import type { InternalStage, VisibleStage } from '@prisma/client';

export const LOCAL_ELIGIBILITY_RULE_VERSION = 'local-eligibility-v1';

export type LocalTrainingTaskType =
  'ASSET_READING' | 'ASSET_REPRODUCTION' | 'SINGLE_ASSET_INVOCATION' | 'ASSET_STITCHING';

export type LocalEligibility = {
  taskType: LocalTrainingTaskType;
  visibleStage: VisibleStage;
  reasonCode: string;
  reason: string;
};

export function visibleStageFor(internalStage: InternalStage): VisibleStage {
  if (internalStage === 'S0' || internalStage === 'S1') return 'ASSET_ACCUMULATION';
  if (internalStage === 'S2') return 'SINGLE_ASSET_INVOCATION';
  return 'STITCHING';
}

/**
 * 资格只由本地阶段和已满足的资产数量决定；这里绝不调用 AI，也不接收 AI 结果。
 */
export function individualEligibilityFor(
  internalStage: InternalStage,
  stitchableAssetCount: number,
): LocalEligibility {
  const visibleStage = visibleStageFor(internalStage);

  switch (internalStage) {
    case 'S0':
      return {
        taskType: 'ASSET_READING',
        visibleStage,
        reasonCode: 'LOCAL_STAGE_S0_READING',
        reason: '当前处于资产积累期，先进行熟读。',
      };
    case 'S1':
      return {
        taskType: 'ASSET_REPRODUCTION',
        visibleStage,
        reasonCode: 'LOCAL_STAGE_S1_REPRODUCTION',
        reason: '当前处于资产积累期，先进行复现。',
      };
    case 'S2':
      return {
        taskType: 'SINGLE_ASSET_INVOCATION',
        visibleStage,
        reasonCode: 'LOCAL_STAGE_S2_SINGLE_ASSET',
        reason: '当前已进入单资产调用期，仅调用这一项个人资产。',
      };
    case 'S3':
    case 'S4':
    case 'S5':
      if (stitchableAssetCount >= 2) {
        return {
          taskType: 'ASSET_STITCHING',
          visibleStage,
          reasonCode: 'LOCAL_STAGE_S3_PLUS_STITCHING',
          reason: '至少两项个人资产已满足拼贴阶段，可进行多资产拼贴。',
        };
      }
      return {
        taskType: 'SINGLE_ASSET_INVOCATION',
        visibleStage,
        reasonCode: 'LOCAL_STITCHING_LOCKED_INSUFFICIENT_ASSETS',
        reason: '尚不足两项可拼贴资产，继续进行单资产调用。',
      };
  }
}
