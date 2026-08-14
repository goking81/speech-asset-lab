import { createHash } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';

import type { AiProviderAdapter } from '@/ai/provider';
import {
  SupportedQuestionService,
  type ResolvedQuestionSupport,
} from '@/server/questions/supported-question-service';

import { ensureLocalR4Release } from './r4-release-service';

export type R4DraftRequest = {
  userId: string;
  primaryPersonalAssetVersionId: string;
  secondaryPersonalAssetVersionId?: string;
  confirmedFactIds?: string[];
};

export type R4DraftResult = {
  taskId: string;
  status: string;
  questionText: string | null;
};

/** R4 只保存待确认的 JSON 草稿，绝不创建 Question 或 QuestionPlan。 */
export class R4DraftService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly provider: AiProviderAdapter,
  ) {}

  async request(input: R4DraftRequest): Promise<R4DraftResult> {
    const support = await new SupportedQuestionService(this.prisma).resolveSupportInput(input);
    const bundle = await ensureLocalR4Release(this.prisma);
    const inputFingerprint = fingerprint(support);
    const task = await this.prisma.aiTask.upsert({
      where: {
        role_entityId_entityVersion_releaseBundleId_inputFingerprint: {
          role: 'R4',
          entityId: support.primary.personalAssetVersionId,
          entityVersion: support.primary.version,
          releaseBundleId: bundle.id,
          inputFingerprint,
        },
      },
      update: {},
      create: {
        releaseBundleId: bundle.id,
        role: 'R4',
        entityType: 'SupportedQuestionDraftRequest',
        entityId: support.primary.personalAssetVersionId,
        entityVersion: support.primary.version,
        inputFingerprint,
      },
      include: { attempts: { orderBy: { attemptNo: 'desc' }, take: 1 } },
    });

    if (task.status === 'AWAITING_USER_CONFIRMATION') {
      return {
        taskId: task.id,
        status: task.status,
        questionText: questionTextFrom(task.attempts[0]?.parsedJson),
      };
    }

    return this.process(task.id, support);
  }

  private async process(taskId: string, support: ResolvedQuestionSupport): Promise<R4DraftResult> {
    const task = await this.prisma.aiTask.findUniqueOrThrow({
      where: { id: taskId },
      include: { releaseBundle: true },
    });
    const attemptNo = (await this.prisma.aiTaskAttempt.count({ where: { aiTaskId: task.id } })) + 1;
    await this.prisma.aiTask.update({ where: { id: task.id }, data: { status: 'RUNNING' } });

    try {
      const result = await this.provider.execute({
        taskId: task.id,
        role: 'R4',
        releaseBundleVersion: task.releaseBundle.version,
        text: r4PromptInput(support),
      });
      if (result.kind !== 'DRAFT') throw new Error('R4 未返回问题草稿。');
      const questionText = parseDraftQuestion(result.draft);
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
      const completed = await this.prisma.aiTask.update({
        where: { id: task.id },
        data: {
          status: 'AWAITING_USER_CONFIRMATION',
          resultReference: 'R4_SUPPORTED_QUESTION_DRAFT',
        },
      });
      return { taskId: completed.id, status: completed.status, questionText };
    } catch (error) {
      await this.prisma.aiTaskAttempt.create({
        data: {
          aiTaskId: task.id,
          attemptNo,
          attemptType: 'INITIAL',
          provider: this.provider.name,
          status: 'FAILED',
          rawResponse: error instanceof Error ? error.message : 'R4 草稿失败。',
        },
      });
      const failed = await this.prisma.aiTask.update({
        where: { id: task.id },
        data: { status: 'FAILED_RETRYABLE', resultReference: 'R4_DRAFT_FAILED' },
      });
      return { taskId: failed.id, status: failed.status, questionText: null };
    }
  }
}

function fingerprint(support: ResolvedQuestionSupport) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        primary: support.primary.personalAssetVersionId,
        secondary: support.secondary?.personalAssetVersionId ?? null,
        facts: support.facts.map((fact) => fact.id).sort(),
        nodes: support.obligationNodes.map((node) => node.id),
      }),
    )
    .digest('hex');
}

function r4PromptInput(support: ResolvedQuestionSupport) {
  const assets = [support.primary, support.secondary].filter(
    (asset): asset is ResolvedQuestionSupport['primary'] => Boolean(asset),
  );
  return [
    'Return JSON only: {"questionText":""}.',
    'Draft exactly one natural user-facing question. It must be answerable with the supplied asset nodes only.',
    'Do not claim this question is confirmed. Do not add personal facts that are not listed.',
    'Callable asset nodes:',
    ...assets.flatMap((asset) =>
      asset.nodes.map((node) => `- [${asset.triggerName}] ${node.text}`),
    ),
    'Confirmed personal facts:',
    ...(support.facts.length ? support.facts.map((fact) => `- ${fact.text}`) : ['- none']),
  ].join('\n');
}

function parseDraftQuestion(value: string) {
  const parsed = JSON.parse(value) as { questionText?: unknown };
  if (typeof parsed.questionText !== 'string' || !parsed.questionText.trim()) {
    throw new Error('R4 草稿缺少非空问题文本。');
  }
  return parsed.questionText.trim();
}

function questionTextFrom(value: string | null | undefined) {
  if (!value) return null;
  try {
    return parseDraftQuestion(value);
  } catch {
    return null;
  }
}
