import { createHash } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';

import { findActiveReleaseForRoles } from './active-release-service';

const r5Prompt =
  '只能解释已有本地日计划中的任务及其理由；不得改变阶段、资格、任务顺序、任务类型或状态，不得增加资产、问题或训练任务。';

/** R5 使用独立、可冻结的发布包；不会影响其他 AI 角色的发布状态。 */
export async function ensureLocalR5Release(prisma: PrismaClient) {
  const active = await findActiveReleaseForRoles(prisma, ['R5']);
  if (active) return active;
  const bundleHash = createHash('sha256').update(`r5-local-v1:${r5Prompt}`).digest('hex');
  const existing = await prisma.aiReleaseBundle.findUnique({ where: { bundleHash } });
  if (existing) {
    return existing.status === 'ACTIVE'
      ? existing
      : prisma.aiReleaseBundle.update({
          where: { id: existing.id },
          data: { status: 'ACTIVE', activatedAt: new Date() },
        });
  }

  const prompt = await prisma.promptDefinition.upsert({
    where: { key_version: { key: 'r5-local-coach-draft', version: '1' } },
    update: {},
    create: { key: 'r5-local-coach-draft', version: '1', content: r5Prompt },
  });
  return prisma.aiReleaseBundle.create({
    data: {
      version: 'r5-local-v1',
      bundleHash,
      status: 'ACTIVE',
      activatedAt: new Date(),
      prompts: { create: { promptDefinitionId: prompt.id, role: 'R5' } },
    },
  });
}
