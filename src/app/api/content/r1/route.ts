import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';

import { DeepSeekAiProvider } from '@/ai/provider';
import { R1DraftProcessor } from '@/server/ai/r1-draft-processor';
import { ensureLocalR1Release } from '@/server/ai/r1-release-service';
import { createDatabaseClient } from '@/server/db/client';
import { syncEnvironmentProviderConfig } from '@/server/ai/provider-config-service';
import { isCloudTrialRuntime } from '@/lib/runtime-mode';
import { cloudTrialUnavailableResponse } from '@/server/cloud-trial-response';

export async function POST(request: Request) {
  if (isCloudTrialRuntime()) return cloudTrialUnavailableResponse();

  const body = (await request.json()) as { sourceDocumentId?: string };
  const prisma = createDatabaseClient();
  try {
    const document = await prisma.sourceDocument.findUnique({
      where: { id: body.sourceDocumentId ?? '' },
      select: { id: true, parseStatus: true, parsedTextHash: true },
    });
    if (!document || document.parseStatus !== 'PARSED') {
      return NextResponse.json(
        { error: '只能为已解析且非重复的来源文档请求 R1 草稿。' },
        { status: 400 },
      );
    }
    const bundle = await ensureLocalR1Release(prisma);
    await syncEnvironmentProviderConfig(prisma);
    const provider = await prisma.aiProviderConfig.findFirst({
      where: { userId: 'local-user', isEnabled: true },
    });
    if (!provider) {
      return NextResponse.json({ status: 'NOT_CONFIGURED', reason: 'AI_PROVIDER_NOT_CONFIGURED' });
    }
    const inputFingerprint = createHash('sha256')
      .update(`r1-asset-selection-v6:${document.id}:${document.parsedTextHash ?? ''}`)
      .digest('hex');
    const task = await prisma.aiTask.upsert({
      where: {
        role_entityId_entityVersion_releaseBundleId_inputFingerprint: {
          role: 'R1',
          entityId: document.id,
          entityVersion: 1,
          releaseBundleId: bundle.id,
          inputFingerprint,
        },
      },
      update: {},
      create: {
        releaseBundleId: bundle.id,
        role: 'R1',
        entityType: 'SourceDocument',
        entityId: document.id,
        entityVersion: 1,
        inputFingerprint,
      },
    });
    if (task.status === 'AWAITING_USER_CONFIRMATION') {
      return NextResponse.json({
        status: task.status,
        taskId: task.id,
        reused: true,
        resultReference: task.resultReference,
      });
    }
    const processed = await new R1DraftProcessor(prisma, new DeepSeekAiProvider()).process(task.id);
    return NextResponse.json({
      status: processed.task.status,
      taskId: task.id,
      candidateCount: processed.candidates.length,
      rejectedCount: processed.rejectedCount,
      resultReference: processed.task.resultReference,
    });
  } finally {
    await prisma.$disconnect();
  }
}
