import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

import type { PrismaClient } from '@prisma/client';

import {
  CloudSourceOriginalStore,
  CloudSourceOriginalStoreError,
} from '@/server/storage/cloud-source-original-store';

import { type ImportLimits, type IntakeErrorCode, validateIntakeFile } from './import-limits';
import type { IntakeFileInput } from './import-intake-service';

const mib = 1024 * 1024;

/**
 * 云端导入的保守默认值。
 *
 * 原件经由浏览器以 Base64 提交，因此不把文件限制设得过大；10 MiB 足够覆盖普通
 * Word、带文字层 PDF 和试用期内的小型扫描件，也能避免一次请求耗尽 Worker 内存。
 */
export const defaultCloudImportLimits: ImportLimits = {
  maxFilesPerBatch: 5,
  maxFileBytes: 10 * mib,
  maxBatchBytes: 25 * mib,
  maxZipCompressionRatio: 1,
};

type CloudImportEnvironment = {
  CLOUD_IMPORT_MAX_FILES?: string;
  CLOUD_IMPORT_MAX_FILE_BYTES?: string;
  CLOUD_IMPORT_MAX_BATCH_BYTES?: string;
};

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getCloudImportLimits(
  environment: CloudImportEnvironment = process.env as unknown as CloudImportEnvironment,
): ImportLimits {
  return {
    maxFilesPerBatch: positiveInteger(
      environment.CLOUD_IMPORT_MAX_FILES,
      defaultCloudImportLimits.maxFilesPerBatch,
    ),
    maxFileBytes: positiveInteger(
      environment.CLOUD_IMPORT_MAX_FILE_BYTES,
      defaultCloudImportLimits.maxFileBytes,
    ),
    maxBatchBytes: positiveInteger(
      environment.CLOUD_IMPORT_MAX_BATCH_BYTES,
      defaultCloudImportLimits.maxBatchBytes,
    ),
    maxZipCompressionRatio: 1,
  };
}

type CloudIntakeResult = {
  relativePath: string;
  originalFileName: string;
  extension: string;
  sizeBytes: number;
  status: 'READY' | 'SKIPPED_UNSUPPORTED';
  skipReason?: IntakeErrorCode;
  exactFileHash?: string;
  storageObjectKey?: string;
};

export class CloudImportIntakeService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage = new CloudSourceOriginalStore(),
    private readonly limits = getCloudImportLimits(),
  ) {}

  async createBatch(input: {
    userId: string;
    collectionTitle: string;
    sourceType: string;
    originalName?: string;
    files: IntakeFileInput[];
  }) {
    if (!input.collectionTitle.trim()) {
      throw new Error('课程集合名称不能为空。');
    }

    const batchId = randomUUID();
    let acceptedBytes = 0;
    const results: CloudIntakeResult[] = [];
    const uploadedObjectKeys: string[] = [];

    try {
      for (const file of input.files) {
        const extension = file.extension.toLowerCase();
        const limitError =
          results.length >= this.limits.maxFilesPerBatch
            ? 'BATCH_FILE_LIMIT_EXCEEDED'
            : validateIntakeFile(
                {
                  relativePath: file.relativePath,
                  extension,
                  sizeBytes: file.content.byteLength,
                },
                this.limits,
                acceptedBytes,
              );
        const error = !['.txt', '.pdf', '.docx'].includes(extension)
          ? 'UNSUPPORTED_FILE_TYPE'
          : limitError;

        if (error) {
          results.push({
            relativePath: file.relativePath,
            originalFileName: file.originalFileName,
            extension,
            sizeBytes: file.content.byteLength,
            status: 'SKIPPED_UNSUPPORTED',
            skipReason: error,
          });
          continue;
        }

        const storageObjectKey = createObjectKey(batchId, file.relativePath);
        await this.storage.put(storageObjectKey, file.content, contentTypeForExtension(extension));
        uploadedObjectKeys.push(storageObjectKey);
        acceptedBytes += file.content.byteLength;
        results.push({
          relativePath: file.relativePath,
          originalFileName: file.originalFileName,
          extension,
          sizeBytes: file.content.byteLength,
          status: 'READY',
          exactFileHash: createHash('sha256').update(file.content).digest('hex'),
          storageObjectKey,
        });
      }

      const acceptedCount = results.filter((result) => result.status === 'READY').length;
      const status =
        acceptedCount === 0
          ? 'FAILED'
          : acceptedCount === results.length
            ? 'READY'
            : 'PARTIAL_SUCCESS';

      const result = await this.prisma.$transaction(async (transaction) => {
        const collection = await transaction.sourceCollection.create({
          data: { userId: input.userId, title: input.collectionTitle.trim() },
        });
        const batch = await transaction.importBatch.create({
          data: {
            id: batchId,
            userId: input.userId,
            sourceCollectionId: collection.id,
            sourceType: input.sourceType,
            originalName: input.originalName,
            status,
            files: {
              create: results.map((file) => ({
                relativePath: file.relativePath,
                originalFileName: file.originalFileName,
                extension: file.extension,
                sizeBytes: file.sizeBytes,
                exactFileHash: file.exactFileHash,
                storageObjectKey: file.storageObjectKey,
                status: file.status,
                skipReason: file.skipReason,
              })),
            },
          },
          include: { files: { orderBy: { relativePath: 'asc' } } },
        });
        return { collection, batch };
      });

      return result;
    } catch (error) {
      await Promise.all(
        uploadedObjectKeys.map((key) => this.storage.remove(key).catch(() => undefined)),
      );
      if (error instanceof CloudSourceOriginalStoreError) throw error;
      throw error;
    }
  }
}

function createObjectKey(batchId: string, relativePath: string) {
  const extension = path.extname(relativePath).toLowerCase() || '.txt';
  const digest = createHash('sha256').update(relativePath).digest('hex').slice(0, 16);
  return `imports/${batchId}/${digest}${extension}`;
}

function contentTypeForExtension(extension: string) {
  switch (extension) {
    case '.pdf':
      return 'application/pdf';
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    default:
      return 'text/plain';
  }
}
