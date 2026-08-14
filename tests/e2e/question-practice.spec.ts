import { expect, test } from '@playwright/test';

test('question practice exposes the local support boundary', async ({ page }) => {
  await page.goto('/practice');

  await expect(page.getByRole('heading', { name: '问题训练', level: 1 })).toBeVisible();
  await expect(
    page.getByText(
      '问题只能调用已经掌握的个人资产；AI 草稿始终需要你的确认，不能替你发布问题计划。',
    ),
  ).toBeVisible();
  await expect(page.locator('.question-practice')).toBeVisible();
});

test('question preparation keeps English expressions folded by default', async ({ page }) => {
  await page.route('**/api/questions/demo-plan', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        plan: {
          id: 'demo-plan',
          questionText: 'How do you respond when a project changes?',
          assets: [{ role: 'PRIMARY', triggerName: '工作复盘', version: 1 }],
          obligations: [
            {
              id: 'obligation-1',
              sequence: 1,
              description: '先说核心观点',
              englishExpression: 'I start by clarifying the change.',
              supports: [{ type: 'PERSONAL_ASSET_NODE', explanation: 'local' }],
            },
            {
              id: 'obligation-2',
              sequence: 2,
              description: '说明原因',
              englishExpression: 'That gives the team a clear direction.',
              supports: [{ type: 'PERSONAL_ASSET_NODE', explanation: 'local' }],
            },
            {
              id: 'obligation-3',
              sequence: 3,
              description: '说明结果',
              englishExpression: 'We can then move forward with confidence.',
              supports: [{ type: 'PERSONAL_ASSET_NODE', explanation: 'local' }],
            },
          ],
        },
      }),
    });
  });

  await page.goto('/practice/new?planId=demo-plan');

  await expect(page.getByRole('heading', { name: '问题准备', level: 1 })).toBeVisible();
  const firstExpression = page.getByText('I start by clarifying the change.');
  await expect(firstExpression).toBeHidden();
  await page.getByText('查看英文表达').first().click();
  await expect(firstExpression).toBeVisible();
  await expect(page.getByRole('button', { name: '开始第一次回答' })).toBeVisible();
});
