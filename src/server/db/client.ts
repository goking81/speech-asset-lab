import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

export function createDatabaseClient(databaseUrl?: string) {
  const resolvedDatabaseUrl =
    databaseUrl ?? process.env.DATABASE_URL ?? 'file:../data/speech-asset-lab.db';

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
