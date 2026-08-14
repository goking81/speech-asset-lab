import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';

import { createDatabaseClient } from '@/server/db/client';
import type { LocalPaths } from '@/server/storage/local-paths';

import { LocalBackupService } from './local-backup-service';

const projectRoot = process.cwd();
const testDatabasePath = path.join(projectRoot, 'data', 'f7-backup-service.db');
const testDatabaseUrl = 'file:../data/f7-backup-service.db';
const prisma = createDatabaseClient(testDatabaseUrl);
let temporaryRoot = '';

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
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
  temporaryRoot = '';
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

test('本地备份包含 SQLite、来源文件和脱敏元数据，并可通过 manifest 校验', async () => {
  const { paths, service } = await createService();
  await mkdir(path.join(paths.filesDir, 'course'), { recursive: true });
  await writeFile(path.join(paths.filesDir, 'course', 'lesson.txt'), 'saved source text', 'utf8');
  await writeFile(path.join(paths.logsDir, '2026-07-27.jsonl'), '{"event":"local"}\n', 'utf8');

  const backup = await service.create();
  const validation = await service.validate(backup.id);
  const record = await prisma.backupRecord.findUniqueOrThrow({ where: { id: backup.id } });
  const packagePath = path.join(paths.backupsDir, ...record.filePath.split('/'));
  const settings = await readFile(path.join(packagePath, 'metadata', 'settings.json'), 'utf8');

  expect(backup).toMatchObject({ status: 'COMPLETED', kind: 'MANUAL', formatVersion: 1 });
  expect(validation.sizeBytes).toBeGreaterThan(0);
  await expect(
    readFile(path.join(packagePath, 'database', 'speech-asset-lab.db')),
  ).resolves.toBeDefined();
  await expect(
    readFile(path.join(packagePath, 'files', 'course', 'lesson.txt'), 'utf8'),
  ).resolves.toBe('saved source text');
  expect(settings).not.toContain('AI_API_KEY');
});

test('篡改备份包或跨目录路径时，校验失败且当前来源文件保持不变', async () => {
  const { paths, service } = await createService();
  await mkdir(path.join(paths.filesDir, 'course'), { recursive: true });
  const liveSource = path.join(paths.filesDir, 'course', 'lesson.txt');
  await writeFile(liveSource, 'current text', 'utf8');
  const backup = await service.create();
  const record = await prisma.backupRecord.findUniqueOrThrow({ where: { id: backup.id } });
  const packagePath = path.join(paths.backupsDir, ...record.filePath.split('/'));
  await writeFile(path.join(packagePath, 'files', 'course', 'lesson.txt'), 'tampered', 'utf8');

  await expect(service.validate(backup.id)).rejects.toMatchObject({
    code: 'BACKUP_INVALID',
  });
  await expect(readFile(liveSource, 'utf8')).resolves.toBe('current text');

  await prisma.backupRecord.update({ where: { id: backup.id }, data: { filePath: '../outside' } });
  await expect(service.validate(backup.id)).rejects.toMatchObject({
    code: 'BACKUP_INVALID',
  });
});

test('恢复先创建自动安全备份，再写入隔离副本，不覆盖当前来源文件或 SQLite', async () => {
  const { paths, service } = await createService();
  await mkdir(path.join(paths.filesDir, 'course'), { recursive: true });
  const liveSource = path.join(paths.filesDir, 'course', 'lesson.txt');
  await writeFile(liveSource, 'backup version', 'utf8');
  const backup = await service.create();
  await writeFile(liveSource, 'current version', 'utf8');

  const restore = await service.restoreToIsolation(backup.id);
  const stagedSource = path.join(
    paths.dataDir,
    ...restore.stagingPath.split('/'),
    'files',
    'course',
    'lesson.txt',
  );

  expect(restore.backup).toMatchObject({ status: 'RESTORED' });
  expect(restore.safetyBackup).toMatchObject({ status: 'COMPLETED', kind: 'PRE_RESTORE_SAFETY' });
  await expect(readFile(stagedSource, 'utf8')).resolves.toBe('backup version');
  await expect(readFile(liveSource, 'utf8')).resolves.toBe('current version');
  await expect(prisma.user.findUnique({ where: { id: 'local-user' } })).resolves.toMatchObject({
    displayName: 'Local User',
  });
});

async function createService() {
  temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'speech-asset-lab-backup-'));
  const paths: LocalPaths = {
    dataDir: temporaryRoot,
    filesDir: path.join(temporaryRoot, 'files'),
    logsDir: path.join(temporaryRoot, 'logs'),
    backupsDir: path.join(temporaryRoot, 'backups'),
  };
  await Promise.all(Object.values(paths).map((directory) => mkdir(directory, { recursive: true })));
  return {
    paths,
    service: new LocalBackupService(
      prisma,
      paths,
      testDatabasePath,
      () => new Date('2026-07-27T00:00:00.000Z'),
    ),
  };
}
