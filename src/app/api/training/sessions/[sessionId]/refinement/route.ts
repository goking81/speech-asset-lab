import { NextResponse } from 'next/server';

import { DeepSeekAiProvider, UnconfiguredAiProvider } from '@/ai/provider';
import { syncEnvironmentProviderConfig } from '@/server/ai/provider-config-service';
import { createDatabaseClient } from '@/server/db/client';
import { R6FollowUpService } from '@/server/training/r6-follow-up-service';
import {
  P08SessionService,
  P08SessionValidationError,
} from '@/server/training/p08-session-service';

export const dynamic = 'force-dynamic';

/**
 * 只有用户主动选择“补一个关键点”才调用 AI。这里不是保存路径，失败也不影响已保存回答。
 */
export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const prisma = createDatabaseClient();
  try {
    const body = (await request.json()) as { expectedBusinessVersion?: unknown };
    const expectedBusinessVersion =
      typeof body.expectedBusinessVersion === 'number' ? body.expectedBusinessVersion : Number.NaN;
    const service = new P08SessionService(prisma);
    const before = await service.getSnapshot(sessionId);
    if (
      before.businessVersion !== expectedBusinessVersion ||
      before.phase !== 'FIRST_ANSWER_SAVED'
    ) {
      throw new P08SessionValidationError('当前会话不能请求补充建议。', 'SESSION_STATE_INVALID');
    }
    if (!before.answers.first) {
      throw new P08SessionValidationError('第一次回答尚未保存。', 'SESSION_STATE_INVALID');
    }

    await syncEnvironmentProviderConfig(prisma);
    const configured = await prisma.aiProviderConfig.findFirst({
      where: { userId: 'local-user', isEnabled: true },
      select: { id: true },
    });
    const provider = configured ? new DeepSeekAiProvider() : new UnconfiguredAiProvider();
    await new R6FollowUpService(prisma, provider).requestForAnswer({
      trainingSessionId: sessionId,
      answerId: before.answers.first.id,
    });
    return NextResponse.json({ session: await service.getSnapshot(sessionId) });
  } catch (error) {
    if (error instanceof P08SessionValidationError) {
      const status =
        error.code === 'SESSION_NOT_FOUND' ? 404 : error.code === 'SESSION_STALE' ? 409 : 400;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    return NextResponse.json(
      { error: '暂时无法准备补充建议；你仍可直接结束或重新组织回答。' },
      { status: 503 },
    );
  } finally {
    await prisma.$disconnect();
  }
}
