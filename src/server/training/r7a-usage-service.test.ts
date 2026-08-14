import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterAll, beforeAll, expect, test } from 'vitest';

import { MockAiProvider, UnconfiguredAiProvider } from '@/ai/provider';
import { ensureLocalR6Release } from '@/server/ai/r6-release-service';
import { createDatabaseClient } from '@/server/db/client';

import { segmentAnswerText } from './answer-unit-service';
import { P08SessionService } from './p08-session-service';
import { R7AUsageService } from './r7a-usage-service';

const projectRoot = process.cwd();
const testDatabasePath = path.join(projectRoot, 'data', 'f5-r7a-usage.db');
const testDatabaseUrl = 'file:../data/f5-r7a-usage.db';
const prisma = createDatabaseClient(testDatabaseUrl);
const sessionService = new P08SessionService(prisma);

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

test('AnswerUnit 使用稳定本地边界并保留原文 offset', () => {
  expect(segmentAnswerText('  First part, then second.  ')).toEqual([
    {
      sequence: 1,
      unitType: 'CLAUSE',
      startOffset: 2,
      endOffset: 13,
      text: 'First part,',
    },
    {
      sequence: 2,
      unitType: 'SENTENCE',
      startOffset: 14,
      endOffset: 26,
      text: 'then second.',
    },
  ]);
  expect(segmentAnswerText('。')).toEqual([
    { sequence: 1, unitType: 'SENTENCE', startOffset: 0, endOffset: 1, text: '。' },
  ]);
});

test('R7A 草稿为节点、回答单元和问题义务建立双向可追溯证据', async () => {
  const fixture = await createSavedAnswer(
    '完整调用',
    'I clarify the change, then choose one useful action.',
  );
  const [firstNode, secondNode] = fixture.personalVersion.nodes;
  const [firstObligation, secondObligation, thirdObligation] = fixture.obligations;
  const service = new R7AUsageService(
    prisma,
    new MockAiProvider({
      kind: 'DRAFT',
      draft: JSON.stringify({
        assets: [
          {
            personalAssetVersionId: fixture.personalVersion.id,
            explanation: '两个冻结节点均能回链到已保存回答。',
            nodeEvidence: [
              {
                personalAssetNodeId: firstNode!.id,
                answerUnitSequence: 1,
                evidenceType: 'DIRECT',
              },
              {
                personalAssetNodeId: secondNode!.id,
                answerUnitSequence: 2,
                evidenceType: 'PARAPHRASE',
              },
            ],
          },
        ],
        obligationCoverage: [
          {
            questionObligationId: firstObligation!.id,
            status: 'COVERED',
            answerUnitSequence: 1,
          },
          {
            questionObligationId: secondObligation!.id,
            status: 'COVERED',
            answerUnitSequence: 2,
          },
          { questionObligationId: thirdObligation!.id, status: 'NOT_COVERED' },
        ],
      }),
    }),
  );

  const first = await service.requestForAnswer({
    trainingSessionId: fixture.sessionId,
    answerId: fixture.answer.id,
  });
  const repeated = await service.requestForAnswer({
    trainingSessionId: fixture.sessionId,
    answerId: fixture.answer.id,
  });
  expect(first).toMatchObject({ status: 'DRAFT_READY' });
  expect(repeated).toEqual(first);

  const result = await prisma.assetUsageResult.findUniqueOrThrow({
    where: { id: first.resultId! },
    include: {
      assessments: { include: { nodeEvidence: { include: { answerUnit: true } } } },
      obligationCoverage: true,
    },
  });
  expect(result.status).toBe('DRAFT_READY');
  expect(result.assessments).toMatchObject([
    {
      personalAssetVersionId: fixture.personalVersion.id,
      isCompleteInvocation: true,
      nodeEvidence: [
        { personalAssetNodeId: firstNode!.id, answerUnit: { sequence: 1, startOffset: 0 } },
        { personalAssetNodeId: secondNode!.id, answerUnit: { sequence: 2, startOffset: 22 } },
      ],
    },
  ]);
  expect(result.obligationCoverage).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ questionObligationId: firstObligation!.id, status: 'COVERED' }),
      expect.objectContaining({ questionObligationId: thirdObligation!.id, status: 'NOT_COVERED' }),
    ]),
  );
  await expect(
    prisma.aiTask.count({ where: { trainingSessionId: fixture.sessionId, role: 'R7A' } }),
  ).resolves.toBe(1);
});

test('单节点证据只能形成部分结果，不能冒充完整资产调用', async () => {
  const fixture = await createSavedAnswer('部分调用', 'I clarify the change.');
  const [node] = fixture.personalVersion.nodes;
  const service = new R7AUsageService(
    prisma,
    new MockAiProvider({
      kind: 'DRAFT',
      draft: JSON.stringify({
        assets: [
          {
            personalAssetVersionId: fixture.personalVersion.id,
            nodeEvidence: [
              {
                personalAssetNodeId: node!.id,
                answerUnitSequence: 1,
                evidenceType: 'DIRECT',
              },
            ],
          },
        ],
        obligationCoverage: fixture.obligations.map((obligation) => ({
          questionObligationId: obligation.id,
          status: 'NOT_COVERED',
        })),
      }),
    }),
  );

  const view = await service.requestForAnswer({
    trainingSessionId: fixture.sessionId,
    answerId: fixture.answer.id,
  });
  expect(view.status).toBe('PARTIAL');
  await expect(
    prisma.assetUsageAssessment.findFirstOrThrow({ where: { assetUsageResultId: view.resultId! } }),
  ).resolves.toMatchObject({ isCompleteInvocation: false, status: 'PARTIAL_EVIDENCE_DRAFT' });
});

test('R7A 无法执行或引用未知节点时保留回答，只记录不可评价或待复核结果', async () => {
  const unavailableFixture = await createSavedAnswer('不可评价', 'Text remains saved.');
  const unavailable = await new R7AUsageService(
    prisma,
    new UnconfiguredAiProvider(),
  ).requestForAnswer({
    trainingSessionId: unavailableFixture.sessionId,
    answerId: unavailableFixture.answer.id,
  });
  expect(unavailable.status).toBe('UNAVAILABLE');
  await expect(
    prisma.nodeUsageEvidence.count({
      where: { assetUsageAssessment: { assetUsageResultId: unavailable.resultId! } },
    }),
  ).resolves.toBe(0);

  const invalidFixture = await createSavedAnswer('无效证据', 'Text also remains saved.');
  const invalid = await new R7AUsageService(
    prisma,
    new MockAiProvider({
      kind: 'DRAFT',
      draft: JSON.stringify({
        assets: [
          {
            personalAssetVersionId: invalidFixture.personalVersion.id,
            nodeEvidence: [
              {
                personalAssetNodeId: 'unknown-node',
                answerUnitSequence: 1,
                evidenceType: 'DIRECT',
              },
            ],
          },
        ],
        obligationCoverage: [],
      }),
    }),
  ).requestForAnswer({
    trainingSessionId: invalidFixture.sessionId,
    answerId: invalidFixture.answer.id,
  });
  expect(invalid.status).toBe('NEEDS_REVIEW');
  await expect(
    prisma.trainingAnswer.findUniqueOrThrow({ where: { id: invalidFixture.answer.id } }),
  ).resolves.toMatchObject({
    text: 'Text also remains saved.',
  });
  await expect(
    prisma.nodeUsageEvidence.count({
      where: { assetUsageAssessment: { assetUsageResultId: invalid.resultId! } },
    }),
  ).resolves.toBe(0);
});

test('旧 R6-only 冻结包不会被补写 R7A，安全降级为不可评价', async () => {
  const fixture = await createSavedAnswer('旧发布包', 'A saved answer.');
  const legacyBundle = await ensureLocalR6Release(prisma);
  await prisma.trainingSession.update({
    where: { id: fixture.sessionId },
    data: { releaseBundleId: legacyBundle.id },
  });

  const view = await new R7AUsageService(
    prisma,
    new MockAiProvider({ kind: 'DRAFT', draft: '{}' }),
  ).requestForAnswer({ trainingSessionId: fixture.sessionId, answerId: fixture.answer.id });
  expect(view.status).toBe('UNAVAILABLE');
  await expect(
    prisma.aiTask.count({ where: { trainingSessionId: fixture.sessionId, role: 'R7A' } }),
  ).resolves.toBe(0);
});

async function createSavedAnswer(label: string, text: string) {
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
          { sequence: 2, nodeType: 'ACTION', text: 'choose one useful action,' },
          { sequence: 3, nodeType: 'RESULT', text: 'and explain the result.' },
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
        create: personalVersion.nodes.map((node) => ({
          sequence: node.sequence,
          obligationType: 'ASSET_NODE',
          description: `冻结节点 ${node.sequence}`,
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
  const { sessionId } = await sessionService.start({ questionPlanId: plan.id });
  const answer = await sessionService.submitAnswer({
    trainingSessionId: sessionId,
    expectedBusinessVersion: 1,
    answerType: 'FIRST_ANSWER',
    text,
    idempotencyKey: `f5-r7a-${label}`,
  });
  const obligations = await prisma.questionObligation.findMany({
    where: { questionPlanId: plan.id },
    orderBy: { sequence: 'asc' },
  });
  return { sessionId, answer, personalVersion, obligations };
}
