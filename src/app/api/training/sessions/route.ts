import { NextResponse } from 'next/server';

import { createDatabaseClient } from '@/server/db/client';
import {
  P08SessionService,
  P08SessionValidationError,
} from '@/server/training/p08-session-service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const prisma = createDatabaseClient();
  try {
    const body = (await request.json()) as { questionPlanId?: unknown };
    const result = await new P08SessionService(prisma).start({
      questionPlanId: typeof body.questionPlanId === 'string' ? body.questionPlanId : '',
    });
    return NextResponse.json(result, { status: result.reused ? 200 : 201 });
  } catch (error) {
    return trainingError(error, '无法建立问题回答会话。');
  } finally {
    await prisma.$disconnect();
  }
}

function trainingError(error: unknown, fallback: string) {
  if (error instanceof P08SessionValidationError) {
    const status =
      error.code === 'SESSION_NOT_FOUND' || error.code === 'PLAN_NOT_AVAILABLE' ? 404 : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}
