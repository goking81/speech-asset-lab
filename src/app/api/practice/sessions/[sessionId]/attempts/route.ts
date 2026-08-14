import { NextResponse } from 'next/server';

import {
  AssetPracticeService,
  AssetPracticeValidationError,
  type HintLevel,
  type P05Step,
} from '@/server/practice/asset-practice-service';
import { createDatabaseClient } from '@/server/db/client';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const prisma = createDatabaseClient();
  try {
    const body = (await request.json()) as {
      stepType?: unknown;
      oralAttemptConfirmed?: unknown;
      completionRating?: unknown;
      difficultyRating?: unknown;
      highestHintLevel?: unknown;
      textAnswer?: unknown;
      idempotencyKey?: unknown;
    };
    const attempt = await new AssetPracticeService(prisma).saveAttempt({
      assetPracticeSessionId: sessionId,
      stepType: body.stepType as P05Step,
      oralAttemptConfirmed:
        typeof body.oralAttemptConfirmed === 'boolean' ? body.oralAttemptConfirmed : undefined,
      completionRating: body.completionRating as
        'COMPLETE' | 'BASIC' | 'PARTIAL' | 'NOT_COMPLETED' | null | undefined,
      difficultyRating: body.difficultyRating as 'EASY' | 'RIGHT' | 'DIFFICULT' | null | undefined,
      highestHintLevel: body.highestHintLevel as HintLevel | undefined,
      textAnswer: typeof body.textAnswer === 'string' ? body.textAnswer : undefined,
      idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '',
    });
    const session = await new AssetPracticeService(prisma).getSnapshot(sessionId);
    return NextResponse.json({ attempt, session });
  } catch (error) {
    if (error instanceof AssetPracticeValidationError) {
      const status =
        error.code === 'SESSION_NOT_FOUND' ? 404 : error.code === 'STEP_MISMATCH' ? 409 : 400;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    return NextResponse.json({ error: '无法保存训练尝试。' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
