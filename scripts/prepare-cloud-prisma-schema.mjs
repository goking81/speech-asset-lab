import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const localSchemaPath = path.join(projectRoot, 'prisma', 'schema.prisma');
const outputPath = path.join(projectRoot, 'tmp', 'cloud-prisma', 'schema.prisma');

const localGenerator = `generator client {
  provider = "prisma-client-js"
}`;

const cloudGenerator = `generator client {
  provider = "prisma-client-js"
  runtime  = "workerd"
}`;

const localDatasource = `datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}`;

const cloudDatasource = `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}`;

async function main() {
  const localSchema = await readFile(localSchemaPath, 'utf8');

  if (!localSchema.includes(localGenerator) || !localSchema.includes(localDatasource)) {
    throw new Error('本地 Prisma schema 的生成器或数据源定义已变化，无法安全生成云端 schema。');
  }

  const cloudSchema = localSchema
    .replace(localGenerator, cloudGenerator)
    .replace(localDatasource, cloudDatasource);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, cloudSchema, 'utf8');

  process.stdout.write(`${path.relative(projectRoot, outputPath)}\n`);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : '无法生成云端 Prisma schema。'}\n`,
  );
  process.exitCode = 1;
});
