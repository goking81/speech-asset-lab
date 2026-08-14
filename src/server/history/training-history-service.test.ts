import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterAll, beforeAll, expect, test } from 'vitest';

import { createDatabaseClient } from '@/server/db/client';

import { TrainingHistoryService } from './training-history-service';

const projectRoot = process.cwd();
const testDatabasePath = path.join(projectRoot, 'data', 'f7-training-history.db');
const testDatabaseUrl = 'file:../data/f7-training-history.db';
const prisma = createDatabaseClient(testDatabaseUrl);

beforeAll(async () => {
  await mkdir(path.dirname(testDatabasePath), { recursive: true });
  await Promise.all(
    [
      testDatabasePath,
      `${testDatabasePath}-journal`,
      `${testDatabasePath}-shm`,
      `${testDatabasePath}-wal`,
    ].map((file) => rm(file, { force: true })),
  );
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
  await Promise.all(
    [
      testDatabasePath,
      `${testDatabasePath}-journal`,
      `${testDatabasePath}-shm`,
      `${testDatabasePath}-wal`,
    ].map((file) => rm(file, { force: true })),
  );
});

test('P13 回看已保存回答、提示、降级来源、评价和冻结 Bundle，并可按资产筛选', async () => {
  const fixture = await createHistoryFixture();
  const service = new TrainingHistoryService(prisma);

  const all = await service.list();
  const filtered = await service.list({ assetId: fixture.personalAssetId, question: '项目变化' });

  expect(filtered.records).toHaveLength(1);
  expect(filtered.records[0]).toMatchObject({
    id: fixture.sessionId,
    question: '项目变化时如何说明你的行动？',
    answers: { first: 'I clarify the change.', second: 'I choose one useful action.' },
    releaseBundle: { version: 'f7-history-bundle', status: 'ACTIVE' },
    comparison: {
      factsStatus: 'COMPLETE',
      interpretationStatus: 'UNAVAILABLE',
      finalDisplayStatus: 'LOCAL_TEMPLATE',
    },
  });
  expect(filtered.records[0]?.hints).toEqual([expect.objectContaining({ level: 'H2_ASSET_NAME' })]);
  expect(filtered.records[0]?.aiStates).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        role: 'R7C',
        status: 'FAILED_RETRYABLE',
        fallbackReason: 'R7C_PROVIDER_UNAVAILABLE',
      }),
    ]),
  );
  expect(filtered.records[0]?.evaluations).toEqual(
    expect.arrayContaining([expect.objectContaining({ totalScore: 82, status: 'DRAFT_READY' })]),
  );
  expect(all.filterOptions.assets).toContainEqual({
    id: fixture.personalAssetId,
    label: '项目应对',
  });
});

test('P13 合并回看 P05 单资产训练，不伪造问题或 AI 评价', async () => {
  const fixture = await createAssetPracticeFixture();
  const service = new TrainingHistoryService(prisma);

  const result = await service.list({ assetId: fixture.personalAssetId, status: 'COMPLETED' });

  expect(result.records).toContainEqual(
    expect.objectContaining({
      id: fixture.sessionId,
      kind: 'ASSET_PRACTICE',
      question: '单资产训练：会议复盘',
      answers: { first: null, second: null },
      releaseBundle: null,
      aiStates: [],
      evaluations: [],
      assetPractice: expect.objectContaining({
        currentStep: 'ANCHOR_TEXT',
        attempts: [
          expect.objectContaining({
            stepType: 'LOGIC_SKELETON_RECALL',
            highestHintLevel: 'H3_LOGIC_NODES',
          }),
          expect.objectContaining({
            stepType: 'ANCHOR_TEXT',
            textAnswer: 'I summarize the decision and the next action.',
          }),
        ],
      }),
    }),
  );
});

async function createHistoryFixture() {
  const bundle = await prisma.aiReleaseBundle.create({
    data: {
      version: 'f7-history-bundle',
      bundleHash: 'f7-history-bundle-hash',
      status: 'ACTIVE',
      activatedAt: new Date(),
    },
  });
  const sourceAsset = await prisma.sourceAsset.create({ data: { userId: 'local-user' } });
  const personalAsset = await prisma.personalAsset.create({
    data: { userId: 'local-user', sourceAssetId: sourceAsset.id },
  });
  const version = await prisma.personalAssetVersion.create({
    data: {
      personalAssetId: personalAsset.id,
      version: 1,
      triggerName: '项目应对',
      coreIdea: '说明变化与行动',
      coreFlow: 'I clarify the change and choose one useful action.',
      status: 'CONFIRMED',
      confirmedAt: new Date(),
    },
  });
  const question = await prisma.question.create({
    data: { text: '项目变化时如何说明你的行动？', source: 'USER_REAL' },
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
          personalAssetVersionId: version.id,
          personalAssetVersionIdSnapshot: version.id,
        },
      },
    },
  });
  const session = await prisma.trainingSession.create({
    data: {
      userId: 'local-user',
      questionPlanId: plan.id,
      releaseBundleId: bundle.id,
      status: 'COMPLETED',
      answers: {
        create: [
          {
            answerType: 'FIRST_ANSWER',
            sequence: 1,
            text: 'I clarify the change.',
            normalizedHash: 'f7-history-first',
            idempotencyKey: 'f7-history-first',
          },
          {
            answerType: 'SECOND_ANSWER',
            sequence: 1,
            text: 'I choose one useful action.',
            normalizedHash: 'f7-history-second',
            idempotencyKey: 'f7-history-second',
          },
        ],
      },
      hints: { create: { level: 'H2_ASSET_NAME', context: 'P08_FIRST_ANSWER' } },
    },
    include: { answers: true },
  });
  const firstAnswer = session.answers.find((answer) => answer.answerType === 'FIRST_ANSWER')!;
  await prisma.answerEvaluationResult.create({
    data: {
      trainingSessionId: session.id,
      answerId: firstAnswer.id,
      status: 'DRAFT_READY',
      totalScore: 82,
    },
  });
  await prisma.answerComparisonResult.create({
    data: {
      trainingSessionId: session.id,
      factsJson: '{"ruleVersion":"test"}',
      factsStatus: 'COMPLETE',
      interpretationStatus: 'UNAVAILABLE',
      finalDisplayStatus: 'LOCAL_TEMPLATE',
    },
  });
  await prisma.aiTask.create({
    data: {
      trainingSessionId: session.id,
      releaseBundleId: bundle.id,
      role: 'R7C',
      entityType: 'AnswerComparisonResult',
      entityId: session.id,
      entityVersion: 1,
      inputFingerprint: 'f7-history-r7c',
      status: 'FAILED_RETRYABLE',
      resultReference: 'R7C_PROVIDER_UNAVAILABLE',
    },
  });
  return { sessionId: session.id, personalAssetId: personalAsset.id };
}

async function createAssetPracticeFixture() {
  const sourceAsset = await prisma.sourceAsset.create({ data: { userId: 'local-user' } });
  const personalAsset = await prisma.personalAsset.create({
    data: { userId: 'local-user', sourceAssetId: sourceAsset.id },
  });
  const version = await prisma.personalAssetVersion.create({
    data: {
      personalAssetId: personalAsset.id,
      version: 1,
      triggerName: '会议复盘',
      coreIdea: '说明决定与下一步',
      coreFlow: 'I summarize the decision and the next action.',
      status: 'CONFIRMED',
      confirmedAt: new Date(),
    },
  });
  const session = await prisma.assetPracticeSession.create({
    data: {
      userId: 'local-user',
      personalAssetId: personalAsset.id,
      personalAssetVersionId: version.id,
      currentStep: 'ANCHOR_TEXT',
      status: 'COMPLETED',
      completedAt: new Date(),
      attempts: {
        create: [
          {
            stepType: 'LOGIC_SKELETON_RECALL',
            modality: 'ORAL_SELF_REPORT',
            status: 'COMPLETED',
            oralAttemptConfirmed: true,
            completionRating: 'BASIC',
            difficultyRating: 'RIGHT',
            highestHintLevel: 'H3_LOGIC_NODES',
            idempotencyKey: 'f7-history-p05-logic',
            completedAt: new Date(),
          },
          {
            stepType: 'ANCHOR_TEXT',
            modality: 'TEXT',
            status: 'COMPLETED',
            textAnswer: 'I summarize the decision and the next action.',
            idempotencyKey: 'f7-history-p05-anchor',
            completedAt: new Date(),
          },
        ],
      },
    },
  });
  return { sessionId: session.id, personalAssetId: personalAsset.id };
}
