import { NextResponse } from 'next/server';

import { isCloudImportRuntime, isLocalOnlyFeatureBlocked } from '@/lib/runtime-mode';
import { cloudTrialUnavailableResponse } from '@/server/cloud-trial-response';
import { createDatabaseClient } from '@/server/db/client';
import { CloudSourceOriginalStoreError } from '@/server/storage/cloud-source-original-store';

type IntakeRequest = {
  collectionTitle?: string;
  text?: string;
  files?: Array<{
    relativePath?: string;
    originalFileName?: string;
    extension?: string;
    contentBase64?: string;
  }>;
};

export async function POST(request: Request) {
  if (isLocalOnlyFeatureBlocked()) return cloudTrialUnavailableResponse();

  const body = (await request.json().catch(() => null)) as IntakeRequest | null;
  if (!body) {
    return NextResponse.json({ error: '导入请求格式无效。' }, { status: 400 });
  }
  const text = body.text?.trim();
  const uploadedFiles = body.files ?? [];

  if (!body.collectionTitle?.trim() || (!text && uploadedFiles.length === 0)) {
    return NextResponse.json({ error: '课程集合名称和来源内容不能为空。' }, { status: 400 });
  }

  const prisma = createDatabaseClient();

  try {
    const service = isCloudImportRuntime()
      ? new (await import('@/server/imports/cloud-import-intake-service')).CloudImportIntakeService(
          prisma,
        )
      : new (await import('@/server/imports/import-intake-service')).ImportIntakeService(prisma);
    const result = await service.createBatch({
      userId: 'local-user',
      collectionTitle: body.collectionTitle,
      sourceType: isCloudImportRuntime()
        ? text
          ? 'CLOUD_PASTED_TEXT'
          : 'CLOUD_DOCUMENT_FILES'
        : text
          ? 'PASTED_TEXT'
          : 'LOCAL_FILES',
      originalName: text ? 'pasted-text.txt' : 'local-files',
      files: [
        ...(text
          ? [
              {
                relativePath: 'pasted-text.txt',
                originalFileName: 'pasted-text.txt',
                extension: '.txt',
                content: new TextEncoder().encode(text),
              },
            ]
          : []),
        ...uploadedFiles.map((file) => ({
          relativePath: file.relativePath ?? file.originalFileName ?? '',
          originalFileName: file.originalFileName ?? '',
          extension: file.extension ?? '',
          content: new Uint8Array(Buffer.from(file.contentBase64 ?? '', 'base64')),
        })),
      ],
    });

    return NextResponse.json({
      batchId: result.batch.id,
      status: result.batch.status,
      files: result.batch.files.map((file) => ({
        relativePath: file.relativePath,
        status: file.status,
        skipReason: file.skipReason,
      })),
    });
  } catch (error) {
    const status = error instanceof CloudSourceOriginalStoreError ? 503 : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '导入批次创建失败。' },
      { status },
    );
  } finally {
    await prisma.$disconnect();
  }
}
