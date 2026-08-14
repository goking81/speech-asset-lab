import { NextResponse } from 'next/server';

import {
  CandidateReviewService,
  CandidateReviewValidationError,
} from '@/server/content/candidate-review-service';
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

export async function GET() {
  const prisma = createDatabaseClient();

  try {
    const [documents, candidates] = await Promise.all([
      prisma.sourceDocument.findMany({
        where: { parseStatus: 'PARSED' },
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
  } finally {
    await prisma.$disconnect();
  }
}

export async function POST(request: Request) {
  const prisma = createDatabaseClient();

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const review = new CandidateReviewService(prisma);

    if (body.action === 'CREATE') {
      const nodeType = isNodeType(body.nodeType) ? body.nodeType : 'OTHER';
      const expressionUnits = Array.isArray(body.expressionUnits)
        ? body.expressionUnits.flatMap((unit) => {
            if (!unit || typeof unit !== 'object') {
              return [];
            }
            const value = unit as Record<string, unknown>;
            const unitType = isExpressionUnitType(value.unitType) ? value.unitType : 'PHRASE_CHUNK';
            return typeof value.text === 'string'
              ? [{ unitType, text: value.text, retrievalCue: value.retrievalCue }]
              : [];
          })
        : [];
      const candidate = await review.createManualCandidate({
        sourceDocumentId: asString(body.sourceDocumentId),
        title: asString(body.title),
        coreIdea: asString(body.coreIdea),
        flowText: asString(body.flowText),
        nodes: [{ nodeType, text: asString(body.nodeText) }],
        expressionUnits: expressionUnits.map((unit) => ({
          unitType: unit.unitType,
          text: unit.text,
          retrievalCue: typeof unit.retrievalCue === 'string' ? unit.retrievalCue : undefined,
        })),
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

    if (body.action === 'UPDATE') {
      const candidate = await review.editManualCandidate(asString(body.candidateId), {
        title: asString(body.title),
        coreIdea: asString(body.coreIdea),
        flowText: asString(body.flowText),
        nodes: [
          {
            nodeType: isNodeType(body.nodeType) ? body.nodeType : 'OTHER',
            text: asString(body.nodeText),
          },
        ],
        expressionUnits: Array.isArray(body.expressionUnits)
          ? body.expressionUnits.flatMap((unit) => {
              if (!unit || typeof unit !== 'object') {
                return [];
              }
              const value = unit as Record<string, unknown>;
              return typeof value.text === 'string'
                ? [
                    {
                      unitType: isExpressionUnitType(value.unitType)
                        ? value.unitType
                        : 'PHRASE_CHUNK',
                      text: value.text,
                      retrievalCue:
                        typeof value.retrievalCue === 'string' ? value.retrievalCue : undefined,
                    },
                  ]
                : [];
            })
          : [],
      });
      return NextResponse.json({ candidate });
    }

    if (body.action === 'APPROVE') {
      const candidate = await review.confirmCandidate(asString(body.candidateId), 'local-user');
      return NextResponse.json({ candidate });
    }

    if (body.action === 'TRANSITION' && isCandidateTransitionStatus(body.status)) {
      const candidate = await review.transition(asString(body.candidateId), body.status);
      return NextResponse.json({ candidate });
    }

    return NextResponse.json({ error: '不支持的候选审核操作。' }, { status: 400 });
  } catch (error) {
    const message =
      error instanceof CandidateReviewValidationError || error instanceof Error
        ? error.message
        : '候选审核操作失败。';
    return NextResponse.json({ error: message }, { status: 400 });
  } finally {
    await prisma.$disconnect();
  }
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
