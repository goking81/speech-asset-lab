import { createHash } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';

import { findActiveReleaseForRoles } from './active-release-service';

const r6Prompt =
  '每次只针对一个由冻结问题义务支撑的最高价值缺口提出一题追问；输出必须引用给定义务 ID。没有安全、非重复的追问时结束，不得引入陌生主题、事实或资产。';
const r7aPrompt =
  '只能识别冻结个人资产及其节点在已保存文字回答中的调用证据；每条证据必须引用回答单元和节点 ID。单个词伙或单个节点不是完整资产调用；不得评分、计算总分或更新掌握状态。';
const r7bPrompt =
  '只为问题相关性、逻辑连贯性、文字表达清晰度和支撑细节充分度生成带证据的 0—100 分草稿；不得重判资产调用或问题义务覆盖，不得计算总分、更新掌握状态或评价未提交的口头表现。';
const r7cPrompt =
  '只能解释提供的两次回答本地比较事实。每条观察必须引用给定 factId 和完全相同的变化类型，明确局限；不得编造进步、退步、资产调用、分数、建议或未提交的口头表现。';

/** R6 独立发布包会在 P08 会话建立时冻结，避免与其他角色的 Prompt 混用。 */
export async function ensureLocalR6Release(prisma: PrismaClient) {
  const bundleHash = createHash('sha256').update(`r6-local-v1:${r6Prompt}`).digest('hex');
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
    where: { key_version: { key: 'r6-supported-follow-up', version: '1' } },
    update: {},
    create: { key: 'r6-supported-follow-up', version: '1', content: r6Prompt },
  });
  return prisma.aiReleaseBundle.create({
    data: {
      version: 'r6-local-v1',
      bundleHash,
      status: 'ACTIVE',
      activatedAt: new Date(),
      prompts: { create: { promptDefinitionId: prompt.id, role: 'R6' } },
    },
  });
}

/**
 * 新建 P08 会话冻结的训练发布包。R6、R7A、R7B 与 R7C 共享同一 Bundle，后续角色不能修改已冻结会话。
 * 旧 Bundle 保留给历史会话读取，绝不就地补写新 Prompt。
 */
export async function ensureLocalTrainingRelease(prisma: PrismaClient) {
  const active = await findActiveReleaseForRoles(prisma, ['R6', 'R7A', 'R7B', 'R7C']);
  if (active) return active;
  const bundleHash = createHash('sha256')
    .update(`training-r6-r7a-r7b-r7c-local-v1:${r6Prompt}:${r7aPrompt}:${r7bPrompt}:${r7cPrompt}`)
    .digest('hex');
  const existing = await prisma.aiReleaseBundle.findUnique({ where: { bundleHash } });
  if (existing) {
    return existing.status === 'ACTIVE'
      ? existing
      : prisma.aiReleaseBundle.update({
          where: { id: existing.id },
          data: { status: 'ACTIVE', activatedAt: new Date() },
        });
  }

  const [r6Definition, r7aDefinition, r7bDefinition, r7cDefinition] = await Promise.all([
    prisma.promptDefinition.upsert({
      where: { key_version: { key: 'r6-supported-follow-up', version: '1' } },
      update: {},
      create: { key: 'r6-supported-follow-up', version: '1', content: r6Prompt },
    }),
    prisma.promptDefinition.upsert({
      where: { key_version: { key: 'r7a-asset-usage-evidence', version: '1' } },
      update: {},
      create: { key: 'r7a-asset-usage-evidence', version: '1', content: r7aPrompt },
    }),
    prisma.promptDefinition.upsert({
      where: { key_version: { key: 'r7b-six-dimension-evaluation', version: '1' } },
      update: {},
      create: { key: 'r7b-six-dimension-evaluation', version: '1', content: r7bPrompt },
    }),
    prisma.promptDefinition.upsert({
      where: { key_version: { key: 'r7c-comparison-explanation', version: '1' } },
      update: {},
      create: { key: 'r7c-comparison-explanation', version: '1', content: r7cPrompt },
    }),
  ]);
  return prisma.aiReleaseBundle.create({
    data: {
      version: 'training-r6-r7a-r7b-r7c-local-v1',
      bundleHash,
      status: 'ACTIVE',
      activatedAt: new Date(),
      prompts: {
        create: [
          { promptDefinitionId: r6Definition.id, role: 'R6' },
          { promptDefinitionId: r7aDefinition.id, role: 'R7A' },
          { promptDefinitionId: r7bDefinition.id, role: 'R7B' },
          { promptDefinitionId: r7cDefinition.id, role: 'R7C' },
        ],
      },
    },
  });
}
