import { expect, test } from '@playwright/test';

test('today page separates local tasks from an unrequested Coach draft', async ({ page }) => {
  let coachRequestCount = 0;
  await page.route('**/api/plans/today/coach', async (route) => {
    coachRequestCount += 1;
    await route.fulfill({ status: 500, body: '{}' });
  });
  await page.route('**/api/plans/today', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        plan: {
          reason: 'LOCAL_ELIGIBILITY_RULES_V1',
          tasks: [
            {
              id: 'local-task-1',
              taskType: 'ASSET_READING',
              sequence: 1,
              reason: '当前处于资产积累期，先进行熟读。',
              assetName: '工作复盘',
              internalStage: 'S0',
              participantNames: [],
            },
          ],
        },
        coach: {
          status: 'NOT_REQUESTED',
          taskStatus: null,
          advice: null,
          fallbackReason: null,
        },
      }),
    });
  });

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'AI Coach 建议', level: 2 })).toBeVisible();
  await expect(page.getByText('工作复盘')).toBeVisible();
  await expect(page.getByText('当前任务顺序和资格理由完全来自本地规则。')).toBeVisible();
  await expect(page.getByRole('button', { name: '请求 R5 Coach 草稿' })).toBeVisible();
  expect(coachRequestCount).toBe(0);
});
