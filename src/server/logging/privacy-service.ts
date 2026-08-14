import { lstat, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import type { PrismaClient } from '@prisma/client';

import { getLocalPaths } from '@/server/storage/local-paths';

const LOCAL_USER_ID = 'local-user';
const PRIVACY_SETTING_KEY = 'privacy.aiLogPolicy';
const DEFAULT_POLICY = { storeRawAiResponses: false, retentionDays: 30 };

export type AiLogPrivacyPolicy = {
  storeRawAiResponses: boolean;
  retentionDays: number;
};

export type LogCleanupResult = {
  deletedFileCount: number;
  deletedBytes: number;
  retentionDays: number;
};

export class LogPrivacyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LogPrivacyValidationError';
  }
}

/** 本地日志隐私配置；不会保存或返回任何 Provider 密钥。 */
export class LocalLogPrivacyService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logsDirectory = getLocalPaths().logsDir,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getPolicy(userId = LOCAL_USER_ID): Promise<AiLogPrivacyPolicy> {
    const setting = await this.prisma.userSetting.findUnique({
      where: { userId_key: { userId, key: PRIVACY_SETTING_KEY } },
      select: { valueJson: true },
    });
    return parsePolicy(setting?.valueJson);
  }

  async savePolicy(input: {
    userId?: string;
    storeRawAiResponses: boolean;
    retentionDays: number;
  }): Promise<AiLogPrivacyPolicy> {
    const userId = input.userId ?? LOCAL_USER_ID;
    if (typeof input.storeRawAiResponses !== 'boolean') {
      throw new LogPrivacyValidationError('原始响应开关无效。');
    }
    if (
      !Number.isInteger(input.retentionDays) ||
      input.retentionDays < 1 ||
      input.retentionDays > 3650
    ) {
      throw new LogPrivacyValidationError('日志保留天数必须为 1 至 3650 的整数。');
    }
    const policy = {
      storeRawAiResponses: input.storeRawAiResponses,
      retentionDays: input.retentionDays,
    };
    await this.prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, displayName: 'Local User' },
    });
    await this.prisma.userSetting.upsert({
      where: { userId_key: { userId, key: PRIVACY_SETTING_KEY } },
      update: { valueJson: JSON.stringify(policy) },
      create: { userId, key: PRIVACY_SETTING_KEY, valueJson: JSON.stringify(policy) },
    });
    return policy;
  }

  async clearExpiredLogs(userId = LOCAL_USER_ID): Promise<LogCleanupResult> {
    const policy = await this.getPolicy(userId);
    await mkdir(this.logsDirectory, { recursive: true });
    const cutoff = new Date(this.now().getTime() - policy.retentionDays * 24 * 60 * 60 * 1000);
    const candidates = await findLogFiles(this.logsDirectory);
    let deletedFileCount = 0;
    let deletedBytes = 0;
    for (const candidate of candidates) {
      if (candidate.modifiedAt >= cutoff) continue;
      await rm(candidate.filePath, { force: true });
      deletedFileCount += 1;
      deletedBytes += candidate.sizeBytes;
    }
    return { deletedFileCount, deletedBytes, retentionDays: policy.retentionDays };
  }
}

function parsePolicy(value: string | undefined): AiLogPrivacyPolicy {
  if (!value) return DEFAULT_POLICY;
  try {
    const parsed = JSON.parse(value) as Partial<AiLogPrivacyPolicy>;
    if (
      typeof parsed.storeRawAiResponses === 'boolean' &&
      Number.isInteger(parsed.retentionDays) &&
      parsed.retentionDays! >= 1 &&
      parsed.retentionDays! <= 3650
    ) {
      return {
        storeRawAiResponses: parsed.storeRawAiResponses,
        retentionDays: parsed.retentionDays!,
      };
    }
  } catch {
    // 历史设置不符合当前格式时，使用安全默认值。
  }
  return DEFAULT_POLICY;
}

async function findLogFiles(
  directory: string,
): Promise<Array<{ filePath: string; modifiedAt: Date; sizeBytes: number }>> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: Array<{ filePath: string; modifiedAt: Date; sizeBytes: number }> = [];
  for (const entry of entries) {
    const candidatePath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      files.push(...(await findLogFiles(candidatePath)));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
    const info = await lstat(candidatePath);
    files.push({ filePath: candidatePath, modifiedAt: info.mtime, sizeBytes: info.size });
  }
  return files;
}
