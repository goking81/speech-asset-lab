import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterAll, beforeAll, expect, test } from 'vitest';

import { createDatabaseClient } from '@/server/db/client';

import { TrainingSettingsService } from './training-settings-service';

const projectRoot = process.cwd();
const testDatabasePath = path.join(projectRoot, 'data', 'rc1-training-settings.db');
const testDatabaseUrl = 'file:../data/rc1-training-settings.db';
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

test('训练目标可保存到本地，且不会改变阶段裁决字段', async () => {
  const service = new TrainingSettingsService(prisma);

  await expect(
    service.save({
      dailyTargetMinutes: 45,
      dailyNewAssetTarget: 2,
      dailyNewAssetMax: 4,
      activeAssetLimit: 6,
    }),
  ).resolves.toEqual({
    dailyTargetMinutes: 45,
    dailyNewAssetTarget: 2,
    dailyNewAssetMax: 4,
    activeAssetLimit: 6,
  });
  await expect(service.get()).resolves.toMatchObject({
    dailyTargetMinutes: 45,
    dailyNewAssetTarget: 2,
    dailyNewAssetMax: 4,
    activeAssetLimit: 6,
  });
});

test('训练目标拒绝负数和超过上限的每日新增目标', async () => {
  const service = new TrainingSettingsService(prisma);

  await expect(
    service.save({
      dailyTargetMinutes: -1,
      dailyNewAssetTarget: 2,
      dailyNewAssetMax: 4,
      activeAssetLimit: 6,
    }),
  ).rejects.toThrow('每日目标时长必须是非负整数。');
  await expect(
    service.save({
      dailyTargetMinutes: 30,
      dailyNewAssetTarget: 5,
      dailyNewAssetMax: 4,
      activeAssetLimit: 6,
    }),
  ).rejects.toThrow('每日新增目标不能大于每日新增上限。');
});
