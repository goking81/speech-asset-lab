import { NextResponse } from 'next/server';

import {
  AssetPracticeService,
  AssetPracticeValidationError,
  type P05Step,
} from '@/server/practice/asset-practice-service';
import { createDatabaseClient } from '@/server/db/client';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const prisma = createDatabaseClient();
  try {
    const body = (await request.json()) as { currentStep?: unknown; payload?: unknown };
    await new AssetPracticeService(prisma).saveCheckpoint({
      assetPracticeSessionId: sessionId,
      currentStep: body.currentStep as P05Step,
      payload: (body.payload ?? {}) as {
        oralAttemptConfirmed?: boolean;
        completionRating?: 'COMPLETE' | 'BASIC' | 'PARTIAL' | 'NOT_COMPLETED' | null;
        difficultyRating?: 'EASY' | 'RIGHT' | 'DIFFICULT' | null;
        highestHintLevel?:
          | 'H0_NONE'
          | 'H1_ANGLE'
          | 'H2_ASSET_NAME'
          | 'H3_LOGIC_NODES'
          | 'H4_ENGLISH_CHUNKS'
          | 'H5_FULL_FLOW';
        textDraft?: string;
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return checkpointErrorResponse(error);
  } finally {
    await prisma.$disconnect();
  }
}

function checkpointErrorResponse(error: unknown) {
  if (error instanceof AssetPracticeValidationError) {
    const status =
      error.code === 'SESSION_NOT_FOUND' ? 404 : error.code === 'STEP_MISMATCH' ? 409 : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  return NextResponse.json({ error: '无法保存训练检查点。' }, { status: 500 });
}
