import { NextResponse } from 'next/server';

import { isCloudTrialRuntime } from '@/lib/runtime-mode';
import { cloudTrialUnavailableResponse } from '@/server/cloud-trial-response';
import { createDatabaseClient } from '@/server/db/client';
import { LocalLogPrivacyService } from '@/server/logging/privacy-service';
import { TrainingSettingsService } from '@/server/settings/training-settings-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (isCloudTrialRuntime()) return cloudTrialUnavailableResponse();

  const prisma = createDatabaseClient();
  try {
    const [{ LocalBackupService }, { getLocalPaths }, path] = await Promise.all([
      import('@/server/backups/local-backup-service'),
      import('@/server/storage/local-paths'),
      import('node:path'),
    ]);
    const paths = getLocalPaths();
    const [backups, privacy, training] = await Promise.all([
      new LocalBackupService(prisma).list(),
      new LocalLogPrivacyService(prisma).getPolicy(),
      new TrainingSettingsService(prisma).get(),
    ]);
    return NextResponse.json({
      storage: {
        database: 'data/speech-asset-lab.db',
        files: displayLocalPath(paths.filesDir, path),
        logs: displayLocalPath(paths.logsDir, path),
        backups: displayLocalPath(paths.backupsDir, path),
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

function displayLocalPath(targetPath: string, path: typeof import('node:path')) {
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
