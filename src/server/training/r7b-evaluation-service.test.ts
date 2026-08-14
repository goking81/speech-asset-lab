import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterAll, beforeAll, expect, test } from 'vitest';

import { MockAiProvider, UnconfiguredAiProvider } from '@/ai/provider';
import { ensureLocalR6Release } from '@/server/ai/r6-release-service';
import { createDatabaseClient } from '@/server/db/client';

import { P08SessionService } from './p08-session-service';
import { R7AUsageService } from './r7a-usage-service';
import { calculateTotalScore, R7BEvaluationService } from './r7b-evaluation-service';

const projectRoot = process.cwd();
const testDatabasePath = path.join(projectRoot, 'data', 'f5-r7b-evaluation.db');
const testDatabaseUrl = 'file:../data/f5-r7b-evaluation.db';
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

test('六维完整有效时只由本地权重写入总分，并保留可定位的草稿', async () => {
  const fixture = await createUsageFixture('完整六维', 'COMPLETE');
  const r7b = new R7BEvaluationService(
    prisma,
    new MockAiProvider({ kind: 'DRAFT', draft: completeEvaluationDraft(fixture) }),
  );

  const first = await r7b.requestForAnswer({
    trainingSessionId: fixture.sessionId,
    answerId: fixture.answer.id,
  });
  const repeated = await r7b.requestForAnswer({
    trainingSessionId: fixture.sessionId,
    answerId: fixture.answer.id,
  });
  expect(first).toMatchObject({ status: 'DRAFT_READY', totalScore: 86 });
  expect(repeated).toEqual(first);

  const result = await prisma.answerEvaluationResult.findUniqueOrThrow({
    where: { id: first.resultId! },
    include: { ratings: true, issues: true, recommendations: true, corrections: true },
  });
  expect(result.totalScore).toBe(86);
  expect(result.ratings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        dimension: 'ASSET_USAGE',
        rating: 100,
        status: 'VALID',
        source: 'R7A_LOCAL',
      }),
      expect.objectContaining({
        dimension: 'OBLIGATION_COVERAGE',
        rating: 100,
        status: 'VALID',
        source: 'R7A_LOCAL',
      }),
      expect.objectContaining({ dimension: 'QUESTION_RELEVANCE', rating: 80, source: 'R7B_DRAFT' }),
    ]),
  );
  expect(result.issues).toHaveLength(1);
  expect(result.recommendations).toHaveLength(1);
  expect(result.corrections).toMatchObject([
    {
      answerUnitId: fixture.answerUnits[1]!.id,
      replacementText: 'Then I choose one useful action.',
    },
  ]);
  await expect(
    prisma.aiTask.count({ where: { trainingSessionId: fixture.sessionId, role: 'R7B' } }),
  ).resolves.toBe(1);
});

test('R7A 部分调用不会被 R7B 补成完整资产调用或总分', async () => {
  const fixture = await createUsageFixture('部分调用', 'PARTIAL');
  const view = await new R7BEvaluationService(
    prisma,
    new MockAiProvider({ kind: 'DRAFT', draft: completeEvaluationDraft(fixture) }),
  ).requestForAnswer({ trainingSessionId: fixture.sessionId, answerId: fixture.answer.id });
  expect(view).toMatchObject({ status: 'PARTIAL', totalScore: null });
  await expect(
    prisma.answerDimensionRating.findFirstOrThrow({
      where: { answerEvaluationResultId: view.resultId!, dimension: 'ASSET_USAGE' },
    }),
  ).resolves.toMatchObject({ rating: null, status: 'PARTIAL', source: 'R7A_LOCAL' });
});

test('模型不能覆盖 R7A 资产维度；无效草稿保留本地事实但不伪造其余评分', async () => {
  const fixture = await createUsageFixture('锁定资产', 'COMPLETE');
  const invalidDraft = JSON.stringify({
    dimensions: [
      {
        dimension: 'ASSET_USAGE',
        rating: 0,
        evidence: [{ type: 'ANSWER_UNIT', sequence: 1 }],
      },
    ],
    issues: [],
    recommendations: [],
    corrections: [],
  });
  const view = await new R7BEvaluationService(
    prisma,
    new MockAiProvider({ kind: 'DRAFT', draft: invalidDraft }),
  ).requestForAnswer({ trainingSessionId: fixture.sessionId, answerId: fixture.answer.id });
  expect(view).toMatchObject({ status: 'NEEDS_REVIEW', totalScore: null });
  await expect(
    prisma.answerDimensionRating.findFirstOrThrow({
      where: { answerEvaluationResultId: view.resultId!, dimension: 'ASSET_USAGE' },
    }),
  ).resolves.toMatchObject({ rating: 100, status: 'VALID', source: 'R7A_LOCAL' });
  await expect(
    prisma.answerDimensionRating.findFirstOrThrow({
      where: { answerEvaluationResultId: view.resultId!, dimension: 'QUESTION_RELEVANCE' },
    }),
  ).resolves.toMatchObject({ rating: null, status: 'NOT_EVALUABLE' });
});

test('Provider 或冻结 Bundle 不可用时保留回答和 R7A 事实，并返回不可评价', async () => {
  const unavailableFixture = await createUsageFixture('Provider 不可用', 'COMPLETE');
  const unavailable = await new R7BEvaluationService(
    prisma,
    new UnconfiguredAiProvider(),
  ).requestForAnswer({
    trainingSessionId: unavailableFixture.sessionId,
    answerId: unavailableFixture.answer.id,
  });
  expect(unavailable).toMatchObject({ status: 'UNAVAILABLE', totalScore: null });
  await expect(
    prisma.trainingAnswer.findUniqueOrThrow({ where: { id: unavailableFixture.answer.id } }),
  ).resolves.toMatchObject({ text: 'I clarify the change, then choose one useful action.' });

  const legacyFixture = await createUsageFixture('历史发布包', 'COMPLETE');
  const legacyBundle = await ensureLocalR6Release(prisma);
  await prisma.trainingSession.update({
    where: { id: legacyFixture.sessionId },
    data: { releaseBundleId: legacyBundle.id },
  });
  const legacy = await new R7BEvaluationService(
    prisma,
    new MockAiProvider({ kind: 'DRAFT', draft: '{}' }),
  ).requestForAnswer({
    trainingSessionId: legacyFixture.sessionId,
    answerId: legacyFixture.answer.id,
  });
  expect(legacy.status).toBe('UNAVAILABLE');
  await expect(
    prisma.aiTask.count({ where: { trainingSessionId: legacyFixture.sessionId, role: 'R7B' } }),
  ).resolves.toBe(0);
});

test('本地总分拒绝任何缺失维度', () => {
  expect(
    calculateTotalScore([
      {
        dimension: 'ASSET_USAGE',
        rating: 100,
        status: 'VALID',
        source: 'R7A_LOCAL',
        evidence: [],
      },
    ]),
  ).toBeNull();
});

async function createUsageFixture(label: string, usageMode: 'COMPLETE' | 'PARTIAL') {
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
    text: 'I clarify the change, then choose one useful action.',
    idempotencyKey: `f5-r7b-${label}`,
  });
  const obligations = await prisma.questionObligation.findMany({
    where: { questionPlanId: plan.id },
    orderBy: { sequence: 'asc' },
  });
  const r7aDraft = JSON.stringify({
    assets: [
      {
        personalAssetVersionId: personalVersion.id,
        nodeEvidence:
          usageMode === 'COMPLETE'
            ? [
                {
                  personalAssetNodeId: personalVersion.nodes[0]!.id,
                  answerUnitSequence: 1,
                  evidenceType: 'DIRECT',
                },
                {
                  personalAssetNodeId: personalVersion.nodes[1]!.id,
                  answerUnitSequence: 2,
                  evidenceType: 'DIRECT',
                },
              ]
            : [
                {
                  personalAssetNodeId: personalVersion.nodes[0]!.id,
                  answerUnitSequence: 1,
                  evidenceType: 'DIRECT',
                },
              ],
      },
    ],
    obligationCoverage: obligations.map((obligation, index) => ({
      questionObligationId: obligation.id,
      status: usageMode === 'PARTIAL' && index === 2 ? 'NOT_EVALUABLE' : 'COVERED',
      ...(usageMode === 'PARTIAL' && index === 2
        ? {}
        : { answerUnitSequence: index === 0 ? 1 : 2 }),
    })),
  });
  await new R7AUsageService(
    prisma,
    new MockAiProvider({ kind: 'DRAFT', draft: r7aDraft }),
  ).requestForAnswer({ trainingSessionId: sessionId, answerId: answer.id });
  const answerUnits = await prisma.answerUnit.findMany({
    where: { trainingAnswerId: answer.id },
    orderBy: { sequence: 'asc' },
  });
  return { sessionId, answer, personalVersion, obligations, answerUnits };
}

function completeEvaluationDraft(fixture: Awaited<ReturnType<typeof createUsageFixture>>) {
  const firstObligation = fixture.obligations[0]!;
  const firstNode = fixture.personalVersion.nodes[0]!;
  return JSON.stringify({
    dimensions: [
      {
        dimension: 'QUESTION_RELEVANCE',
        rating: 80,
        evidence: [{ type: 'ANSWER_UNIT', sequence: 1, explanation: '直接回应题面。' }],
      },
      {
        dimension: 'LOGICAL_COHERENCE',
        rating: 70,
        evidence: [{ type: 'ANSWER_UNIT', sequence: 2, explanation: '行动承接前文。' }],
      },
      {
        dimension: 'TEXT_CLARITY',
        rating: 60,
        evidence: [{ type: 'QUESTION_OBLIGATION', id: firstObligation.id }],
      },
      {
        dimension: 'SUPPORTING_DETAIL',
        rating: 90,
        evidence: [{ type: 'PERSONAL_ASSET_NODE', id: firstNode.id }],
      },
    ],
    issues: [
      {
        dimension: 'LOGICAL_COHERENCE',
        issueCode: 'LOGIC_LINK',
        severity: 'LOW',
        explanation: '行动与结果之间可增加连接。',
        evidence: [{ type: 'ANSWER_UNIT', sequence: 2 }],
      },
    ],
    recommendations: [
      {
        dimension: 'LOGICAL_COHERENCE',
        issueIndex: 0,
        text: '补充行动后的结果。',
        evidence: [{ type: 'ANSWER_UNIT', sequence: 2 }],
      },
    ],
    corrections: [
      {
        dimension: 'LOGICAL_COHERENCE',
        recommendationIndex: 0,
        answerUnitSequence: 2,
        replacementText: 'Then I choose one useful action.',
        explanation: '这是待确认的文字修正草稿。',
        evidence: [{ type: 'ANSWER_UNIT', sequence: 2 }],
      },
    ],
  });
}
