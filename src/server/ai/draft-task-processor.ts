import type { PrismaClient } from '@prisma/client';
import type { AiProviderAdapter } from '@/ai/provider';

/** R2 保存 changeSet 草稿；R3 在缺少确认个人事实模型时安全停止。 */
export class DraftTaskProcessor {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly provider: AiProviderAdapter,
  ) {}

  async process(taskId: string) {
    const task = await this.prisma.aiTask.findUniqueOrThrow({
      where: { id: taskId },
      include: { releaseBundle: true },
    });
    if (task.role === 'R3') return this.processR3(task);
    if (task.role !== 'R2') throw new Error('不是 R2/R3 草稿任务。');
    const source = await this.prisma.sourceAssetVersion.findUniqueOrThrow({
      where: { id: task.entityId },
    });
    const attemptNo = (await this.prisma.aiTaskAttempt.count({ where: { aiTaskId: task.id } })) + 1;
    await this.prisma.aiTask.update({ where: { id: task.id }, data: { status: 'RUNNING' } });
    try {
      const result = await this.provider.execute({
        taskId,
        role: 'R2',
        releaseBundleVersion: task.releaseBundle.version,
        text: `Return JSON only: {"changeSet":[]}. Propose edits only; do not publish.\n${source.coreFlow}`,
      });
      if (result.kind !== 'DRAFT' || !JSON.parse(result.draft).changeSet)
        throw new Error('R2 changeSet 无效。');
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
      return this.prisma.aiTask.update({
        where: { id: task.id },
        data: { status: 'AWAITING_USER_CONFIRMATION', resultReference: 'R2_CHANGESET_DRAFT' },
      });
    } catch (error) {
      await this.prisma.aiTaskAttempt.create({
        data: {
          aiTaskId: task.id,
          attemptNo,
          attemptType: 'INITIAL',
          provider: this.provider.name,
          status: 'FAILED',
          rawResponse: error instanceof Error ? error.message : 'R2 草稿失败。',
        },
      });
      return this.prisma.aiTask.update({
        where: { id: task.id },
        data: { status: 'FAILED_RETRYABLE', resultReference: 'R2_DRAFT_FAILED' },
      });
    }
  }

  private async processR3(task: {
    id: string;
    entityId: string;
    releaseBundle: { version: string };
  }) {
    const personal = await this.prisma.personalAssetVersion.findUniqueOrThrow({
      where: { id: task.entityId },
      include: { personalAsset: true },
    });
    const facts = await this.prisma.userFact.findMany({
      where: { userId: personal.personalAsset.userId, status: 'CONFIRMED' },
      select: { text: true },
    });
    if (facts.length === 0)
      return this.prisma.aiTask.update({
        where: { id: task.id },
        data: { status: 'NEEDS_REVIEW', resultReference: 'PERSONAL_FACTS_REQUIRED' },
      });
    const attemptNo = (await this.prisma.aiTaskAttempt.count({ where: { aiTaskId: task.id } })) + 1;
    await this.prisma.aiTask.update({ where: { id: task.id }, data: { status: 'RUNNING' } });
    try {
      const result = await this.provider.execute({
        taskId: task.id,
        role: 'R3',
        releaseBundleVersion: task.releaseBundle.version,
        text: `Return JSON only: {"triggerName":"","coreIdea":"","coreFlow":"","scenario":""}. Use only these confirmed facts; do not invent experiences.\nFacts:\n${facts.map((f) => `- ${f.text}`).join('\n')}\nCurrent asset:\n${personal.coreFlow}`,
      });
      if (result.kind !== 'DRAFT') throw new Error('R3 未返回草稿。');
      const draft = JSON.parse(result.draft) as {
        triggerName?: unknown;
        coreIdea?: unknown;
        coreFlow?: unknown;
        scenario?: unknown;
      };
      if (
        ![draft.triggerName, draft.coreIdea, draft.coreFlow].every(
          (value) => typeof value === 'string' && value.trim(),
        )
      )
        throw new Error('R3 草稿结构不完整。');
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
      return this.prisma.aiTask.update({
        where: { id: task.id },
        data: { status: 'AWAITING_USER_CONFIRMATION', resultReference: 'R3_PERSONAL_DRAFT' },
      });
    } catch (error) {
      await this.prisma.aiTaskAttempt.create({
        data: {
          aiTaskId: task.id,
          attemptNo,
          attemptType: 'INITIAL',
          provider: this.provider.name,
          status: 'FAILED',
          rawResponse: error instanceof Error ? error.message : 'R3 草稿失败。',
        },
      });
      return this.prisma.aiTask.update({
        where: { id: task.id },
        data: { status: 'FAILED_RETRYABLE', resultReference: 'R3_DRAFT_FAILED' },
      });
    }
  }
}
