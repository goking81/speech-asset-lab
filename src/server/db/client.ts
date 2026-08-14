import { PrismaClient } from '@prisma/client';

export function createDatabaseClient(databaseUrl?: string) {
  const resolvedDatabaseUrl =
    databaseUrl ?? process.env.DATABASE_URL ?? 'file:../data/speech-asset-lab.db';

  return new PrismaClient({ datasources: { db: { url: resolvedDatabaseUrl } } });
}
