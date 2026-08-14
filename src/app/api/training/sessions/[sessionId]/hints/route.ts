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
      level?: unknown;
      followUpIndex?: unknown;
    };
    const service = new P08SessionService(prisma);
    await service.saveHint({
      trainingSessionId: sessionId,
      expectedBusinessVersion:
        typeof body.expectedBusinessVersion === 'number'
          ? body.expectedBusinessVersion
          : Number.NaN,
      phase: body.phase as 'FIRST_ANSWER' | 'FOLLOW_UP_ANSWER' | 'SECOND_ANSWER',
      followUpIndex: typeof body.followUpIndex === 'number' ? body.followUpIndex : undefined,
      level: body.level as
        'H1_ANGLE' | 'H2_ASSET_NAME' | 'H3_LOGIC_NODES' | 'H4_ENGLISH_CHUNKS' | 'H5_FULL_FLOW',
    });
    const session = await service.getSnapshot(sessionId);
    return NextResponse.json({ session });
  } catch (error) {
    if (error instanceof P08SessionValidationError) {
      const status =
        error.code === 'SESSION_NOT_FOUND' ? 404 : error.code === 'SESSION_STALE' ? 409 : 400;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    return NextResponse.json({ error: '无法保存提示记录。' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
