import { NextResponse } from 'next/server';

import { createDatabaseClient } from '@/server/db/client';
import { ReleaseGateService } from '@/server/releases/release-gate-service';

export const dynamic = 'force-dynamic';

/** 只返回发布审计、门禁摘要和 Provider 掩码状态，不返回 Prompt 原文、原始输出或密钥。 */
export async function GET() {
  const prisma = createDatabaseClient();
  try {
    return NextResponse.json({ release: await new ReleaseGateService(prisma).getReport() });
  } catch {
    return NextResponse.json({ error: '无法读取本地发布门禁记录。' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
