import { NextResponse } from 'next/server';

import { DeepSeekAiProvider } from '@/ai/provider';
import { syncEnvironmentProviderConfig } from '@/server/ai/provider-config-service';
import { createDatabaseClient } from '@/server/db/client';
import { ReleaseGateService } from '@/server/releases/release-gate-service';

export const dynamic = 'force-dynamic';

/** 用户主动检查 Provider 兼容性；只发送固定合成文本，结果只保存状态和摘要。 */
export async function POST() {
  const prisma = createDatabaseClient();
  try {
    // 环境变量是当前部署的配置事实来源，不能让历史记录抢先覆盖本次检查。
    const environmentConfig = await syncEnvironmentProviderConfig(prisma);
    const config =
      environmentConfig ??
      (await prisma.aiProviderConfig.findFirst({
        where: { userId: 'local-user', isEnabled: true },
        select: { providerKey: true, modelName: true },
        orderBy: { updatedAt: 'desc' },
      }));
    if (!config) {
      return NextResponse.json({ status: 'NOT_CONFIGURED', reason: 'AI_PROVIDER_NOT_CONFIGURED' });
    }
    const compatibility = await new ReleaseGateService(prisma).testProviderCompatibility({
      providerKey: config.providerKey,
      modelName: config.modelName,
      provider: config.providerKey === 'deepseek' ? new DeepSeekAiProvider() : null,
    });
    return NextResponse.json({ compatibility });
  } catch {
    return NextResponse.json({ error: 'Provider 兼容性检查失败。' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
