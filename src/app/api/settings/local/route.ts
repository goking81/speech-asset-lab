import path from 'node:path';

import { NextResponse } from 'next/server';

import { LocalBackupService } from '@/server/backups/local-backup-service';
import { createDatabaseClient } from '@/server/db/client';
import { LocalLogPrivacyService } from '@/server/logging/privacy-service';
import { TrainingSettingsService } from '@/server/settings/training-settings-service';
import { getLocalPaths } from '@/server/storage/local-paths';

export const dynamic = 'force-dynamic';

export async function GET() {
  const prisma = createDatabaseClient();
  try {
    const paths = getLocalPaths();
    const [backups, privacy, training] = await Promise.all([
      new LocalBackupService(prisma).list(),
      new LocalLogPrivacyService(prisma).getPolicy(),
      new TrainingSettingsService(prisma).get(),
    ]);
    return NextResponse.json({
      storage: {
        database: 'data/speech-asset-lab.db',
        files: displayLocalPath(paths.filesDir),
        logs: displayLocalPath(paths.logsDir),
        backups: displayLocalPath(paths.backupsDir),
      },
      backups,
      privacy,
      training,
    });
  } catch {
    return NextResponse.json({ error: '无法读取本地设置。' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

function displayLocalPath(targetPath: string) {
  const relative = path.relative(process.cwd(), targetPath);
  if (
    !relative ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return '已配置的本地目录（路径已隐藏）';
  }
  return relative.split(path.sep).join('/');
}
