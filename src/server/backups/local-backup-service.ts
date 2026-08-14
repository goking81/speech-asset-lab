import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, readdir, readFile, statfs, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { PrismaClient } from '@prisma/client';

import {
  ensureLocalDirectories,
  getLocalPaths,
  resolveLocalFilePath,
  type LocalPaths,
} from '@/server/storage/local-paths';

const LOCAL_USER_ID = 'local-user';
const BACKUP_FORMAT_VERSION = 1;
const BACKUP_APPLICATION = 'speech-asset-lab';

type BackupEntry = {
  relativePath: string;
  sha256: string;
  sizeBytes: number;
};

type BackupManifest = {
  formatVersion: number;
  application: string;
  backupId: string;
  createdAt: string;
  databaseMigrations: string[];
  entries: BackupEntry[];
};

type BackupScope = {
  database: true;
  sourceFiles: true;
  settings: true;
  bundleMetadata: true;
  logIndex: true;
};

export type BackupView = {
  id: string;
  kind: string;
  formatVersion: number;
  status: string;
  contentHash: string | null;
  sizeBytes: number | null;
  createdAt: Date;
  restoredAt: Date | null;
  restorePath: string | null;
};

export type BackupValidation = {
  backup: BackupView;
  migrationNames: string[];
  sizeBytes: number;
};

export type RestoreView = {
  backup: BackupView;
  safetyBackup: BackupView;
  stagingPath: string;
};

export class BackupValidationError extends Error {
  constructor(
    message: string,
    readonly code: 'BACKUP_NOT_FOUND' | 'BACKUP_INVALID' | 'RESTORE_FAILED',
  ) {
    super(message);
    this.name = 'BackupValidationError';
  }
}

/**
 * 本地备份包仅使用受控目录、相对路径和 manifest 哈希。恢复只写入隔离副本，绝不直接覆盖运行中的 SQLite。
 */
export class LocalBackupService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly paths: LocalPaths = getLocalPaths(),
    private readonly databasePath = resolveDatabasePath(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(userId = LOCAL_USER_ID): Promise<BackupView[]> {
    const records = await this.prisma.backupRecord.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((record) => this.toView(record));
  }

  async create(input: { userId?: string; kind?: 'MANUAL' | 'PRE_RESTORE_SAFETY' } = {}) {
    const userId = input.userId ?? LOCAL_USER_ID;
    await this.prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, displayName: 'Local User' },
    });
    await ensureLocalDirectories(this.paths);
    const scope: BackupScope = {
      database: true,
      sourceFiles: true,
      settings: true,
      bundleMetadata: true,
      logIndex: true,
    };
    const record = await this.prisma.backupRecord.create({
      data: {
        userId,
        filePath: 'packages/pending',
        kind: input.kind ?? 'MANUAL',
        formatVersion: BACKUP_FORMAT_VERSION,
        scopeJson: JSON.stringify(scope),
        status: 'CREATING',
      },
    });
    const relativePackagePath = path.posix.join('packages', record.id);
    const packagePath = resolveLocalFilePath(this.paths.backupsDir, relativePackagePath);
    await this.prisma.backupRecord.update({
      where: { id: record.id },
      data: { filePath: relativePackagePath },
    });

    try {
      await mkdir(packagePath, { recursive: true });
      const entries: BackupEntry[] = [];
      await this.prisma.$executeRawUnsafe('PRAGMA wal_checkpoint(FULL)').catch(() => undefined);
      await this.copyEntry(this.databasePath, packagePath, 'database/speech-asset-lab.db', entries);
      await this.copyDirectory(this.paths.filesDir, packagePath, 'files', entries);
      await this.writeMetadata(
        packagePath,
        'metadata/settings.json',
        await this.readSafeSettings(userId),
        entries,
      );
      await this.writeMetadata(
        packagePath,
        'metadata/release-bundles.json',
        await this.readReleaseMetadata(),
        entries,
      );
      await this.writeMetadata(
        packagePath,
        'metadata/log-index.json',
        await this.readLogIndex(),
        entries,
      );

      const manifest: BackupManifest = {
        formatVersion: BACKUP_FORMAT_VERSION,
        application: BACKUP_APPLICATION,
        backupId: record.id,
        createdAt: this.now().toISOString(),
        databaseMigrations: await this.readMigrationNames(),
        entries: entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
      };
      const contentHash = hashManifest(manifest);
      await writeFile(
        path.join(packagePath, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
        'utf8',
      );
      const sizeBytes = entries.reduce((total, entry) => total + entry.sizeBytes, 0);
      const updated = await this.prisma.backupRecord.update({
        where: { id: record.id },
        data: { status: 'COMPLETED', contentHash, sizeBytes, errorMessage: null },
      });
      return this.toView(updated);
    } catch {
      const failed = await this.prisma.backupRecord.update({
        where: { id: record.id },
        data: {
          status: 'FAILED',
          errorMessage: '本地备份未完成；当前训练数据没有被修改。',
        },
      });
      return this.toView(failed);
    }
  }

  async validate(backupId: string, userId = LOCAL_USER_ID): Promise<BackupValidation> {
    const record = await this.prisma.backupRecord.findFirst({ where: { id: backupId, userId } });
    if (!record) throw new BackupValidationError('未找到本地备份记录。', 'BACKUP_NOT_FOUND');
    if (!record.contentHash || !['COMPLETED', 'RESTORED'].includes(record.status)) {
      throw new BackupValidationError('该备份尚未完成，不能用于恢复。', 'BACKUP_INVALID');
    }
    const packagePath = this.resolvePackagePath(record.filePath);
    const manifest = await readManifest(packagePath);
    if (
      manifest.application !== BACKUP_APPLICATION ||
      manifest.formatVersion !== BACKUP_FORMAT_VERSION ||
      manifest.backupId !== record.id ||
      hashManifest(manifest) !== record.contentHash
    ) {
      throw new BackupValidationError('备份 manifest 校验失败。', 'BACKUP_INVALID');
    }
    const currentMigrations = new Set(await this.readMigrationNames());
    if (manifest.databaseMigrations.some((migration) => !currentMigrations.has(migration))) {
      throw new BackupValidationError('备份数据库版本与当前应用不兼容。', 'BACKUP_INVALID');
    }
    let sizeBytes = 0;
    for (const entry of manifest.entries) {
      const sourcePath = resolveLocalFilePath(packagePath, entry.relativePath);
      const info = await lstat(sourcePath).catch(() => null);
      if (!info || !info.isFile() || info.isSymbolicLink() || info.size !== entry.sizeBytes) {
        throw new BackupValidationError('备份文件校验失败。', 'BACKUP_INVALID');
      }
      if ((await hashFile(sourcePath)) !== entry.sha256) {
        throw new BackupValidationError('备份文件 Hash 校验失败。', 'BACKUP_INVALID');
      }
      sizeBytes += entry.sizeBytes;
    }
    const databasePath = resolveLocalFilePath(packagePath, 'database/speech-asset-lab.db');
    const header = await readFile(databasePath).catch(() => null);
    if (!header?.subarray(0, 16).equals(Buffer.from('SQLite format 3\u0000'))) {
      throw new BackupValidationError('备份数据库文件校验失败。', 'BACKUP_INVALID');
    }
    if (sizeBytes !== record.sizeBytes) {
      throw new BackupValidationError('备份大小校验失败。', 'BACKUP_INVALID');
    }
    return { backup: this.toView(record), migrationNames: manifest.databaseMigrations, sizeBytes };
  }

  async restoreToIsolation(backupId: string, userId = LOCAL_USER_ID): Promise<RestoreView> {
    const validation = await this.validate(backupId, userId);
    const safetyBackup = await this.create({ userId, kind: 'PRE_RESTORE_SAFETY' });
    if (safetyBackup.status !== 'COMPLETED') {
      throw new BackupValidationError('自动安全备份失败，当前数据未被修改。', 'RESTORE_FAILED');
    }
    const record = await this.prisma.backupRecord.findUniqueOrThrow({ where: { id: backupId } });
    const packagePath = this.resolvePackagePath(record.filePath);
    const manifest = await readManifest(packagePath);
    const restoreRoot = path.resolve(this.paths.dataDir, 'restore-staging');
    const restoreName = `${backupId}-${this.now().getTime()}`;
    const stagingPath = resolveLocalFilePath(restoreRoot, restoreName);
    const stagingRelativePath = safeRelativePath(this.paths.dataDir, stagingPath);
    try {
      await this.ensureAvailableSpace(restoreRoot, validation.sizeBytes);
      await this.prisma.backupRecord.update({
        where: { id: backupId },
        data: { status: 'RESTORING', errorMessage: null },
      });
      for (const entry of manifest.entries) {
        await this.copyEntry(
          resolveLocalFilePath(packagePath, entry.relativePath),
          stagingPath,
          entry.relativePath,
          [],
        );
      }
      await writeFile(
        path.join(stagingPath, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
        'utf8',
      );
      for (const entry of manifest.entries) {
        const restoredPath = resolveLocalFilePath(stagingPath, entry.relativePath);
        if ((await hashFile(restoredPath)) !== entry.sha256) {
          throw new BackupValidationError('隔离恢复文件校验失败。', 'RESTORE_FAILED');
        }
      }
      const restored = await this.prisma.backupRecord.update({
        where: { id: backupId },
        data: {
          status: 'RESTORED',
          restoredAt: this.now(),
          restorePath: stagingRelativePath,
          errorMessage: null,
        },
      });
      return {
        backup: this.toView(restored),
        safetyBackup,
        stagingPath: stagingRelativePath,
      };
    } catch (error) {
      await this.prisma.backupRecord.update({
        where: { id: backupId },
        data: {
          // 恢复失败不能损坏原备份记录；保留为可再次校验的完成备份。
          status: 'COMPLETED',
          restorePath: null,
          errorMessage: '隔离恢复失败；当前训练数据没有被修改。',
        },
      });
      if (error instanceof BackupValidationError) throw error;
      throw new BackupValidationError('隔离恢复失败；当前训练数据没有被修改。', 'RESTORE_FAILED');
    }
  }

  private async copyEntry(
    sourcePath: string,
    packagePath: string,
    relativePath: string,
    entries: BackupEntry[],
  ) {
    const sourceInfo = await lstat(sourcePath);
    if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink()) {
      throw new BackupValidationError('备份只允许普通本地文件。', 'BACKUP_INVALID');
    }
    const targetPath = resolveLocalFilePath(packagePath, relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
    entries.push({
      relativePath: toManifestPath(relativePath),
      sha256: await hashFile(targetPath),
      sizeBytes: sourceInfo.size,
    });
  }

  private async copyDirectory(
    sourceDirectory: string,
    packagePath: string,
    packagePrefix: string,
    entries: BackupEntry[],
  ) {
    const sourceInfo = await lstat(sourceDirectory);
    if (!sourceInfo.isDirectory() || sourceInfo.isSymbolicLink()) {
      throw new BackupValidationError('来源文件目录不可用。', 'BACKUP_INVALID');
    }
    const children = await readdir(sourceDirectory, { withFileTypes: true });
    for (const child of children.sort((left, right) => left.name.localeCompare(right.name))) {
      const sourcePath = path.join(sourceDirectory, child.name);
      const relativePath = path.posix.join(packagePrefix, child.name);
      if (child.isSymbolicLink()) {
        throw new BackupValidationError('来源文件不能包含符号链接。', 'BACKUP_INVALID');
      }
      if (child.isDirectory()) {
        await this.copyDirectory(sourcePath, packagePath, relativePath, entries);
      } else if (child.isFile()) {
        await this.copyEntry(sourcePath, packagePath, relativePath, entries);
      }
    }
  }

  private async writeMetadata(
    packagePath: string,
    relativePath: string,
    content: unknown,
    entries: BackupEntry[],
  ) {
    const targetPath = resolveLocalFilePath(packagePath, relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, JSON.stringify(content, null, 2), 'utf8');
    const info = await lstat(targetPath);
    entries.push({
      relativePath: toManifestPath(relativePath),
      sha256: await hashFile(targetPath),
      sizeBytes: info.size,
    });
  }

  private async readSafeSettings(userId: string) {
    const [settings, providerConfigs] = await Promise.all([
      this.prisma.userSetting.findMany({
        where: { userId, key: { not: { contains: 'secret' } } },
        select: { key: true, valueJson: true, updatedAt: true },
        orderBy: { key: 'asc' },
      }),
      this.prisma.aiProviderConfig.findMany({
        where: { userId },
        select: {
          providerKey: true,
          baseUrl: true,
          modelName: true,
          timeoutMs: true,
          retryCount: true,
          isFallback: true,
          isEnabled: true,
          maskedKeySuffix: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return {
      settings: settings.filter((setting) => !isSensitiveKey(setting.key)),
      providerConfigs,
    };
  }

  private async readReleaseMetadata() {
    return this.prisma.aiReleaseBundle.findMany({
      select: {
        id: true,
        version: true,
        status: true,
        bundleHash: true,
        createdAt: true,
        activatedAt: true,
        prompts: {
          select: {
            role: true,
            promptDefinition: { select: { key: true, version: true } },
          },
          orderBy: { role: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async readLogIndex() {
    return this.listFiles(this.paths.logsDir);
  }

  private async listFiles(directory: string, prefix = ''): Promise<BackupEntry[]> {
    const directoryInfo = await lstat(directory);
    if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
      throw new BackupValidationError('本地日志目录不可用。', 'BACKUP_INVALID');
    }
    const children = await readdir(directory, { withFileTypes: true });
    const entries: BackupEntry[] = [];
    for (const child of children.sort((left, right) => left.name.localeCompare(right.name))) {
      const childPath = path.join(directory, child.name);
      const childPrefix = path.posix.join(prefix, child.name);
      if (child.isSymbolicLink()) {
        throw new BackupValidationError('本地日志目录不能包含符号链接。', 'BACKUP_INVALID');
      }
      if (child.isDirectory()) {
        entries.push(...(await this.listFiles(childPath, childPrefix)));
      } else if (child.isFile()) {
        const info = await lstat(childPath);
        entries.push({
          relativePath: toManifestPath(childPrefix),
          sha256: await hashFile(childPath),
          sizeBytes: info.size,
        });
      }
    }
    return entries;
  }

  private async readMigrationNames() {
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
        'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name ASC',
      );
      return rows.map((row) => row.migration_name);
    } catch {
      return [];
    }
  }

  private async ensureAvailableSpace(directory: string, requiredBytes: number) {
    await mkdir(directory, { recursive: true });
    const filesystem = await statfs(directory);
    const available = BigInt(filesystem.bavail) * BigInt(filesystem.bsize);
    if (available < BigInt(requiredBytes)) {
      throw new BackupValidationError('本地可用空间不足，当前数据未被修改。', 'RESTORE_FAILED');
    }
  }

  private resolvePackagePath(relativePackagePath: string) {
    try {
      return resolveLocalFilePath(this.paths.backupsDir, relativePackagePath);
    } catch {
      throw new BackupValidationError('备份路径不在本地受控目录内。', 'BACKUP_INVALID');
    }
  }

  private toView(record: {
    id: string;
    kind: string;
    formatVersion: number;
    status: string;
    contentHash: string | null;
    sizeBytes: number | null;
    createdAt: Date;
    restoredAt: Date | null;
    restorePath: string | null;
  }): BackupView {
    return {
      id: record.id,
      kind: record.kind,
      formatVersion: record.formatVersion,
      status: record.status,
      contentHash: record.contentHash,
      sizeBytes: record.sizeBytes,
      createdAt: record.createdAt,
      restoredAt: record.restoredAt,
      restorePath: record.restorePath
        ? safeRelativePath(this.paths.dataDir, record.restorePath)
        : null,
    };
  }
}

function resolveDatabasePath() {
  const configured = process.env.DATABASE_URL ?? 'file:../data/speech-asset-lab.db';
  if (!configured.startsWith('file:')) {
    throw new Error('本地备份仅支持 SQLite file 数据库。');
  }
  const fileName = decodeURIComponent(configured.slice('file:'.length).split('?')[0] ?? '');
  if (!fileName || fileName === ':memory:') throw new Error('本地备份需要持久化 SQLite 文件。');
  // Prisma 的相对 SQLite URL 以 schema 所在的 prisma/ 目录为基准解析。
  return path.resolve(process.cwd(), 'prisma', fileName);
}

async function readManifest(packagePath: string): Promise<BackupManifest> {
  try {
    const manifestPath = resolveLocalFilePath(packagePath, 'manifest.json');
    const parsed = JSON.parse(await readFile(manifestPath, 'utf8')) as Partial<BackupManifest>;
    if (
      typeof parsed.formatVersion !== 'number' ||
      typeof parsed.application !== 'string' ||
      typeof parsed.backupId !== 'string' ||
      !Array.isArray(parsed.databaseMigrations) ||
      !Array.isArray(parsed.entries)
    ) {
      throw new Error('invalid');
    }
    const entries = parsed.entries.filter(isBackupEntry);
    if (entries.length !== parsed.entries.length) throw new Error('invalid entries');
    return {
      formatVersion: parsed.formatVersion,
      application: parsed.application,
      backupId: parsed.backupId,
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : '',
      databaseMigrations: parsed.databaseMigrations.filter(
        (migration): migration is string => typeof migration === 'string',
      ),
      entries,
    };
  } catch {
    throw new BackupValidationError('备份 manifest 不可读取。', 'BACKUP_INVALID');
  }
}

function isBackupEntry(value: unknown): value is BackupEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<BackupEntry>;
  return (
    typeof entry.relativePath === 'string' &&
    entry.relativePath.length > 0 &&
    !path.isAbsolute(entry.relativePath) &&
    !entry.relativePath.split('/').includes('..') &&
    typeof entry.sha256 === 'string' &&
    /^[a-f0-9]{64}$/u.test(entry.sha256) &&
    typeof entry.sizeBytes === 'number' &&
    Number.isSafeInteger(entry.sizeBytes) &&
    entry.sizeBytes >= 0
  );
}

function hashManifest(manifest: BackupManifest) {
  return createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
}

async function hashFile(filePath: string) {
  return createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex');
}

function isSensitiveKey(value: string) {
  return /api.?key|authorization|password|secret|token/i.test(value);
}

function toManifestPath(value: string) {
  return value.split(path.sep).join('/');
}

function safeRelativePath(rootDirectory: string, targetPath: string) {
  const relative = path.relative(rootDirectory, targetPath);
  if (
    !relative ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return '受控本地目录（路径已隐藏）';
  }
  return toManifestPath(relative);
}
