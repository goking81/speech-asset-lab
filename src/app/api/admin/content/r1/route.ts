import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';

import { DeepSeekAiProvider } from '@/ai/provider';
import { CLOUD_ADMIN_USER_ID } from '@/lib/runtime-mode';
import { ensureCloudAdminUser, isCloudAdminFeatureEnabled } from '@/server/cloud-admin';
import { R1DraftProcessor } from '@/server/ai/r1-draft-processor';
import { ensureLocalR1Release } from '@/server/ai/r1-release-service';
import { syncEnvironmentProviderConfig } from '@/server/ai/provider-config-service';
import { cloudTrialUnavailableResponse } from '@/server/cloud-trial-response';
import { createDatabaseClient } from '@/server/db/client';

/** 受 Access 保护的管理员 R1 筛选：只读取管理员自己的已解析来源文档。 */
export async function POST(request: Request) {
  if (!isCloudAdminFeatureEnabled()) return cloudTrialUnavailableResponse();

  const body = (await request.json().catch(() => null)) as { sourceDocumentId?: string } | null;
  if (!body?.sourceDocumentId) {
    return NextResponse.json({ error: '请选择已解析的来源文档。' }, { status: 400 });
  }

  const prisma = createDatabaseClient();
  try {
    await ensureCloudAdminUser(prisma);
    const document = await prisma.sourceDocument.findFirst({
      where: {
        id: body.sourceDocumentId,
        parseStatus: 'PARSED',
        sourceCollection: { userId: CLOUD_ADMIN_USER_ID },
      },
      select: { id: true, parsedTextHash: true },
    });
    if (!document) {
      return NextResponse.json(
        { error: '只能为管理员已解析且非重复的来源文档请求候选草稿。' },
        { status: 404 },
      );
    }

    const bundle = await ensureLocalR1Release(prisma);
    await syncEnvironmentProviderConfig(prisma, CLOUD_ADMIN_USER_ID);
    const provider = await prisma.aiProviderConfig.findFirst({
      where: { userId: CLOUD_ADMIN_USER_ID, isEnabled: true },
      select: { id: true },
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
      taskId: processed.task.id,
      candidateCount: processed.candidates.length,
      rejectedCount: processed.rejectedCount,
      resultReference: processed.task.resultReference,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'AI 候选草稿生成失败。' },
      { status: 500 },
    );
  } finally {
    await prisma.$disconnect();
  }
}
