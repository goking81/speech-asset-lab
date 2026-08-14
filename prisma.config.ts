import { defineConfig } from 'prisma/config';

const databaseUrl = process.env.DATABASE_URL ?? 'file:../data/speech-asset-lab.db';

process.env.DATABASE_URL ??= databaseUrl;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node prisma/seed.mjs',
  },
  engine: 'classic',
  datasource: {
    url: databaseUrl,
  },
});
