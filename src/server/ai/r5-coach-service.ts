import { createHash } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';

import type { AiProviderAdapter } from '@/ai/provider';

import { ensureLocalR5Release } from './r5-release-service';

type LocalTaskSnapshot = {
  id: string;
  sequence: number;
  taskType: string;
  reason: string | null;
  eligibilityJson: string | null;
};

export type R5CoachAdvice = {
  summary: string;
  taskNotes: Array<{ taskId: string; reason: string }>;
};

export type R5CoachView = {
  status: 'NOT_REQUESTED' | 'DRAFT_READY' | 'LOCAL_FALLBACK' | 'NO_LOCAL_TASKS';
  taskStatus: string | null;
  advice: R5CoachAdvice | null;
  fallbackReason: string | null;
};

export class R5CoachValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'R5CoachValidationError';
  }
}

/**
 * R5 只能解释已落库的本地日计划。它从不更新 DailyPlan 或 TrainingTask。
 */
export class R5CoachService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly provider: AiProviderAdapter,
  ) {}

  async request(userId: string, dailyPlanId: string): Promise<R5CoachView> {
    const plan = await this.findPlan(userId, dailyPlanId);
    if (plan.tasks.length === 0) {
      return {
        status: 'NO_LOCAL_TASKS',
        taskStatus: null,
        advice: null,
        fallbackReason: 'NO_LOCAL_TASKS',
      };
    }

    const bundle = await ensureLocalR5Release(this.prisma);
    const inputFingerprint = planFingerprint(plan.id, plan.tasks);
    const task = await this.prisma.aiTask.upsert({
      where: {
        role_entityId_entityVersion_releaseBundleId_inputFingerprint: {
          role: 'R5',
          entityId: plan.id,
          entityVersion: 1,
          releaseBundleId: bundle.id,
          inputFingerprint,
        },
      },
      update: {},
      create: {
        releaseBundleId: bundle.id,
        role: 'R5',
        entityType: 'DailyPlan',
        entityId: plan.id,
        entityVersion: 1,
        inputFingerprint,
      },
      include: { attempts: { orderBy: { attemptNo: 'desc' }, take: 1 } },
    });

    if (task.status === 'AWAITING_USER_CONFIRMATION') {
      return viewFromTask(
        task.status,
        task.resultReference,
        task.attempts[0]?.parsedJson,
        plan.tasks,
      );
    }

    return this.process(task.id, plan.tasks);
  }

  async getSavedAdvice(userId: string, dailyPlanId: string): Promise<R5CoachView> {
    const plan = await this.findPlan(userId, dailyPlanId);
    if (plan.tasks.length === 0) {
      return {
        status: 'NO_LOCAL_TASKS',
        taskStatus: null,
        advice: null,
        fallbackReason: 'NO_LOCAL_TASKS',
      };
    }
    const task = await this.prisma.aiTask.findFirst({
      where: { role: 'R5', entityType: 'DailyPlan', entityId: plan.id },
      include: { attempts: { orderBy: { attemptNo: 'desc' }, take: 1 } },
      orderBy: { updatedAt: 'desc' },
    });
    if (!task) {
      return { status: 'NOT_REQUESTED', taskStatus: null, advice: null, fallbackReason: null };
    }
    return viewFromTask(
      task.status,
      task.resultReference,
      task.attempts[0]?.parsedJson,
      plan.tasks,
    );
  }

  private async process(taskId: string, tasks: LocalTaskSnapshot[]): Promise<R5CoachView> {
    const task = await this.prisma.aiTask.findUniqueOrThrow({
      where: { id: taskId },
      include: { releaseBundle: true },
    });
    const attemptNo = (await this.prisma.aiTaskAttempt.count({ where: { aiTaskId: task.id } })) + 1;
    await this.prisma.aiTask.update({ where: { id: task.id }, data: { status: 'RUNNING' } });
    let providerDraft = '';

    try {
      const result = await this.provider.execute({
        taskId: task.id,
        role: 'R5',
        releaseBundleVersion: task.releaseBundle.version,
        text: r5PromptInput(tasks),
        responseFormat: 'JSON_OBJECT',
      });
      if (result.kind !== 'DRAFT') throw new Error('R5 未返回 Coach 草稿。');
      providerDraft = result.draft;
      const advice = parseAdvice(providerDraft, tasks);
      await this.prisma.aiTaskAttempt.create({
        data: {
          aiTaskId: task.id,
          attemptNo,
          attemptType: 'INITIAL',
          provider: this.provider.name,
          status: 'DRAFT_READY',
          parsedJson: JSON.stringify(advice),
        },
      });
      const completed = await this.prisma.aiTask.update({
        where: { id: task.id },
        data: { status: 'AWAITING_USER_CONFIRMATION', resultReference: 'R5_COACH_DRAFT' },
      });
      return {
        status: 'DRAFT_READY',
        taskStatus: completed.status,
        advice,
        fallbackReason: null,
      };
    } catch (error) {
      await this.prisma.aiTaskAttempt.create({
        data: {
          aiTaskId: task.id,
          attemptNo,
          attemptType: 'INITIAL',
          provider: this.provider.name,
          status: 'FAILED',
          rawResponse:
            providerDraft || (error instanceof Error ? error.message : 'R5 Coach 草稿失败。'),
        },
      });
      const failed = await this.prisma.aiTask.update({
        where: { id: task.id },
        data: { status: 'FAILED_RETRYABLE', resultReference: 'R5_COACH_FAILED' },
      });
      return {
        status: 'LOCAL_FALLBACK',
        taskStatus: failed.status,
        advice: null,
        fallbackReason: failed.resultReference,
      };
    }
  }

  private async findPlan(userId: string, dailyPlanId: string) {
    const plan = await this.prisma.dailyPlan.findFirst({
      where: { id: dailyPlanId, userId },
      include: { tasks: { orderBy: { sequence: 'asc' } } },
    });
    if (!plan) throw new R5CoachValidationError('本地日计划不存在。');
    return plan;
  }
}

function planFingerprint(planId: string, tasks: LocalTaskSnapshot[]) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        planId,
        tasks: tasks.map((task) => ({
          id: task.id,
          sequence: task.sequence,
          taskType: task.taskType,
          reason: task.reason,
          eligibilityJson: task.eligibilityJson,
        })),
      }),
    )
    .digest('hex');
}

function r5PromptInput(tasks: LocalTaskSnapshot[]) {
  return [
    'Return exactly one JSON object and nothing else. Do not use Markdown fences.',
    'The object must have this exact shape: {"summary":"non-empty Chinese training focus","taskNotes":[{"taskId":"one supplied task id","reason":"non-empty Chinese reason"}]}.',
    'summary is required even if taskNotes is empty. taskNotes must be an array and may be empty.',
    'Explain only the supplied local tasks in Chinese. Do not change order, stage, eligibility, task type, task status, or add assets and questions.',
    'Every taskId in taskNotes must be exactly one supplied task ID and may appear only once.',
    'Local task snapshot:',
    ...tasks.map((task) =>
      JSON.stringify({
        taskId: task.id,
        sequence: task.sequence,
        taskType: task.taskType,
        localReason: task.reason,
        localEligibility: parseEligibility(task.eligibilityJson),
      }),
    ),
  ].join('\n');
}

function viewFromTask(
  taskStatus: string,
  resultReference: string | null,
  parsedJson: string | null | undefined,
  tasks: LocalTaskSnapshot[],
): R5CoachView {
  if (taskStatus === 'AWAITING_USER_CONFIRMATION') {
    try {
      return {
        status: 'DRAFT_READY',
        taskStatus,
        advice: parseAdvice(parsedJson ?? '', tasks),
        fallbackReason: null,
      };
    } catch {
      return {
        status: 'LOCAL_FALLBACK',
        taskStatus,
        advice: null,
        fallbackReason: 'R5_STORED_DRAFT_INVALID',
      };
    }
  }
  return {
    status: 'LOCAL_FALLBACK',
    taskStatus,
    advice: null,
    fallbackReason: resultReference ?? 'R5_NOT_AVAILABLE',
  };
}

function parseAdvice(value: string, tasks: LocalTaskSnapshot[]): R5CoachAdvice {
  const parsed = JSON.parse(value) as { summary?: unknown; taskNotes?: unknown };
  if (typeof parsed.summary !== 'string' || !parsed.summary.trim()) {
    throw new R5CoachValidationError('R5 草稿缺少总体建议。');
  }
  if (!Array.isArray(parsed.taskNotes)) {
    throw new R5CoachValidationError('R5 草稿缺少任务说明列表。');
  }
  const validTaskIds = new Set(tasks.map((task) => task.id));
  const usedTaskIds = new Set<string>();
  const taskNotes = parsed.taskNotes.map((item) => {
    const note = item as { taskId?: unknown; reason?: unknown };
    if (
      typeof note.taskId !== 'string' ||
      !validTaskIds.has(note.taskId) ||
      usedTaskIds.has(note.taskId) ||
      typeof note.reason !== 'string' ||
      !note.reason.trim()
    ) {
      throw new R5CoachValidationError('R5 草稿引用了无效的本地任务。');
    }
    usedTaskIds.add(note.taskId);
    return { taskId: note.taskId, reason: note.reason.trim() };
  });

  return { summary: parsed.summary.trim(), taskNotes };
}

function parseEligibility(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return {
      internalStage: typeof parsed.internalStage === 'string' ? parsed.internalStage : null,
      visibleStage: typeof parsed.visibleStage === 'string' ? parsed.visibleStage : null,
      reasonCode: typeof parsed.reasonCode === 'string' ? parsed.reasonCode : null,
      triggerName: typeof parsed.triggerName === 'string' ? parsed.triggerName : null,
    };
  } catch {
    return null;
  }
}
