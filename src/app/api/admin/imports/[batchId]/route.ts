import { NextResponse } from 'next/server';

import { CLOUD_ADMIN_USER_ID } from '@/lib/runtime-mode';
import { isCloudAdminFeatureEnabled } from '@/server/cloud-admin';
import { cloudTrialUnavailableResponse } from '@/server/cloud-trial-response';
import { createDatabaseClient } from '@/server/db/client';

type RouteContext = { params: Promise<{ batchId: string }> };

async function findAdminBatch(prisma: ReturnType<typeof createDatabaseClient>, batchId: string) {
  return prisma.importBatch.findFirst({
    where: { id: batchId, userId: CLOUD_ADMIN_USER_ID },
    include: {
      files: {
        orderBy: { relativePath: 'asc' },
        include: { sourceDocument: { include: { duplicatesFrom: { select: { toDocumentId: true }, take: 1 } } } },
      },
      sourceCollection: { select: { title: true } },
    },
  });
}

export async function GET(_request: Request, context: RouteContext) {
  if (!isCloudAdminFeatureEnabled()) return cloudTrialUnavailableResponse();

  const { batchId } = await context.params;
  const prisma = createDatabaseClient();
  try {
    const batch = await findAdminBatch(prisma, batchId);
    if (!batch) return NextResponse.json({ error: '导入批次不存在。' }, { status: 404 });

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
      { error: error instanceof Error ? error.message : '无法读取私有导入批次。' },
      { status: 500 },
    );
  } finally {
    await prisma.$disconnect();
  }
}

export async function POST(request: Request, context: RouteContext) {
  if (!isCloudAdminFeatureEnabled()) return cloudTrialUnavailableResponse();

  const { batchId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { forceOcrFileId?: string };
  const prisma = createDatabaseClient();
  try {
    const batch = await findAdminBatch(prisma, batchId);
    if (!batch) return NextResponse.json({ error: '导入批次不存在。' }, { status: 404 });

    const { CloudDocumentParserService } = await import(
      '@/server/imports/cloud-document-parser-service'
    );
    const parser = new CloudDocumentParserService(prisma);
    if (body.forceOcrFileId) {
      if (!batch.files.some((file) => file.id === body.forceOcrFileId)) {
        return NextResponse.json({ error: '该文件不属于当前导入批次。' }, { status: 404 });
      }
      const document = await parser.reparsePdfWithOcr(batchId, body.forceOcrFileId);
      return NextResponse.json({ reparsedDocumentId: document.id });
    }

    const documents = await parser.parseReadyFiles(batchId);
    return NextResponse.json({ parsedDocuments: documents.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '云端文档解析失败。' },
      { status: 400 },
    );
  } finally {
    await prisma.$disconnect();
  }
}
