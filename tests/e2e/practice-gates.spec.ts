import { expect, test } from '@playwright/test';

test('P05 and P08 gate demo updates disabled buttons immediately', async ({ page }) => {
  await page.goto('/practice/gates');

  const saveButton = page.getByRole('button', { name: '保存并继续' });
  const submitButton = page.getByRole('button', { name: '提交文字' });
  await expect(saveButton).toBeDisabled();
  await expect(submitButton).toBeDisabled();

  await page.getByLabel('我已完成口头尝试').check();
  await page.getByLabel('完成情况').selectOption('COMPLETE');
  await page.getByLabel('难度').selectOption('RIGHT');
  await expect(saveButton).toBeEnabled();

  await page.getByLabel('回答文本').fill('   ');
  await expect(submitButton).toBeDisabled();
  await page.getByLabel('回答文本').fill('。');
  await expect(submitButton).toBeEnabled();
  await page.getByLabel('会话版本仍有效').uncheck();
  await expect(submitButton).toBeDisabled();
});
