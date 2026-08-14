import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

import { findActiveReleaseForRoles } from './active-release-service';

const r1Prompt = '只能依据来源文本生成候选草稿；必须保留来源证据；不得发布资产或编造经历。';

export async function ensureLocalR1Release(prisma: PrismaClient) {
  const active = await findActiveReleaseForRoles(prisma, ['R1']);
  if (active) return active;
  const bundleHash = createHash('sha256').update(`r1-local-v1:${r1Prompt}`).digest('hex');
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
    where: { key_version: { key: 'r1-source-draft', version: '1' } },
    update: {},
    create: { key: 'r1-source-draft', version: '1', content: r1Prompt },
  });
  return prisma.aiReleaseBundle.create({
    data: {
      version: 'r1-local-v1',
      bundleHash,
      status: 'ACTIVE',
      activatedAt: new Date(),
      prompts: { create: { promptDefinitionId: prompt.id, role: 'R1' } },
    },
  });
}
