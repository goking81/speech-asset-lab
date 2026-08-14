import type { NodeType, PrismaClient } from '@prisma/client';

import type { AiProviderAdapter } from '@/ai/provider';
import { CandidateReviewService } from '@/server/content/candidate-review-service';

type R1SourceSegment = { id: string; sequence: number; text: string };

type R1Candidate = {
  title: string;
  coreIdea: string;
  flowText: string;
  nodes: Array<{ nodeType: NodeType; text: string }>;
  evidence: Array<{ sourceSegmentId: string; startOffset: number; endOffset: number }>;
};

export type R1SelectionResult = {
  candidates: R1Candidate[];
  rejectedCount: number;
  rejectionReasons: string[];
};

const nodeTypes = [
  'CONTEXT',
  'CLAIM',
  'REASON',
  'EXPLANATION',
  'EXAMPLE',
  'CONTRAST',
  'CONDITION',
  'ACTION',
  'RESULT',
  'CONCLUSION',
  'TRANSITION',
  'OTHER',
] as const satisfies readonly NodeType[];

const r1Instruction = `
你是 R1“来源语流候选筛选器”。你的任务不是总结文章、翻译播客或介绍嘉宾；而是从原始文本中筛选可用于英语训练的完整英文语流候选。

只返回 JSON：
{"candidates":[{"title":"","coreIdea":"","flowText":"","nodes":[{"type":"CLAIM","text":""}],"evidence":[{"segment":1}]}]}

硬性规则：
1. candidates 可以是空数组。没有足够完整、自然、可复用的英文语流时，必须返回 []，不得为了输出而生成总结或改写。
2. 每项候选必须是来源中连续、完整、自然的英文表达，建议 12—110 个英文词；flowText 必须逐字复制来源，不能概括、翻译、润色或补写。
3. 排除播客标题、节目/嘉宾介绍、片头片尾、说话人标签、中文摘要/翻译、OCR 乱码、孤立残句和元信息。
4. evidence 只能有一条，填写包含这些英文句子的来源段落 segment 编号即可；应用会从每个 node 文本自动计算精确来源范围，不能编造范围。
5. title 和 coreIdea 只是候选草稿的简短中文说明；nodes 必须按原有顺序覆盖 flowText 的全部英文内容，node 的 text 也必须逐字来自来源段落，type 只能使用给定逻辑类型。
6. 最多给出 5 项。不得创建或发布资产；所有输出只供用户逐项审核。

来源段落如下：
`;

/**
 * R1 只接受与来源段落有足够英文词元重合的候选，防止摘要、翻译或幻觉进入候选审核区。
 * 对 OCR 错字导致的非逐字一致候选，保留完整原始段落证据并作为 AI 重建草稿处理。
 */
export function selectUsableR1Candidates(
  payload: unknown,
  segments: R1SourceSegment[],
): R1SelectionResult {
  const rawCandidates =
    typeof payload === 'object' &&
    payload !== null &&
    Array.isArray((payload as { candidates?: unknown }).candidates)
      ? (payload as { candidates: unknown[] }).candidates
      : null;
  if (!rawCandidates) throw new Error('R1 草稿缺少 candidates 数组。');

  const candidates: R1Candidate[] = [];
  const rejectionReasons: string[] = [];
  for (const raw of rawCandidates.slice(0, 5)) {
    try {
      candidates.push(validateCandidate(raw, segments));
    } catch (error) {
      rejectionReasons.push(error instanceof Error ? error.message : '候选结构无效。');
    }
  }
  return { candidates, rejectedCount: rejectionReasons.length, rejectionReasons };
}

export class R1DraftProcessor {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly provider: AiProviderAdapter,
  ) {}

  async process(taskId: string) {
    const task = await this.prisma.aiTask.findUniqueOrThrow({
      where: { id: taskId },
      include: { releaseBundle: true },
    });
    if (task.role !== 'R1' || task.entityType !== 'SourceDocument') {
      throw new Error('不是 R1 来源文档任务。');
    }
    const document = await this.prisma.sourceDocument.findUniqueOrThrow({
      where: { id: task.entityId },
      include: { segments: { orderBy: { sequence: 'asc' } } },
    });
    const attemptNo = (await this.prisma.aiTaskAttempt.count({ where: { aiTaskId: task.id } })) + 1;
    await this.prisma.aiTask.update({ where: { id: task.id }, data: { status: 'RUNNING' } });
    try {
      const result = await this.provider.execute({
        taskId,
        role: 'R1',
        releaseBundleVersion: task.releaseBundle.version,
        text: `${r1Instruction}${document.segments.map((segment) => `[${segment.sequence}] ${segment.text}`).join('\n')}`,
      });
      if (result.kind !== 'DRAFT') throw new Error('R1 未返回候选草稿。');

      const selection = selectUsableR1Candidates(JSON.parse(result.draft), document.segments);
      const review = new CandidateReviewService(this.prisma);
      for (const candidate of selection.candidates) {
        await review.createManualCandidate({
          sourceDocumentId: document.id,
          title: candidate.title,
          coreIdea: candidate.coreIdea,
          flowText: candidate.flowText,
          nodes: candidate.nodes,
          evidence: candidate.evidence,
          origin: 'AI_R1',
          isAiReconstructed: true,
        });
      }
      await this.prisma.aiTaskAttempt.create({
        data: {
          aiTaskId: task.id,
          attemptNo,
          attemptType: 'INITIAL',
          provider: this.provider.name,
          status: 'DRAFT_READY',
          parsedJson: result.draft,
        },
      });
      const updatedTask = await this.prisma.aiTask.update({
        where: { id: task.id },
        data: {
          status: 'AWAITING_USER_CONFIRMATION',
          resultReference: selection.candidates.length > 0 ? 'R1_DRAFT' : 'R1_NO_USABLE_FLOW',
        },
      });
      return { task: updatedTask, ...selection };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'R1 草稿处理失败。';
      await this.prisma.aiTaskAttempt.create({
        data: {
          aiTaskId: task.id,
          attemptNo,
          attemptType: 'INITIAL',
          provider: this.provider.name,
          status: 'FAILED',
          rawResponse: message,
        },
      });
      const updatedTask = await this.prisma.aiTask.update({
        where: { id: task.id },
        data: { status: 'FAILED_RETRYABLE', resultReference: 'R1_VALIDATION_FAILED' },
      });
      return { task: updatedTask, candidates: [], rejectedCount: 0 };
    }
  }
}

function validateCandidate(raw: unknown, segments: R1SourceSegment[]): R1Candidate {
  if (typeof raw !== 'object' || raw === null) throw new Error('候选结构无效。');
  const item = raw as {
    title?: unknown;
    coreIdea?: unknown;
    flowText?: unknown;
    nodes?: unknown;
    evidence?: unknown;
  };
  const title = stringValue(item.title);
  const coreIdea = stringValue(item.coreIdea);
  const flowText = stringValue(item.flowText);
  if (!title || !coreIdea || !flowText || /[\u3400-\u9fff]/u.test(flowText)) {
    throw new Error('候选缺少英文语流或混入非英文内容。');
  }
  const wordCount = (flowText.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? []).length;
  if (wordCount < 12 || wordCount > 110 || isMetaText(flowText)) {
    throw new Error('候选不构成可训练的完整英语语流。');
  }
  if (!Array.isArray(item.evidence) || item.evidence.length !== 1) {
    throw new Error('候选必须标注一个来源段落。');
  }
  const evidence = item.evidence[0] as { segment?: unknown };
  const segmentNumber = integerValue(evidence.segment);
  const sourceSegment = segments.find((segment) => segment.sequence === segmentNumber);
  if (!sourceSegment) throw new Error('候选引用了不存在的来源段落。');
  if (!Array.isArray(item.nodes) || item.nodes.length === 0) {
    throw new Error('候选缺少逻辑节点。');
  }
  const nodes = item.nodes.map((rawNode) => {
    const node = rawNode as { type?: unknown; text?: unknown };
    const nodeType = nodeTypeValue(node.type);
    const text = stringValue(node.text);
    if (!nodeType || !text || !flowText.includes(text)) {
      throw new Error('逻辑节点没有精确来源于候选语流。');
    }
    return { nodeType, text };
  });
  if (normalizedEnglish(nodes.map((node) => node.text).join(' ')) !== normalizedEnglish(flowText)) {
    throw new Error('逻辑节点没有完整覆盖候选英语语流。');
  }
  if (sourceTokenCoverage(flowText, sourceSegment.text) < 0.62) {
    throw new Error('候选英文与标注来源段落的重合度不足。');
  }
  return {
    title,
    coreIdea,
    flowText,
    nodes,
    evidence: [
      {
        sourceSegmentId: sourceSegment.id,
        startOffset: 0,
        endOffset: sourceSegment.text.length,
      },
    ],
  };
}

function sourceTokenCoverage(flowText: string, sourceText: string) {
  const candidateTokens = new Set(
    (flowText.match(/[A-Za-z0-9]+/g) ?? []).map((token) => token.toLowerCase()),
  );
  const sourceTokens = new Set(
    (sourceText.match(/[A-Za-z0-9]+/g) ?? []).map((token) => token.toLowerCase()),
  );
  if (candidateTokens.size === 0) return 0;
  return (
    [...candidateTokens].filter((token) => sourceTokens.has(token)).length / candidateTokens.size
  );
}

function normalizedEnglish(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isMetaText(value: string) {
  return /^(you're listening to|welcome to|this is|i'?m .+ from |everyone reports to )/iu.test(
    value.trim(),
  );
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function integerValue(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : -1;
}

function nodeTypeValue(value: unknown): NodeType | null {
  return typeof value === 'string' && nodeTypes.includes(value as NodeType)
    ? (value as NodeType)
    : null;
}
