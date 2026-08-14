import { NextResponse } from 'next/server';

import { DeepSeekAiProvider, UnconfiguredAiProvider } from '@/ai/provider';
import { syncEnvironmentProviderConfig } from '@/server/ai/provider-config-service';
import { createDatabaseClient } from '@/server/db/client';
import { R7CReviewService, R7CReviewValidationError } from '@/server/training/r7c-review-service';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const prisma = createDatabaseClient();
  try {
    const review = await new R7CReviewService(prisma, new UnconfiguredAiProvider()).getReview(
      sessionId,
    );
    return NextResponse.json({ review });
  } catch (error) {
    return reviewError(error, '无法读取本地复盘。');
  } finally {
    await prisma.$disconnect();
  }
}

/** 仅请求当前冻结比较事实的 R7C 草稿；不会改写任一回答或 R7A/R7B 结果。 */
export async function POST(_request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const prisma = createDatabaseClient();
  try {
    await syncEnvironmentProviderConfig(prisma);
    const configured = await prisma.aiProviderConfig.findFirst({
      where: { userId: 'local-user', isEnabled: true },
      select: { id: true },
    });
    const provider = configured ? new DeepSeekAiProvider() : new UnconfiguredAiProvider();
    const review = await new R7CReviewService(prisma, provider).requestForSession({
      trainingSessionId: sessionId,
    });
    return NextResponse.json({ review });
  } catch (error) {
    return reviewError(error, '无法建立本地复盘。');
  } finally {
    await prisma.$disconnect();
  }
}

function reviewError(error: unknown, fallback: string) {
  if (error instanceof R7CReviewValidationError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 404 });
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}
