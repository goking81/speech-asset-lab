import { NextResponse } from 'next/server';

import {
  PersonalAssetService,
  PersonalAssetValidationError,
} from '@/server/assets/personal-asset-service';
import { cloudTrialUnavailableResponse } from '@/server/cloud-trial-response';
import { createDatabaseClient } from '@/server/db/client';
import { CLOUD_TRIAL_USER_ID, isCloudTrialRuntime } from '@/lib/runtime-mode';

export async function GET() {
  let prisma: ReturnType<typeof createDatabaseClient> | undefined;

  try {
    prisma = createDatabaseClient();
    const cloudTrial = isCloudTrialRuntime();
    const assets = await prisma.sourceAsset.findMany({
      where: {
        ...(cloudTrial ? { userId: CLOUD_TRIAL_USER_ID } : {}),
        versions: { some: { status: 'CONFIRMED' } },
      },
      include: {
        versions: {
          where: { status: 'CONFIRMED' },
          orderBy: { version: 'desc' },
          take: 1,
          select: {
            id: true,
            version: true,
            title: true,
            coreIdea: true,
            coreFlow: true,
            sourceType: true,
          },
        },
        personalAssets: {
          where: { userId: cloudTrial ? CLOUD_TRIAL_USER_ID : 'local-user' },
          include: {
            versions: {
              where: { status: 'CONFIRMED' },
              orderBy: { version: 'desc' },
              take: 1,
              select: { id: true, version: true, triggerName: true, coreFlow: true },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({ assets });
  } catch (error) {
    console.error('读取资产库失败。', error);
    return NextResponse.json({ error: '线上资产库暂时不可用，请稍后刷新。' }, { status: 503 });
  } finally {
    await prisma?.$disconnect();
  }
}

export async function POST(request: Request) {
  if (isCloudTrialRuntime()) return cloudTrialUnavailableResponse();

  const prisma = createDatabaseClient();

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const version = await new PersonalAssetService(prisma).createConfirmedVersion({
      userId: 'local-user',
      sourceAssetVersionId: stringValue(body.sourceAssetVersionId),
      triggerName: stringValue(body.triggerName),
      coreIdea: stringValue(body.coreIdea),
      coreFlow: stringValue(body.coreFlow),
      scenario: stringValue(body.scenario),
    });

    return NextResponse.json({ version });
  } catch (error) {
    const message =
      error instanceof PersonalAssetValidationError || error instanceof Error
        ? error.message
        : '个人资产保存失败。';
    return NextResponse.json({ error: message }, { status: 400 });
  } finally {
    await prisma.$disconnect();
  }
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}
