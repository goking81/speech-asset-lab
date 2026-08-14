import { expect, test } from '@playwright/test';

test('asset library preserves the training sequence with either local data state', async ({
  page,
}) => {
  await page.goto('/assets');

  await expect(page.getByRole('heading', { name: '资产库', level: 1 })).toBeVisible();
  await expect(page.getByText('尚未进入多资产拼贴')).toBeVisible();
  await expect(page.locator('.asset-library')).toBeVisible();
});

test('asset detail remains usable at the desktop minimum width when no personal version exists', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/assets/nonexistent-asset');

  await expect(page.getByText('来源资产不存在或尚未确认。')).toBeVisible();
});
