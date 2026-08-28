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
    const body = (await request.json()) as { expectedBusinessVersion?: unknown };
    const service = new P08SessionService(prisma);
    await service.complete({
      trainingSessionId: sessionId,
      expectedBusinessVersion:
        typeof body.expectedBusinessVersion === 'number'
          ? body.expectedBusinessVersion
          : Number.NaN,
    });
    return NextResponse.json({ session: await service.getSnapshot(sessionId) });
  } catch (error) {
    if (error instanceof P08SessionValidationError) {
      const status =
        error.code === 'SESSION_NOT_FOUND' ? 404 : error.code === 'SESSION_STALE' ? 409 : 400;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    return NextResponse.json({ error: '无法结束本轮问题训练。' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
