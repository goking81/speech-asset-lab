import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { PrismaClient } from '@prisma/client';

import { getLocalPaths, resolveLocalFilePath } from '@/server/storage/local-paths';

import { nearDuplicateThreshold, tokenJaccardSimilarity } from './near-duplicate';
import { extractPdfText, PdfTextExtractionError } from './pdf-text-extractor';

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeText(value: string) {
  return value.replace(/\r\n?/g, '\n').trim();
}

function toSegments(text: string) {
  return text
    .split(/\n\s*\n/g)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export class TextParserService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly filesDirectory = getLocalPaths().filesDir,
  ) {}

  async parseReadyTextFiles(importBatchId: string) {
    const batch = await this.prisma.importBatch.findUniqueOrThrow({
      where: { id: importBatchId },
      include: {
        files: {
          where: {
            OR: [
              { status: 'READY' },
              // 新增本地解析能力后，允许重试此前缺少解析器或 OCR 的 PDF。
              {
                status: 'PARSE_FAILED',
                skipReason: {
                  in: [
                    'PARSER_NOT_ENABLED',
                    'PDF_TEXT_NOT_FOUND',
                    'OCR_ENGINE_UNAVAILABLE',
                    'OCR_LANGUAGE_UNAVAILABLE',
                    'PDF_RENDERER_UNAVAILABLE',
                  ],
                },
              },
            ],
          },
        },
      },
    });

    const results = [];

    const parseableFiles = batch.files.filter((item) =>
      ['.txt', '.pdf'].includes(item.extension.toLowerCase()),
    );
    const unsupportedFiles = batch.files.filter(
      (item) => !['.txt', '.pdf'].includes(item.extension.toLowerCase()),
    );

    await this.prisma.importBatchFile.updateMany({
      where: { id: { in: unsupportedFiles.map((file) => file.id) } },
      data: { status: 'PARSE_FAILED', skipReason: 'PARSER_NOT_ENABLED' },
    });

    for (const file of parseableFiles) {
      try {
        let parseProgressCurrent = 0;
        let parseProgressTotal = 1;
        await this.prisma.importBatchFile.update({
          where: { id: file.id },
          data: {
            status: 'PARSING',
            skipReason: null,
            parseProgressCurrent: 0,
            parseProgressTotal: 1,
          },
        });
        const localPath = resolveLocalFilePath(
          this.filesDirectory,
          path.join('imports', batch.id, file.relativePath),
        );
        const text = normalizeText(
          file.extension.toLowerCase() === '.pdf'
            ? await extractPdfText(localPath, {
                onOcrProgress: async ({ currentPage, totalPages }) => {
                  parseProgressCurrent = currentPage;
                  parseProgressTotal = totalPages;
                  await this.prisma.importBatchFile.update({
                    where: { id: file.id },
                    data: {
                      parseProgressCurrent: currentPage,
                      parseProgressTotal: totalPages,
                    },
                  });
                },
              })
            : await readFile(localPath, 'utf8'),
        );
        const parsedTextHash = hash(text);
        const duplicate = await this.prisma.sourceDocument.findFirst({
          where: { parsedTextHash },
          select: { id: true },
        });
        const nearDuplicate = duplicate
          ? null
          : (
              await this.prisma.sourceDocument.findMany({
                include: { segments: { orderBy: { sequence: 'asc' } } },
              })
            ).find(
              (candidate) =>
                tokenJaccardSimilarity(
                  text,
                  candidate.segments.map((segment) => segment.text).join('\n\n'),
                ) >= nearDuplicateThreshold,
            );

        const document = await this.prisma.$transaction(async (transaction) => {
          const created = await transaction.sourceDocument.create({
            data: {
              sourceCollectionId: batch.sourceCollectionId,
              importBatchId: batch.id,
              importBatchFileId: file.id,
              title: file.originalFileName,
              documentType: file.extension.toLowerCase() === '.pdf' ? 'PDF' : 'TEXT',
              localFilePath: path.join('imports', batch.id, file.relativePath),
              relativePath: file.relativePath,
              originalFileName: file.originalFileName,
              exactFileHash: file.exactFileHash,
              parsedTextHash,
              parseStatus: duplicate
                ? 'EXACT_DUPLICATE'
                : nearDuplicate
                  ? 'NEAR_DUPLICATE'
                  : 'PARSED',
              segments:
                duplicate || nearDuplicate
                  ? undefined
                  : {
                      create: toSegments(text).map((segment, sequence) => ({
                        sequence: sequence + 1,
                        text: segment,
                        textHash: hash(segment),
                        annotations: {
                          create: {
                            startOffset: 0,
                            endOffset: segment.length,
                            annotationType: 'PARAGRAPH',
                          },
                        },
                      })),
                    },
            },
          });

          await transaction.importBatchFile.update({
            where: { id: file.id },
            data: {
              status: duplicate ? 'EXACT_DUPLICATE' : nearDuplicate ? 'NEAR_DUPLICATE' : 'PARSED',
              normalizedTextHash: parsedTextHash,
              parseProgressCurrent:
                file.extension.toLowerCase() === '.pdf'
                  ? Math.max(parseProgressCurrent, parseProgressTotal)
                  : 1,
              parseProgressTotal: file.extension.toLowerCase() === '.pdf' ? parseProgressTotal : 1,
            },
          });

          if (duplicate) {
            await transaction.sourceDocumentDuplicate.create({
              data: {
                fromDocumentId: created.id,
                toDocumentId: duplicate.id,
                matchType: 'EXACT',
                similarity: 1,
              },
            });
          }

          if (nearDuplicate) {
            await transaction.sourceDocumentDuplicate.create({
              data: {
                fromDocumentId: created.id,
                toDocumentId: nearDuplicate.id,
                matchType: 'NEAR',
                similarity: tokenJaccardSimilarity(
                  text,
                  nearDuplicate.segments.map((segment) => segment.text).join('\n\n'),
                ),
              },
            });
          }

          return created;
        });

        results.push(document);
      } catch (error) {
        await this.prisma.importBatchFile.update({
          where: { id: file.id },
          data: {
            status: 'PARSE_FAILED',
            skipReason:
              error instanceof PdfTextExtractionError ? error.code : 'LOCAL_FILE_READ_FAILED',
          },
        });
      }
    }

    const fileStatuses = await this.prisma.importBatchFile.findMany({
      where: { importBatchId },
      select: { status: true },
    });
    const successful = fileStatuses.filter(
      (file) =>
        file.status === 'PARSED' ||
        file.status === 'EXACT_DUPLICATE' ||
        file.status === 'NEAR_DUPLICATE',
    ).length;
    const batchStatus =
      successful === fileStatuses.length
        ? 'COMPLETED'
        : successful > 0
          ? 'PARTIAL_SUCCESS'
          : 'FAILED';

    await this.prisma.importBatch.update({
      where: { id: importBatchId },
      data: { status: batchStatus },
    });

    return results;
  }

  /**
   * 仅为尚未进入候选审核的 PDF 替换本地解析段落。
   * 原始 PDF 文件保持不变；一旦已有候选证据，必须保留该证据，不允许重解析覆盖。
   */
  async reparsePdfWithOcr(importBatchId: string, importBatchFileId: string) {
    const file = await this.prisma.importBatchFile.findFirst({
      where: { id: importBatchFileId, importBatchId },
      include: {
        sourceDocument: {
          include: { candidates: { select: { id: true }, take: 1 } },
        },
      },
    });
    if (!file || file.extension.toLowerCase() !== '.pdf' || !file.sourceDocument) {
      throw new Error('只能重新解析当前批次中已导入的 PDF 文件。');
    }
    if (file.sourceDocument.candidates.length > 0) {
      throw new Error('该 PDF 已产生候选或来源证据，不能覆盖解析文本。请保留原文后重新导入。');
    }

    let parseProgressCurrent = 0;
    let parseProgressTotal = 1;
    await this.prisma.importBatchFile.update({
      where: { id: file.id },
      data: {
        status: 'PARSING',
        skipReason: null,
        parseProgressCurrent: 0,
        parseProgressTotal: 1,
      },
    });

    try {
      const localPath = resolveLocalFilePath(
        this.filesDirectory,
        path.join('imports', importBatchId, file.relativePath),
      );
      const text = normalizeText(
        await extractPdfText(localPath, {
          forceOcr: true,
          onOcrProgress: async ({ currentPage, totalPages }) => {
            parseProgressCurrent = currentPage;
            parseProgressTotal = totalPages;
            await this.prisma.importBatchFile.update({
              where: { id: file.id },
              data: { parseProgressCurrent: currentPage, parseProgressTotal: totalPages },
            });
          },
        }),
      );
      const parsedTextHash = hash(text);
      const segments = toSegments(text);

      const document = await this.prisma.$transaction(async (transaction) => {
        await transaction.sourceSegment.deleteMany({
          where: { sourceDocumentId: file.sourceDocument!.id },
        });
        const updated = await transaction.sourceDocument.update({
          where: { id: file.sourceDocument!.id },
          data: {
            parsedTextHash,
            parseStatus: 'PARSED',
            segments: {
              create: segments.map((segment, sequence) => ({
                sequence: sequence + 1,
                text: segment,
                textHash: hash(segment),
                annotations: {
                  create: {
                    startOffset: 0,
                    endOffset: segment.length,
                    annotationType: 'PARAGRAPH',
                  },
                },
              })),
            },
          },
        });
        await transaction.importBatchFile.update({
          where: { id: file.id },
          data: {
            status: 'PARSED',
            normalizedTextHash: parsedTextHash,
            parseProgressCurrent: Math.max(parseProgressCurrent, parseProgressTotal),
            parseProgressTotal,
          },
        });
        return updated;
      });

      const statuses = await this.prisma.importBatchFile.findMany({
        where: { importBatchId },
        select: { status: true },
      });
      const successful = statuses.filter((item) =>
        ['PARSED', 'EXACT_DUPLICATE', 'NEAR_DUPLICATE'].includes(item.status),
      ).length;
      await this.prisma.importBatch.update({
        where: { id: importBatchId },
        data: { status: successful === statuses.length ? 'COMPLETED' : 'PARTIAL_SUCCESS' },
      });

      return document;
    } catch (error) {
      await this.prisma.importBatchFile.update({
        where: { id: file.id },
        data: {
          status: 'PARSE_FAILED',
          skipReason: error instanceof PdfTextExtractionError ? error.code : 'OCR_PROCESS_FAILED',
        },
      });
      throw error;
    }
  }
}
