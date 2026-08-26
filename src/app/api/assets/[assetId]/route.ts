import { NextResponse } from 'next/server';

import { createDatabaseClient } from '@/server/db/client';

export async function GET(_request: Request, context: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await context.params;
  const prisma = createDatabaseClient();

  try {
    const asset = await prisma.sourceAsset.findUnique({
      where: { id: assetId },
      include: {
        versions: {
          where: { status: 'CONFIRMED' },
          orderBy: { version: 'desc' },
          take: 1,
          select: { id: true, title: true, coreIdea: true, coreFlow: true, version: true },
        },
        personalAssets: {
          where: { userId: 'local-user' },
          include: {
            versions: {
              where: { status: 'CONFIRMED' },
              orderBy: { version: 'desc' },
              take: 1,
              include: {
                nodes: { select: { id: true, nodeType: true } },
                flowSpans: { orderBy: { sequence: 'asc' } },
              },
            },
          },
        },
      },
    });
    if (!asset?.versions[0])
      return NextResponse.json({ error: '来源资产不存在或尚未确认。' }, { status: 404 });
    return NextResponse.json({
      assetId: asset.id,
      sourceVersion: asset.versions[0],
      personalVersion: asset.personalAssets[0]?.versions[0] ?? null,
    });
  } finally {
    await prisma.$disconnect();
  }
}
