import type { Prisma, PrismaClient } from '@prisma/client';

const LOCAL_USER_ID = 'local-user';

export type TrainingHistoryFilters = {
  assetId?: string;
  question?: string;
  status?: string;
};

export type TrainingHistoryView = {
  records: Array<{
    id: string;
    kind: 'QUESTION_TRAINING' | 'ASSET_PRACTICE';
    status: string;
    createdAt: Date;
    updatedAt: Date;
    question: string;
    assets: Array<{ id: string; triggerName: string; version: number }>;
    answers: { first: string | null; second: string | null };
    hints: Array<{ level: string; context: string; createdAt: Date }>;
    releaseBundle: { version: string; status: string } | null;
    aiStates: Array<{ role: string; status: string; fallbackReason: string | null }>;
    evaluations: Array<{
      answerId: string;
      status: string;
      totalScore: number | null;
    }>;
    comparison: {
      factsStatus: string;
      interpretationStatus: string;
      finalDisplayStatus: string;
    } | null;
    assetPractice: {
      currentStep: string;
      completedAt: Date | null;
      attempts: Array<{
        stepType: string;
        status: string;
        oralAttemptConfirmed: boolean;
        completionRating: string | null;
        difficultyRating: string | null;
        highestHintLevel: string;
        textAnswer: string | null;
        completedAt: Date | null;
      }>;
    } | null;
  }>;
  filterOptions: {
    assets: Array<{ id: string; label: string }>;
    statuses: string[];
  };
};

/** P13 只读读取已保存训练记录；不返回 Provider 原始响应、密钥或可变草稿。 */
export class TrainingHistoryService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(
    filters: TrainingHistoryFilters = {},
    userId = LOCAL_USER_ID,
  ): Promise<TrainingHistoryView> {
    const where: Prisma.TrainingSessionWhereInput = { userId };
    const assetId = filters.assetId?.trim();
    const question = filters.question?.trim();
    const status = filters.status?.trim();
    const questionPlanWhere: Prisma.QuestionPlanWhereInput = {};
    if (assetId) {
      const versionIds = await this.prisma.personalAssetVersion.findMany({
        where: { personalAssetId: assetId, personalAsset: { userId } },
        select: { id: true },
      });
      questionPlanWhere.assets = {
        some: { personalAssetVersionId: { in: versionIds.map((item) => item.id) } },
      };
    }
    if (question) {
      questionPlanWhere.questionText = { contains: question };
    }
    if (Object.keys(questionPlanWhere).length > 0) where.questionPlan = { is: questionPlanWhere };
    if (status) where.status = status as Prisma.EnumSessionStatusFilter;

    const assetPracticeWhere: Prisma.AssetPracticeSessionWhereInput = { userId };
    if (assetId) assetPracticeWhere.personalAssetId = assetId;
    if (status) assetPracticeWhere.status = status;
    // “问题”筛选只针对问题训练；P05 没有独立问题，不能伪造一条陌生问题来参与筛选。
    if (question) assetPracticeWhere.personalAssetVersion = { triggerName: { contains: question } };

    const [sessions, assetPracticeSessions] = await Promise.all([
      this.prisma.trainingSession.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        include: {
          questionPlan: {
            include: {
              assets: { orderBy: { role: 'asc' } },
            },
          },
          answers: { select: { answerType: true, text: true }, orderBy: { createdAt: 'asc' } },
          hints: {
            select: { level: true, context: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
          },
          releaseBundle: { select: { version: true, status: true } },
          aiTasks: {
            select: { role: true, status: true, resultReference: true, updatedAt: true },
            orderBy: { updatedAt: 'desc' },
          },
          evaluationResults: {
            where: { isCurrent: true },
            select: { answerId: true, status: true, totalScore: true },
          },
          comparisonResult: {
            select: { factsStatus: true, interpretationStatus: true, finalDisplayStatus: true },
          },
        },
      }),
      this.prisma.assetPracticeSession.findMany({
        where: assetPracticeWhere,
        orderBy: { updatedAt: 'desc' },
        include: {
          personalAssetVersion: {
            select: { triggerName: true, version: true },
          },
          attempts: {
            select: {
              stepType: true,
              status: true,
              oralAttemptConfirmed: true,
              completionRating: true,
              difficultyRating: true,
              highestHintLevel: true,
              textAnswer: true,
              completedAt: true,
              startedAt: true,
            },
            orderBy: { startedAt: 'asc' },
          },
        },
      }),
    ]);
    const versionIds = [
      ...new Set(
        sessions.flatMap((session) =>
          session.questionPlan.assets.map((asset) => asset.personalAssetVersionId),
        ),
      ),
    ];
    const versions = await this.prisma.personalAssetVersion.findMany({
      where: { id: { in: versionIds }, personalAsset: { userId } },
      select: { id: true, version: true, triggerName: true, personalAssetId: true },
    });
    const versionsById = new Map(versions.map((version) => [version.id, version]));

    const questionRecords = sessions.map((session) => {
      const latestRoleState = new Map<string, (typeof session.aiTasks)[number]>();
      for (const task of session.aiTasks) {
        if (!latestRoleState.has(task.role)) latestRoleState.set(task.role, task);
      }
      return {
        id: session.id,
        kind: 'QUESTION_TRAINING' as const,
        status: session.status,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        question: session.questionPlan.questionText,
        assets: session.questionPlan.assets.flatMap((asset) => {
          const version = versionsById.get(asset.personalAssetVersionId);
          return version
            ? [
                {
                  id: version.personalAssetId,
                  triggerName: version.triggerName,
                  version: version.version,
                },
              ]
            : [];
        }),
        answers: {
          first:
            session.answers.find((answer) => answer.answerType === 'FIRST_ANSWER')?.text ?? null,
          second:
            session.answers.find((answer) => answer.answerType === 'SECOND_ANSWER')?.text ?? null,
        },
        hints: session.hints,
        releaseBundle: session.releaseBundle,
        aiStates: [...latestRoleState.values()]
          .sort((left, right) => left.role.localeCompare(right.role))
          .map((task) => ({
            role: task.role,
            status: task.status,
            fallbackReason: fallbackReason(task.status, task.resultReference),
          })),
        evaluations: session.evaluationResults,
        comparison: session.comparisonResult,
        assetPractice: null,
      };
    });
    const assetPracticeRecords = assetPracticeSessions.map((session) => ({
      id: session.id,
      kind: 'ASSET_PRACTICE' as const,
      status: session.status,
      createdAt: session.startedAt,
      updatedAt: session.updatedAt,
      question: `单资产训练：${session.personalAssetVersion.triggerName}`,
      assets: [
        {
          id: session.personalAssetId,
          triggerName: session.personalAssetVersion.triggerName,
          version: session.personalAssetVersion.version,
        },
      ],
      answers: { first: null, second: null },
      hints: session.attempts
        .filter((attempt) => attempt.highestHintLevel !== 'H0_NONE')
        .map((attempt) => ({
          level: attempt.highestHintLevel,
          context: `P05_${attempt.stepType}`,
          createdAt: attempt.completedAt ?? attempt.startedAt,
        })),
      releaseBundle: null,
      aiStates: [],
      evaluations: [],
      comparison: null,
      assetPractice: {
        currentStep: session.currentStep,
        completedAt: session.completedAt,
        attempts: [...session.attempts]
          .sort(
            (left, right) =>
              left.startedAt.getTime() - right.startedAt.getTime() ||
              practiceStepOrder(left.stepType) - practiceStepOrder(right.stepType),
          )
          .map((attempt) => ({
            stepType: attempt.stepType,
            status: attempt.status,
            oralAttemptConfirmed: attempt.oralAttemptConfirmed,
            completionRating: attempt.completionRating,
            difficultyRating: attempt.difficultyRating,
            highestHintLevel: attempt.highestHintLevel,
            textAnswer: attempt.textAnswer,
            completedAt: attempt.completedAt,
          })),
      },
    }));
    const records = [...questionRecords, ...assetPracticeRecords].sort(
      (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
    );
    const assets = new Map<string, string>();
    const statuses = new Set<string>();
    for (const record of records) {
      statuses.add(record.status);
      for (const asset of record.assets) assets.set(asset.id, asset.triggerName);
    }
    return {
      records,
      filterOptions: {
        assets: [...assets.entries()]
          .map(([id, label]) => ({ id, label }))
          .sort((left, right) => left.label.localeCompare(right.label)),
        statuses: [...statuses].sort(),
      },
    };
  }
}

function fallbackReason(status: string, resultReference: string | null) {
  if (!resultReference) return null;
  return /UNAVAILABLE|FAILED|INSUFFICIENT|INVALID|NO_SAFE/i.test(`${status} ${resultReference}`)
    ? resultReference
    : null;
}

function practiceStepOrder(stepType: string) {
  const order: Record<string, number> = {
    READING: 1,
    KEYWORD_RECALL: 2,
    LOGIC_SKELETON_RECALL: 3,
    NO_HINT_RECALL: 4,
    ANCHOR_TEXT: 5,
    CLOZE_RECALL: 6,
    CUMULATIVE_RECALL: 7,
  };
  return order[stepType] ?? Number.MAX_SAFE_INTEGER;
}
