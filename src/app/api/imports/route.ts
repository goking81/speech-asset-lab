import { NextResponse } from 'next/server';

import { ImportIntakeService } from '@/server/imports/import-intake-service';
import { createDatabaseClient } from '@/server/db/client';

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
  const body = (await request.json()) as IntakeRequest;
  const text = body.text?.trim();
  const uploadedFiles = body.files ?? [];

  if (!body.collectionTitle?.trim() || (!text && uploadedFiles.length === 0)) {
    return NextResponse.json({ error: '课程集合名称和来源内容不能为空。' }, { status: 400 });
  }

  const prisma = createDatabaseClient();

  try {
    const service = new ImportIntakeService(prisma);
    const result = await service.createBatch({
      userId: 'local-user',
      collectionTitle: body.collectionTitle,
      sourceType: text ? 'PASTED_TEXT' : 'LOCAL_FILES',
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
  } finally {
    await prisma.$disconnect();
  }
}
