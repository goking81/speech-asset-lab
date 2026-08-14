import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';

import { createDatabaseClient } from '@/server/db/client';

import { appendLocalLog } from './local-logger';
import { LocalLogPrivacyService } from './privacy-service';

const projectRoot = process.cwd();
const testDatabasePath = path.join(projectRoot, 'data', 'f7-log-privacy.db');
const testDatabaseUrl = 'file:../data/f7-log-privacy.db';
const prisma = createDatabaseClient(testDatabaseUrl);
let temporaryDirectory = '';

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

afterEach(async () => {
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = '';
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

test('日志会脱敏敏感字段和值，且日志保留策略仅清理过期 JSONL', async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'speech-asset-lab-privacy-'));
  const now = new Date('2026-07-27T12:00:00.000Z');
  const service = new LocalLogPrivacyService(prisma, temporaryDirectory, () => now);
  const logged = await appendLocalLog(temporaryDirectory, {
    event: 'ai.task.failed',
    context: {
      provider: 'deepseek',
      message: 'Bearer sk-should-not-appear-12345678',
      apiKey: 'sk-should-not-appear-87654321',
    },
  });
  const oldLog = path.join(temporaryDirectory, 'old.jsonl');
  const freshLog = path.join(temporaryDirectory, 'fresh.jsonl');
  await writeFile(oldLog, '{"event":"old"}\n', 'utf8');
  await writeFile(freshLog, '{"event":"fresh"}\n', 'utf8');
  await utimes(oldLog, new Date('2026-07-01T00:00:00.000Z'), new Date('2026-07-01T00:00:00.000Z'));
  await service.savePolicy({ storeRawAiResponses: false, retentionDays: 7 });

  const cleanup = await service.clearExpiredLogs();

  const logText = await readFile(logged, 'utf8');
  expect(logText).toContain('[REDACTED]');
  expect(logText).not.toContain('should-not-appear');
  expect(cleanup).toMatchObject({ deletedFileCount: 1, retentionDays: 7 });
  await expect(readFile(oldLog, 'utf8')).rejects.toThrow();
  await expect(readFile(freshLog, 'utf8')).resolves.toContain('fresh');
  await expect(service.getPolicy()).resolves.toEqual({
    storeRawAiResponses: false,
    retentionDays: 7,
  });
});

test('日志隐私设置拒绝无效保留天数', async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'speech-asset-lab-privacy-'));
  const service = new LocalLogPrivacyService(prisma, temporaryDirectory);

  await expect(
    service.savePolicy({ storeRawAiResponses: false, retentionDays: 0 }),
  ).rejects.toThrow('日志保留天数必须为 1 至 3650 的整数。');
});
