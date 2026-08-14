import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterAll, beforeAll, expect, test } from 'vitest';

import { MockAiProvider, UnconfiguredAiProvider } from '@/ai/provider';
import { createDatabaseClient } from '@/server/db/client';
import { LocalDailyPlanService } from '@/server/planning/local-daily-plan-service';

import { R5CoachService } from './r5-coach-service';

const projectRoot = process.cwd();
const testDatabasePath = path.join(projectRoot, 'data', 'f3-r5-coach.db');
const testDatabaseUrl = 'file:../data/f3-r5-coach.db';
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

async function createLocalPlan(label: string, day: string) {
  const sourceAsset = await prisma.sourceAsset.create({ data: { userId: localUserId } });
  const personalAsset = await prisma.personalAsset.create({
    data: { userId: localUserId, sourceAssetId: sourceAsset.id },
  });
  await prisma.personalAssetVersion.create({
    data: {
      personalAssetId: personalAsset.id,
      version: 1,
      triggerName: `${label} 资产`,
      coreIdea: '本地核心观点',
      coreFlow: 'A local flow.',
      status: 'CONFIRMED',
      confirmedAt: new Date(),
    },
  });
  await prisma.userAssetState.create({
    data: { userId: localUserId, personalAssetId: personalAsset.id, isActive: true },
  });
  return new LocalDailyPlanService(prisma).getOrCreateTodayPlan({
    userId: localUserId,
    now: new Date(`${day}T08:00:00.000Z`),
  });
}

async function localTaskSnapshot(planId: string) {
  return prisma.trainingTask.findMany({
    where: { dailyPlanId: planId },
    orderBy: { sequence: 'asc' },
    select: {
      id: true,
      sequence: true,
      taskType: true,
      reason: true,
      eligibilityJson: true,
      status: true,
    },
  });
}

test('R5 草稿只能解释本地任务，不能改动正式任务', async () => {
  const plan = await createLocalPlan('成功', '2026-08-01');
  const before = await localTaskSnapshot(plan.id);
  const service = new R5CoachService(
    prisma,
    new MockAiProvider({
      kind: 'DRAFT',
      draft: JSON.stringify({
        summary: '先按本地计划完成熟读，再决定是否需要加强。',
        taskNotes: [{ taskId: before[0].id, reason: '这项资产当前处于积累期。' }],
      }),
    }),
  );

  await expect(service.request(localUserId, plan.id)).resolves.toMatchObject({
    status: 'DRAFT_READY',
    advice: {
      summary: '先按本地计划完成熟读，再决定是否需要加强。',
      taskNotes: [{ taskId: before[0].id }],
    },
  });
  await expect(localTaskSnapshot(plan.id)).resolves.toEqual(before);
  await expect(service.getSavedAdvice(localUserId, plan.id)).resolves.toMatchObject({
    status: 'DRAFT_READY',
    advice: { taskNotes: [{ taskId: before[0].id }] },
  });
});

test('未配置 Provider 时保留本地计划并记录降级', async () => {
  const plan = await createLocalPlan('未配置', '2026-08-02');
  const before = await localTaskSnapshot(plan.id);
  const service = new R5CoachService(prisma, new UnconfiguredAiProvider());

  await expect(service.request(localUserId, plan.id)).resolves.toMatchObject({
    status: 'LOCAL_FALLBACK',
    fallbackReason: 'R5_COACH_FAILED',
  });
  await expect(localTaskSnapshot(plan.id)).resolves.toEqual(before);
  await expect(
    prisma.aiTask.findFirstOrThrow({
      where: { role: 'R5', entityId: plan.id },
      include: { attempts: true },
    }),
  ).resolves.toMatchObject({
    status: 'FAILED_RETRYABLE',
    attempts: [{ status: 'FAILED' }],
  });
});

test('引用不存在任务的 R5 草稿会安全降级，不会改动计划', async () => {
  const plan = await createLocalPlan('非法草稿', '2026-08-03');
  const before = await localTaskSnapshot(plan.id);
  const service = new R5CoachService(
    prisma,
    new MockAiProvider({
      kind: 'DRAFT',
      draft: JSON.stringify({
        summary: '不应被采用。',
        taskNotes: [{ taskId: 'unknown-task', reason: '不存在。' }],
      }),
    }),
  );

  await expect(service.request(localUserId, plan.id)).resolves.toMatchObject({
    status: 'LOCAL_FALLBACK',
    fallbackReason: 'R5_COACH_FAILED',
  });
  await expect(localTaskSnapshot(plan.id)).resolves.toEqual(before);
});

test('Provider 异常时保留本地计划并允许安全降级', async () => {
  const plan = await createLocalPlan('Provider 异常', '2026-08-04');
  const before = await localTaskSnapshot(plan.id);
  const service = new R5CoachService(
    prisma,
    new MockAiProvider({ kind: 'ERROR', code: 'TIMEOUT' }),
  );

  await expect(service.request(localUserId, plan.id)).resolves.toMatchObject({
    status: 'LOCAL_FALLBACK',
    fallbackReason: 'R5_COACH_FAILED',
  });
  await expect(localTaskSnapshot(plan.id)).resolves.toEqual(before);
});

test('没有本地任务时不创建 R5 任务也不伪造建议', async () => {
  const emptyUser = await prisma.user.create({ data: { displayName: 'empty plan user' } });
  const plan = await new LocalDailyPlanService(prisma).getOrCreateTodayPlan({
    userId: emptyUser.id,
    now: new Date('2026-08-05T08:00:00.000Z'),
  });
  const service = new R5CoachService(prisma, new MockAiProvider());

  await expect(service.request(emptyUser.id, plan.id)).resolves.toMatchObject({
    status: 'NO_LOCAL_TASKS',
    advice: null,
  });
  await expect(prisma.aiTask.count({ where: { role: 'R5', entityId: plan.id } })).resolves.toBe(0);
});
