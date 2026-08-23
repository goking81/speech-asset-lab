import { expect, test } from '@playwright/test';

test('Landing Demo explains the built-in trial without exposing private import', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/landing');

  await expect(page.getByRole('heading', { name: /让英语表达/ })).toBeVisible();
  await expect(page.getByRole('link', { name: '开始体验内置资产' })).toHaveAttribute('href', '/');
  await expect(page.getByRole('link', { name: '浏览资产库' })).toHaveAttribute('href', '/assets');
  await expect(page.getByRole('heading', { name: '内置资产试用版' })).toBeVisible();
  await expect(page.getByText('下一步：私有资料导入与 AI 整理')).toBeVisible();
  await expect(page.getByRole('button', { name: /导入/i })).toHaveCount(0);
});
