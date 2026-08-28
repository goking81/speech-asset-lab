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
      followUpId?: unknown;
      text?: unknown;
      idempotencyKey?: unknown;
    };
    const sessionService = new P08SessionService(prisma);
    const answer = await sessionService.submitFollowUpAnswer({
      trainingSessionId: sessionId,
      expectedBusinessVersion:
        typeof body.expectedBusinessVersion === 'number'
          ? body.expectedBusinessVersion
          : Number.NaN,
      followUpId: typeof body.followUpId === 'string' ? body.followUpId : '',
      text: typeof body.text === 'string' ? body.text : '',
      idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '',
    });
    const session = await sessionService.getSnapshot(sessionId);
    return NextResponse.json({ answer, session });
  } catch (error) {
    if (error instanceof P08SessionValidationError) {
      const status =
        error.code === 'SESSION_NOT_FOUND' ? 404 : error.code === 'SESSION_STALE' ? 409 : 400;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    return NextResponse.json({ error: '无法保存追问回答。' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
