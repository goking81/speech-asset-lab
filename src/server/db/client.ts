import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import { isCloudTrialRuntime } from '@/lib/runtime-mode';

/** 线上试用版未接入 PostgreSQL 时，向路由返回可处理的配置错误。 */
export class DatabaseConfigurationError extends Error {
  constructor() {
    super('线上内置资产库正在配置，请稍后刷新。');
    this.name = 'DatabaseConfigurationError';
  }
}

export function createDatabaseClient(databaseUrl?: string) {
  const configuredDatabaseUrl = databaseUrl ?? process.env.DATABASE_URL;

  if (!configuredDatabaseUrl && isCloudTrialRuntime()) {
    throw new DatabaseConfigurationError();
  }

  const resolvedDatabaseUrl = configuredDatabaseUrl ?? 'file:../data/speech-asset-lab.db';

  if (
    resolvedDatabaseUrl.startsWith('postgresql://') ||
    resolvedDatabaseUrl.startsWith('postgres://')
  ) {
    /**
     * Cloudflare Workers 运行时经 nodejs_compat 使用 pg 驱动；本机 SQLite 路径仍走原有客户端。
     * 每个请求的路由都会自行断开连接，避免边缘运行时复用陈旧连接。
     */
    return new PrismaClient({
      adapter: new PrismaPg({ connectionString: resolvedDatabaseUrl }),
    });
  }

  return new PrismaClient({ datasources: { db: { url: resolvedDatabaseUrl } } });
}
