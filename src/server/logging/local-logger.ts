import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export type LocalLogEntry = {
  event: string;
  level?: 'INFO' | 'WARN' | 'ERROR';
  context?: Record<string, boolean | number | string | null>;
};

const sensitiveKeyPattern = /api.?key|authorization|password|secret|token/i;
const sensitiveValuePattern = /\b(?:sk-[a-z0-9_-]{8,}|bearer\s+\S+)\b/gi;

function sanitizeContext(context: LocalLogEntry['context']) {
  if (!context) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      sensitiveKeyPattern.test(key) ? '[REDACTED]' : sanitizeValue(value),
    ]),
  );
}

function sanitizeValue(value: boolean | number | string | null) {
  return typeof value === 'string' ? value.replace(sensitiveValuePattern, '[REDACTED]') : value;
}

export async function appendLocalLog(logsDirectory: string, entry: LocalLogEntry) {
  if (!entry.event.trim()) {
    throw new Error('日志事件不能为空。');
  }

  await mkdir(logsDirectory, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const filePath = path.join(logsDirectory, `${date}.jsonl`);
  const record = {
    timestamp: new Date().toISOString(),
    level: entry.level ?? 'INFO',
    event: entry.event.trim(),
    context: sanitizeContext(entry.context),
  };

  await appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf8');

  return filePath;
}
