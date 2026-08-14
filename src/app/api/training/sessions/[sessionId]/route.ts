import { NextResponse } from 'next/server';

import { createDatabaseClient } from '@/server/db/client';
import {
  P08SessionService,
  P08SessionValidationError,
} from '@/server/training/p08-session-service';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const prisma = createDatabaseClient();
  try {
    const session = await new P08SessionService(prisma).getSnapshot(sessionId);
    return NextResponse.json({ session });
  } catch (error) {
    if (error instanceof P08SessionValidationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 404 });
    }
    return NextResponse.json({ error: '无法读取问题回答会话。' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
