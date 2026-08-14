import { NextResponse } from 'next/server';

import { DeepSeekAiProvider } from '@/ai/provider';
import { syncEnvironmentProviderConfig } from '@/server/ai/provider-config-service';
import { createDatabaseClient } from '@/server/db/client';

type PersonalDraft = {
  triggerName: string;
  coreIdea: string;
  coreFlow: string;
  scenario: string;
};

/** 用户确认本次中文经历后，才将其作为个人化草稿的本地事实输入；草稿绝不自动发布。 */
export async function POST(request: Request, context: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await context.params;
  const prisma = createDatabaseClient();
  try {
    const body = (await request.json()) as { personalExperience?: unknown };
    const personalExperience =
      typeof body.personalExperience === 'string' ? body.personalExperience.trim() : '';
    if (!personalExperience) {
      return NextResponse.json({ error: '请先用中文写下本次要使用的个人经历。' }, { status: 400 });
    }
    if (personalExperience.length > 3_000) {
      return NextResponse.json({ error: '个人经历请控制在 3000 个字符以内。' }, { status: 400 });
    }
    await syncEnvironmentProviderConfig(prisma);
    const configured = await prisma.aiProviderConfig.findFirst({
      where: { userId: 'local-user', providerKey: 'deepseek', isEnabled: true },
      select: { id: true },
    });
    if (!configured)
      return NextResponse.json({ error: '本机 DeepSeek 服务尚未配置。' }, { status: 400 });

    const asset = await prisma.sourceAsset.findUnique({
      where: { id: assetId },
      include: {
        versions: {
          where: { status: 'CONFIRMED' },
          orderBy: { version: 'desc' },
          take: 1,
          include: { nodes: { orderBy: { sequence: 'asc' } } },
        },
        personalAssets: {
          where: { userId: 'local-user' },
          include: {
            versions: { where: { status: 'CONFIRMED' }, orderBy: { version: 'desc' }, take: 1 },
          },
        },
      },
    });
    const source = asset?.versions[0];
    const current = asset?.personalAssets[0]?.versions[0];
    if (!source || !current) {
      return NextResponse.json({ error: '当前资产缺少可改写的已确认版本。' }, { status: 400 });
    }

    // 此按钮是用户对本次经历的明确确认；其后仍须审核草稿并手动保存个人版本。
    const fact = await prisma.userFact.create({
      data: { userId: 'local-user', text: personalExperience, status: 'CONFIRMED' },
    });
    const result = await new DeepSeekAiProvider().execute({
      taskId: `personalization-${assetId}-${fact.id}`,
      role: 'R3',
      releaseBundleVersion: 'local-personalization-v1',
      text: [
        'Return JSON only with keys: triggerName, coreIdea, coreFlow, scenario.',
        'Create a draft only. Do not claim publication or confirmation. Use only the supplied Chinese experience; do not invent facts.',
        'Keep the source logic (claim, reason, explanation/example/result) and reuse suitable English chunks where natural.',
        `Chinese personal experience:\n${personalExperience}`,
        `Current personal flow:\n${current.coreFlow}`,
        `Source logic nodes:\n${source.nodes.map((node) => `${node.nodeType}: ${node.text}`).join('\n')}`,
      ].join('\n\n'),
    });
    if (result.kind !== 'DRAFT')
      return NextResponse.json({ error: 'AI 未返回可用的个人化草稿。' }, { status: 400 });
    return NextResponse.json({ draft: parseDraft(result.draft) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI 个人化草稿生成失败。';
    return NextResponse.json({ error: message }, { status: 400 });
  } finally {
    await prisma.$disconnect();
  }
}

function parseDraft(value: string): PersonalDraft {
  const json = value.match(/\{[\s\S]*\}/)?.[0];
  const parsed = JSON.parse(json ?? '') as Partial<PersonalDraft>;
  if (
    typeof parsed.triggerName !== 'string' ||
    typeof parsed.coreIdea !== 'string' ||
    typeof parsed.coreFlow !== 'string' ||
    !parsed.triggerName.trim() ||
    !parsed.coreIdea.trim() ||
    !parsed.coreFlow.trim()
  ) {
    throw new Error('AI 草稿结构不完整，请补充或重试。');
  }
  return {
    triggerName: parsed.triggerName.trim(),
    coreIdea: parsed.coreIdea.trim(),
    coreFlow: parsed.coreFlow.trim(),
    scenario: typeof parsed.scenario === 'string' ? parsed.scenario.trim() : '',
  };
}
