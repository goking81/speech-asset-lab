import { NextResponse } from 'next/server';

import {
  TrainingSettingsService,
  type TrainingTargets,
} from '@/server/settings/training-settings-service';
import { createDatabaseClient } from '@/server/db/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const prisma = createDatabaseClient();
  try {
    return NextResponse.json({ training: await new TrainingSettingsService(prisma).get() });
  } finally {
    await prisma.$disconnect();
  }
}

export async function PUT(request: Request) {
  const prisma = createDatabaseClient();
  try {
    const input = (await request.json()) as Partial<TrainingTargets>;
    const training = await new TrainingSettingsService(prisma).save({
      dailyTargetMinutes: input.dailyTargetMinutes ?? Number.NaN,
      dailyNewAssetTarget: input.dailyNewAssetTarget ?? Number.NaN,
      dailyNewAssetMax: input.dailyNewAssetMax ?? Number.NaN,
      activeAssetLimit: input.activeAssetLimit ?? Number.NaN,
    });
    return NextResponse.json({ training });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '无法保存训练目标。' },
      { status: 400 },
    );
  } finally {
    await prisma.$disconnect();
  }
}
