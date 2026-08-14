import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test, afterAll, beforeAll } from 'vitest';

import { createDatabaseClient } from './client';

const projectRoot = process.cwd();
const testDatabasePath = path.join(projectRoot, 'data', 'iteration-02-constraints.db');
const testDatabaseUrl = 'file:../data/iteration-02-constraints.db';
const prisma = createDatabaseClient(testDatabaseUrl);

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

async function createAssetGraph(label: string) {
  const user = await prisma.user.create({ data: { displayName: label } });
  const sourceAsset = await prisma.sourceAsset.create({ data: { userId: user.id } });
  const sourceAssetVersion = await prisma.sourceAssetVersion.create({
    data: {
      sourceAssetId: sourceAsset.id,
      version: 1,
      title: `${label} 来源资产`,
      coreIdea: '核心观点',
      coreFlow: 'A connected flow.',
      sourceType: 'MANUAL',
    },
  });
  const personalAsset = await prisma.personalAsset.create({
    data: { userId: user.id, sourceAssetId: sourceAsset.id },
  });
  const personalAssetVersion = await prisma.personalAssetVersion.create({
    data: {
      personalAssetId: personalAsset.id,
      version: 1,
      triggerName: `${label} 触发名`,
      coreIdea: '核心观点',
      coreFlow: 'A connected flow.',
    },
  });
  const personalAssetNode = await prisma.personalAssetNode.create({
    data: {
      personalAssetVersionId: personalAssetVersion.id,
      sequence: 1,
      nodeType: 'CLAIM',
      text: 'A connected flow.',
    },
  });

  return {
    user,
    sourceAsset,
    sourceAssetVersion,
    personalAsset,
    personalAssetVersion,
    personalAssetNode,
  };
}

test('seeds one local user and its default local settings', async () => {
  await expect(
    prisma.user.findUniqueOrThrow({
      where: { id: 'local-user' },
      include: { settings: { orderBy: { key: 'asc' } } },
    }),
  ).resolves.toMatchObject({
    id: 'local-user',
    settings: [
      { key: 'privacy.aiLogPolicy' },
      { key: 'privacy.aiLogRetention' },
      { key: 'storage.root' },
    ],
  });
});

test('cascades user settings when the local user is deleted', async () => {
  const user = await prisma.user.create({ data: { displayName: 'cascade user' } });
  await prisma.userSetting.create({
    data: { userId: user.id, key: 'theme', valueJson: '"system"' },
  });

  await prisma.user.delete({ where: { id: user.id } });

  await expect(prisma.userSetting.count({ where: { userId: user.id } })).resolves.toBe(0);
});

test('prevents updates to immutable source asset versions', async () => {
  const graph = await createAssetGraph('immutable version');

  await expect(
    prisma.sourceAssetVersion.update({
      where: { id: graph.sourceAssetVersion.id },
      data: { title: '不应覆盖的内容' },
    }),
  ).rejects.toThrow();

  await expect(
    prisma.sourceAssetVersion.findUniqueOrThrow({ where: { id: graph.sourceAssetVersion.id } }),
  ).resolves.toMatchObject({ title: 'immutable version 来源资产' });
});

test('enforces AssetFlowSpan, attempt, answer, and AI task idempotency constraints', async () => {
  const graph = await createAssetGraph('constraint graph');
  const textHash = 'span-text-hash';

  await prisma.assetFlowSpan.create({
    data: {
      personalAssetVersionId: graph.personalAssetVersion.id,
      personalAssetNodeId: graph.personalAssetNode.id,
      sequence: 1,
      startOffset: 0,
      endOffset: 17,
      textHash,
    },
  });
  await expect(
    prisma.assetFlowSpan.create({
      data: {
        personalAssetVersionId: graph.personalAssetVersion.id,
        personalAssetNodeId: graph.personalAssetNode.id,
        sequence: 1,
        startOffset: 0,
        endOffset: 17,
        textHash: 'duplicate-span',
      },
    }),
  ).rejects.toThrow();

  const practiceSession = await prisma.assetPracticeSession.create({
    data: {
      userId: graph.user.id,
      personalAssetId: graph.personalAsset.id,
      personalAssetVersionId: graph.personalAssetVersion.id,
    },
  });
  await prisma.assetPracticeAttempt.create({
    data: {
      assetPracticeSessionId: practiceSession.id,
      stepType: 'READING',
      modality: 'READ_ONLY',
      idempotencyKey: 'attempt-idempotency-key',
    },
  });
  await expect(
    prisma.assetPracticeAttempt.create({
      data: {
        assetPracticeSessionId: practiceSession.id,
        stepType: 'READING',
        modality: 'READ_ONLY',
        idempotencyKey: 'attempt-idempotency-key',
      },
    }),
  ).rejects.toThrow();

  const question = await prisma.question.create({
    data: { text: 'What changed?', source: 'MANUAL' },
  });
  const questionPlan = await prisma.questionPlan.create({
    data: {
      questionId: question.id,
      version: 1,
      questionText: question.text,
      distance: 'L1',
    },
  });
  const trainingSession = await prisma.trainingSession.create({
    data: { userId: graph.user.id, questionPlanId: questionPlan.id },
  });
  await prisma.trainingAnswer.create({
    data: {
      trainingSessionId: trainingSession.id,
      answerType: 'FIRST_ANSWER',
      sequence: 1,
      text: 'A saved answer.',
      normalizedHash: 'answer-hash',
      idempotencyKey: 'answer-idempotency-key',
    },
  });
  await expect(
    prisma.trainingAnswer.create({
      data: {
        trainingSessionId: trainingSession.id,
        answerType: 'FIRST_ANSWER',
        sequence: 1,
        text: 'A duplicate answer.',
        normalizedHash: 'answer-hash-duplicate',
        idempotencyKey: 'answer-idempotency-key',
      },
    }),
  ).rejects.toThrow();

  const releaseBundle = await prisma.aiReleaseBundle.create({
    data: { version: 'test-bundle', bundleHash: 'test-bundle-hash' },
  });
  const aiTaskData = {
    releaseBundleId: releaseBundle.id,
    role: 'R1' as const,
    entityType: 'TrainingAnswer',
    entityId: trainingSession.id,
    entityVersion: 1,
    inputFingerprint: 'task-input-fingerprint',
  };
  await prisma.aiTask.create({ data: aiTaskData });
  await expect(prisma.aiTask.create({ data: aiTaskData })).rejects.toThrow();
});
