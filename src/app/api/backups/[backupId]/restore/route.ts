import { NextResponse } from 'next/server';

import { isCloudTrialRuntime } from '@/lib/runtime-mode';
import { cloudTrialUnavailableResponse } from '@/server/cloud-trial-response';
import { createDatabaseClient } from '@/server/db/client';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, context: { params: Promise<{ backupId: string }> }) {
  if (isCloudTrialRuntime()) return cloudTrialUnavailableResponse();

  const { backupId } = await context.params;
  const prisma = createDatabaseClient();
  try {
    const { LocalBackupService } = await import('@/server/backups/local-backup-service');
    const restore = await new LocalBackupService(prisma).restoreToIsolation(backupId);
    return NextResponse.json({ restore });
  } catch (error) {
    if (isBackupValidationError(error)) {
      const status = error.code === 'BACKUP_NOT_FOUND' ? 404 : 400;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    return NextResponse.json({ error: '无法隔离恢复本地备份。' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

function isBackupValidationError(error: unknown): error is { code: string; message: string } {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: unknown }).code;
  return typeof code === 'string' && (code.startsWith('BACKUP_') || code === 'RESTORE_FAILED');
}
