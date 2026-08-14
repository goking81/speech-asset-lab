import { expect, test } from '@playwright/test';

test('content workspace explains the local source flow and opens the import intake', async ({
  page,
}) => {
  await page.goto('/content');

  await expect(page.getByRole('heading', { name: '内容工作台', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '导入一份来源内容' })).toBeVisible();
  await expect(page.getByText('发现重复', { exact: true })).toBeVisible();
  await expect(page.getByText('本阶段只处理来源文本', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: '导入内容' }).click();
  await expect(page).toHaveURL(/\/content\/import$/);
});
