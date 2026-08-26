import type { PrismaClient } from '@prisma/client';

import { CLOUD_ADMIN_USER_ID, isCloudImportRuntime } from '@/lib/runtime-mode';

/**
 * 仅供 Cloudflare Access 保护的 `/admin` 路由调用。
 * 公开试用资产仍属于 `local-user`，管理员导入资料统一归入此独立用户。
 */
export async function ensureCloudAdminUser(prisma: PrismaClient) {
  return prisma.user.upsert({
    where: { id: CLOUD_ADMIN_USER_ID },
    update: {},
    create: { id: CLOUD_ADMIN_USER_ID, displayName: 'Cloud Admin' },
    select: { id: true, displayName: true },
  });
}

/** 不启用私有导入时，管理 API 不暴露任何数据。 */
export function isCloudAdminFeatureEnabled() {
  return isCloudImportRuntime();
}
