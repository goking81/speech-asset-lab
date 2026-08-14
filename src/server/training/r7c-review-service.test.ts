import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterAll, beforeAll, expect, test } from 'vitest';

import { MockAiProvider } from '@/ai/provider';
import { ensureLocalR6Release, ensureLocalTrainingRelease } from '@/server/ai/r6-release-service';
import { createDatabaseClient } from '@/server/db/client';

import { R7CReviewService } from './r7c-review-service';

const projectRoot = process.cwd();
const testDatabasePath = path.join(projectRoot, 'data', 'f6-r7c-review.db');
const testDatabaseUrl = 'file:../data/f6-r7c-review.db';
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

test('完整本地事实只允许 R7C 解释已有 factId，且重复请求不新建任务', async () => {
  const fixture = await createComparisonFixture('完整事实');
  const service = new R7CReviewService(
    prisma,
    new MockAiProvider({
      kind: 'DRAFT',
      draft: JSON.stringify({
        observations: [
          {
            factId: 'dimension:QUESTION_RELEVANCE',
            changeType: 'INCREASED',
            text: '第二次已保存文本在该本地维度上显示增加。',
          },
        ],
        limitation: '此草稿只基于已保存文字与冻结本地事实。',
      }),
    }),
  );

  const first = await service.requestForSession({ trainingSessionId: fixture.sessionId });
  const repeated = await service.requestForSession({ trainingSessionId: fixture.sessionId });

  expect(first).toMatchObject({ status: 'COMPLETE' });
  expect(first.comparison).toMatchObject({
    factsStatus: 'COMPLETE',
    interpretationStatus: 'DRAFT_READY',
    firstTotalScore: 80,
    secondTotalScore: 88,
  });
  expect(first.comparison?.dimensions).toHaveLength(6);
  expect(first.comparison?.nodes).toEqual(
    expect.arrayContaining([expect.objectContaining({ changeType: 'ADDED' })]),
  );
  expect(first.comparison?.interpretation?.observations).toEqual([
    {
      factId: 'dimension:QUESTION_RELEVANCE',
      changeType: 'INCREASED',
      text: '第二次已保存文本在该本地维度上显示增加。',
    },
  ]);
  expect(repeated).toEqual(first);
  await expect(
    prisma.aiTask.count({ where: { trainingSessionId: fixture.sessionId, role: 'R7C' } }),
  ).resolves.toBe(1);
});

test('任一 R7B 结果不完整时仅保留局部事实与本地模板', async () => {
  const fixture = await createComparisonFixture('部分事实', {
    secondEvaluationStatus: 'UNAVAILABLE',
  });
  const review = await new R7CReviewService(
    prisma,
    new MockAiProvider({ kind: 'DRAFT', draft: '{}' }),
  ).requestForSession({ trainingSessionId: fixture.sessionId });

  expect(review).toMatchObject({ status: 'PARTIAL' });
  expect(review.comparison).toMatchObject({
    factsStatus: 'PARTIAL',
    interpretationStatus: 'PARTIAL',
    firstTotalScore: 80,
    secondTotalScore: null,
    interpretation: null,
  });
  expect(review.localTemplate).toContain('不完整评价');
  await expect(
    prisma.aiTask.count({ where: { trainingSessionId: fixture.sessionId, role: 'R7C' } }),
  ).resolves.toBe(0);
});

test('缺少第二次回答时保持不可比较，不创建比较结果', async () => {
  const fixture = await createComparisonFixture('尚未完成', { includeSecondAnswer: false });
  const review = await new R7CReviewService(
    prisma,
    new MockAiProvider({ kind: 'DRAFT', draft: '{}' }),
  ).requestForSession({ trainingSessionId: fixture.sessionId });

  expect(review).toMatchObject({ status: 'NOT_COMPARABLE', comparison: null });
  await expect(
    prisma.answerComparisonResult.count({ where: { trainingSessionId: fixture.sessionId } }),
  ).resolves.toBe(0);
});

test('R7C 引用不存在的事实会降级为本地模板，不能写入解释草稿', async () => {
  const fixture = await createComparisonFixture('无效草稿');
  const review = await new R7CReviewService(
    prisma,
    new MockAiProvider({
      kind: 'DRAFT',
      draft: JSON.stringify({
        observations: [
          { factId: 'dimension:UNKNOWN', changeType: 'INCREASED', text: '无效事实。' },
        ],
        limitation: '此草稿只基于已保存文字与冻结本地事实。',
      }),
    }),
  ).requestForSession({ trainingSessionId: fixture.sessionId });

  expect(review.comparison).toMatchObject({
    factsStatus: 'COMPLETE',
    interpretationStatus: 'NEEDS_REVIEW',
    finalDisplayStatus: 'LOCAL_TEMPLATE',
    interpretation: null,
  });
  await expect(
    prisma.aiTask.findFirstOrThrow({
      where: { trainingSessionId: fixture.sessionId, role: 'R7C' },
    }),
  ).resolves.toMatchObject({ status: 'NEEDS_REVIEW', resultReference: 'R7C_INVALID_DRAFT' });
});

test('R7C 即使引用有效事实，也不能将分数写入解释草稿', async () => {
  const fixture = await createComparisonFixture('禁止分数');
  const review = await new R7CReviewService(
    prisma,
    new MockAiProvider({
      kind: 'DRAFT',
      draft: JSON.stringify({
        observations: [
          {
            factId: 'dimension:QUESTION_RELEVANCE',
            changeType: 'INCREASED',
            text: '第二次得分 88，更高。',
          },
        ],
        limitation: '此草稿只基于已保存文字与冻结本地事实。',
      }),
    }),
  ).requestForSession({ trainingSessionId: fixture.sessionId });

  expect(review.comparison).toMatchObject({
    factsStatus: 'COMPLETE',
    interpretationStatus: 'NEEDS_REVIEW',
    interpretation: null,
  });
});

test('历史冻结包缺少 R7C 时只展示本地事实，绝不补写角色', async () => {
  const fixture = await createComparisonFixture('历史发布包', { release: 'R6_ONLY' });
  const review = await new R7CReviewService(
    prisma,
    new MockAiProvider({ kind: 'DRAFT', draft: '{}' }),
  ).requestForSession({ trainingSessionId: fixture.sessionId });

  expect(review.comparison).toMatchObject({
    factsStatus: 'COMPLETE',
    interpretationStatus: 'UNAVAILABLE',
    finalDisplayStatus: 'LOCAL_TEMPLATE',
  });
  await expect(
    prisma.aiTask.count({ where: { trainingSessionId: fixture.sessionId, role: 'R7C' } }),
  ).resolves.toBe(0);
});

async function createComparisonFixture(
  label: string,
  options: {
    includeSecondAnswer?: boolean;
    secondEvaluationStatus?: 'DRAFT_READY' | 'UNAVAILABLE';
    release?: 'CURRENT' | 'R6_ONLY';
  } = {},
) {
  const includeSecondAnswer = options.includeSecondAnswer ?? true;
  const release =
    options.release === 'R6_ONLY'
      ? await ensureLocalR6Release(prisma)
      : await ensureLocalTrainingRelease(prisma);
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
      coreFlow: 'I clarify the change and choose one useful action.',
      status: 'CONFIRMED',
      confirmedAt: new Date(),
      nodes: {
        create: [
          { sequence: 1, nodeType: 'CLAIM', text: 'I clarify the change.' },
          { sequence: 2, nodeType: 'ACTION', text: 'I choose one useful action.' },
        ],
      },
    },
    include: { nodes: { orderBy: { sequence: 'asc' } } },
  });
  const question = await prisma.question.create({
    data: { text: `${label} 时如何回答？`, source: 'USER_REAL' },
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
        })),
      },
    },
    include: { obligations: { orderBy: { sequence: 'asc' } } },
  });
  const session = await prisma.trainingSession.create({
    data: {
      userId: 'local-user',
      questionPlanId: plan.id,
      releaseBundleId: release.id,
      status: includeSecondAnswer ? 'SECOND_ANSWER_SUBMITTED' : 'FIRST_ANSWER_SUBMITTED',
    },
  });
  const firstAnswer = await createAnswer(session.id, 'FIRST_ANSWER', 'I clarify the change.');
  await createUsageResult({
    sessionId: session.id,
    answer: firstAnswer,
    personalVersion,
    obligations: plan.obligations,
    usedNodeIndexes: [0],
  });
  await createEvaluationResult({
    sessionId: session.id,
    answerId: firstAnswer.id,
    totalScore: 80,
    status: 'DRAFT_READY',
    startRating: 70,
  });

  if (includeSecondAnswer) {
    const secondAnswer = await createAnswer(
      session.id,
      'SECOND_ANSWER',
      'I clarify the change. I choose one useful action.',
    );
    await createUsageResult({
      sessionId: session.id,
      answer: secondAnswer,
      personalVersion,
      obligations: plan.obligations,
      usedNodeIndexes: [0, 1],
    });
    await createEvaluationResult({
      sessionId: session.id,
      answerId: secondAnswer.id,
      totalScore: options.secondEvaluationStatus === 'UNAVAILABLE' ? null : 88,
      status: options.secondEvaluationStatus ?? 'DRAFT_READY',
      startRating: 78,
    });
  }
  return { sessionId: session.id };
}

async function createAnswer(
  trainingSessionId: string,
  answerType: 'FIRST_ANSWER' | 'SECOND_ANSWER',
  text: string,
) {
  return prisma.trainingAnswer.create({
    data: {
      trainingSessionId,
      answerType,
      sequence: 1,
      text,
      normalizedHash: `${trainingSessionId}-${answerType}`,
      idempotencyKey: `${trainingSessionId}-${answerType}`,
      units: {
        create: text
          .split('. ')
          .filter(Boolean)
          .map((unit, index) => ({
            sequence: index + 1,
            unitType: 'SENTENCE',
            startOffset: text.indexOf(unit),
            endOffset: text.indexOf(unit) + unit.length,
            text: unit,
          })),
      },
    },
    include: { units: { orderBy: { sequence: 'asc' } } },
  });
}

async function createUsageResult({
  sessionId,
  answer,
  personalVersion,
  obligations,
  usedNodeIndexes,
}: {
  sessionId: string;
  answer: { id: string; units: Array<{ id: string }> };
  personalVersion: { id: string; nodes: Array<{ id: string }> };
  obligations: Array<{ id: string }>;
  usedNodeIndexes: number[];
}) {
  return prisma.assetUsageResult.create({
    data: {
      trainingSessionId: sessionId,
      answerId: answer.id,
      status: 'DRAFT_READY',
      assessments: {
        create: {
          personalAssetVersionId: personalVersion.id,
          status: 'DRAFT_READY',
          isCompleteInvocation: usedNodeIndexes.length === personalVersion.nodes.length,
          nodeEvidence: {
            create: usedNodeIndexes.map((index) => ({
              personalAssetNodeId: personalVersion.nodes[index]!.id,
              answerUnitId: answer.units[Math.min(index, answer.units.length - 1)]!.id,
              evidenceType: 'DIRECT',
            })),
          },
        },
      },
      obligationCoverage: {
        create: obligations.map((obligation, index) => ({
          questionObligationId: obligation.id,
          answerUnitId: answer.units[Math.min(index, answer.units.length - 1)]!.id,
          status: usedNodeIndexes.includes(index) ? 'COVERED' : 'NOT_COVERED',
        })),
      },
    },
  });
}

async function createEvaluationResult({
  sessionId,
  answerId,
  totalScore,
  status,
  startRating,
}: {
  sessionId: string;
  answerId: string;
  totalScore: number | null;
  status: 'DRAFT_READY' | 'UNAVAILABLE';
  startRating: number;
}) {
  const dimensions = [
    'ASSET_USAGE',
    'OBLIGATION_COVERAGE',
    'QUESTION_RELEVANCE',
    'LOGICAL_COHERENCE',
    'TEXT_CLARITY',
    'SUPPORTING_DETAIL',
  ];
  return prisma.answerEvaluationResult.create({
    data: {
      trainingSessionId: sessionId,
      answerId,
      status,
      totalScore,
      ratings: {
        create:
          status === 'DRAFT_READY'
            ? dimensions.map((dimension, index) => ({
                dimension,
                rating: startRating + index,
                status: 'VALID',
                source:
                  dimension === 'ASSET_USAGE' || dimension === 'OBLIGATION_COVERAGE'
                    ? 'R7A_LOCAL'
                    : 'R7B_DRAFT',
              }))
            : [
                {
                  dimension: 'ASSET_USAGE',
                  rating: null,
                  status: 'NOT_EVALUABLE',
                  source: 'R7A_LOCAL',
                },
              ],
      },
    },
  });
}
