import type { PrismaClient } from '@prisma/client';

/** 将本机环境变量投影为不含密钥的本地配置记录。 */
export async function syncEnvironmentProviderConfig(prisma: PrismaClient) {
  const providerKey = process.env.AI_PROVIDER;
  const modelName = process.env.AI_MODEL;
  const apiKey = process.env.AI_API_KEY;
  if (!providerKey || !modelName || !apiKey) return null;

  return prisma.aiProviderConfig.upsert({
    where: { userId_providerKey_modelName: { userId: 'local-user', providerKey, modelName } },
    update: {
      baseUrl: process.env.AI_BASE_URL ?? null,
      secretRef: 'env:AI_API_KEY',
      maskedKeySuffix: apiKey.slice(-4),
      timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 60_000),
      retryCount: Number(process.env.AI_RETRY_COUNT ?? 1),
      isEnabled: true,
    },
    create: {
      userId: 'local-user',
      providerKey,
      modelName,
      baseUrl: process.env.AI_BASE_URL ?? null,
      secretRef: 'env:AI_API_KEY',
      maskedKeySuffix: apiKey.slice(-4),
      timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 60_000),
      retryCount: Number(process.env.AI_RETRY_COUNT ?? 1),
      isEnabled: true,
    },
  });
}
