import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, test } from 'vitest';

import { appendLocalLog } from './local-logger';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

test('writes local JSONL logs and redacts credential-like context fields', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'speech-asset-lab-log-'));
  temporaryDirectories.push(directory);

  const filePath = await appendLocalLog(directory, {
    event: 'ai.task.failed',
    level: 'WARN',
    context: { apiKey: 'never-write-this', provider: 'mock', retry: 1 },
  });

  await expect(readFile(filePath, 'utf8')).resolves.toContain('"apiKey":"[REDACTED]"');
  await expect(readFile(filePath, 'utf8')).resolves.not.toContain('never-write-this');
});

test('rejects an empty log event', async () => {
  await expect(
    appendLocalLog(path.join(os.tmpdir(), 'unused-log-dir'), { event: '  ' }),
  ).rejects.toThrow('日志事件不能为空。');
});
