import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterAll, beforeAll, expect, test } from 'vitest';

import { createDatabaseClient } from '@/server/db/client';

import { AssetPracticeService, AssetPracticeValidationError } from './asset-practice-service';

const projectRoot = process.cwd();
const testDatabasePath = path.join(projectRoot, 'data', 'f4-asset-practice.db');
const testDatabaseUrl = 'file:../data/f4-asset-practice.db';
const prisma = createDatabaseClient(testDatabaseUrl);
const service = new AssetPracticeService(prisma);
let sequence = 0;

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

test('从本地单资产任务建立并恢复冻结版本的 P05 会话', async () => {
  const fixture = await createPracticeTask('恢复会话');

  const first = await service.start({ trainingTaskId: fixture.task.id });
  const resumed = await service.start({ trainingTaskId: fixture.task.id });
  const snapshot = await service.getSnapshot(first.sessionId);

  expect(first).toMatchObject({ reused: false });
  expect(resumed).toEqual({ sessionId: first.sessionId, reused: true });
  expect(snapshot).toMatchObject({
    currentStep: 'READING',
    status: 'IN_PROGRESS',
    checkpoint: { currentStep: 'READING' },
    personalAssetVersion: { id: fixture.personalVersion.id, status: 'CONFIRMED' },
    personalAsset: {
      sourceReference: { extendedFlow: '来源词伙中文注释' },
    },
  });
  expect(snapshot.personalAssetVersion.expressionUnits).toHaveLength(1);
  expect(snapshot.personalAssetVersion.extendedFlow).toBe('个人词伙中文注释');
});

test('五步主链路保存独立 Attempt、严格执行门禁并恢复文字草稿', async () => {
  const fixture = await createPracticeTask('完整五步');
  const { sessionId } = await service.start({ trainingTaskId: fixture.task.id });

  await service.saveAttempt({
    assetPracticeSessionId: sessionId,
    stepType: 'READING',
    idempotencyKey: 'f4-reading-idempotency',
  });
  await service.saveAttempt({
    assetPracticeSessionId: sessionId,
    stepType: 'READING',
    idempotencyKey: 'f4-reading-idempotency',
  });
  await expect(
    service.saveAttempt({
      assetPracticeSessionId: sessionId,
      stepType: 'KEYWORD_RECALL',
      idempotencyKey: 'f4-keyword-incomplete',
    }),
  ).rejects.toMatchObject({ code: 'INVALID_INPUT' });

  await service.saveAttempt({
    assetPracticeSessionId: sessionId,
    stepType: 'KEYWORD_RECALL',
    oralAttemptConfirmed: true,
    completionRating: 'BASIC',
    difficultyRating: 'RIGHT',
    highestHintLevel: 'H0_NONE',
    idempotencyKey: 'f4-keyword-complete',
  });
  await service.saveCheckpoint({
    assetPracticeSessionId: sessionId,
    currentStep: 'LOGIC_SKELETON_RECALL',
    payload: {
      oralAttemptConfirmed: true,
      completionRating: 'COMPLETE',
      difficultyRating: 'EASY',
      highestHintLevel: 'H4_ENGLISH_CHUNKS',
    },
  });
  await service.saveAttempt({
    assetPracticeSessionId: sessionId,
    stepType: 'LOGIC_SKELETON_RECALL',
    oralAttemptConfirmed: true,
    completionRating: 'COMPLETE',
    difficultyRating: 'EASY',
    highestHintLevel: 'H4_ENGLISH_CHUNKS',
    idempotencyKey: 'f4-skeleton-complete',
  });
  await expect(
    service.saveAttempt({
      assetPracticeSessionId: sessionId,
      stepType: 'NO_HINT_RECALL',
      oralAttemptConfirmed: true,
      completionRating: 'BASIC',
      difficultyRating: 'RIGHT',
      highestHintLevel: 'H1_ANGLE',
      idempotencyKey: 'f4-no-hint-leak',
    }),
  ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  await expect(
    service.saveCheckpoint({
      assetPracticeSessionId: sessionId,
      currentStep: 'NO_HINT_RECALL',
      payload: { highestHintLevel: 'H1_ANGLE' },
    }),
  ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  await service.saveAttempt({
    assetPracticeSessionId: sessionId,
    stepType: 'NO_HINT_RECALL',
    oralAttemptConfirmed: true,
    completionRating: 'BASIC',
    difficultyRating: 'RIGHT',
    highestHintLevel: 'H0_NONE',
    idempotencyKey: 'f4-no-hint-complete',
  });
  await expect(
    service.saveAttempt({
      assetPracticeSessionId: sessionId,
      stepType: 'ANCHOR_TEXT',
      textAnswer: '   ',
      idempotencyKey: 'f4-empty-text',
    }),
  ).rejects.toMatchObject({ code: 'INVALID_INPUT' });

  await service.saveCheckpoint({
    assetPracticeSessionId: sessionId,
    currentStep: 'ANCHOR_TEXT',
    payload: { textDraft: '  一个字也可以。  ' },
  });
  await expect(service.getSnapshot(sessionId)).resolves.toMatchObject({
    currentStep: 'ANCHOR_TEXT',
    checkpoint: { payload: { textDraft: '  一个字也可以。  ' } },
  });
  await service.saveAttempt({
    assetPracticeSessionId: sessionId,
    stepType: 'ANCHOR_TEXT',
    textAnswer: '  一个字也可以。  ',
    idempotencyKey: 'f4-anchor-complete',
  });

  const snapshot = await service.getSnapshot(sessionId);
  expect(snapshot).toMatchObject({ status: 'COMPLETED', currentStep: 'ANCHOR_TEXT' });
  expect(snapshot.attempts).toHaveLength(5);
  expect(snapshot.attempts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ stepType: 'READING', modality: 'READ_ONLY' }),
      expect.objectContaining({
        stepType: 'LOGIC_SKELETON_RECALL',
        modality: 'ORAL_SELF_REPORT',
        highestHintLevel: 'H4_ENGLISH_CHUNKS',
      }),
      expect.objectContaining({
        stepType: 'ANCHOR_TEXT',
        modality: 'TEXT',
        textAnswer: '一个字也可以。',
      }),
    ]),
  );

  const retrained = await service.start({ retrainFromSessionId: sessionId });
  expect(retrained).toMatchObject({ reused: false });
  expect(retrained.sessionId).not.toBe(sessionId);
  await expect(
    prisma.assetPracticeAttempt.count({ where: { assetPracticeSessionId: sessionId } }),
  ).resolves.toBe(5);
});

test('拼贴任务不能伪装为单资产 P05 会话', async () => {
  const fixture = await createPracticeTask('拼贴限制', 'ASSET_STITCHING');

  await expect(service.start({ trainingTaskId: fixture.task.id })).rejects.toEqual(
    expect.objectContaining<Partial<AssetPracticeValidationError>>({ code: 'TASK_NOT_SUPPORTED' }),
  );
});

async function createPracticeTask(
  label: string,
  taskType:
    | 'ASSET_READING'
    | 'ASSET_REPRODUCTION'
    | 'SINGLE_ASSET_INVOCATION'
    | 'ASSET_STITCHING' = 'ASSET_REPRODUCTION',
) {
  sequence += 1;
  const sourceAsset = await prisma.sourceAsset.create({ data: { userId: 'local-user' } });
  const sourceVersion = await prisma.sourceAssetVersion.create({
    data: {
      sourceAssetId: sourceAsset.id,
      version: 1,
      title: `${label} 来源`,
      coreIdea: '来源核心观点',
      coreFlow: 'When a problem appears, I focus on what I can change and take one step.',
      extendedFlow: '来源词伙中文注释',
      sourceType: 'MANUAL',
      status: 'CONFIRMED',
      confirmedAt: new Date(),
    },
  });
  const personalAsset = await prisma.personalAsset.create({
    data: { userId: 'local-user', sourceAssetId: sourceAsset.id },
  });
  const personalVersion = await prisma.personalAssetVersion.create({
    data: {
      personalAssetId: personalAsset.id,
      version: 1,
      triggerName: `${label} 触发名`,
      coreIdea: '遇到问题时先寻找可改变的部分',
      coreFlow: 'When a problem appears, I focus on what I can change and take one step.',
      extendedFlow: '个人词伙中文注释',
      status: 'CONFIRMED',
      confirmedAt: new Date(),
      nodes: {
        create: [
          { sequence: 1, nodeType: 'CLAIM', text: 'When a problem appears,' },
          { sequence: 2, nodeType: 'ACTION', text: ' I focus on what I can change' },
          { sequence: 3, nodeType: 'RESULT', text: ' and take one step.' },
        ],
      },
      expressionUnits: {
        create: {
          unitType: 'PHRASE_CHUNK',
          text: 'focus on what I can change',
          retrievalCue: '寻找可改变的部分',
        },
      },
    },
    include: { nodes: { orderBy: { sequence: 'asc' } } },
  });
  await prisma.assetFlowSpan.createMany({
    data: personalVersion.nodes.map((node) => ({
      personalAssetVersionId: personalVersion.id,
      personalAssetNodeId: node.id,
      sequence: node.sequence,
      startOffset: personalVersion.coreFlow.indexOf(node.text),
      endOffset: personalVersion.coreFlow.indexOf(node.text) + node.text.length,
      textHash: `${label}-${node.sequence}`,
    })),
  });
  const dailyPlan = await prisma.dailyPlan.create({
    data: {
      userId: 'local-user',
      planDate: new Date(Date.UTC(2026, 6, 26 + sequence)),
      reason: 'TEST_LOCAL_RULE',
    },
  });
  const task = await prisma.trainingTask.create({
    data: {
      dailyPlanId: dailyPlan.id,
      taskType,
      sequence: 1,
      targetEntityId: personalAsset.id,
      reason: 'TEST_LOCAL_RULE',
      eligibilityJson: JSON.stringify({
        ruleVersion: 'LOCAL_ELIGIBILITY_RULES_V1',
        personalAssetVersionId: personalVersion.id,
        triggerName: personalVersion.triggerName,
      }),
    },
  });
  return { sourceVersion, personalAsset, personalVersion, task };
}
