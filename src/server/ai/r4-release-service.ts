import { createHash } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';

import { findActiveReleaseForRoles } from './active-release-service';

const r4Prompt =
  '只能依据已确认、可调用的个人资产节点与已确认个人事实提出一个问题草稿；不得发布问题计划，不得编造经历或陌生主题。';

/** R4 使用独立、可冻结的发布包，不会使既有角色的发布包失效。 */
export async function ensureLocalR4Release(prisma: PrismaClient) {
  const active = await findActiveReleaseForRoles(prisma, ['R4']);
  if (active) return active;
  const bundleHash = createHash('sha256').update(`r4-local-v1:${r4Prompt}`).digest('hex');
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
    where: { key_version: { key: 'r4-supported-question-draft', version: '1' } },
    update: {},
    create: { key: 'r4-supported-question-draft', version: '1', content: r4Prompt },
  });
  return prisma.aiReleaseBundle.create({
    data: {
      version: 'r4-local-v1',
      bundleHash,
      status: 'ACTIVE',
      activatedAt: new Date(),
      prompts: { create: { promptDefinitionId: prompt.id, role: 'R4' } },
    },
  });
}
