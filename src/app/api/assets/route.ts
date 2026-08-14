import { NextResponse } from 'next/server';

import {
  PersonalAssetService,
  PersonalAssetValidationError,
} from '@/server/assets/personal-asset-service';
import { createDatabaseClient } from '@/server/db/client';

export async function GET() {
  const prisma = createDatabaseClient();

  try {
    const assets = await prisma.sourceAsset.findMany({
      where: { versions: { some: { status: 'CONFIRMED' } } },
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
          where: { userId: 'local-user' },
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
  } finally {
    await prisma.$disconnect();
  }
}

export async function POST(request: Request) {
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
