import { NextResponse } from 'next/server';

import { isCloudImportRuntime, isCloudTrialRuntime } from '@/lib/runtime-mode';
import { cloudTrialUnavailableResponse } from '@/server/cloud-trial-response';
import { createDatabaseClient } from '@/server/db/client';

type RouteContext = { params: Promise<{ batchId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  if (isCloudTrialRuntime()) return cloudTrialUnavailableResponse();

  const { batchId } = await context.params;
  const prisma = createDatabaseClient();

  try {
    const batch = await prisma.importBatch.findUnique({
      where: { id: batchId },
      include: {
        files: {
          orderBy: { relativePath: 'asc' },
          include: {
            sourceDocument: {
              include: { duplicatesFrom: { select: { toDocumentId: true }, take: 1 } },
            },
          },
        },
        sourceCollection: { select: { title: true } },
      },
    });

    if (!batch) {
      return NextResponse.json({ error: '导入批次不存在。' }, { status: 404 });
    }

    return NextResponse.json({
      id: batch.id,
      status: batch.status,
      collectionTitle: batch.sourceCollection?.title ?? '未命名集合',
      files: batch.files.map((file) => {
        const document = file.sourceDocument;
        return {
          id: file.id,
          relativePath: file.relativePath,
          extension: file.extension,
          status: file.status,
          skipReason: file.skipReason,
          parseStatus: document?.parseStatus ?? 'PENDING',
          parseProgressCurrent: file.parseProgressCurrent,
          parseProgressTotal: file.parseProgressTotal,
          aiSourceDocumentId:
            document?.parseStatus === 'PARSED'
              ? document.id
              : (document?.duplicatesFrom[0]?.toDocumentId ?? null),
          aiSourceDocumentTitle:
            document?.parseStatus === 'PARSED'
              ? document.title
              : document?.duplicatesFrom[0]?.toDocumentId
                ? file.originalFileName
                : null,
        };
      }),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '无法读取导入批次。' },
      { status: 500 },
    );
  } finally {
    await prisma.$disconnect();
  }
}

export async function POST(request: Request, context: RouteContext) {
  if (isCloudTrialRuntime()) return cloudTrialUnavailableResponse();

  const { batchId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { forceOcrFileId?: string };
  const prisma = createDatabaseClient();

  try {
    if (isCloudImportRuntime()) {
      const parser = new (
        await import('@/server/imports/cloud-document-parser-service')
      ).CloudDocumentParserService(prisma);
      if (body.forceOcrFileId) {
        const document = await parser.reparsePdfWithOcr(batchId, body.forceOcrFileId);
        return NextResponse.json({ reparsedDocumentId: document.id });
      }

      const documents = await parser.parseReadyFiles(batchId);
      return NextResponse.json({ parsedDocuments: documents.length });
    }

    const parser = new (await import('@/server/imports/text-parser-service')).TextParserService(
      prisma,
    );
    if (body.forceOcrFileId) {
      const document = await parser.reparsePdfWithOcr(batchId, body.forceOcrFileId);
      return NextResponse.json({ reparsedDocumentId: document.id });
    }

    const documents = await parser.parseReadyTextFiles(batchId);

    return NextResponse.json({ parsedDocuments: documents.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '本地 PDF 解析失败。' },
      { status: 400 },
    );
  } finally {
    await prisma.$disconnect();
  }
}
