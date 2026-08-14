import { NextResponse } from 'next/server';

import { BackupValidationError, LocalBackupService } from '@/server/backups/local-backup-service';
import { createDatabaseClient } from '@/server/db/client';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, context: { params: Promise<{ backupId: string }> }) {
  const { backupId } = await context.params;
  const prisma = createDatabaseClient();
  try {
    const restore = await new LocalBackupService(prisma).restoreToIsolation(backupId);
    return NextResponse.json({ restore });
  } catch (error) {
    if (error instanceof BackupValidationError) {
      const status = error.code === 'BACKUP_NOT_FOUND' ? 404 : 400;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    return NextResponse.json({ error: '无法隔离恢复本地备份。' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
