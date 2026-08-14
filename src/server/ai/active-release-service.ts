import type { AiRole, PrismaClient } from '@prisma/client';

/**
 * 只为新任务解析当前激活的 Bundle。历史会话永远读取自身已冻结的 releaseBundleId，
 * 因而发布、撤回或回滚都不能改写历史会话。
 */
export async function findActiveReleaseForRoles(prisma: PrismaClient, roles: AiRole[]) {
  const requiredRoles = new Set(roles);
  const bundles = await prisma.aiReleaseBundle.findMany({
    where: { status: 'ACTIVE' },
    orderBy: [{ activatedAt: 'desc' }, { createdAt: 'desc' }],
    include: { prompts: { select: { role: true } } },
  });
  return (
    bundles.find((bundle) => {
      const bundledRoles = new Set(bundle.prompts.map((prompt) => prompt.role));
      return [...requiredRoles].every((role) => bundledRoles.has(role));
    }) ?? null
  );
}
