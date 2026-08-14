import { expect, test } from '@playwright/test';

test('today page states that eligibility comes from local rules', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: '今日训练', level: 1 })).toBeVisible();
  await expect(
    page.getByText('计划只依据本地个人资产状态生成；阶段、资格和拼贴解锁不由 AI 决定。'),
  ).toBeVisible();
  await expect(page.locator('.today-plan')).toBeVisible();
});
