import { createHash } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';

import { AiProviderError, type AiProviderAdapter } from '@/ai/provider';

import { R7B_DIMENSIONS } from './r7b-evaluation-service';

const LOCAL_USER_ID = 'local-user';

type FactChangeType =
  | 'INCREASED'
  | 'DECREASED'
  | 'UNCHANGED'
  | 'COVERED_NOW'
  | 'NO_LONGER_COVERED'
  | 'ADDED'
  | 'REMOVED'
  | 'NOT_COMPARABLE';

type ReviewFact = {
  factId: string;
  changeType: FactChangeType;
};

type R7CDraft = {
  observations: Array<{
    factId: string;
    changeType: FactChangeType;
    text: string;
  }>;
  limitation: string;
};

type R7CContext = Awaited<ReturnType<R7CReviewService['loadContext']>>;

export type RequestR7CInput = {
  trainingSessionId: string;
  userId?: string;
};

export type ReviewView = {
  status: string;
  question: string | null;
  answers: {
    first: {
      id: string;
      text: string;
      units: Array<{ id: string; sequence: number; text: string }>;
    } | null;
    second: {
      id: string;
      text: string;
      units: Array<{ id: string; sequence: number; text: string }>;
    } | null;
  };
  comparison: {
    id: string;
    factsStatus: string;
    interpretationStatus: string;
    finalDisplayStatus: string;
    firstTotalScore: number | null;
    secondTotalScore: number | null;
    limitations: string[];
    dimensions: Array<{
      id: string;
      label: string;
      firstRating: number | null;
      secondRating: number | null;
      firstStatus: string;
      secondStatus: string;
      changeType: string;
    }>;
    obligations: Array<{
      id: string;
      description: string;
      firstStatus: string;
      secondStatus: string;
      changeType: string;
    }>;
    nodes: Array<{
      id: string;
      text: string;
      firstUsed: boolean;
      secondUsed: boolean;
      changeType: string;
    }>;
    interpretation: R7CDraft | null;
  } | null;
  localTemplate: string;
};

export class R7CReviewValidationError extends Error {
  constructor(
    message: string,
    readonly code: 'SESSION_NOT_FOUND',
  ) {
    super(message);
    this.name = 'R7CReviewValidationError';
  }
}

/**
 * R7C 先固化本地比较事实，再让模型只解释受限 factId；任何缺失均回到本地模板。
 */
export class R7CReviewService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly provider: AiProviderAdapter,
  ) {}

  async requestForSession(input: RequestR7CInput): Promise<ReviewView> {
    const context = await this.loadContext(input.trainingSessionId, input.userId ?? LOCAL_USER_ID);
    if (!context.firstAnswer || !context.secondAnswer) return toReviewView(context, null);

    const comparison = await this.ensureFacts(context);
    if (comparison.factsStatus !== 'COMPLETE') {
      await this.setLocalTemplate(comparison.id, 'PARTIAL');
      return this.getReview(input.trainingSessionId, input.userId);
    }

    const bundle = context.session.releaseBundleId
      ? await this.prisma.aiReleaseBundle.findUnique({
          where: { id: context.session.releaseBundleId },
          include: { prompts: { where: { role: 'R7C' }, select: { id: true } } },
        })
      : null;
    if (!bundle || bundle.status !== 'ACTIVE' || bundle.prompts.length === 0) {
      await this.setLocalTemplate(comparison.id, 'UNAVAILABLE');
      return this.getReview(input.trainingSessionId, input.userId);
    }

    const inputFingerprint = comparisonFingerprint(comparison);
    const task = await this.prisma.aiTask.upsert({
      where: {
        role_entityId_entityVersion_releaseBundleId_inputFingerprint: {
          role: 'R7C',
          entityId: comparison.id,
          entityVersion: context.secondAnswer.sequence,
          releaseBundleId: bundle.id,
          inputFingerprint,
        },
      },
      update: {},
      create: {
        trainingSessionId: context.session.id,
        releaseBundleId: bundle.id,
        role: 'R7C',
        entityType: 'AnswerComparisonResult',
        entityId: comparison.id,
        entityVersion: context.secondAnswer.sequence,
        inputFingerprint,
      },
    });
    if (task.status === 'QUEUED' || task.status === 'RUNNING') {
      await this.process(task.id, comparison);
    }
    return this.getReview(input.trainingSessionId, input.userId);
  }

  async getReview(trainingSessionId: string, userId = LOCAL_USER_ID): Promise<ReviewView> {
    const context = await this.loadContext(trainingSessionId, userId);
    const comparison = await this.prisma.answerComparisonResult.findUnique({
      where: { trainingSessionId: context.session.id },
      include: {
        dimensionChanges: true,
        obligationChanges: {
          include: { questionObligation: true },
          orderBy: { questionObligationId: 'asc' },
        },
        nodeChanges: {
          include: { personalAssetNode: true },
          orderBy: { personalAssetNodeId: 'asc' },
        },
      },
    });
    return toReviewView(context, comparison);
  }

  private async process(taskId: string, comparison: ComparisonWithFacts) {
    const claimed = await this.prisma.aiTask.updateMany({
      where: { id: taskId, status: 'QUEUED' },
      data: { status: 'RUNNING' },
    });
    if (claimed.count === 0) return;

    const task = await this.prisma.aiTask.findUniqueOrThrow({
      where: { id: taskId },
      include: { releaseBundle: true },
    });
    const attemptNo = (await this.prisma.aiTaskAttempt.count({ where: { aiTaskId: task.id } })) + 1;
    let attemptRecorded = false;
    try {
      const response = await this.provider.execute({
        taskId: task.id,
        role: 'R7C',
        releaseBundleVersion: task.releaseBundle.version,
        text: r7cPromptInput(comparison),
      });
      if (response.kind === 'INSUFFICIENT_TEXT') {
        await this.prisma.aiTaskAttempt.create({
          data: {
            aiTaskId: task.id,
            attemptNo,
            attemptType: 'INITIAL',
            provider: this.provider.name,
            status: 'INSUFFICIENT_TEXT',
            parsedJson: JSON.stringify(response),
          },
        });
        attemptRecorded = true;
        await this.setLocalTemplate(comparison.id, 'INSUFFICIENT_TEXT');
        await this.prisma.aiTask.update({
          where: { id: task.id },
          data: { status: 'NEEDS_REVIEW', resultReference: 'R7C_INSUFFICIENT_TEXT' },
        });
        return;
      }

      const draft = parseDraft(response.draft, comparison);
      await this.prisma.aiTaskAttempt.create({
        data: {
          aiTaskId: task.id,
          attemptNo,
          attemptType: 'INITIAL',
          provider: this.provider.name,
          status: 'DRAFT_READY',
          parsedJson: JSON.stringify(draft),
        },
      });
      attemptRecorded = true;
      await this.prisma.answerComparisonResult.update({
        where: { id: comparison.id },
        data: {
          interpretationJson: JSON.stringify(draft),
          interpretationStatus: 'DRAFT_READY',
          finalDisplayStatus: 'COMPLETE',
        },
      });
      await this.prisma.aiTask.update({
        where: { id: task.id },
        data: { status: 'AWAITING_USER_CONFIRMATION', resultReference: 'R7C_INTERPRETATION_DRAFT' },
      });
    } catch (error) {
      const isProviderError = error instanceof AiProviderError;
      if (!attemptRecorded) {
        await this.prisma.aiTaskAttempt.create({
          data: {
            aiTaskId: task.id,
            attemptNo,
            attemptType: 'INITIAL',
            provider: this.provider.name,
            status: isProviderError ? error.code : 'INVALID_DRAFT',
            rawResponse: isProviderError ? 'R7C Provider 不可用。' : 'R7C 草稿未通过本地事实校验。',
          },
        });
      }
      const status = isProviderError ? 'UNAVAILABLE' : 'NEEDS_REVIEW';
      await this.setLocalTemplate(comparison.id, status);
      await this.prisma.aiTask.update({
        where: { id: task.id },
        data: {
          status: isProviderError ? 'FAILED_RETRYABLE' : 'NEEDS_REVIEW',
          resultReference: isProviderError ? 'R7C_PROVIDER_UNAVAILABLE' : 'R7C_INVALID_DRAFT',
        },
      });
    }
  }

  private async ensureFacts(context: R7CContext): Promise<ComparisonWithFacts> {
    const existing = await this.prisma.answerComparisonResult.findUnique({
      where: { trainingSessionId: context.session.id },
      include: comparisonInclude,
    });
    if (existing) return existing;

    const facts = buildFacts(context);
    try {
      return await this.prisma.answerComparisonResult.create({
        data: {
          trainingSessionId: context.session.id,
          factsJson: JSON.stringify(facts.summary),
          factsStatus: facts.factsStatus,
          interpretationStatus: 'LOCAL_TEMPLATE',
          finalDisplayStatus: facts.factsStatus === 'COMPLETE' ? 'LOCAL_FACTS_READY' : 'PARTIAL',
          dimensionChanges: { create: facts.dimensions },
          obligationChanges: { create: facts.obligations },
          nodeChanges: { create: facts.nodes },
        },
        include: comparisonInclude,
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return this.prisma.answerComparisonResult.findUniqueOrThrow({
        where: { trainingSessionId: context.session.id },
        include: comparisonInclude,
      });
    }
  }

  private async setLocalTemplate(comparisonId: string, interpretationStatus: string) {
    await this.prisma.answerComparisonResult.update({
      where: { id: comparisonId },
      data: {
        interpretationStatus,
        finalDisplayStatus: interpretationStatus === 'PARTIAL' ? 'PARTIAL' : 'LOCAL_TEMPLATE',
      },
    });
  }

  private async loadContext(trainingSessionId: string, userId: string) {
    const session = await this.prisma.trainingSession.findFirst({
      where: { id: trainingSessionId, userId },
      include: {
        questionPlan: {
          include: { assets: true, obligations: { orderBy: { sequence: 'asc' } } },
        },
        answers: {
          include: { units: { orderBy: { sequence: 'asc' } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!session) throw new R7CReviewValidationError('问题回答会话不存在。', 'SESSION_NOT_FOUND');
    const firstAnswer =
      session.answers.find((answer) => answer.answerType === 'FIRST_ANSWER') ?? null;
    const secondAnswer =
      session.answers.find((answer) => answer.answerType === 'SECOND_ANSWER') ?? null;
    const answerIds = [firstAnswer?.id, secondAnswer?.id].filter((id): id is string => Boolean(id));
    const [evaluations, usageResults, assetVersions] = await Promise.all([
      this.prisma.answerEvaluationResult.findMany({
        where: { trainingSessionId: session.id, answerId: { in: answerIds }, isCurrent: true },
        include: { ratings: true },
      }),
      this.prisma.assetUsageResult.findMany({
        where: { trainingSessionId: session.id, answerId: { in: answerIds }, isCurrent: true },
        include: { assessments: { include: { nodeEvidence: true } }, obligationCoverage: true },
      }),
      this.prisma.personalAssetVersion.findMany({
        where: {
          id: { in: session.questionPlan.assets.map((asset) => asset.personalAssetVersionId) },
          personalAsset: { userId },
        },
        include: { nodes: { orderBy: { sequence: 'asc' } } },
      }),
    ]);
    return {
      session,
      firstAnswer,
      secondAnswer,
      evaluationsByAnswer: new Map(evaluations.map((result) => [result.answerId, result])),
      usageByAnswer: new Map(usageResults.map((result) => [result.answerId, result])),
      assetVersions,
    };
  }
}

const comparisonInclude = {
  dimensionChanges: true,
  obligationChanges: {
    include: { questionObligation: true },
    orderBy: { questionObligationId: 'asc' },
  },
  nodeChanges: { include: { personalAssetNode: true }, orderBy: { personalAssetNodeId: 'asc' } },
} as const;

type ComparisonWithFacts = Awaited<
  ReturnType<PrismaClient['answerComparisonResult']['findUniqueOrThrow']>
> & {
  dimensionChanges: Array<{
    dimension: string;
    firstRating: number | null;
    secondRating: number | null;
    firstStatus: string;
    secondStatus: string;
    changeType: string;
  }>;
  obligationChanges: Array<{
    questionObligationId: string;
    firstStatus: string;
    secondStatus: string;
    changeType: string;
    questionObligation: { description: string };
  }>;
  nodeChanges: Array<{
    personalAssetNodeId: string;
    firstUsed: boolean;
    secondUsed: boolean;
    changeType: string;
    personalAssetNode: { text: string };
  }>;
};

function buildFacts(context: R7CContext) {
  const firstEvaluation = context.evaluationsByAnswer.get(context.firstAnswer!.id) ?? null;
  const secondEvaluation = context.evaluationsByAnswer.get(context.secondAnswer!.id) ?? null;
  const firstUsage = context.usageByAnswer.get(context.firstAnswer!.id) ?? null;
  const secondUsage = context.usageByAnswer.get(context.secondAnswer!.id) ?? null;
  const firstRatings = new Map(
    firstEvaluation?.ratings.map((rating) => [rating.dimension, rating]),
  );
  const secondRatings = new Map(
    secondEvaluation?.ratings.map((rating) => [rating.dimension, rating]),
  );
  const dimensions = R7B_DIMENSIONS.map((dimension) => {
    const first = firstRatings.get(dimension.id);
    const second = secondRatings.get(dimension.id);
    return {
      dimension: dimension.id,
      firstRating: first?.rating ?? null,
      secondRating: second?.rating ?? null,
      firstStatus: first?.status ?? 'NOT_EVALUABLE',
      secondStatus: second?.status ?? 'NOT_EVALUABLE',
      changeType: dimensionChange(
        first?.rating ?? null,
        second?.rating ?? null,
        first?.status,
        second?.status,
      ),
    };
  });
  const firstCoverage = new Map(
    firstUsage?.obligationCoverage.map((coverage) => [
      coverage.questionObligationId,
      coverage.status,
    ]),
  );
  const secondCoverage = new Map(
    secondUsage?.obligationCoverage.map((coverage) => [
      coverage.questionObligationId,
      coverage.status,
    ]),
  );
  const obligations = context.session.questionPlan.obligations.map((obligation) => {
    const firstStatus = firstCoverage.get(obligation.id) ?? 'NOT_EVALUABLE';
    const secondStatus = secondCoverage.get(obligation.id) ?? 'NOT_EVALUABLE';
    return {
      questionObligationId: obligation.id,
      firstStatus,
      secondStatus,
      changeType: obligationChange(firstStatus, secondStatus),
    };
  });
  const firstUsed = usedNodes(firstUsage);
  const secondUsed = usedNodes(secondUsage);
  const nodes = context.assetVersions.flatMap((asset) =>
    asset.nodes.map((node) => ({
      personalAssetNodeId: node.id,
      firstUsed: firstUsed.has(node.id),
      secondUsed: secondUsed.has(node.id),
      changeType: nodeChange(firstUsed.has(node.id), secondUsed.has(node.id)),
    })),
  );
  const complete =
    isCompleteEvaluation(firstEvaluation, dimensions) &&
    isCompleteEvaluation(secondEvaluation, dimensions) &&
    firstUsage?.status === 'DRAFT_READY' &&
    secondUsage?.status === 'DRAFT_READY';
  const limitations = [
    ...(firstUsage?.status === 'DRAFT_READY' && secondUsage?.status === 'DRAFT_READY'
      ? []
      : ['R7A 资产调用或义务覆盖未形成完整比较。']),
    ...(firstEvaluation?.status === 'DRAFT_READY' && secondEvaluation?.status === 'DRAFT_READY'
      ? []
      : ['R7B 六维评价不完整，不能解释为完整进步或退步。']),
  ];
  return {
    factsStatus: complete ? 'COMPLETE' : 'PARTIAL',
    dimensions,
    obligations,
    nodes,
    summary: {
      ruleVersion: 'r7c-local-comparison-facts-v1',
      firstAnswerId: context.firstAnswer!.id,
      secondAnswerId: context.secondAnswer!.id,
      firstAnswerUnits: context.firstAnswer!.units.map((unit) => ({
        id: unit.id,
        sequence: unit.sequence,
        startOffset: unit.startOffset,
        endOffset: unit.endOffset,
      })),
      secondAnswerUnits: context.secondAnswer!.units.map((unit) => ({
        id: unit.id,
        sequence: unit.sequence,
        startOffset: unit.startOffset,
        endOffset: unit.endOffset,
      })),
      limitations,
    },
  };
}

function usedNodes(
  usage: (R7CContext['usageByAnswer'] extends Map<string, infer Value> ? Value : never) | null,
) {
  return new Set(
    usage?.assessments.flatMap((assessment) =>
      assessment.nodeEvidence.map((evidence) => evidence.personalAssetNodeId),
    ) ?? [],
  );
}

function isCompleteEvaluation(
  evaluation: { status: string; ratings: Array<{ dimension: string; status: string }> } | null,
  dimensions: Array<{ dimension: string; firstStatus: string; secondStatus: string }>,
) {
  return (
    evaluation?.status === 'DRAFT_READY' &&
    evaluation.ratings.length === R7B_DIMENSIONS.length &&
    dimensions.every(
      (dimension) => dimension.firstStatus === 'VALID' && dimension.secondStatus === 'VALID',
    )
  );
}

function dimensionChange(
  firstRating: number | null,
  secondRating: number | null,
  firstStatus?: string,
  secondStatus?: string,
): FactChangeType {
  if (
    firstStatus !== 'VALID' ||
    secondStatus !== 'VALID' ||
    firstRating === null ||
    secondRating === null
  ) {
    return 'NOT_COMPARABLE';
  }
  if (secondRating > firstRating) return 'INCREASED';
  if (secondRating < firstRating) return 'DECREASED';
  return 'UNCHANGED';
}

function obligationChange(firstStatus: string, secondStatus: string): FactChangeType {
  if (firstStatus === 'NOT_EVALUABLE' || secondStatus === 'NOT_EVALUABLE') return 'NOT_COMPARABLE';
  if (firstStatus !== 'COVERED' && secondStatus === 'COVERED') return 'COVERED_NOW';
  if (firstStatus === 'COVERED' && secondStatus !== 'COVERED') return 'NO_LONGER_COVERED';
  return 'UNCHANGED';
}

function nodeChange(firstUsed: boolean, secondUsed: boolean): FactChangeType {
  if (!firstUsed && secondUsed) return 'ADDED';
  if (firstUsed && !secondUsed) return 'REMOVED';
  return 'UNCHANGED';
}

function comparisonFacts(comparison: ComparisonWithFacts): ReviewFact[] {
  return [
    ...comparison.dimensionChanges.map((item) => ({
      factId: `dimension:${item.dimension}`,
      changeType: item.changeType as FactChangeType,
    })),
    ...comparison.obligationChanges.map((item) => ({
      factId: `obligation:${item.questionObligationId}`,
      changeType: item.changeType as FactChangeType,
    })),
    ...comparison.nodeChanges.map((item) => ({
      factId: `node:${item.personalAssetNodeId}`,
      changeType: item.changeType as FactChangeType,
    })),
  ];
}

function comparisonFingerprint(comparison: ComparisonWithFacts) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        id: comparison.id,
        factsJson: comparison.factsJson,
        facts: comparisonFacts(comparison),
      }),
    )
    .digest('hex');
}

function parseDraft(value: string, comparison: ComparisonWithFacts): R7CDraft {
  const parsed = JSON.parse(value) as { observations?: unknown; limitation?: unknown };
  if (!Array.isArray(parsed.observations) || !isText(parsed.limitation, 600)) {
    throw new Error('R7C 草稿结构无效。');
  }
  const factsById = new Map(comparisonFacts(comparison).map((fact) => [fact.factId, fact]));
  const seen = new Set<string>();
  const observations = parsed.observations.map((item) => {
    const observation = item as { factId?: unknown; changeType?: unknown; text?: unknown };
    if (
      typeof observation.factId !== 'string' ||
      seen.has(observation.factId) ||
      !isFactChangeType(observation.changeType) ||
      !isText(observation.text, 500) ||
      factsById.get(observation.factId)?.changeType !== observation.changeType ||
      containsForbiddenClaim(observation.text)
    ) {
      throw new Error('R7C 草稿引用了无效或不一致的比较事实。');
    }
    seen.add(observation.factId);
    return {
      factId: observation.factId,
      changeType: observation.changeType,
      text: observation.text.trim(),
    };
  });
  if (containsForbiddenClaim(parsed.limitation)) throw new Error('R7C 局限说明无效。');
  return { observations, limitation: parsed.limitation.trim() };
}

function r7cPromptInput(comparison: ComparisonWithFacts) {
  return [
    'Return JSON only: {"observations":[{"factId":"","changeType":"","text":""}],"limitation":""}.',
    'Use only supplied factId values and the exact supplied changeType for each observation. Do not invent progress, decline, asset use, scores, suggestions, pronunciation, fluency, or oral performance.',
    'Observations may be empty when no fact deserves explanation. Limitation must state that this is based only on saved text and local facts.',
    'Local comparison facts:',
    ...comparisonFacts(comparison).map((fact) => JSON.stringify(fact)),
  ].join('\n');
}

function toReviewView(context: R7CContext, comparison: ComparisonWithFacts | null): ReviewView {
  if (!comparison) {
    return {
      status: 'NOT_COMPARABLE',
      question: context.session.questionPlan.questionText,
      answers: toAnswerView(context),
      comparison: null,
      localTemplate: '需要先保存同一会话中的第一次和第二次回答，才能建立本地比较事实。',
    };
  }
  const summary = parseSummary(comparison.factsJson);
  return {
    status: comparison.finalDisplayStatus,
    question: context.session.questionPlan.questionText,
    answers: toAnswerView(context),
    comparison: {
      id: comparison.id,
      factsStatus: comparison.factsStatus,
      interpretationStatus: comparison.interpretationStatus,
      finalDisplayStatus: comparison.finalDisplayStatus,
      firstTotalScore: context.firstAnswer
        ? (context.evaluationsByAnswer.get(context.firstAnswer.id)?.totalScore ?? null)
        : null,
      secondTotalScore: context.secondAnswer
        ? (context.evaluationsByAnswer.get(context.secondAnswer.id)?.totalScore ?? null)
        : null,
      limitations: summary.limitations,
      dimensions: comparison.dimensionChanges.map((item) => ({
        id: item.dimension,
        label:
          R7B_DIMENSIONS.find((dimension) => dimension.id === item.dimension)?.label ??
          item.dimension,
        firstRating: item.firstRating,
        secondRating: item.secondRating,
        firstStatus: item.firstStatus,
        secondStatus: item.secondStatus,
        changeType: item.changeType,
      })),
      obligations: comparison.obligationChanges.map((item) => ({
        id: item.questionObligationId,
        description: item.questionObligation.description,
        firstStatus: item.firstStatus,
        secondStatus: item.secondStatus,
        changeType: item.changeType,
      })),
      nodes: comparison.nodeChanges.map((item) => ({
        id: item.personalAssetNodeId,
        text: item.personalAssetNode.text,
        firstUsed: item.firstUsed,
        secondUsed: item.secondUsed,
        changeType: item.changeType,
      })),
      interpretation: parseInterpretation(comparison.interpretationJson),
    },
    localTemplate: localTemplate(comparison.factsStatus, comparison.interpretationStatus),
  };
}

function toAnswerView(context: R7CContext): ReviewView['answers'] {
  const toAnswer = (answer: R7CContext['firstAnswer']) =>
    answer
      ? {
          id: answer.id,
          text: answer.text,
          units: answer.units.map((unit) => ({
            id: unit.id,
            sequence: unit.sequence,
            text: unit.text,
          })),
        }
      : null;
  return { first: toAnswer(context.firstAnswer), second: toAnswer(context.secondAnswer) };
}

function parseSummary(value: string): { limitations: string[] } {
  try {
    const parsed = JSON.parse(value) as { limitations?: unknown };
    return {
      limitations: Array.isArray(parsed.limitations) ? parsed.limitations.filter(isString) : [],
    };
  } catch {
    return { limitations: [] };
  }
}

function parseInterpretation(value: string | null): R7CDraft | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as R7CDraft;
    return Array.isArray(parsed.observations) && typeof parsed.limitation === 'string'
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function localTemplate(factsStatus: string, interpretationStatus: string) {
  if (factsStatus !== 'COMPLETE') {
    return '本次仅展示已保存文字与可回链的局部事实。存在不完整评价，系统不会补写六维、总分或对比结论。';
  }
  if (interpretationStatus !== 'DRAFT_READY') {
    return '本地比较事实已经保存。R7C 解释暂不可用，因此此处不添加未经事实支撑的解读。';
  }
  return '以下 AI 内容仅解释已冻结的本地比较事实，不会改变回答、资产调用或总分。';
}

function isFactChangeType(value: unknown): value is FactChangeType {
  return (
    value === 'INCREASED' ||
    value === 'DECREASED' ||
    value === 'UNCHANGED' ||
    value === 'COVERED_NOW' ||
    value === 'NO_LONGER_COVERED' ||
    value === 'ADDED' ||
    value === 'REMOVED' ||
    value === 'NOT_COMPARABLE'
  );
}

function isText(value: unknown, maximumLength: number): value is string {
  return (
    typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maximumLength
  );
}

function containsForbiddenClaim(value: string) {
  return /\b(pronunciation|accent|speed|pause|fluency|audio|recording|score|rating)\b|发音|语速|停顿|录音|音频|评分|得分|分数|总分|\d/u.test(
    value,
  );
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isUniqueViolation(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
