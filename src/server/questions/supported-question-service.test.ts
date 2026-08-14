import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterAll, beforeAll, expect, test } from 'vitest';

import { MockAiProvider } from '@/ai/provider';
import { R4DraftService } from '@/server/ai/r4-draft-service';
import { createDatabaseClient } from '@/server/db/client';

import { SupportedQuestionService } from './supported-question-service';

const projectRoot = process.cwd();
const testDatabasePath = path.join(projectRoot, 'data', 'f3-supported-questions.db');
const testDatabaseUrl = 'file:../data/f3-supported-questions.db';
const prisma = createDatabaseClient(testDatabaseUrl);
const localUserId = 'local-user';

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

async function createAsset(label: string, options: { userId?: string; callable?: boolean } = {}) {
  const userId = options.userId ?? localUserId;
  const callable = options.callable ?? true;
  const sourceAsset = await prisma.sourceAsset.create({ data: { userId } });
  const personalAsset = await prisma.personalAsset.create({
    data: { userId, sourceAssetId: sourceAsset.id },
  });
  const version = await prisma.personalAssetVersion.create({
    data: {
      personalAssetId: personalAsset.id,
      version: 1,
      triggerName: `${label} 资产`,
      coreIdea: `${label} 观点`,
      coreFlow: 'First point. Second point. Final result.',
      status: 'CONFIRMED',
      confirmedAt: new Date(),
      nodes: {
        create: [
          { sequence: 1, nodeType: 'CLAIM', text: 'First point.' },
          { sequence: 2, nodeType: 'REASON', text: 'Second point.' },
          { sequence: 3, nodeType: 'RESULT', text: 'Final result.' },
        ],
      },
    },
  });
  await prisma.userAssetState.create({
    data: {
      userId,
      personalAssetId: personalAsset.id,
      isActive: true,
      internalStage: callable ? 'S2' : 'S1',
      visibleStage: callable ? 'SINGLE_ASSET_INVOCATION' : 'ASSET_ACCUMULATION',
      learningState: callable ? 'CALLABLE' : 'RECALLABLE',
    },
  });
  return { personalAsset, version };
}

test('拒绝未达到可调用状态的个人资产', async () => {
  const asset = await createAsset('未调用', { callable: false });
  const service = new SupportedQuestionService(prisma);

  await expect(
    service.createPlan({
      userId: localUserId,
      questionText: 'What would you do?',
      source: 'USER_REAL',
      primaryPersonalAssetVersionId: asset.version.id,
    }),
  ).rejects.toMatchObject({
    code: 'ASSET_NOT_CALLABLE',
  });
});

test('问题计划冻结资产版本，并为每个义务保存可追溯支撑', async () => {
  const asset = await createAsset('可调用');
  const fact = await prisma.userFact.create({
    data: {
      userId: localUserId,
      text: 'I prefer to start with a clear plan.',
      status: 'CONFIRMED',
    },
  });
  const service = new SupportedQuestionService(prisma);
  const created = await service.createPlan({
    userId: localUserId,
    questionText: 'When a project changes, how do you respond?',
    source: 'USER_REAL',
    primaryPersonalAssetVersionId: asset.version.id,
    confirmedFactIds: [fact.id],
  });

  await expect(
    prisma.questionPlan.findUniqueOrThrow({
      where: { id: created.plan.id },
      include: { assets: true, obligations: { include: { supports: true } } },
    }),
  ).resolves.toMatchObject({
    status: 'VALIDATED',
    assets: [
      {
        role: 'PRIMARY',
        personalAssetVersionId: asset.version.id,
        personalAssetVersionIdSnapshot: asset.version.id,
      },
    ],
    obligations: [
      {
        description: '先说核心观点',
        supports: expect.arrayContaining([
          expect.objectContaining({ supportType: 'PERSONAL_ASSET_NODE' }),
          expect.objectContaining({ supportType: 'QUESTION_CONTEXT' }),
          expect.objectContaining({
            supportType: 'CONFIRMED_USER_FACT',
            supportReferenceId: fact.id,
          }),
        ]),
      },
      {
        description: '说明原因',
        supports: expect.arrayContaining([
          expect.objectContaining({ supportType: 'PERSONAL_ASSET_NODE' }),
          expect.objectContaining({ supportType: 'QUESTION_CONTEXT' }),
        ]),
      },
      {
        description: '说明结果',
        supports: expect.arrayContaining([
          expect.objectContaining({ supportType: 'PERSONAL_ASSET_NODE' }),
          expect.objectContaining({ supportType: 'QUESTION_CONTEXT' }),
        ]),
      },
    ],
  });

  await expect(service.getPlanForUser(localUserId, created.plan.id)).resolves.toMatchObject({
    questionText: 'When a project changes, how do you respond?',
    obligations: [
      { englishExpression: 'First point.' },
      { englishExpression: 'Second point.' },
      { englishExpression: 'Final result.' },
    ],
  });
});

test('拒绝未确认事实和其他用户的资产', async () => {
  const asset = await createAsset('事实校验');
  const draftFact = await prisma.userFact.create({
    data: { userId: localUserId, text: 'This fact is only a draft.' },
  });
  const otherUser = await prisma.user.create({ data: { displayName: 'Other user' } });
  const otherAsset = await createAsset('其他用户', { userId: otherUser.id });
  const service = new SupportedQuestionService(prisma);

  await expect(
    service.createPlan({
      userId: localUserId,
      questionText: 'How do you decide?',
      source: 'USER_REAL',
      primaryPersonalAssetVersionId: asset.version.id,
      confirmedFactIds: [draftFact.id],
    }),
  ).rejects.toMatchObject({ code: 'UNCONFIRMED_FACT' });
  await expect(
    service.createPlan({
      userId: localUserId,
      questionText: 'How do you decide?',
      source: 'USER_REAL',
      primaryPersonalAssetVersionId: otherAsset.version.id,
    }),
  ).rejects.toMatchObject({
    code: 'ASSET_NOT_CALLABLE',
  });
});

test('R4 只保存待确认问题草稿，不会自动创建正式问题', async () => {
  const asset = await createAsset('R4 草稿');
  const beforeQuestionCount = await prisma.question.count();
  const service = new R4DraftService(
    prisma,
    new MockAiProvider({
      kind: 'DRAFT',
      draft: '{"questionText":"How do you handle a change at work?"}',
    }),
  );

  await expect(
    service.request({
      userId: localUserId,
      primaryPersonalAssetVersionId: asset.version.id,
    }),
  ).resolves.toMatchObject({
    status: 'AWAITING_USER_CONFIRMATION',
    questionText: 'How do you handle a change at work?',
  });
  await expect(prisma.question.count()).resolves.toBe(beforeQuestionCount);
  await expect(
    new SupportedQuestionService(prisma).getPracticeOverview(localUserId),
  ).resolves.toMatchObject({
    r4Drafts: [
      expect.objectContaining({
        questionText: 'How do you handle a change at work?',
        primaryAssetName: 'R4 草稿 资产',
      }),
    ],
  });
  await expect(
    prisma.aiTask.findFirstOrThrow({
      where: { role: 'R4', entityId: asset.version.id },
      include: { attempts: true },
    }),
  ).resolves.toMatchObject({
    status: 'AWAITING_USER_CONFIRMATION',
    attempts: [{ status: 'DRAFT_READY' }],
  });
});
