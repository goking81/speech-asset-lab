import { describe, expect, test } from 'vitest';

import { individualEligibilityFor, visibleStageFor } from './local-eligibility';

describe('本地资产资格规则', () => {
  test.each([
    ['S0', 'ASSET_ACCUMULATION'],
    ['S1', 'ASSET_ACCUMULATION'],
    ['S2', 'SINGLE_ASSET_INVOCATION'],
    ['S3', 'STITCHING'],
    ['S4', 'STITCHING'],
    ['S5', 'STITCHING'],
  ] as const)('将 %s 映射到可见阶段 %s', (internalStage, visibleStage) => {
    expect(visibleStageFor(internalStage)).toBe(visibleStage);
  });

  test('新人 S0 只能先获得熟读任务', () => {
    expect(individualEligibilityFor('S0', 0)).toMatchObject({
      taskType: 'ASSET_READING',
      reasonCode: 'LOCAL_STAGE_S0_READING',
    });
  });

  test('只有一项 S3 资产时不解锁拼贴', () => {
    expect(individualEligibilityFor('S3', 1)).toMatchObject({
      taskType: 'SINGLE_ASSET_INVOCATION',
      reasonCode: 'LOCAL_STITCHING_LOCKED_INSUFFICIENT_ASSETS',
    });
  });

  test('至少两项 S3 以上资产才允许拼贴', () => {
    expect(individualEligibilityFor('S3', 2)).toMatchObject({
      taskType: 'ASSET_STITCHING',
      reasonCode: 'LOCAL_STAGE_S3_PLUS_STITCHING',
    });
  });
});
