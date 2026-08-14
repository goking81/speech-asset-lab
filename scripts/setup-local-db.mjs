import { mkdir, open } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const databaseUrl = process.env.DATABASE_URL ?? 'file:../data/speech-asset-lab.db';

function getSqlitePath(url) {
  if (!url.startsWith('file:')) {
    throw new Error('DATABASE_URL 必须指向本地 SQLite 文件');
  }

  return path.resolve(process.cwd(), 'prisma', url.slice('file:'.length));
}

function getConfiguredDirectory(value, fallback) {
  return path.resolve(process.cwd(), value ?? fallback);
}

function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`命令失败：node ${args.join(' ')}`));
    });
  });
}

const sqlitePath = getSqlitePath(databaseUrl);
const dataDirectory = getConfiguredDirectory(process.env.APP_DATA_DIR, 'data');
const filesDirectory = getConfiguredDirectory(
  process.env.APP_FILES_DIR,
  path.join(dataDirectory, 'files'),
);
const logsDirectory = getConfiguredDirectory(
  process.env.APP_LOGS_DIR,
  path.join(dataDirectory, 'logs'),
);
const backupsDirectory = getConfiguredDirectory(
  process.env.APP_BACKUPS_DIR,
  path.join(dataDirectory, 'backups'),
);

await Promise.all([
  mkdir(path.dirname(sqlitePath), { recursive: true }),
  mkdir(dataDirectory, { recursive: true }),
  mkdir(filesDirectory, { recursive: true }),
  mkdir(logsDirectory, { recursive: true }),
  mkdir(backupsDirectory, { recursive: true }),
]);
const sqliteFile = await open(sqlitePath, 'a');
await sqliteFile.close();
await runNode(['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
await runNode(['prisma/seed.mjs']);
