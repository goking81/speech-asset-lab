import { NextResponse } from 'next/server';

import { createDatabaseClient } from '@/server/db/client';
import { syncEnvironmentProviderConfig } from '@/server/ai/provider-config-service';

export async function GET() {
  const prisma = createDatabaseClient();
  try {
    await syncEnvironmentProviderConfig(prisma);
    const configs = await prisma.aiProviderConfig.findMany({
      where: { userId: 'local-user' },
      select: {
        providerKey: true,
        modelName: true,
        timeoutMs: true,
        retryCount: true,
        isFallback: true,
        isEnabled: true,
        maskedKeySuffix: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({ configs });
  } finally {
    await prisma.$disconnect();
  }
}
