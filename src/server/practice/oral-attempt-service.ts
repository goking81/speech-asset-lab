import type { PrismaClient } from '@prisma/client';

import {
  canSaveOralAttempt,
  type CompletionRating,
  type DifficultyRating,
} from '@/lib/practice-gates';

type OralAttemptInput = {
  assetPracticeSessionId: string;
  stepType: 'KEYWORD_RECALL' | 'LOGIC_SKELETON_RECALL' | 'NO_HINT_RECALL';
  oralAttemptConfirmed: boolean;
  completionRating: CompletionRating | null;
  difficultyRating: DifficultyRating | null;
  idempotencyKey: string;
};

export class OralAttemptValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OralAttemptValidationError';
  }
}

export class OralAttemptService {
  constructor(private readonly prisma: PrismaClient) {}

  async save(input: OralAttemptInput) {
    if (!canSaveOralAttempt({ ...input, isSaving: false })) {
      throw new OralAttemptValidationError('口头尝试尚未完成必填确认与自评。');
    }

    return this.prisma.$transaction(async (transaction) => {
      const session = await transaction.assetPracticeSession.findUnique({
        where: { id: input.assetPracticeSessionId },
        select: { id: true },
      });

      if (!session) {
        throw new OralAttemptValidationError('资产训练会话不存在。');
      }

      return transaction.assetPracticeAttempt.upsert({
        where: { idempotencyKey: input.idempotencyKey },
        update: {},
        create: {
          assetPracticeSessionId: session.id,
          stepType: input.stepType,
          modality: 'ORAL_SELF_REPORT',
          status: 'COMPLETED',
          oralAttemptConfirmed: input.oralAttemptConfirmed,
          completionRating: input.completionRating,
          difficultyRating: input.difficultyRating,
          completedAt: new Date(),
          idempotencyKey: input.idempotencyKey,
        },
      });
    });
  }
}
