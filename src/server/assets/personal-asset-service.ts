import { createHash } from 'node:crypto';

import type { NodeType, PrismaClient } from '@prisma/client';

export type CreatePersonalAssetVersionInput = {
  sourceAssetVersionId: string;
  userId: string;
  triggerName: string;
  coreIdea: string;
  coreFlow: string;
  scenario?: string;
};

export class PersonalAssetValidationError extends Error {
  constructor(
    message: string,
    readonly code: 'SOURCE_VERSION_NOT_CONFIRMED' | 'PERSONAL_CONTENT_REQUIRED',
  ) {
    super(message);
    this.name = 'PersonalAssetValidationError';
  }
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export class PersonalAssetService {
  constructor(private readonly prisma: PrismaClient) {}

  async createConfirmedVersion(input: CreatePersonalAssetVersionInput) {
    if (!input.triggerName.trim() || !input.coreIdea.trim() || !input.coreFlow.trim()) {
      throw new PersonalAssetValidationError(
        '个人资产的名称、核心观点和语流不能为空。',
        'PERSONAL_CONTENT_REQUIRED',
      );
    }

    return this.prisma.$transaction(async (transaction) => {
      const sourceVersion = await transaction.sourceAssetVersion.findUniqueOrThrow({
        where: { id: input.sourceAssetVersionId },
        include: { sourceAsset: true, nodes: { orderBy: { sequence: 'asc' } } },
      });
      if (sourceVersion.status !== 'CONFIRMED') {
        throw new PersonalAssetValidationError(
          '只能从已确认的来源资产版本创建个人资产。',
          'SOURCE_VERSION_NOT_CONFIRMED',
        );
      }

      const flowStructure = deriveFlowStructure(input.coreFlow, sourceVersion.nodes);
      const personalAsset = await transaction.personalAsset.upsert({
        where: {
          userId_sourceAssetId: {
            userId: input.userId,
            sourceAssetId: sourceVersion.sourceAssetId,
          },
        },
        update: {},
        create: { userId: input.userId, sourceAssetId: sourceVersion.sourceAssetId },
        include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
      });
      const nextVersion = (personalAsset.versions[0]?.version ?? 0) + 1;

      const personalVersion = await transaction.personalAssetVersion.create({
        data: {
          personalAssetId: personalAsset.id,
          version: nextVersion,
          triggerName: input.triggerName.trim(),
          coreIdea: input.coreIdea.trim(),
          coreFlow: input.coreFlow.trim(),
          scenario: input.scenario?.trim() || null,
          status: 'CONFIRMED',
          confirmedAt: new Date(),
          nodes: {
            create: flowStructure.nodes.map((node) => ({
              sequence: node.sequence,
              nodeType: node.nodeType,
              text: node.text,
              sourceMaps: {
                create: node.sourceNodeIds.map((sourceAssetNodeId) => ({
                  sourceAssetNodeId,
                  mapType: node.mapType,
                })),
              },
            })),
          },
        },
        include: { nodes: { select: { id: true, sequence: true } } },
      });
      const nodeIds = new Map(personalVersion.nodes.map((node) => [node.sequence, node.id]));

      await transaction.assetFlowSpan.createMany({
        data: flowStructure.spans.map((span) => ({
          personalAssetVersionId: personalVersion.id,
          personalAssetNodeId: nodeIds.get(span.sequence)!,
          sequence: span.sequence,
          startOffset: span.startOffset,
          endOffset: span.endOffset,
          textHash: hash(input.coreFlow.trim()),
        })),
      });

      // 首次确认个人资产时建立本地状态；阶段和激活资格不由 AI 写入。
      const currentState = await transaction.userAssetState.findUnique({
        where: { personalAssetId: personalAsset.id },
        select: { id: true },
      });
      if (!currentState) {
        const [user, activeAssetCount] = await Promise.all([
          transaction.user.findUniqueOrThrow({
            where: { id: input.userId },
            select: { activeAssetLimit: true },
          }),
          transaction.userAssetState.count({ where: { userId: input.userId, isActive: true } }),
        ]);
        await transaction.userAssetState.create({
          data: {
            userId: input.userId,
            personalAssetId: personalAsset.id,
            isActive: activeAssetCount < user.activeAssetLimit,
          },
        });
      }

      return personalVersion;
    });
  }
}

type PersonalFlowNode = {
  sequence: number;
  nodeType: NodeType;
  text: string;
  sourceNodeIds: string[];
  mapType: 'RETAINED' | 'ADAPTED';
};

type PersonalFlowStructure = {
  nodes: PersonalFlowNode[];
  spans: Array<{ sequence: number; startOffset: number; endOffset: number }>;
};

/**
 * 保留原文时维持逐节点映射；用户手动改写时创建一个完整的个人节点，
 * 同时将其追溯到全部来源节点，避免因编辑而失去来源证据。
 */
function deriveFlowStructure(
  flow: string,
  nodes: Array<{ id: string; sequence: number; nodeType: NodeType; text: string }>,
): PersonalFlowStructure {
  let cursor = 0;
  const retainedSpans = nodes.map((node) => {
    const startOffset = flow.indexOf(node.text, cursor);
    if (startOffset < 0) return null;
    const endOffset = startOffset + node.text.length;
    cursor = endOffset;
    return { sequence: node.sequence, startOffset, endOffset };
  });

  if (retainedSpans.every((span) => span !== null)) {
    return {
      nodes: nodes.map((node) => ({
        sequence: node.sequence,
        nodeType: node.nodeType,
        text: node.text,
        sourceNodeIds: [node.id],
        mapType: 'RETAINED',
      })),
      spans: retainedSpans,
    };
  }

  return {
    nodes: [
      {
        sequence: 1,
        nodeType: 'OTHER',
        text: flow.trim(),
        sourceNodeIds: nodes.map((node) => node.id),
        mapType: 'ADAPTED',
      },
    ],
    spans: [{ sequence: 1, startOffset: 0, endOffset: flow.trim().length }],
  };
}
