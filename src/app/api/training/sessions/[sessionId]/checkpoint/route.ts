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
      phase?: unknown;
      draft?: unknown;
      followUpIndex?: unknown;
    };
    await new P08SessionService(prisma).saveCheckpoint({
      trainingSessionId: sessionId,
      expectedBusinessVersion:
        typeof body.expectedBusinessVersion === 'number'
          ? body.expectedBusinessVersion
          : Number.NaN,
      phase: body.phase as 'FIRST_ANSWER' | 'FOLLOW_UP_ANSWER' | 'SECOND_ANSWER',
      draft: typeof body.draft === 'string' ? body.draft : '',
      followUpIndex: typeof body.followUpIndex === 'number' ? body.followUpIndex : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return checkpointError(error);
  } finally {
    await prisma.$disconnect();
  }
}

function checkpointError(error: unknown) {
  if (error instanceof P08SessionValidationError) {
    const status =
      error.code === 'SESSION_NOT_FOUND' ? 404 : error.code === 'SESSION_STALE' ? 409 : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  return NextResponse.json({ error: '无法保存回答草稿。' }, { status: 500 });
}
