import { NextResponse } from 'next/server';

import {
  CandidateReviewService,
  CandidateReviewValidationError,
} from '@/server/content/candidate-review-service';
import { CLOUD_ADMIN_USER_ID } from '@/lib/runtime-mode';
import { ensureCloudAdminUser, isCloudAdminFeatureEnabled } from '@/server/cloud-admin';
import { cloudTrialUnavailableResponse } from '@/server/cloud-trial-response';
import { createDatabaseClient } from '@/server/db/client';

const nodeTypes = [
  'CONTEXT',
  'CLAIM',
  'REASON',
  'EXPLANATION',
  'EXAMPLE',
  'CONCLUSION',
  'OTHER',
] as const;
const expressionUnitTypes = [
  'PHRASE_CHUNK',
  'SENTENCE_PATTERN',
  'CONNECTOR',
  'LEXICAL_ANCHOR',
] as const;
const candidateStatuses = ['EDITING', 'IGNORED'] as const;

const adminDocumentWhere = { sourceCollection: { userId: CLOUD_ADMIN_USER_ID } };

/** 仅返回管理员拥有的来源段落及其候选草稿。 */
export async function GET() {
  if (!isCloudAdminFeatureEnabled()) return cloudTrialUnavailableResponse();

  const prisma = createDatabaseClient();
  try {
    await ensureCloudAdminUser(prisma);
    const [documents, candidates] = await Promise.all([
      prisma.sourceDocument.findMany({
        where: { parseStatus: 'PARSED', ...adminDocumentWhere },
        select: {
          id: true,
          title: true,
          segments: {
            select: { id: true, sequence: true, text: true },
            orderBy: { sequence: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.candidateAsset.findMany({
        where: {
          status: { in: ['PENDING_REVIEW', 'EDITING'] },
          sourceAssetVersionId: null,
          sourceDocument: adminDocumentWhere,
        },
        select: {
          id: true,
          title: true,
          coreIdea: true,
          flowText: true,
          status: true,
          modelDraftJson: true,
          sourceDocument: { select: { id: true, title: true } },
          evidence: {
            include: { sourceSegment: { select: { id: true, sequence: true, text: true } } },
          },
          nodes: { select: { text: true }, orderBy: { sequence: 'asc' } },
          sourceAssetVersion: { select: { id: true, version: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    return NextResponse.json({ documents, candidates });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '无法读取管理员候选审核数据。' },
      { status: 500 },
    );
  } finally {
    await prisma.$disconnect();
  }
}

export async function POST(request: Request) {
  if (!isCloudAdminFeatureEnabled()) return cloudTrialUnavailableResponse();

  const prisma = createDatabaseClient();
  try {
    await ensureCloudAdminUser(prisma);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: '候选审核请求格式无效。' }, { status: 400 });
    const review = new CandidateReviewService(prisma);

    if (body.action === 'CREATE') {
      const documentId = asString(body.sourceDocumentId);
      await assertAdminDocument(prisma, documentId);
      const nodeType = isNodeType(body.nodeType) ? body.nodeType : 'OTHER';
      const expressionUnits = expressionUnitInput(body.expressionUnits);
      const candidate = await review.createManualCandidate({
        sourceDocumentId: documentId,
        title: asString(body.title),
        coreIdea: asString(body.coreIdea),
        flowText: asString(body.flowText),
        nodes: [{ nodeType, text: asString(body.nodeText) }],
        expressionUnits,
        evidence: [
          {
            sourceSegmentId: asString(body.sourceSegmentId),
            startOffset: asNumber(body.startOffset),
            endOffset: asNumber(body.endOffset),
          },
        ],
      });
      return NextResponse.json({ candidate });
    }

    const candidateId = asString(body.candidateId);
    await assertAdminCandidate(prisma, candidateId);

    if (body.action === 'UPDATE') {
      const candidate = await review.editManualCandidate(candidateId, {
        title: asString(body.title),
        coreIdea: asString(body.coreIdea),
        flowText: asString(body.flowText),
        nodes: [
          {
            nodeType: isNodeType(body.nodeType) ? body.nodeType : 'OTHER',
            text: asString(body.nodeText),
          },
        ],
        expressionUnits: expressionUnitInput(body.expressionUnits),
      });
      return NextResponse.json({ candidate });
    }

    if (body.action === 'APPROVE') {
      const candidate = await review.confirmCandidate(candidateId, CLOUD_ADMIN_USER_ID);
      return NextResponse.json({ candidate });
    }

    if (body.action === 'TRANSITION' && isCandidateTransitionStatus(body.status)) {
      const candidate = await review.transition(candidateId, body.status);
      return NextResponse.json({ candidate });
    }

    return NextResponse.json({ error: '不支持的候选审核操作。' }, { status: 400 });
  } catch (error) {
    const message =
      error instanceof CandidateReviewValidationError || error instanceof Error
        ? error.message
        : '候选审核操作失败。';
    const status = message === '该来源文档不存在或不属于当前管理员。' ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  } finally {
    await prisma.$disconnect();
  }
}

async function assertAdminDocument(prisma: ReturnType<typeof createDatabaseClient>, id: string) {
  const document = await prisma.sourceDocument.findFirst({
    where: { id, ...adminDocumentWhere },
    select: { id: true },
  });
  if (!document) throw new Error('该来源文档不存在或不属于当前管理员。');
}

async function assertAdminCandidate(prisma: ReturnType<typeof createDatabaseClient>, id: string) {
  const candidate = await prisma.candidateAsset.findFirst({
    where: { id, sourceDocument: adminDocumentWhere },
    select: { id: true },
  });
  if (!candidate) throw new Error('该候选不存在或不属于当前管理员。');
}

function expressionUnitInput(value: unknown) {
  return Array.isArray(value)
    ? value.flatMap((unit) => {
        if (!unit || typeof unit !== 'object') return [];
        const input = unit as Record<string, unknown>;
        return typeof input.text === 'string'
          ? [
              {
                unitType: isExpressionUnitType(input.unitType)
                  ? input.unitType
                  : 'PHRASE_CHUNK',
                text: input.text,
                retrievalCue: typeof input.retrievalCue === 'string' ? input.retrievalCue : undefined,
              },
            ]
          : [];
      })
    : [];
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : -1;
}

function isNodeType(value: unknown): value is (typeof nodeTypes)[number] {
  return typeof value === 'string' && nodeTypes.includes(value as (typeof nodeTypes)[number]);
}

function isExpressionUnitType(value: unknown): value is (typeof expressionUnitTypes)[number] {
  return (
    typeof value === 'string' &&
    expressionUnitTypes.includes(value as (typeof expressionUnitTypes)[number])
  );
}

function isCandidateTransitionStatus(value: unknown): value is (typeof candidateStatuses)[number] {
  return typeof value === 'string' && candidateStatuses.includes(value as 'EDITING' | 'IGNORED');
}
