import type { CandidateStatus, ExpressionUnitType, NodeType, PrismaClient } from '@prisma/client';

export type CandidateEvidenceInput = {
  sourceSegmentId: string;
  startOffset: number;
  endOffset: number;
};

export type CandidateNodeInput = {
  nodeType: NodeType;
  text: string;
};

export type CandidateExpressionUnitInput = {
  unitType: ExpressionUnitType;
  text: string;
  retrievalCue?: string;
};

export type CreateManualCandidateInput = {
  sourceDocumentId: string;
  title: string;
  coreIdea: string;
  flowText: string;
  evidence: CandidateEvidenceInput[];
  nodes: CandidateNodeInput[];
  expressionUnits?: CandidateExpressionUnitInput[];
  origin?: 'MANUAL' | 'AI_R1';
  isAiReconstructed?: boolean;
};

export type EditManualCandidateInput = Pick<
  CreateManualCandidateInput,
  'title' | 'coreIdea' | 'flowText' | 'nodes' | 'expressionUnits'
>;

export class CandidateReviewValidationError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'SOURCE_DOCUMENT_NOT_ELIGIBLE'
      | 'EVIDENCE_REQUIRED'
      | 'EVIDENCE_OUT_OF_RANGE'
      | 'CANDIDATE_CONTENT_REQUIRED'
      | 'CANDIDATE_NODE_REQUIRED'
      | 'INVALID_STATUS_TRANSITION'
      | 'CANDIDATE_ALREADY_CONFIRMED',
  ) {
    super(message);
    this.name = 'CandidateReviewValidationError';
  }
}

const transitions: Record<CandidateStatus, readonly CandidateStatus[]> = {
  PENDING_REVIEW: ['EDITING', 'APPROVED', 'IGNORED', 'FAILED'],
  EDITING: ['PENDING_REVIEW', 'APPROVED', 'IGNORED', 'FAILED'],
  APPROVED: [],
  IGNORED: [],
  CONVERTED: [],
  FAILED: [],
};

function required(value: string, message: string) {
  if (!value.trim()) {
    throw new CandidateReviewValidationError(message, 'CANDIDATE_CONTENT_REQUIRED');
  }
}

function candidatePayload(input: CreateManualCandidateInput) {
  candidateContent(input);

  if (input.evidence.length === 0) {
    throw new CandidateReviewValidationError('候选至少需要一条来源证据。', 'EVIDENCE_REQUIRED');
  }
}

function candidateContent(input: EditManualCandidateInput) {
  required(input.title, '候选标题不能为空。');
  required(input.coreIdea, '候选核心观点不能为空。');
  required(input.flowText, '候选语流不能为空。');

  if (input.nodes.length === 0 || input.nodes.some((node) => !node.text.trim())) {
    throw new CandidateReviewValidationError(
      '候选至少需要一条非空逻辑节点。',
      'CANDIDATE_NODE_REQUIRED',
    );
  }
}

function candidateMetadata(
  input: Pick<CreateManualCandidateInput, 'expressionUnits' | 'origin' | 'isAiReconstructed'>,
) {
  return JSON.stringify({
    origin: input.origin ?? 'MANUAL',
    isAiReconstructed: input.isAiReconstructed ?? false,
    expressionUnits: (input.expressionUnits ?? []).map((unit) => ({
      unitType: unit.unitType,
      text: unit.text.trim(),
      retrievalCue: unit.retrievalCue?.trim() || undefined,
    })),
  });
}

export class CandidateReviewService {
  constructor(private readonly prisma: PrismaClient) {}

  async createManualCandidate(input: CreateManualCandidateInput) {
    candidatePayload(input);

    const document = await this.prisma.sourceDocument.findUniqueOrThrow({
      where: { id: input.sourceDocumentId },
      include: { segments: true },
    });

    if (document.parseStatus !== 'PARSED') {
      throw new CandidateReviewValidationError(
        '只能从已解析且非重复的来源文档创建候选。',
        'SOURCE_DOCUMENT_NOT_ELIGIBLE',
      );
    }

    validateEvidence(input.evidence, document.segments);

    return this.prisma.candidateAsset.create({
      data: {
        sourceDocumentId: input.sourceDocumentId,
        title: input.title.trim(),
        coreIdea: input.coreIdea.trim(),
        flowText: input.flowText.trim(),
        modelDraftJson: candidateMetadata(input),
        nodes: {
          create: input.nodes.map((node, index) => ({
            sequence: index + 1,
            nodeType: node.nodeType,
            text: node.text.trim(),
          })),
        },
        evidence: {
          create: input.evidence.map((evidence) => ({
            sourceSegmentId: evidence.sourceSegmentId,
            startOffset: evidence.startOffset,
            endOffset: evidence.endOffset,
          })),
        },
      },
      include: { nodes: true, evidence: true },
    });
  }

  async transition(candidateId: string, target: CandidateStatus) {
    const candidate = await this.prisma.candidateAsset.findUniqueOrThrow({
      where: { id: candidateId },
    });

    if (!transitions[candidate.status].includes(target)) {
      throw new CandidateReviewValidationError(
        `候选当前状态 ${candidate.status} 不能变更为 ${target}。`,
        candidate.status === 'APPROVED'
          ? 'CANDIDATE_ALREADY_CONFIRMED'
          : 'INVALID_STATUS_TRANSITION',
      );
    }

    return this.prisma.candidateAsset.update({
      where: { id: candidateId },
      data: { status: target },
    });
  }

  async editManualCandidate(candidateId: string, input: EditManualCandidateInput) {
    candidateContent(input);
    const candidate = await this.prisma.candidateAsset.findUniqueOrThrow({
      where: { id: candidateId },
    });

    if (!['PENDING_REVIEW', 'EDITING'].includes(candidate.status)) {
      throw new CandidateReviewValidationError(
        '只有待审核或编辑中的候选可以修改。',
        candidate.status === 'APPROVED'
          ? 'CANDIDATE_ALREADY_CONFIRMED'
          : 'INVALID_STATUS_TRANSITION',
      );
    }

    return this.prisma.candidateAsset.update({
      where: { id: candidateId },
      data: {
        title: input.title.trim(),
        coreIdea: input.coreIdea.trim(),
        flowText: input.flowText.trim(),
        status: 'EDITING',
        modelDraftJson: candidateMetadata(input),
        nodes: {
          deleteMany: {},
          create: input.nodes.map((node, index) => ({
            sequence: index + 1,
            nodeType: node.nodeType,
            text: node.text.trim(),
          })),
        },
      },
    });
  }

  async confirmCandidate(candidateId: string, userId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const candidate = await transaction.candidateAsset.findUniqueOrThrow({
        where: { id: candidateId },
        include: {
          sourceDocument: true,
          nodes: { orderBy: { sequence: 'asc' } },
          evidence: { include: { sourceSegment: true } },
        },
      });

      if (!transitions[candidate.status].includes('APPROVED')) {
        throw new CandidateReviewValidationError(
          '该候选不能再次确认或已不处于可审核状态。',
          candidate.status === 'APPROVED'
            ? 'CANDIDATE_ALREADY_CONFIRMED'
            : 'INVALID_STATUS_TRANSITION',
        );
      }
      if (candidate.sourceDocument.parseStatus !== 'PARSED') {
        throw new CandidateReviewValidationError(
          '来源文档不再满足确认条件。',
          'SOURCE_DOCUMENT_NOT_ELIGIBLE',
        );
      }

      validateEvidence(
        candidate.evidence,
        candidate.evidence.map((item) => item.sourceSegment),
      );

      const sourceAsset = await transaction.sourceAsset.create({
        data: {
          userId,
          versions: {
            create: {
              version: 1,
              title: candidate.title,
              coreIdea: candidate.coreIdea,
              coreFlow: candidate.flowText,
              sourceType: 'MANUAL_REVIEW',
              isAiReconstructed: isAiReconstructedCandidate(candidate.modelDraftJson),
              status: 'CONFIRMED',
              confirmedAt: new Date(),
              nodes: {
                create: candidate.nodes.map((node) => ({
                  sequence: node.sequence,
                  nodeType: node.nodeType,
                  text: node.text,
                })),
              },
              expressionUnits: {
                create: expressionUnitsFromCandidate(candidate.modelDraftJson),
              },
            },
          },
        },
        include: { versions: true },
      });
      const sourceAssetVersion = sourceAsset.versions[0];

      return transaction.candidateAsset.update({
        where: { id: candidate.id },
        data: { status: 'APPROVED', sourceAssetVersionId: sourceAssetVersion.id },
        include: { sourceAssetVersion: true },
      });
    });
  }
}

function validateEvidence(
  evidence: CandidateEvidenceInput[],
  segments: Array<{ id: string; text: string }>,
) {
  const segmentsById = new Map(segments.map((segment) => [segment.id, segment]));

  for (const item of evidence) {
    const segment = segmentsById.get(item.sourceSegmentId);
    if (
      !segment ||
      item.startOffset < 0 ||
      item.endOffset <= item.startOffset ||
      item.endOffset > segment.text.length
    ) {
      throw new CandidateReviewValidationError(
        '来源证据范围必须位于对应段落的有效文本范围内。',
        'EVIDENCE_OUT_OF_RANGE',
      );
    }
  }
}

function expressionUnitsFromCandidate(modelDraftJson: string | null) {
  try {
    const parsed = JSON.parse(modelDraftJson ?? '{}') as {
      expressionUnits?: CandidateExpressionUnitInput[];
    };

    return (parsed.expressionUnits ?? [])
      .filter((unit) => unit.text.trim())
      .map((unit) => ({
        unitType: unit.unitType,
        text: unit.text.trim(),
        retrievalCue: unit.retrievalCue?.trim() || undefined,
      }));
  } catch {
    return [];
  }
}

function isAiReconstructedCandidate(modelDraftJson: string | null) {
  try {
    const parsed = JSON.parse(modelDraftJson ?? '{}') as { isAiReconstructed?: unknown };
    return parsed.isAiReconstructed === true;
  } catch {
    return false;
  }
}
