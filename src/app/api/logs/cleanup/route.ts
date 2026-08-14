import { NextResponse } from 'next/server';

import { createDatabaseClient } from '@/server/db/client';
import { LocalLogPrivacyService } from '@/server/logging/privacy-service';

export const dynamic = 'force-dynamic';

export async function POST() {
  const prisma = createDatabaseClient();
  try {
    const result = await new LocalLogPrivacyService(prisma).clearExpiredLogs();
    return NextResponse.json({ result });
  } catch {
    return NextResponse.json({ error: '无法清理本地日志。' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
