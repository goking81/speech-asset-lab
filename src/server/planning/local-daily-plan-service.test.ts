import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterAll, beforeAll, expect, test } from 'vitest';

import { createDatabaseClient } from '@/server/db/client';

import { LocalDailyPlanService } from './local-daily-plan-service';

const projectRoot = process.cwd();
const testDatabasePath = path.join(projectRoot, 'data', 'f3-local-daily-plan.db');
const testDatabaseUrl = 'file:../data/f3-local-daily-plan.db';
const prisma = createDatabaseClient(testDatabaseUrl);
const localUserId = 'local-user';
const fixedNow = new Date('2026-07-26T08:00:00.000Z');

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

test('无已确认个人资产时生成真实空计划', async () => {
  const plan = await new LocalDailyPlanService(prisma).getOrCreateTodayPlan({
    userId: localUserId,
    now: fixedNow,
  });

  expect(plan).toMatchObject({
    reason: 'NO_CONFIRMED_PERSONAL_ASSETS',
    tasks: [],
  });
});

test('为 S0 个人资产建立一次确定的熟读计划，不会直接拼贴', async () => {
  const sourceAsset = await prisma.sourceAsset.create({ data: { userId: localUserId } });
  const personalAsset = await prisma.personalAsset.create({
    data: { userId: localUserId, sourceAssetId: sourceAsset.id },
  });
  await prisma.personalAssetVersion.create({
    data: {
      personalAssetId: personalAsset.id,
      version: 1,
      triggerName: '一次工作复盘',
      coreIdea: '核心观点',
      coreFlow: 'A connected flow.',
      status: 'CONFIRMED',
      confirmedAt: fixedNow,
    },
  });

  const nextDay = new Date('2026-07-27T08:00:00.000Z');
  const service = new LocalDailyPlanService(prisma);
  const firstPlan = await service.getOrCreateTodayPlan({ userId: localUserId, now: nextDay });
  const repeatedPlan = await service.getOrCreateTodayPlan({ userId: localUserId, now: nextDay });

  expect(firstPlan).toMatchObject({
    reason: 'LOCAL_ELIGIBILITY_RULES_V1',
    tasks: [
      {
        taskType: 'ASSET_READING',
        assetName: '一次工作复盘',
        internalStage: 'S0',
        visibleStage: 'ASSET_ACCUMULATION',
      },
    ],
  });
  expect(repeatedPlan).toEqual(firstPlan);
  await expect(
    prisma.userAssetState.findUniqueOrThrow({ where: { personalAssetId: personalAsset.id } }),
  ).resolves.toMatchObject({ internalStage: 'S0', isActive: true });
});

test('当天空计划在后续导入可训练资产后会重新生成', async () => {
  const importedUserId = 'late-import-user';
  const importedAt = new Date('2026-07-28T08:00:00.000Z');
  await prisma.user.create({ data: { id: importedUserId, displayName: 'Imported User' } });
  const service = new LocalDailyPlanService(prisma);

  await expect(
    service.getOrCreateTodayPlan({ userId: importedUserId, now: importedAt }),
  ).resolves.toMatchObject({
    reason: 'NO_CONFIRMED_PERSONAL_ASSETS',
    tasks: [],
  });

  const sourceAsset = await prisma.sourceAsset.create({ data: { userId: importedUserId } });
  const personalAsset = await prisma.personalAsset.create({
    data: { userId: importedUserId, sourceAssetId: sourceAsset.id },
  });
  await prisma.personalAssetVersion.create({
    data: {
      personalAssetId: personalAsset.id,
      version: 1,
      triggerName: '初始导入语流',
      coreIdea: '初始学习资产',
      coreFlow: 'An imported connected flow.',
      status: 'CONFIRMED',
      confirmedAt: importedAt,
    },
  });

  await expect(
    service.getOrCreateTodayPlan({ userId: importedUserId, now: importedAt }),
  ).resolves.toMatchObject({
    reason: 'LOCAL_ELIGIBILITY_RULES_V1',
    tasks: [
      {
        taskType: 'ASSET_READING',
        assetName: '初始导入语流',
        internalStage: 'S0',
      },
    ],
  });
});
