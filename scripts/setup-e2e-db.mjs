import { rm } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const projectRoot = process.cwd();
const testDataDirectory = path.resolve(projectRoot, 'data', 'e2e-test');
const expectedRoot = path.resolve(projectRoot, 'data');

if (path.dirname(testDataDirectory) !== expectedRoot) {
  throw new Error('E2E 数据目录不在项目受控 data 目录中。');
}

await rm(testDataDirectory, { recursive: true, force: true });

const environment = {
  ...process.env,
  DATABASE_URL: 'file:../data/e2e-test/speech-asset-lab.db',
  APP_DATA_DIR: './data/e2e-test',
  APP_FILES_DIR: './data/e2e-test/files',
  APP_LOGS_DIR: './data/e2e-test/logs',
  APP_BACKUPS_DIR: './data/e2e-test/backups',
  AI_PROVIDER: '',
  AI_MODEL: '',
  AI_API_KEY: '',
};

await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['scripts/setup-local-db.mjs'], {
    cwd: projectRoot,
    env: environment,
    stdio: 'inherit',
  });
  child.once('error', reject);
  child.once('exit', (code) => {
    if (code === 0) resolve();
    else reject(new Error('E2E SQLite 初始化失败。'));
  });
});

console.log('E2E 使用独立 SQLite、文件、日志和备份目录。');
