import { NextResponse } from 'next/server';

import { DeepSeekAiProvider } from '@/ai/provider';
import { syncEnvironmentProviderConfig } from '@/server/ai/provider-config-service';
import { createDatabaseClient } from '@/server/db/client';
import {
  ReleaseGateService,
  ReleaseGateValidationError,
} from '@/server/releases/release-gate-service';

export const dynamic = 'force-dynamic';

/** 用户主动触发时才会向已配置 Provider 发送合成固定 Golden Set；不会发送真实训练数据。 */
export async function POST(_request: Request, context: { params: Promise<{ bundleId: string }> }) {
  const { bundleId } = await context.params;
  const prisma = createDatabaseClient();
  try {
    await syncEnvironmentProviderConfig(prisma);
    const config = await prisma.aiProviderConfig.findFirst({
      where: { userId: 'local-user', isEnabled: true },
      select: { providerKey: true, modelName: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!config || config.providerKey !== 'deepseek') {
      return NextResponse.json({ status: 'NOT_CONFIGURED', reason: 'AI_PROVIDER_NOT_CONFIGURED' });
    }
    const run = await new ReleaseGateService(prisma).runGoldenSet({
      bundleId,
      provider: new DeepSeekAiProvider(),
      providerKey: config.providerKey,
      modelName: config.modelName,
    });
    return NextResponse.json({ run });
  } catch (error) {
    const status = error instanceof ReleaseGateValidationError ? 409 : 500;
    const message =
      error instanceof ReleaseGateValidationError ? error.message : 'Golden Set 运行失败。';
    return NextResponse.json({ error: message }, { status });
  } finally {
    await prisma.$disconnect();
  }
}
