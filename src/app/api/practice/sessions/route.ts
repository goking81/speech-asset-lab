import { NextResponse } from 'next/server';

import {
  AssetPracticeService,
  AssetPracticeValidationError,
} from '@/server/practice/asset-practice-service';
import { createDatabaseClient } from '@/server/db/client';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const prisma = createDatabaseClient();
  try {
    const body = (await request.json()) as {
      trainingTaskId?: unknown;
      retrainFromSessionId?: unknown;
    };
    const result = await new AssetPracticeService(prisma).start({
      trainingTaskId: typeof body.trainingTaskId === 'string' ? body.trainingTaskId : undefined,
      retrainFromSessionId:
        typeof body.retrainFromSessionId === 'string' ? body.retrainFromSessionId : undefined,
    });
    return NextResponse.json(result, { status: result.reused ? 200 : 201 });
  } catch (error) {
    return practiceErrorResponse(error, '无法建立资产训练会话。');
  } finally {
    await prisma.$disconnect();
  }
}

function practiceErrorResponse(error: unknown, fallback: string) {
  if (error instanceof AssetPracticeValidationError) {
    const status = error.code === 'SESSION_NOT_FOUND' ? 404 : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}
