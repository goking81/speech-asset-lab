import { createHash } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';

import { canSubmitTextAnswer } from '@/lib/practice-gates';

type AnswerType = 'FIRST_ANSWER' | 'FOLLOW_UP_ANSWER' | 'SECOND_ANSWER';

export type SubmitTextAnswerInput = {
  trainingSessionId: string;
  expectedSessionVersion: number;
  answerType: AnswerType;
  sequence: number;
  text: string;
  idempotencyKey: string;
};

export class TextAnswerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TextAnswerValidationError';
  }
}

function fingerprint(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function isCurrentSession(status: string, businessVersion: number, expectedSessionVersion: number) {
  return (
    businessVersion === expectedSessionVersion && status !== 'INVALIDATED' && status !== 'ABANDONED'
  );
}

export class AnswerSubmissionService {
  constructor(private readonly prisma: PrismaClient) {}

  async submit(input: SubmitTextAnswerInput) {
    const text = input.text.trim();

    if (!canSubmitTextAnswer({ text, sessionVersionIsCurrent: true, isSubmitting: false })) {
      throw new TextAnswerValidationError('回答去除首尾空白后不能为空。');
    }

    return this.prisma.$transaction(async (transaction) => {
      const session = await transaction.trainingSession.findUnique({
        where: { id: input.trainingSessionId },
        include: { releaseBundle: true },
      });

      if (
        !session ||
        !isCurrentSession(session.status, session.businessVersion, input.expectedSessionVersion)
      ) {
        throw new TextAnswerValidationError('训练会话已失效或版本不是当前版本。');
      }

      if (!session.releaseBundle || session.releaseBundle.status !== 'ACTIVE') {
        throw new TextAnswerValidationError('当前训练会话没有可用的发布包。');
      }

      const existingAnswer = await transaction.trainingAnswer.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });

      if (
        existingAnswer &&
        (existingAnswer.trainingSessionId !== session.id ||
          existingAnswer.answerType !== input.answerType ||
          existingAnswer.sequence !== input.sequence)
      ) {
        throw new TextAnswerValidationError('幂等键不能复用于另一条回答。');
      }

      const answer =
        existingAnswer ??
        (await transaction.trainingAnswer.upsert({
          where: { idempotencyKey: input.idempotencyKey },
          update: {},
          create: {
            trainingSessionId: session.id,
            answerType: input.answerType,
            sequence: input.sequence,
            text,
            normalizedHash: fingerprint(text),
            idempotencyKey: input.idempotencyKey,
          },
        }));

      const inputFingerprint = fingerprint(answer.text.trim());
      const task = await transaction.aiTask.upsert({
        where: {
          role_entityId_entityVersion_releaseBundleId_inputFingerprint: {
            role: 'R7A',
            entityId: answer.id,
            entityVersion: answer.sequence,
            releaseBundleId: session.releaseBundle.id,
            inputFingerprint,
          },
        },
        update: {},
        create: {
          trainingSessionId: session.id,
          releaseBundleId: session.releaseBundle.id,
          role: 'R7A',
          entityType: 'TrainingAnswer',
          entityId: answer.id,
          entityVersion: answer.sequence,
          inputFingerprint,
        },
      });

      return { answer, task };
    });
  }
}
