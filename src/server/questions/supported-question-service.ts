import type {
  AssetLearningState,
  InternalStage,
  NodeType,
  Prisma,
  PrismaClient,
  QuestionSource,
  VisibleStage,
} from '@prisma/client';

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

const callableStages: InternalStage[] = ['S2', 'S3', 'S4', 'S5'];
const callableLearningStates: AssetLearningState[] = ['CALLABLE', 'STITCHABLE', 'TRANSFERABLE'];

export type CallableAssetVersion = {
  personalAssetId: string;
  personalAssetVersionId: string;
  version: number;
  triggerName: string;
  coreIdea: string;
  internalStage: InternalStage;
  visibleStage: VisibleStage;
  nodes: Array<{ id: string; sequence: number; nodeType: NodeType; text: string }>;
};

export type SupportedQuestionInput = {
  userId: string;
  questionText: string;
  source: Extract<QuestionSource, 'USER_REAL' | 'AI_GENERATED' | 'MANUAL'>;
  primaryPersonalAssetVersionId: string;
  secondaryPersonalAssetVersionId?: string;
  confirmedFactIds?: string[];
};

type SupportInput = Pick<
  SupportedQuestionInput,
  | 'userId'
  | 'primaryPersonalAssetVersionId'
  | 'secondaryPersonalAssetVersionId'
  | 'confirmedFactIds'
>;

export type ResolvedQuestionSupport = {
  primary: CallableAssetVersion;
  secondary: CallableAssetVersion | null;
  facts: Array<{ id: string; text: string }>;
  obligationNodes: Array<CallableAssetVersion['nodes'][number]>;
};

export type PracticeOverview = {
  callableAssets: CallableAssetVersion[];
  confirmedFacts: Array<{ id: string; text: string }>;
  r4Drafts: Array<{ taskId: string; questionText: string; primaryAssetName: string | null }>;
  plans: Array<{
    id: string;
    questionText: string;
    status: string;
    source: QuestionSource;
    primaryAssetName: string | null;
  }>;
};

export type SupportedQuestionPlanView = {
  id: string;
  questionText: string;
  source: QuestionSource;
  status: string;
  assets: Array<{ role: 'PRIMARY' | 'SECONDARY'; triggerName: string; version: number }>;
  obligations: Array<{
    id: string;
    sequence: number;
    description: string;
    isRequired: boolean;
    englishExpression: string | null;
    supports: Array<{ type: string; explanation: string | null }>;
  }>;
};

export class SupportedQuestionValidationError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'QUESTION_REQUIRED'
      | 'PRIMARY_ASSET_REQUIRED'
      | 'ASSET_NOT_CALLABLE'
      | 'ASSET_DUPLICATED'
      | 'INSUFFICIENT_SUPPORTED_NODES'
      | 'UNCONFIRMED_FACT'
      | 'PLAN_NOT_AVAILABLE',
  ) {
    super(message);
    this.name = 'SupportedQuestionValidationError';
  }
}

/**
 * 问题计划的正式门禁。AI 草稿和页面提交都必须经过这里的本地资格校验。
 */
export class SupportedQuestionService {
  constructor(private readonly prisma: PrismaClient) {}

  async listCallableAssets(userId: string): Promise<CallableAssetVersion[]> {
    return this.listCallableAssetsWith(this.prisma, userId);
  }

  async resolveSupportInput(input: SupportInput): Promise<ResolvedQuestionSupport> {
    return this.resolveSupportInputWith(this.prisma, input);
  }

  async createPlan(input: SupportedQuestionInput) {
    const questionText = input.questionText.trim();
    if (!questionText) {
      throw new SupportedQuestionValidationError(
        '问题去除首尾空白后不能为空。',
        'QUESTION_REQUIRED',
      );
    }

    return this.prisma.$transaction(async (transaction) => {
      const support = await this.resolveSupportInputWith(transaction, input);
      const question = await transaction.question.create({
        data: { text: questionText, source: input.source },
      });
      const plan = await transaction.questionPlan.create({
        data: {
          questionId: question.id,
          version: 1,
          questionText,
          distance: 'L1',
          status: 'VALIDATED',
          supportProofJson: JSON.stringify({
            ruleVersion: 'supported-question-v1',
            primaryPersonalAssetVersionId: support.primary.personalAssetVersionId,
            secondaryPersonalAssetVersionId: support.secondary?.personalAssetVersionId ?? null,
            confirmedFactIds: support.facts.map((fact) => fact.id),
            obligationNodeIds: support.obligationNodes.map((node) => node.id),
          }),
          assets: {
            create: [
              {
                role: 'PRIMARY',
                personalAssetVersionId: support.primary.personalAssetVersionId,
                personalAssetVersionIdSnapshot: support.primary.personalAssetVersionId,
              },
              ...(support.secondary
                ? [
                    {
                      role: 'SECONDARY' as const,
                      personalAssetVersionId: support.secondary.personalAssetVersionId,
                      personalAssetVersionIdSnapshot: support.secondary.personalAssetVersionId,
                    },
                  ]
                : []),
            ],
          },
          obligations: {
            create: support.obligationNodes.map((node, index) => ({
              sequence: index + 1,
              obligationType: 'ASSET_NODE',
              isRequired: true,
              description: chineseSkeletonLabel(node.nodeType),
              supports: {
                create: [
                  {
                    supportType: 'PERSONAL_ASSET_NODE',
                    supportReferenceId: node.id,
                    explanation: '由已确认且可调用的个人资产节点支撑。',
                  },
                  {
                    supportType: 'QUESTION_CONTEXT',
                    supportReferenceId: question.id,
                    explanation: '与当前题面直接相关。',
                  },
                  ...(index === 0
                    ? support.facts.map((fact) => ({
                        supportType: 'CONFIRMED_USER_FACT',
                        supportReferenceId: fact.id,
                        explanation: '用户已确认的个人事实。',
                      }))
                    : []),
                ],
              },
            })),
          },
        },
      });

      return { question, plan, support };
    });
  }

  async getPracticeOverview(userId: string): Promise<PracticeOverview> {
    const [callableAssets, confirmedFacts, rawPlans, rawR4Tasks] = await Promise.all([
      this.listCallableAssets(userId),
      this.prisma.userFact.findMany({
        where: { userId, status: 'CONFIRMED' },
        select: { id: true, text: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.questionPlan.findMany({
        include: { question: { select: { source: true } }, assets: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.aiTask.findMany({
        where: { role: 'R4', status: 'AWAITING_USER_CONFIRMATION' },
        include: { attempts: { orderBy: { attemptNo: 'desc' }, take: 1 } },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);
    const userVersions = await this.prisma.personalAssetVersion.findMany({
      where: {
        id: {
          in: [
            ...rawPlans.flatMap((plan) => plan.assets.map((asset) => asset.personalAssetVersionId)),
            ...rawR4Tasks.map((task) => task.entityId),
          ],
        },
        personalAsset: { userId },
      },
      select: { id: true, triggerName: true },
    });
    const userVersionIds = new Set(userVersions.map((version) => version.id));
    const names = new Map(userVersions.map((version) => [version.id, version.triggerName]));

    return {
      callableAssets,
      confirmedFacts,
      r4Drafts: rawR4Tasks.flatMap((task) => {
        const questionText = r4DraftText(task.attempts[0]?.parsedJson);
        if (!userVersionIds.has(task.entityId) || !questionText) return [];
        return [
          {
            taskId: task.id,
            questionText,
            primaryAssetName: names.get(task.entityId) ?? null,
          },
        ];
      }),
      plans: rawPlans
        .filter((plan) =>
          plan.assets.some(
            (asset) => asset.role === 'PRIMARY' && userVersionIds.has(asset.personalAssetVersionId),
          ),
        )
        .map((plan) => {
          const primary = plan.assets.find((asset) => asset.role === 'PRIMARY');
          return {
            id: plan.id,
            questionText: plan.questionText,
            status: plan.status,
            source: plan.question.source,
            primaryAssetName: primary ? (names.get(primary.personalAssetVersionId) ?? null) : null,
          };
        }),
    };
  }

  async getPlanForUser(userId: string, planId: string): Promise<SupportedQuestionPlanView> {
    const plan = await this.prisma.questionPlan.findUnique({
      where: { id: planId },
      include: {
        question: { select: { source: true } },
        assets: { orderBy: { role: 'asc' } },
        obligations: { include: { supports: true }, orderBy: { sequence: 'asc' } },
      },
    });
    if (!plan) {
      throw new SupportedQuestionValidationError('问题计划不存在。', 'PLAN_NOT_AVAILABLE');
    }

    const versionIds = plan.assets.map((asset) => asset.personalAssetVersionId);
    const versions = await this.prisma.personalAssetVersion.findMany({
      where: { id: { in: versionIds }, personalAsset: { userId } },
      select: { id: true, version: true, triggerName: true },
    });
    const versionsById = new Map(versions.map((version) => [version.id, version]));
    if (
      plan.assets.some((asset) => !versionsById.has(asset.personalAssetVersionId)) ||
      !plan.assets.some((asset) => asset.role === 'PRIMARY')
    ) {
      throw new SupportedQuestionValidationError(
        '问题计划不属于当前本地用户。',
        'PLAN_NOT_AVAILABLE',
      );
    }

    const nodeIds = plan.obligations.flatMap((obligation) =>
      obligation.supports
        .filter((support) => support.supportType === 'PERSONAL_ASSET_NODE')
        .map((support) => support.supportReferenceId),
    );
    const nodes = await this.prisma.personalAssetNode.findMany({
      where: { id: { in: nodeIds }, personalAssetVersion: { personalAsset: { userId } } },
      select: { id: true, text: true },
    });
    const nodesById = new Map(nodes.map((node) => [node.id, node.text]));

    return {
      id: plan.id,
      questionText: plan.questionText,
      source: plan.question.source,
      status: plan.status,
      assets: plan.assets.map((asset) => {
        const version = versionsById.get(asset.personalAssetVersionId)!;
        return { role: asset.role, triggerName: version.triggerName, version: version.version };
      }),
      obligations: plan.obligations.map((obligation) => {
        const nodeSupport = obligation.supports.find(
          (support) => support.supportType === 'PERSONAL_ASSET_NODE',
        );
        return {
          id: obligation.id,
          sequence: obligation.sequence,
          description: obligation.description,
          isRequired: obligation.isRequired,
          englishExpression: nodeSupport
            ? (nodesById.get(nodeSupport.supportReferenceId) ?? null)
            : null,
          supports: obligation.supports.map((support) => ({
            type: support.supportType,
            explanation: support.explanation,
          })),
        };
      }),
    };
  }

  private async listCallableAssetsWith(
    client: DatabaseClient,
    userId: string,
  ): Promise<CallableAssetVersion[]> {
    const assets = await client.personalAsset.findMany({
      where: {
        userId,
        state: {
          is: {
            isActive: true,
            internalStage: { in: callableStages },
            learningState: { in: callableLearningStates },
          },
        },
        versions: { some: { status: 'CONFIRMED' } },
      },
      select: {
        id: true,
        state: { select: { internalStage: true, visibleStage: true } },
        versions: {
          where: { status: 'CONFIRMED' },
          orderBy: { version: 'desc' },
          take: 1,
          select: {
            id: true,
            version: true,
            triggerName: true,
            coreIdea: true,
            nodes: {
              orderBy: { sequence: 'asc' },
              select: { id: true, sequence: true, nodeType: true, text: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return assets.flatMap((asset) => {
      const version = asset.versions[0];
      if (!version || !asset.state) return [];
      return [
        {
          personalAssetId: asset.id,
          personalAssetVersionId: version.id,
          version: version.version,
          triggerName: version.triggerName,
          coreIdea: version.coreIdea,
          internalStage: asset.state.internalStage,
          visibleStage: asset.state.visibleStage,
          nodes: version.nodes,
        },
      ];
    });
  }

  private async resolveSupportInputWith(
    client: DatabaseClient,
    input: SupportInput,
  ): Promise<ResolvedQuestionSupport> {
    if (!input.primaryPersonalAssetVersionId) {
      throw new SupportedQuestionValidationError(
        '请先选择一项可调用的主资产。',
        'PRIMARY_ASSET_REQUIRED',
      );
    }
    if (
      input.secondaryPersonalAssetVersionId &&
      input.secondaryPersonalAssetVersionId === input.primaryPersonalAssetVersionId
    ) {
      throw new SupportedQuestionValidationError(
        '主资产和补充资产不能是同一版本。',
        'ASSET_DUPLICATED',
      );
    }

    const callableAssets = await this.listCallableAssetsWith(client, input.userId);
    const assetsByVersionId = new Map(
      callableAssets.map((asset) => [asset.personalAssetVersionId, asset]),
    );
    const primary = assetsByVersionId.get(input.primaryPersonalAssetVersionId);
    if (!primary) {
      throw new SupportedQuestionValidationError(
        '主资产未确认、未激活或尚未达到可调用阶段。',
        'ASSET_NOT_CALLABLE',
      );
    }
    const secondary = input.secondaryPersonalAssetVersionId
      ? (assetsByVersionId.get(input.secondaryPersonalAssetVersionId) ?? null)
      : null;
    if (input.secondaryPersonalAssetVersionId && !secondary) {
      throw new SupportedQuestionValidationError(
        '补充资产未确认、未激活或尚未达到可调用阶段。',
        'ASSET_NOT_CALLABLE',
      );
    }
    if (secondary && secondary.personalAssetId === primary.personalAssetId) {
      throw new SupportedQuestionValidationError(
        '主资产和补充资产不能来自同一资产。',
        'ASSET_DUPLICATED',
      );
    }

    const factIds = [...new Set(input.confirmedFactIds ?? [])];
    const facts = factIds.length
      ? await client.userFact.findMany({
          where: { id: { in: factIds }, userId: input.userId, status: 'CONFIRMED' },
          select: { id: true, text: true },
        })
      : [];
    if (facts.length !== factIds.length) {
      throw new SupportedQuestionValidationError(
        '只能使用当前用户已确认的个人事实。',
        'UNCONFIRMED_FACT',
      );
    }

    const obligationNodes = [
      ...primary.nodes.slice(0, 3),
      ...(secondary
        ? secondary.nodes.slice(0, Math.max(0, 4 - Math.min(primary.nodes.length, 3)))
        : []),
    ].slice(0, 4);
    if (obligationNodes.length < 3) {
      throw new SupportedQuestionValidationError(
        '所选可调用资产不足三个可追溯逻辑节点，无法生成问题准备骨架。',
        'INSUFFICIENT_SUPPORTED_NODES',
      );
    }

    return { primary, secondary, facts, obligationNodes };
  }
}

function chineseSkeletonLabel(nodeType: NodeType) {
  const labels: Record<NodeType, string> = {
    CONTEXT: '交代背景',
    CLAIM: '先说核心观点',
    REASON: '说明原因',
    EXPLANATION: '补充解释',
    EXAMPLE: '给出一个例子',
    CONTRAST: '说明对比',
    CONDITION: '说明适用条件',
    ACTION: '说明采取的行动',
    RESULT: '说明结果',
    CONCLUSION: '落到结论',
    TRANSITION: '衔接到下一点',
    OTHER: '补充关键内容',
  };
  return labels[nodeType];
}

function r4DraftText(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { questionText?: unknown };
    return typeof parsed.questionText === 'string' && parsed.questionText.trim()
      ? parsed.questionText.trim()
      : null;
  } catch {
    return null;
  }
}
