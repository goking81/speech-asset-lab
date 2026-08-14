import { NextResponse } from 'next/server';

import {
  AssetPracticeService,
  AssetPracticeValidationError,
} from '@/server/practice/asset-practice-service';
import { createDatabaseClient } from '@/server/db/client';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const prisma = createDatabaseClient();
  try {
    const session = await new AssetPracticeService(prisma).getSnapshot(sessionId);
    return NextResponse.json({ session });
  } catch (error) {
    if (error instanceof AssetPracticeValidationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 404 });
    }
    return NextResponse.json({ error: '无法读取资产训练会话。' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
