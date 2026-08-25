import { createHash } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';
import { getCloudflareContext } from '@opennextjs/cloudflare';

import {
  CloudSourceOriginalStore,
  CloudSourceOriginalStoreError,
} from '@/server/storage/cloud-source-original-store';

import { CloudOcrError, CloudOcrService } from './cloud-ocr-service';
import { needsOcrFallback } from './document-text-quality';
import { nearDuplicateThreshold, tokenJaccardSimilarity } from './near-duplicate';

type CloudDocumentFile = {
  id: string;
  relativePath: string;
  originalFileName: string;
  extension: string;
  exactFileHash: string | null;
  storageObjectKey: string | null;
};

type CloudflareMarkdownResult = {
  format: 'markdown' | 'text' | 'error';
  data?: string;
  error?: string;
};

type CloudflareAiBinding = {
  toMarkdown: (
    files: { name: string; blob: Blob },
    options: {
      conversionOptions: {
        output: { format: 'text' };
        pdf: { metadata: false };
      };
    },
  ) => Promise<CloudflareMarkdownResult>;
};

type CloudflareAiEnvironment = {
  AI?: CloudflareAiBinding;
};

const documentConversionTimeoutMs = 90_000;

export class CloudDocumentParserError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'CLOUD_DOCUMENT_UNSUPPORTED'
      | 'CLOUD_TEXT_INVALID_UTF8'
      | 'CLOUD_TEXT_EMPTY'
      | 'CLOUD_AI_BINDING_UNAVAILABLE'
      | 'CLOUD_DOCUMENT_CONVERSION_FAILED',
  ) {
    super(message);
    this.name = 'CloudDocumentParserError';
  }
}

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

function contentTypeForExtension(extension: string) {
  switch (extension) {
    case '.pdf':
      return 'application/pdf';
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    default:
      return 'text/plain; charset=utf-8';
  }
}

function documentTypeForExtension(extension: string) {
  switch (extension) {
    case '.pdf':
      return 'CLOUD_PDF';
    case '.docx':
      return 'CLOUD_DOCX';
    default:
      return 'CLOUD_TEXT';
  }
}

async function getAiBinding() {
  const { env } = await getCloudflareContext({ async: true });
  const ai = (env as CloudflareAiEnvironment).AI;
  if (!ai) {
    throw new CloudDocumentParserError(
      'Cloudflare AI 文档转换尚未绑定。请为 Worker 添加 AI binding 后重试。',
      'CLOUD_AI_BINDING_UNAVAILABLE',
    );
  }
  return ai;
}

async function convertDocumentToText(input: {
  name: string;
  extension: string;
  content: Uint8Array;
}) {
  const ai = await getAiBinding();
  let result: CloudflareMarkdownResult;
  try {
    result = await withTimeout(
      ai.toMarkdown(
        {
          name: input.name,
          blob: new Blob([input.content.slice().buffer as ArrayBuffer], {
            type: contentTypeForExtension(input.extension),
          }),
        },
        {
          conversionOptions: {
            output: { format: 'text' },
            pdf: { metadata: false },
          },
        },
      ),
      documentConversionTimeoutMs,
    );
  } catch {
    throw new CloudDocumentParserError(
      'Cloudflare 文档转换在 90 秒内未完成。文件已保留，可稍后重试或拆分文档。',
      'CLOUD_DOCUMENT_CONVERSION_FAILED',
    );
  }

  if (result.format === 'error' || !result.data) {
    throw new CloudDocumentParserError(
      result.error || 'Cloudflare 未能从此文件提取文字。',
      'CLOUD_DOCUMENT_CONVERSION_FAILED',
    );
  }

  return result.data;
}

function withTimeout<T>(task: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('DOCUMENT_CONVERSION_TIMEOUT')), timeoutMs);
    task.then(
      (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

/**
 * 云端文档解析：原件保存在私有 Storage，PDF 与 DOCX 使用 Cloudflare 文档转换。
 * 只有 PDF 的文字层缺失或明显损坏时，才调用额外的 OCR 适配器。
 */
export class CloudDocumentParserService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage = new CloudSourceOriginalStore(),
    private readonly ocr = new CloudOcrService(),
  ) {}

  async parseReadyFiles(importBatchId: string) {
    const batch = await this.prisma.importBatch.findUniqueOrThrow({
      where: { id: importBatchId },
      include: {
        files: {
          where: {
            OR: [
              { status: 'READY' },
              {
                status: 'PARSE_FAILED',
                skipReason: {
                  in: [
                    'CLOUD_AI_BINDING_UNAVAILABLE',
                    'CLOUD_DOCUMENT_CONVERSION_FAILED',
                    'CLOUD_OCR_NOT_CONFIGURED',
                    'CLOUD_OCR_FAILED',
                  ],
                },
              },
            ],
          },
        },
      },
    });
    if (!batch.sourceCollectionId) {
      throw new Error('导入批次缺少来源集合，无法解析。');
    }
    const results = [];

    for (const file of batch.files) {
      try {
        const extension = file.extension.toLowerCase();
        if (!['.txt', '.pdf', '.docx'].includes(extension) || !file.storageObjectKey) {
          throw new CloudDocumentParserError(
            '云端仅支持 TXT、PDF 与 Word（.docx）文件。',
            'CLOUD_DOCUMENT_UNSUPPORTED',
          );
        }

        await this.markParsing(file.id);
        const content = await this.storage.read(file.storageObjectKey);
        const text = await this.extractText({
          name: file.originalFileName,
          extension,
          content,
        });
        const document = await this.persistParsedDocument({
          file,
          batchId: batch.id,
          sourceCollectionId: batch.sourceCollectionId,
          extension,
          text,
        });
        results.push(document);
      } catch (error) {
        await this.markFailed(file.id, error);
      }
    }

    await this.refreshBatchStatus(importBatchId);
    return results;
  }

  /**
   * 重新 OCR 只允许处理尚未产生候选证据的 PDF，避免覆盖人工审核依据。
   */
  async reparsePdfWithOcr(importBatchId: string, importBatchFileId: string) {
    const file = await this.prisma.importBatchFile.findFirst({
      where: { id: importBatchFileId, importBatchId },
      include: { sourceDocument: { include: { candidates: { select: { id: true }, take: 1 } } } },
    });
    if (!file || file.extension.toLowerCase() !== '.pdf' || !file.storageObjectKey) {
      throw new Error('只能重新解析当前批次中已导入的 PDF 文件。');
    }
    if (file.sourceDocument?.candidates.length) {
      throw new Error('该 PDF 已产生候选或来源证据，不能覆盖解析文本。请保留原文后重新导入。');
    }

    await this.markParsing(file.id);
    try {
      const text = normalizeText(
        await this.ocr.extractPdfText({
          name: file.originalFileName,
          content: await this.storage.read(file.storageObjectKey),
        }),
      );
      if (!text) {
        throw new CloudDocumentParserError('OCR 未得到可用来源文本。', 'CLOUD_TEXT_EMPTY');
      }

      const parsedTextHash = hash(text);
      const document = await this.prisma.$transaction(async (transaction) => {
        if (file.sourceDocument) {
          await transaction.sourceSegment.deleteMany({
            where: { sourceDocumentId: file.sourceDocument.id },
          });
          const updated = await transaction.sourceDocument.update({
            where: { id: file.sourceDocument.id },
            data: {
              parsedTextHash,
              parseStatus: 'PARSED',
              segments: {
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
              status: 'PARSED',
              normalizedTextHash: parsedTextHash,
              parseProgressCurrent: 1,
              parseProgressTotal: 1,
              skipReason: null,
            },
          });
          return updated;
        }

        return null;
      });

      if (!document) {
        throw new Error('此 PDF 尚未产生可替换的解析文档，请先执行一次解析。');
      }
      await this.refreshBatchStatus(importBatchId);
      return document;
    } catch (error) {
      await this.markFailed(file.id, error);
      throw error;
    }
  }

  private async extractText(input: { name: string; extension: string; content: Uint8Array }) {
    if (input.extension === '.txt') {
      try {
        const text = normalizeText(new TextDecoder('utf-8', { fatal: true }).decode(input.content));
        if (!text) {
          throw new CloudDocumentParserError('来源文本为空。', 'CLOUD_TEXT_EMPTY');
        }
        return text;
      } catch (error) {
        if (error instanceof CloudDocumentParserError) throw error;
        throw new CloudDocumentParserError(
          '文本文件不是有效的 UTF-8 编码。请转存为 UTF-8 后重试。',
          'CLOUD_TEXT_INVALID_UTF8',
        );
      }
    }

    const extracted = normalizeText(await convertDocumentToText(input));
    if (input.extension !== '.pdf' || !needsOcrFallback(extracted)) {
      if (!extracted) {
        throw new CloudDocumentParserError('文档中没有可用文字。', 'CLOUD_TEXT_EMPTY');
      }
      return extracted;
    }

    return normalizeText(await this.ocr.extractPdfText(input));
  }

  private async markParsing(fileId: string) {
    await this.prisma.importBatchFile.update({
      where: { id: fileId },
      data: { status: 'PARSING', skipReason: null, parseProgressCurrent: 0, parseProgressTotal: 1 },
    });
  }

  private async markFailed(fileId: string, error: unknown) {
    const skipReason =
      error instanceof CloudSourceOriginalStoreError
        ? 'CLOUD_STORAGE_READ_FAILED'
        : error instanceof CloudOcrError || error instanceof CloudDocumentParserError
          ? error.code
          : 'CLOUD_DOCUMENT_PARSE_FAILED';
    await this.prisma.importBatchFile.update({
      where: { id: fileId },
      data: { status: 'PARSE_FAILED', skipReason },
    });
  }

  private async persistParsedDocument(input: {
    file: CloudDocumentFile;
    batchId: string;
    sourceCollectionId: string;
    extension: string;
    text: string;
  }) {
    const parsedTextHash = hash(input.text);
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
              input.text,
              candidate.segments.map((segment) => segment.text).join('\n\n'),
            ) >= nearDuplicateThreshold,
        );

    return this.prisma.$transaction(async (transaction) => {
      const created = await transaction.sourceDocument.create({
        data: {
          sourceCollectionId: input.sourceCollectionId,
          importBatchId: input.batchId,
          importBatchFileId: input.file.id,
          title: input.file.originalFileName,
          documentType: documentTypeForExtension(input.extension),
          localFilePath: null,
          relativePath: input.file.relativePath,
          originalFileName: input.file.originalFileName,
          exactFileHash: input.file.exactFileHash,
          parsedTextHash,
          parseStatus: duplicate ? 'EXACT_DUPLICATE' : nearDuplicate ? 'NEAR_DUPLICATE' : 'PARSED',
          segments:
            duplicate || nearDuplicate
              ? undefined
              : {
                  create: toSegments(input.text).map((segment, sequence) => ({
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
        where: { id: input.file.id },
        data: {
          status: duplicate ? 'EXACT_DUPLICATE' : nearDuplicate ? 'NEAR_DUPLICATE' : 'PARSED',
          normalizedTextHash: parsedTextHash,
          parseProgressCurrent: 1,
          parseProgressTotal: 1,
        },
      });

      if (duplicate || nearDuplicate) {
        await transaction.sourceDocumentDuplicate.create({
          data: {
            fromDocumentId: created.id,
            toDocumentId: (duplicate ?? nearDuplicate)!.id,
            matchType: duplicate ? 'EXACT' : 'NEAR',
            similarity: duplicate
              ? 1
              : tokenJaccardSimilarity(
                  input.text,
                  nearDuplicate!.segments.map((segment) => segment.text).join('\n\n'),
                ),
          },
        });
      }

      return created;
    });
  }

  private async refreshBatchStatus(importBatchId: string) {
    const statuses = await this.prisma.importBatchFile.findMany({
      where: { importBatchId },
      select: { status: true },
    });
    const successful = statuses.filter((item) =>
      ['PARSED', 'EXACT_DUPLICATE', 'NEAR_DUPLICATE'].includes(item.status),
    ).length;
    await this.prisma.importBatch.update({
      where: { id: importBatchId },
      data: {
        status:
          successful === statuses.length
            ? 'COMPLETED'
            : successful > 0
              ? 'PARTIAL_SUCCESS'
              : 'FAILED',
      },
    });
  }
}
