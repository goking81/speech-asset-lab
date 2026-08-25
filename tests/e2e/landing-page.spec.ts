import { expect, test } from '@playwright/test';

test('官网 Landing 引导当前窗口进入工作台，并保持导航可用', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /让英语表达/ })).toBeVisible();
  const workbenchLink = page.getByRole('link', { name: '用一条内置资产开始训练' });
  await expect(workbenchLink).toHaveAttribute('href', '/lab');
  await expect(workbenchLink).not.toHaveAttribute('target', '_blank');
  await expect(page.getByRole('link', { name: '先看看资产库' })).toHaveAttribute('href', '/assets');
  await expect(page.getByRole('heading', { name: '内置资产试用版' })).toBeVisible();
  await expect(page.getByText('下一步：私有资料导入与 AI 整理')).toBeVisible();
  await expect(page.getByRole('button', { name: /导入/i })).toHaveCount(0);

  await page.locator('#trial').scrollIntoViewIfNeeded();
  await expect(page.locator('.landing-demo__nav')).toBeVisible();
  await expect(page.locator('.landing-demo__nav')).toHaveCSS('position', 'sticky');

  await page.goto('/landing');
  await expect(page).toHaveURL(/\/$/);
});
