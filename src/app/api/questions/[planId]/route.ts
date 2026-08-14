import { NextResponse } from 'next/server';

import { createDatabaseClient } from '@/server/db/client';
import {
  SupportedQuestionService,
  SupportedQuestionValidationError,
} from '@/server/questions/supported-question-service';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ planId: string }> }) {
  const { planId } = await context.params;
  const prisma = createDatabaseClient();
  try {
    const plan = await new SupportedQuestionService(prisma).getPlanForUser('local-user', planId);
    return NextResponse.json({ plan });
  } catch (error) {
    const message =
      error instanceof SupportedQuestionValidationError || error instanceof Error
        ? error.message
        : '无法读取问题准备。';
    return NextResponse.json({ error: message }, { status: 404 });
  } finally {
    await prisma.$disconnect();
  }
}
