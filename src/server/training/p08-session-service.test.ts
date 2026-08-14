import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterAll, beforeAll, expect, test } from 'vitest';

import { MockAiProvider, UnconfiguredAiProvider } from '@/ai/provider';
import { createDatabaseClient } from '@/server/db/client';

import { P08SessionService } from './p08-session-service';
import { R6FollowUpService } from './r6-follow-up-service';

const projectRoot = process.cwd();
const testDatabasePath = path.join(projectRoot, 'data', 'f4-p08-session.db');
const testDatabaseUrl = 'file:../data/f4-p08-session.db';
const prisma = createDatabaseClient(testDatabaseUrl);
const service = new P08SessionService(prisma);

beforeAll(async () => {
  await mkdir(path.dirname(testDatabasePath), { recursive: true });
  await Promise.all([
    rm(testDatabasePath, { force: true }),
    rm(`${testDatabasePath}-journal`, { force: true }),
    rm(`${testDatabasePath}-shm`, { force: true }),
    rm(`${testDatabasePath}-wal`, { force: true }),
  ]);
  await writeFile(testDatabasePath, '');
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: 'pipe',
  });
  execFileSync(process.execPath, ['prisma/seed.mjs'], {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: 'pipe',
  });
});

afterAll(async () => {
  await prisma.$disconnect();
  await Promise.all([
    rm(testDatabasePath, { force: true }),
    rm(`${testDatabasePath}-journal`, { force: true }),
    rm(`${testDatabasePath}-shm`, { force: true }),
    rm(`${testDatabasePath}-wal`, { force: true }),
  ]);
});

test('建立并恢复已验证问题的本地回答会话', async () => {
  const fixture = await createQuestionPlan('恢复会话');

  const first = await service.start({ questionPlanId: fixture.plan.id });
  const resumed = await service.start({ questionPlanId: fixture.plan.id });
  const snapshot = await service.getSnapshot(first.sessionId);

  expect(first).toMatchObject({ reused: false });
  expect(resumed).toEqual({ sessionId: first.sessionId, reused: true });
  expect(snapshot).toMatchObject({
    phase: 'FIRST_ANSWER',
    businessVersion: 1,
    checkpoint: { type: 'P08_FIRST_ANSWER_DRAFT', draft: '' },
    answers: { first: null, second: null },
  });
});

test('保存两次独立回答、恢复草稿并拒绝陈旧或阶段错误的写入', async () => {
  const fixture = await createQuestionPlan('两次回答');
  const { sessionId } = await service.start({ questionPlanId: fixture.plan.id });

  await service.saveCheckpoint({
    trainingSessionId: sessionId,
    expectedBusinessVersion: 1,
    phase: 'FIRST_ANSWER',
    draft: '  保留的第一次草稿  ',
  });
  await expect(service.getSnapshot(sessionId)).resolves.toMatchObject({
    phase: 'FIRST_ANSWER',
    checkpoint: { draft: '  保留的第一次草稿  ' },
  });

  const firstInput = {
    trainingSessionId: sessionId,
    expectedBusinessVersion: 1,
    answerType: 'FIRST_ANSWER' as const,
    text: '。',
    idempotencyKey: 'p08-first-idempotency',
  };
  const [firstAnswer, repeatedFirstAnswer] = await Promise.all([
    service.submitAnswer(firstInput),
    service.submitAnswer(firstInput),
  ]);
  expect(repeatedFirstAnswer.id).toBe(firstAnswer.id);
  await expect(
    prisma.trainingAnswer.count({
      where: { trainingSessionId: sessionId, answerType: 'FIRST_ANSWER' },
    }),
  ).resolves.toBe(1);

  await expect(
    service.saveCheckpoint({
      trainingSessionId: sessionId,
      expectedBusinessVersion: 1,
      phase: 'FIRST_ANSWER',
      draft: '旧页面不能覆盖新状态',
    }),
  ).rejects.toMatchObject({ code: 'SESSION_STALE' });
  await expect(
    service.submitAnswer({
      trainingSessionId: sessionId,
      expectedBusinessVersion: 2,
      answerType: 'SECOND_ANSWER',
      text: '不能跳过状态机',
      idempotencyKey: 'p08-second-too-early',
    }),
  ).rejects.toMatchObject({ code: 'SESSION_STATE_INVALID' });

  await service.advanceToSecondAnswer({ trainingSessionId: sessionId, expectedBusinessVersion: 2 });
  const readyForSecond = await service.getSnapshot(sessionId);
  expect(readyForSecond).toMatchObject({
    phase: 'SECOND_ANSWER',
    businessVersion: 3,
    checkpoint: { type: 'P08_SECOND_ANSWER_DRAFT', draft: '' },
    answers: { first: { text: '。' }, second: null },
  });

  await expect(
    service.submitAnswer({
      trainingSessionId: sessionId,
      expectedBusinessVersion: 3,
      answerType: 'SECOND_ANSWER',
      text: '   ',
      idempotencyKey: 'p08-second-blank',
    }),
  ).rejects.toMatchObject({ code: 'ANSWER_INVALID' });
  await service.submitAnswer({
    trainingSessionId: sessionId,
    expectedBusinessVersion: 3,
    answerType: 'SECOND_ANSWER',
    text: '字',
    idempotencyKey: 'p08-second-saved',
  });

  await expect(service.getSnapshot(sessionId)).resolves.toMatchObject({
    phase: 'COMPLETED',
    businessVersion: 4,
    answers: { first: { text: '。' }, second: { text: '字' } },
  });
  await expect(prisma.aiTask.count({ where: { trainingSessionId: sessionId } })).resolves.toBe(0);
});

test('只记录用户主动请求的 H1—H5 提示，不从 P07 准备材料自动创建事件', async () => {
  const fixture = await createQuestionPlan('主动提示');
  const { sessionId } = await service.start({ questionPlanId: fixture.plan.id });

  await expect(service.getSnapshot(sessionId)).resolves.toMatchObject({ hints: [] });
  await service.saveHint({
    trainingSessionId: sessionId,
    expectedBusinessVersion: 1,
    phase: 'FIRST_ANSWER',
    level: 'H3_LOGIC_NODES',
  });
  await expect(service.getSnapshot(sessionId)).resolves.toMatchObject({
    hints: [{ level: 'H3_LOGIC_NODES', context: 'P08_FIRST_ANSWER' }],
  });
  await expect(
    service.saveHint({
      trainingSessionId: sessionId,
      expectedBusinessVersion: 1,
      phase: 'FIRST_ANSWER',
      level: 'H0_NONE' as never,
    }),
  ).rejects.toMatchObject({ code: 'HINT_INVALID' });
});

test('R6 为冻结义务创建单题追问，保存追问回答后可解释地结束', async () => {
  const fixture = await createQuestionPlan('受支撑追问');
  const { sessionId } = await service.start({ questionPlanId: fixture.plan.id });
  const first = await service.submitAnswer({
    trainingSessionId: sessionId,
    expectedBusinessVersion: 1,
    answerType: 'FIRST_ANSWER',
    text: 'I will handle it.',
    idempotencyKey: 'r6-first-answer',
  });
  const obligation = await prisma.questionObligation.findFirstOrThrow({
    where: { questionPlanId: fixture.plan.id },
    orderBy: { sequence: 'asc' },
  });

  const questionService = new R6FollowUpService(
    prisma,
    new MockAiProvider({
      kind: 'DRAFT',
      draft: JSON.stringify({
        action: 'ASK',
        questionText: 'What action would you choose first?',
        supportObligationId: obligation.id,
      }),
    }),
  );
  await expect(
    questionService.requestForAnswer({ trainingSessionId: sessionId, answerId: first.id }),
  ).resolves.toMatchObject({ status: 'FOLLOW_UP_READY' });
  await expect(
    questionService.requestForAnswer({ trainingSessionId: sessionId, answerId: first.id }),
  ).resolves.toMatchObject({ status: 'FOLLOW_UP_READY' });
  await expect(
    prisma.followUpItem.count({ where: { trainingSessionId: sessionId } }),
  ).resolves.toBe(1);

  const ready = await service.getSnapshot(sessionId);
  expect(ready).toMatchObject({
    phase: 'AWAITING_FOLLOW_UP',
    businessVersion: 3,
    followUp: {
      issuedCount: 1,
      current: {
        issuedIndex: 1,
        questionText: 'What action would you choose first?',
        support: { obligationDescription: '先说核心观点' },
      },
    },
  });
  await service.saveCheckpoint({
    trainingSessionId: sessionId,
    expectedBusinessVersion: 3,
    phase: 'FOLLOW_UP_ANSWER',
    followUpIndex: 1,
    draft: '  可恢复的追问草稿  ',
  });
  await expect(service.getSnapshot(sessionId)).resolves.toMatchObject({
    checkpoint: { type: 'P08_FOLLOW_UP_1_DRAFT', draft: '  可恢复的追问草稿  ' },
  });

  const followUpAnswer = await service.submitFollowUpAnswer({
    trainingSessionId: sessionId,
    expectedBusinessVersion: 3,
    followUpId: ready.followUp.current!.id,
    text: '。',
    idempotencyKey: 'r6-follow-up-answer',
  });
  await expect(
    new R6FollowUpService(
      prisma,
      new MockAiProvider({
        kind: 'DRAFT',
        draft: JSON.stringify({ action: 'END', endReason: 'CONTENT_COMPLETE' }),
      }),
    ).requestForAnswer({ trainingSessionId: sessionId, answerId: followUpAnswer.id }),
  ).resolves.toMatchObject({ status: 'FOLLOW_UP_COMPLETE', endReason: 'CONTENT_COMPLETE' });

  await expect(service.getSnapshot(sessionId)).resolves.toMatchObject({
    phase: 'SECOND_ANSWER',
    businessVersion: 5,
    followUp: { current: null, issuedCount: 1, endReason: 'CONTENT_COMPLETE' },
    checkpoint: { type: 'P08_SECOND_ANSWER_DRAFT', draft: '' },
  });
  await expect(
    prisma.trainingAnswer.count({
      where: { trainingSessionId: sessionId, answerType: 'FOLLOW_UP_ANSWER', sequence: 1 },
    }),
  ).resolves.toBe(1);
});

test('R6 未配置或草稿无效时不丢失第一次回答，并直接进入第二次回答', async () => {
  const failedFixture = await createQuestionPlan('R6 未配置');
  const { sessionId: failedSessionId } = await service.start({
    questionPlanId: failedFixture.plan.id,
  });
  const savedFirst = await service.submitAnswer({
    trainingSessionId: failedSessionId,
    expectedBusinessVersion: 1,
    answerType: 'FIRST_ANSWER',
    text: '字',
    idempotencyKey: 'r6-unconfigured-first',
  });
  await new R6FollowUpService(prisma, new UnconfiguredAiProvider()).requestForAnswer({
    trainingSessionId: failedSessionId,
    answerId: savedFirst.id,
  });
  await expect(service.getSnapshot(failedSessionId)).resolves.toMatchObject({
    phase: 'SECOND_ANSWER',
    answers: { first: { text: '字' }, second: null },
    followUp: { endReason: 'R6_UNAVAILABLE' },
  });
  await expect(
    prisma.aiTask.findFirst({ where: { trainingSessionId: failedSessionId, role: 'R6' } }),
  ).resolves.toMatchObject({ status: 'FAILED_RETRYABLE', resultReference: 'R6_R6_UNAVAILABLE' });

  const invalidFixture = await createQuestionPlan('R6 无效草稿');
  const { sessionId: invalidSessionId } = await service.start({
    questionPlanId: invalidFixture.plan.id,
  });
  const invalidFirst = await service.submitAnswer({
    trainingSessionId: invalidSessionId,
    expectedBusinessVersion: 1,
    answerType: 'FIRST_ANSWER',
    text: '。',
    idempotencyKey: 'r6-invalid-first',
  });
  await new R6FollowUpService(
    prisma,
    new MockAiProvider({
      kind: 'DRAFT',
      draft: JSON.stringify({
        action: 'ASK',
        questionText: 'Tell me an unrelated story.',
        supportObligationId: 'unknown-obligation',
      }),
    }),
  ).requestForAnswer({ trainingSessionId: invalidSessionId, answerId: invalidFirst.id });
  await expect(service.getSnapshot(invalidSessionId)).resolves.toMatchObject({
    phase: 'SECOND_ANSWER',
    answers: { first: { text: '。' }, second: null },
    followUp: { current: null, endReason: 'R6_INVALID_DRAFT' },
  });
});

test('用户可结束已就绪追问，旧 R6 结果不会再回写会话', async () => {
  const fixture = await createQuestionPlan('主动结束追问');
  const { sessionId } = await service.start({ questionPlanId: fixture.plan.id });
  const first = await service.submitAnswer({
    trainingSessionId: sessionId,
    expectedBusinessVersion: 1,
    answerType: 'FIRST_ANSWER',
    text: 'first',
    idempotencyKey: 'r6-user-ended-first',
  });
  const obligation = await prisma.questionObligation.findFirstOrThrow({
    where: { questionPlanId: fixture.plan.id },
    orderBy: { sequence: 'asc' },
  });
  await new R6FollowUpService(
    prisma,
    new MockAiProvider({
      kind: 'DRAFT',
      draft: JSON.stringify({
        action: 'ASK',
        questionText: 'What is your next action?',
        supportObligationId: obligation.id,
      }),
    }),
  ).requestForAnswer({ trainingSessionId: sessionId, answerId: first.id });

  await service.advanceToSecondAnswer({ trainingSessionId: sessionId, expectedBusinessVersion: 3 });
  await expect(service.getSnapshot(sessionId)).resolves.toMatchObject({
    phase: 'SECOND_ANSWER',
    followUp: { endReason: 'USER_ENDED' },
  });
  await expect(
    prisma.followUpItem.findFirst({ where: { trainingSessionId: sessionId } }),
  ).resolves.toMatchObject({ status: 'SKIPPED', endReason: 'USER_ENDED' });
  await expect(
    prisma.aiTask.findFirst({ where: { trainingSessionId: sessionId, role: 'R6' } }),
  ).resolves.toMatchObject({ status: 'SUPERSEDED', resultReference: 'R6_USER_ENDED' });
});

test('R6 最多发出三轮追问，第三轮回答后由本地规则直接结束', async () => {
  const fixture = await createQuestionPlan('三轮上限');
  const { sessionId } = await service.start({ questionPlanId: fixture.plan.id });
  const first = await service.submitAnswer({
    trainingSessionId: sessionId,
    expectedBusinessVersion: 1,
    answerType: 'FIRST_ANSWER',
    text: 'first',
    idempotencyKey: 'r6-max-first',
  });
  const obligation = await prisma.questionObligation.findFirstOrThrow({
    where: { questionPlanId: fixture.plan.id },
    orderBy: { sequence: 'asc' },
  });
  const askService = new R6FollowUpService(
    prisma,
    new MockAiProvider({
      kind: 'DRAFT',
      draft: JSON.stringify({
        action: 'ASK',
        questionText: 'What would you do next?',
        supportObligationId: obligation.id,
      }),
    }),
  );
  await askService.requestForAnswer({ trainingSessionId: sessionId, answerId: first.id });

  for (const index of [1, 2] as const) {
    const snapshot = await service.getSnapshot(sessionId);
    const answer = await service.submitFollowUpAnswer({
      trainingSessionId: sessionId,
      expectedBusinessVersion: snapshot.businessVersion,
      followUpId: snapshot.followUp.current!.id,
      text: index === 1 ? 'one' : 'two',
      idempotencyKey: `r6-max-follow-up-${index}`,
    });
    await askService.requestForAnswer({ trainingSessionId: sessionId, answerId: answer.id });
  }
  const thirdReady = await service.getSnapshot(sessionId);
  expect(thirdReady.followUp.current?.issuedIndex).toBe(3);
  await service.submitFollowUpAnswer({
    trainingSessionId: sessionId,
    expectedBusinessVersion: thirdReady.businessVersion,
    followUpId: thirdReady.followUp.current!.id,
    text: 'three',
    idempotencyKey: 'r6-max-follow-up-3',
  });
  await expect(service.getSnapshot(sessionId)).resolves.toMatchObject({
    phase: 'SECOND_ANSWER',
    followUp: { issuedCount: 3, endReason: 'MAX_ROUNDS_REACHED' },
  });
  await expect(
    prisma.followUpItem.count({ where: { trainingSessionId: sessionId } }),
  ).resolves.toBe(3);
});

async function createQuestionPlan(label: string) {
  const sourceAsset = await prisma.sourceAsset.create({ data: { userId: 'local-user' } });
  const personalAsset = await prisma.personalAsset.create({
    data: { userId: 'local-user', sourceAssetId: sourceAsset.id },
  });
  const personalVersion = await prisma.personalAssetVersion.create({
    data: {
      personalAssetId: personalAsset.id,
      version: 1,
      triggerName: `${label} 主资产`,
      coreIdea: '从问题中找到可改变的部分',
      coreFlow: 'I clarify the change, choose one useful action, and explain the result.',
      status: 'CONFIRMED',
      confirmedAt: new Date(),
      nodes: {
        create: [
          { sequence: 1, nodeType: 'CLAIM', text: 'I clarify the change,' },
          { sequence: 2, nodeType: 'ACTION', text: ' choose one useful action,' },
          { sequence: 3, nodeType: 'RESULT', text: ' and explain the result.' },
        ],
      },
    },
    include: { nodes: { orderBy: { sequence: 'asc' } } },
  });
  const question = await prisma.question.create({
    data: { text: `${label} 时你会如何处理？`, source: 'USER_REAL' },
  });
  const plan = await prisma.questionPlan.create({
    data: {
      questionId: question.id,
      version: 1,
      questionText: question.text,
      distance: 'L1',
      status: 'VALIDATED',
      assets: {
        create: {
          role: 'PRIMARY',
          personalAssetVersionId: personalVersion.id,
          personalAssetVersionIdSnapshot: personalVersion.id,
        },
      },
      obligations: {
        create: personalVersion.nodes.map((node, index) => ({
          sequence: index + 1,
          obligationType: 'ASSET_NODE',
          description: ['先说核心观点', '说明行动', '说明结果'][index]!,
          supports: {
            create: {
              supportType: 'PERSONAL_ASSET_NODE',
              supportReferenceId: node.id,
              explanation: '已冻结个人资产节点。',
            },
          },
        })),
      },
    },
  });
  return { plan, personalVersion };
}
