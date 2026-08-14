import { expect, test, type Page } from '@playwright/test';

test('P09 显示两次回答、六维事实与受限的 R7C 草稿', async ({ page }) => {
  await mockReview(page, completeReview());
  await page.goto('/practice/demo-review/review');

  await expect(page.getByRole('heading', { name: '回答复盘', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '第一次回答', level: 2 })).toBeVisible();
  await expect(page.getByText('I clarify the change.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '六维本地比较', level: 2 })).toBeVisible();
  await expect(page.getByText('问题相关性', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'R7C 草稿解释', level: 2 })).toBeVisible();
  await expect(page.getByText('第二次已保存文本在该本地维度上显示增加。')).toBeVisible();
});

test('P09 对部分事实保留未生成状态，不伪造解释', async ({ page }) => {
  const base = completeReview();
  const review = {
    ...base,
    status: 'PARTIAL',
    comparison: {
      ...base.comparison,
      factsStatus: 'PARTIAL',
      interpretationStatus: 'PARTIAL',
      finalDisplayStatus: 'PARTIAL',
      secondTotalScore: null,
      interpretation: null,
    },
    localTemplate:
      '本次仅展示已保存文字与可回链的局部事实。存在不完整评价，系统不会补写六维、总分或对比结论。',
  };
  await mockReview(page, review);
  await page.goto('/practice/demo-review/review');

  await expect(page.getByText('未生成', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '本地模板', level: 2 })).toBeVisible();
  await expect(page.getByText('R7C 草稿暂不可用。')).toBeVisible();
});

async function mockReview(page: Page, review: unknown) {
  await page.route('**/api/training/sessions/demo-review/review', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ review }) });
  });
}

function completeReview() {
  return {
    status: 'COMPLETE',
    question: 'How do you respond when a project changes?',
    answers: {
      first: {
        id: 'first',
        text: 'I clarify the change.',
        units: [{ id: 'unit-1', sequence: 1, text: 'I clarify the change.' }],
      },
      second: {
        id: 'second',
        text: 'I clarify the change. I choose one useful action.',
        units: [
          { id: 'unit-2', sequence: 1, text: 'I clarify the change.' },
          { id: 'unit-3', sequence: 2, text: 'I choose one useful action.' },
        ],
      },
    },
    comparison: {
      id: 'comparison-1',
      factsStatus: 'COMPLETE',
      interpretationStatus: 'DRAFT_READY',
      finalDisplayStatus: 'COMPLETE',
      firstTotalScore: 80,
      secondTotalScore: 88,
      limitations: [],
      dimensions: [
        {
          id: 'QUESTION_RELEVANCE',
          label: '问题相关性',
          firstRating: 70,
          secondRating: 78,
          firstStatus: 'VALID',
          secondStatus: 'VALID',
          changeType: 'INCREASED',
        },
      ],
      obligations: [
        {
          id: 'obligation-1',
          description: '说明采取的行动',
          firstStatus: 'NOT_COVERED',
          secondStatus: 'COVERED',
          changeType: 'COVERED_NOW',
        },
      ],
      nodes: [
        {
          id: 'node-1',
          text: 'I choose one useful action.',
          firstUsed: false,
          secondUsed: true,
          changeType: 'ADDED',
        },
      ],
      interpretation: {
        observations: [
          {
            factId: 'dimension:QUESTION_RELEVANCE',
            changeType: 'INCREASED',
            text: '第二次已保存文本在该本地维度上显示增加。',
          },
        ],
        limitation: '此草稿只基于已保存文字与冻结本地事实。',
      },
    },
    localTemplate: '以下 AI 内容仅解释已冻结的本地比较事实，不会改变回答、资产调用或总分。',
  };
}
