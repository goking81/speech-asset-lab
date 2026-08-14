import { NextResponse } from 'next/server';

import { isCloudTrialRuntime } from '@/lib/runtime-mode';
import { cloudTrialUnavailableResponse } from '@/server/cloud-trial-response';
import { createDatabaseClient } from '@/server/db/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (isCloudTrialRuntime()) return cloudTrialUnavailableResponse();

  const prisma = createDatabaseClient();
  try {
    const { LocalBackupService } = await import('@/server/backups/local-backup-service');
    const backups = await new LocalBackupService(prisma).list();
    return NextResponse.json({ backups });
  } catch {
    return NextResponse.json({ error: '无法读取本地备份记录。' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

export async function POST() {
  if (isCloudTrialRuntime()) return cloudTrialUnavailableResponse();

  const prisma = createDatabaseClient();
  try {
    const { LocalBackupService } = await import('@/server/backups/local-backup-service');
    const backup = await new LocalBackupService(prisma).create();
    if (backup.status !== 'COMPLETED') {
      return NextResponse.json({ error: '本地备份未完成；当前数据没有被修改。' }, { status: 500 });
    }
    return NextResponse.json({ backup }, { status: 201 });
  } catch {
    return NextResponse.json({ error: '无法创建本地备份。' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
