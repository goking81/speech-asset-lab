import { NextResponse } from 'next/server';

import { DraftTaskService } from '@/server/ai/draft-task-service';
import { DraftTaskProcessor } from '@/server/ai/draft-task-processor';
import { DeepSeekAiProvider } from '@/ai/provider';
import { createDatabaseClient } from '@/server/db/client';

export async function POST(request: Request, context: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await context.params;
  const body = (await request.json()) as { role?: 'R2' | 'R3' };
  if (body.role !== 'R2' && body.role !== 'R3')
    return NextResponse.json({ error: '仅支持 R2 或 R3 草稿。' }, { status: 400 });
  const prisma = createDatabaseClient();
  try {
    const asset = await prisma.sourceAsset.findUnique({
      where: { id: assetId },
      include: {
        versions: { where: { status: 'CONFIRMED' }, orderBy: { version: 'desc' }, take: 1 },
        personalAssets: {
          where: { userId: 'local-user' },
          include: {
            versions: { where: { status: 'CONFIRMED' }, orderBy: { version: 'desc' }, take: 1 },
          },
        },
      },
    });
    const version = body.role === 'R2' ? asset?.versions[0] : asset?.personalAssets[0]?.versions[0];
    if (!version)
      return NextResponse.json({ error: '缺少可用于草稿的已确认版本。' }, { status: 400 });
    const task = await new DraftTaskService(prisma).queue(body.role, version.id, version.version);
    const processed = await new DraftTaskProcessor(prisma, new DeepSeekAiProvider()).process(
      task.id,
    );
    return NextResponse.json({
      status: processed.status,
      taskId: task.id,
      resultReference: processed.resultReference,
    });
  } finally {
    await prisma.$disconnect();
  }
}
