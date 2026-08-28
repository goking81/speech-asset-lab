import { NextResponse } from 'next/server';

import { createDatabaseClient } from '@/server/db/client';
import {
  P08SessionService,
  P08SessionValidationError,
} from '@/server/training/p08-session-service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const prisma = createDatabaseClient();
  try {
    const body = (await request.json()) as {
      expectedBusinessVersion?: unknown;
      answerType?: unknown;
      text?: unknown;
      idempotencyKey?: unknown;
    };
    const service = new P08SessionService(prisma);
    const answer = await service.submitAnswer({
      trainingSessionId: sessionId,
      expectedBusinessVersion:
        typeof body.expectedBusinessVersion === 'number'
          ? body.expectedBusinessVersion
          : Number.NaN,
      answerType: body.answerType as 'FIRST_ANSWER' | 'SECOND_ANSWER',
      text: typeof body.text === 'string' ? body.text : '',
      idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '',
    });
    // 保存路径只做本地事务和快照读取。AI 仅在用户明确请求“补一个关键点”时调用，
    // 避免 Provider 延迟把“保存”误表现成卡死。
    const session = await service.getSnapshot(sessionId);
    return NextResponse.json({ answer, session });
  } catch (error) {
    return trainingError(error, '无法保存问题回答。');
  } finally {
    await prisma.$disconnect();
  }
}

function trainingError(error: unknown, fallback: string) {
  if (error instanceof P08SessionValidationError) {
    const status =
      error.code === 'SESSION_NOT_FOUND' ? 404 : error.code === 'SESSION_STALE' ? 409 : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}
