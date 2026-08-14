import { mkdir } from 'node:fs/promises';
import path from 'node:path';

type LocalPathEnvironment = {
  APP_DATA_DIR?: string;
  APP_FILES_DIR?: string;
  APP_LOGS_DIR?: string;
  APP_BACKUPS_DIR?: string;
};

export type LocalPaths = {
  dataDir: string;
  filesDir: string;
  logsDir: string;
  backupsDir: string;
};

function resolveConfiguredPath(value: string | undefined, fallback: string, projectRoot: string) {
  const candidate = value?.trim() || fallback;

  return path.resolve(projectRoot, candidate);
}

export function getLocalPaths(
  environment: LocalPathEnvironment = process.env as LocalPathEnvironment,
  projectRoot = process.cwd(),
): LocalPaths {
  const dataDir = resolveConfiguredPath(environment.APP_DATA_DIR, 'data', projectRoot);

  return {
    dataDir,
    filesDir: resolveConfiguredPath(
      environment.APP_FILES_DIR,
      path.join(dataDir, 'files'),
      projectRoot,
    ),
    logsDir: resolveConfiguredPath(
      environment.APP_LOGS_DIR,
      path.join(dataDir, 'logs'),
      projectRoot,
    ),
    backupsDir: resolveConfiguredPath(
      environment.APP_BACKUPS_DIR,
      path.join(dataDir, 'backups'),
      projectRoot,
    ),
  };
}

export async function ensureLocalDirectories(paths: LocalPaths) {
  await Promise.all(Object.values(paths).map((directory) => mkdir(directory, { recursive: true })));
}

export function resolveLocalFilePath(rootDirectory: string, relativePath: string) {
  if (!relativePath.trim() || path.isAbsolute(relativePath)) {
    throw new Error('路径超出本地目录');
  }

  const root = path.resolve(rootDirectory);
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);

  if (
    relative === '' ||
    relative.startsWith(`..${path.sep}`) ||
    relative === '..' ||
    path.isAbsolute(relative)
  ) {
    throw new Error('路径超出本地目录');
  }

  return resolved;
}
