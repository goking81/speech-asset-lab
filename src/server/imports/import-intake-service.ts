import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { PrismaClient } from '@prisma/client';

import { getLocalPaths, resolveLocalFilePath } from '@/server/storage/local-paths';

import {
  defaultImportLimits,
  type ImportLimits,
  type IntakeErrorCode,
  validateIntakeFile,
} from './import-limits';
import { readZipMetadata } from './zip-metadata';

export type IntakeFileInput = {
  relativePath: string;
  originalFileName: string;
  extension: string;
  content: Uint8Array;
  compressedBytes?: number;
  uncompressedBytes?: number;
};

export type CreateImportBatchInput = {
  userId: string;
  collectionTitle: string;
  sourceType: string;
  originalName?: string;
  files: IntakeFileInput[];
};

type IntakeResult = {
  relativePath: string;
  status: 'READY' | 'SKIPPED_UNSUPPORTED';
  skipReason?: IntakeErrorCode;
  exactFileHash?: string;
  storedRelativePath?: string;
  sizeBytes: number;
  extension: string;
  originalFileName: string;
};

function sha256(content: Uint8Array) {
  return createHash('sha256').update(content).digest('hex');
}

export class ImportIntakeService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly filesDirectory = getLocalPaths().filesDir,
    private readonly limits: ImportLimits = defaultImportLimits,
  ) {}

  async createBatch(input: CreateImportBatchInput) {
    if (!input.collectionTitle.trim()) {
      throw new Error('课程集合名称不能为空。');
    }

    const batchId = randomUUID();
    let acceptedBytes = 0;
    const results: IntakeResult[] = [];
    const writtenPaths: string[] = [];

    for (const file of input.files) {
      let compressedBytes = file.compressedBytes;
      let uncompressedBytes = file.uncompressedBytes;
      let metadataError: IntakeErrorCode | undefined;

      if (file.extension.toLowerCase() === '.zip') {
        try {
          const metadata = readZipMetadata(file.content);
          compressedBytes = metadata.compressedBytes;
          uncompressedBytes = metadata.uncompressedBytes;
          if (metadata.entryCount > this.limits.maxFilesPerBatch) {
            metadataError = 'BATCH_FILE_LIMIT_EXCEEDED';
          }
        } catch {
          metadataError = 'ZIP_METADATA_INVALID';
        }
      }
      const descriptor = {
        relativePath: file.relativePath,
        extension: file.extension,
        sizeBytes: file.content.byteLength,
        compressedBytes,
        uncompressedBytes,
      };
      const limitError =
        (metadataError ?? results.length >= this.limits.maxFilesPerBatch)
          ? 'BATCH_FILE_LIMIT_EXCEEDED'
          : validateIntakeFile(descriptor, this.limits, acceptedBytes);

      if (limitError) {
        results.push({
          relativePath: file.relativePath,
          originalFileName: file.originalFileName,
          extension: file.extension,
          sizeBytes: file.content.byteLength,
          status: 'SKIPPED_UNSUPPORTED',
          skipReason: limitError,
        });
        continue;
      }

      const storedRelativePath = path.join('imports', batchId, file.relativePath);
      const destination = resolveLocalFilePath(this.filesDirectory, storedRelativePath);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, file.content);
      writtenPaths.push(destination);
      acceptedBytes += file.content.byteLength;
      results.push({
        relativePath: file.relativePath,
        originalFileName: file.originalFileName,
        extension: file.extension,
        sizeBytes: file.content.byteLength,
        status: 'READY',
        exactFileHash: sha256(file.content),
        storedRelativePath,
      });
    }

    const acceptedCount = results.filter((result) => result.status === 'READY').length;
    const batchStatus =
      acceptedCount === 0
        ? 'FAILED'
        : acceptedCount === results.length
          ? 'READY'
          : 'PARTIAL_SUCCESS';

    try {
      return await this.prisma.$transaction(async (transaction) => {
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
            status: batchStatus,
            files: {
              create: results.map((result) => ({
                relativePath: result.relativePath,
                originalFileName: result.originalFileName,
                extension: result.extension,
                sizeBytes: result.sizeBytes,
                exactFileHash: result.exactFileHash,
                status: result.status,
                skipReason: result.skipReason,
              })),
            },
          },
          include: { files: { orderBy: { relativePath: 'asc' } } },
        });

        return { collection, batch };
      });
    } catch (error) {
      await Promise.all(writtenPaths.map((filePath) => rm(filePath, { force: true })));
      throw error;
    }
  }
}
