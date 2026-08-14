import { NextResponse } from 'next/server';

import { createDatabaseClient } from '@/server/db/client';
import { TrainingHistoryService } from '@/server/history/training-history-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const prisma = createDatabaseClient();
  try {
    const url = new URL(request.url);
    const history = await new TrainingHistoryService(prisma).list({
      assetId: url.searchParams.get('assetId') ?? undefined,
      question: url.searchParams.get('question') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
    });
    return NextResponse.json({ history });
  } catch {
    return NextResponse.json({ error: '无法读取本地训练记录。' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
