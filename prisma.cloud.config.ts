import { defineConfig } from 'prisma/config';

// 只供云端 schema 的生成、校验与迁移命令使用，绝不读取或覆盖本地 SQLite 配置。
const validationUrl =
  'postgresql://prisma:prisma@localhost:5432/speech_asset_lab_cloud_schema_validation?schema=public';
const cloudDatabaseUrl = process.env.CLOUD_DATABASE_URL ?? validationUrl;

process.env.DATABASE_URL ??= cloudDatabaseUrl;

export default defineConfig({
  schema: 'tmp/cloud-prisma/schema.prisma',
  migrations: {
    path: 'prisma/cloud-migrations',
  },
  engine: 'classic',
  datasource: {
    url: cloudDatabaseUrl,
  },
});
