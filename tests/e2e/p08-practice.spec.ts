import { expect, test, type Page } from '@playwright/test';

type DemoSession = {
  id: string;
  businessVersion: number;
  status: string;
  phase: string;
  question: string;
  assets: Array<{ role: string; triggerName: string; version: number; coreFlow: string }>;
  obligations: Array<{
    id: string;
    sequence: number;
    description: string;
    englishExpression: string | null;
  }>;
  answers: {
    first: { id: string; text: string; createdAt: string } | null;
    second: { id: string; text: string; createdAt: string } | null;
  };
  followUp: {
    current: {
      id: string;
      issuedIndex: number;
      questionText: string;
      support: { obligationDescription: string | null; supportLabels: string[] };
    } | null;
    issuedCount: number;
    endReason: string | null;
    taskStatus: string | null;
  };
  checkpoint: { type: string; draft: string; createdAt: string } | null;
  hints: Array<unknown>;
};

test('P08 saves a single character follow-up only after showing its frozen support', async ({
  page,
}) => {
  let session: DemoSession = firstAnswerSession();

  await mockP08Routes(
    page,
    () => session,
    (next) => {
      session = next;
    },
  );
  await page.goto('/practice/demo-session');

  const firstSubmit = page.getByRole('button', { name: '保存第一次回答' });
  await expect(firstSubmit).toBeDisabled();
  await page.getByLabel('本次回答').fill('。');
  await expect(firstSubmit).toBeEnabled();
  await firstSubmit.click();

  await expect(page.getByRole('heading', { name: '受支撑追问', level: 2 })).toBeVisible();
  await expect(page.getByText('How would you explain the useful action?')).toBeVisible();
  await page.getByText('查看本题的支撑边界').click();
  await expect(page.getByText('说明采取的行动')).toBeVisible();

  const followUpSubmit = page.getByRole('button', { name: '保存追问回答' });
  await expect(followUpSubmit).toBeDisabled();
  await page.getByLabel('本次回答').fill('字');
  await expect(followUpSubmit).toBeEnabled();
  await followUpSubmit.click();

  await expect(page.getByRole('heading', { name: '第二次回答', level: 2 })).toBeVisible();
  await expect(page.getByLabel('本次回答')).toHaveValue('');
  await expect(page.getByRole('button', { name: '保存第二次回答' })).toBeDisabled();
});

test('P08 lets the user end a ready follow-up and keeps the second answer blank', async ({
  page,
}) => {
  let session: DemoSession = followUpReadySession();

  await mockP08Routes(
    page,
    () => session,
    (next) => {
      session = next;
    },
  );
  await page.goto('/practice/demo-session');

  await page.getByRole('button', { name: '结束追问并开始第二次回答' }).click();
  await expect(page.getByRole('heading', { name: '第二次回答', level: 2 })).toBeVisible();
  await expect(page.getByLabel('本次回答')).toHaveValue('');
});

async function mockP08Routes(
  page: Page,
  current: () => DemoSession,
  replace: (session: DemoSession) => void,
) {
  await page.route('**/api/training/sessions/demo-session', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ session: current() }),
      });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/training/sessions/demo-session/checkpoint', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  await page.route('**/api/training/sessions/demo-session/answers', async (route) => {
    replace(followUpReadySession());
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ answer: {}, session: current() }),
    });
  });
  await page.route('**/api/training/sessions/demo-session/follow-ups', async (route) => {
    replace(secondAnswerSession());
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ answer: {}, session: current() }),
    });
  });
  await page.route('**/api/training/sessions/demo-session/advance', async (route) => {
    replace(secondAnswerSession());
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ session: current() }),
    });
  });
}

function firstAnswerSession(): DemoSession {
  return {
    id: 'demo-session',
    businessVersion: 1,
    status: 'QUESTION_READY',
    phase: 'FIRST_ANSWER',
    question: 'How do you respond when a project changes?',
    assets: [
      {
        role: 'PRIMARY',
        triggerName: '工作复盘',
        version: 1,
        coreFlow: 'I clarify the change and choose one useful action.',
      },
    ],
    obligations: [
      {
        id: 'obligation-1',
        sequence: 1,
        description: '说明采取的行动',
        englishExpression: 'I start by clarifying the change.',
      },
    ],
    answers: { first: null, second: null },
    followUp: { current: null, issuedCount: 0, endReason: null, taskStatus: null },
    checkpoint: {
      type: 'P08_FIRST_ANSWER_DRAFT',
      draft: '',
      createdAt: '2026-07-26T00:00:00.000Z',
    },
    hints: [],
  };
}

function followUpReadySession(): DemoSession {
  return {
    ...firstAnswerSession(),
    businessVersion: 3,
    status: 'FOLLOW_UP_IN_PROGRESS',
    phase: 'AWAITING_FOLLOW_UP',
    answers: {
      first: { id: 'first-answer', text: '。', createdAt: '2026-07-26T00:01:00.000Z' },
      second: null,
    },
    followUp: {
      current: {
        id: 'follow-up-1',
        issuedIndex: 1,
        questionText: 'How would you explain the useful action?',
        support: {
          obligationDescription: '说明采取的行动',
          supportLabels: ['choose one useful action'],
        },
      },
      issuedCount: 1,
      endReason: null,
      taskStatus: 'AWAITING_USER_CONFIRMATION',
    },
    checkpoint: {
      type: 'P08_FOLLOW_UP_1_DRAFT',
      draft: '',
      createdAt: '2026-07-26T00:02:00.000Z',
    },
  };
}

function secondAnswerSession(): DemoSession {
  return {
    ...followUpReadySession(),
    businessVersion: 4,
    status: 'FOLLOW_UP_COMPLETE',
    phase: 'SECOND_ANSWER',
    followUp: {
      current: null,
      issuedCount: 1,
      endReason: 'USER_ENDED',
      taskStatus: 'VALIDATED',
    },
    checkpoint: {
      type: 'P08_SECOND_ANSWER_DRAFT',
      draft: '',
      createdAt: '2026-07-26T00:03:00.000Z',
    },
  };
}
