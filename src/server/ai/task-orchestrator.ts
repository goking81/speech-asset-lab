import type { PrismaClient } from '@prisma/client';

import { AiProviderError, type AiProviderAdapter, type AiProviderErrorCode } from '@/ai/provider';

export class AiTaskOrchestrator {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly provider: AiProviderAdapter,
    private readonly retryLimit = 1,
  ) {}

  async process(taskId: string) {
    const task = await this.prisma.aiTask.findUnique({
      where: { id: taskId },
      include: { releaseBundle: true },
    });

    if (!task) {
      throw new Error('AI 任务不存在。');
    }

    if (task.status === 'SUPERSEDED') {
      return task;
    }

    const answer = await this.prisma.trainingAnswer.findUnique({ where: { id: task.entityId } });

    if (!answer) {
      return this.recordFailure(task, 'FAILED', '训练回答不存在。');
    }

    const attemptNo = (await this.prisma.aiTaskAttempt.count({ where: { aiTaskId: task.id } })) + 1;
    await this.prisma.aiTask.update({ where: { id: task.id }, data: { status: 'RUNNING' } });

    try {
      const result = await this.provider.execute({
        taskId: task.id,
        role: task.role,
        text: answer.text,
        releaseBundleVersion: task.releaseBundle.version,
      });

      if (result.kind === 'INSUFFICIENT_TEXT') {
        await this.prisma.aiTaskAttempt.create({
          data: {
            aiTaskId: task.id,
            attemptNo,
            attemptType: 'INITIAL',
            provider: this.provider.name,
            status: 'INSUFFICIENT_TEXT',
            parsedJson: JSON.stringify(result),
          },
        });

        return this.prisma.aiTask.update({
          where: { id: task.id },
          data: { status: 'NEEDS_REVIEW', resultReference: 'INSUFFICIENT_TEXT' },
        });
      }

      await this.prisma.aiTaskAttempt.create({
        data: {
          aiTaskId: task.id,
          attemptNo,
          attemptType: 'INITIAL',
          provider: this.provider.name,
          status: 'DRAFT_READY',
          parsedJson: JSON.stringify(result),
        },
      });

      return this.prisma.aiTask.update({
        where: { id: task.id },
        data: { status: 'AWAITING_USER_CONFIRMATION', resultReference: 'DRAFT' },
      });
    } catch (error) {
      const providerError =
        error instanceof AiProviderError
          ? error
          : new AiProviderError('FAILED', 'AI Provider 执行失败。');

      return this.recordFailure(task, providerError.code, providerError.message, attemptNo);
    }
  }

  async supersede(taskId: string) {
    return this.prisma.aiTask.update({
      where: { id: taskId },
      data: { status: 'SUPERSEDED' },
    });
  }

  async recoverPending(limit = 20) {
    const tasks = await this.prisma.aiTask.findMany({
      where: { status: { in: ['QUEUED', 'FAILED_RETRYABLE'] } },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true },
    });

    return Promise.all(tasks.map((task) => this.process(task.id)));
  }

  private async recordFailure(
    task: { id: string },
    code: AiProviderErrorCode | 'FAILED',
    message: string,
    attemptNo?: number,
  ) {
    const nextAttemptNo =
      attemptNo ?? (await this.prisma.aiTaskAttempt.count({ where: { aiTaskId: task.id } })) + 1;

    await this.prisma.aiTaskAttempt.create({
      data: {
        aiTaskId: task.id,
        attemptNo: nextAttemptNo,
        attemptType: 'INITIAL',
        provider: this.provider.name,
        status: code,
        rawResponse: message,
      },
    });

    return this.prisma.aiTask.update({
      where: { id: task.id },
      data: {
        status: nextAttemptNo > this.retryLimit ? 'FAILED_TERMINAL' : 'FAILED_RETRYABLE',
        resultReference: code,
      },
    });
  }
}
