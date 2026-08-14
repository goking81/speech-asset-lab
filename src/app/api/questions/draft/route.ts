import { NextResponse } from 'next/server';

import { DeepSeekAiProvider } from '@/ai/provider';
import { syncEnvironmentProviderConfig } from '@/server/ai/provider-config-service';
import { R4DraftService } from '@/server/ai/r4-draft-service';
import { createDatabaseClient } from '@/server/db/client';
import { SupportedQuestionValidationError } from '@/server/questions/supported-question-service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const prisma = createDatabaseClient();
  try {
    const body = (await request.json()) as Record<string, unknown>;
    await syncEnvironmentProviderConfig(prisma);
    const provider = await prisma.aiProviderConfig.findFirst({
      where: { userId: 'local-user', isEnabled: true },
      select: { id: true },
    });
    if (!provider) {
      return NextResponse.json({ status: 'NOT_CONFIGURED', reason: 'AI_PROVIDER_NOT_CONFIGURED' });
    }

    const result = await new R4DraftService(prisma, new DeepSeekAiProvider()).request({
      userId: 'local-user',
      primaryPersonalAssetVersionId: stringValue(body.primaryPersonalAssetVersionId),
      secondaryPersonalAssetVersionId: optionalStringValue(body.secondaryPersonalAssetVersionId),
      confirmedFactIds: stringArray(body.confirmedFactIds),
    });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof SupportedQuestionValidationError || error instanceof Error
        ? error.message
        : 'R4 草稿请求失败。';
    return NextResponse.json({ error: message }, { status: 400 });
  } finally {
    await prisma.$disconnect();
  }
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function optionalStringValue(value: unknown) {
  return typeof value === 'string' && value ? value : undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
