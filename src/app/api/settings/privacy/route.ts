import { NextResponse } from 'next/server';

import { createDatabaseClient } from '@/server/db/client';
import {
  LocalLogPrivacyService,
  LogPrivacyValidationError,
} from '@/server/logging/privacy-service';

export const dynamic = 'force-dynamic';

export async function PUT(request: Request) {
  const prisma = createDatabaseClient();
  try {
    const body = (await request.json()) as {
      storeRawAiResponses?: unknown;
      retentionDays?: unknown;
    };
    if (typeof body.storeRawAiResponses !== 'boolean') {
      throw new LogPrivacyValidationError('原始响应开关无效。');
    }
    const privacy = await new LocalLogPrivacyService(prisma).savePolicy({
      storeRawAiResponses: body.storeRawAiResponses,
      retentionDays: typeof body.retentionDays === 'number' ? body.retentionDays : Number.NaN,
    });
    return NextResponse.json({ privacy });
  } catch (error) {
    if (error instanceof LogPrivacyValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: '无法保存日志隐私设置。' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
