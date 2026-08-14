import { Prisma, type PrismaClient } from '@prisma/client';

export type AnswerUnitDraft = {
  sequence: number;
  unitType: 'SENTENCE' | 'CLAUSE';
  startOffset: number;
  endOffset: number;
  text: string;
};

/**
 * 仅用本地确定性边界切分已保存回答。Unit 保留原文 offset，不修改用户文字，供后续证据精确回链。
 */
export function segmentAnswerText(text: string): AnswerUnitDraft[] {
  const boundary = /[.!?。！？]+|[,，;；:：]+/gu;
  const units: AnswerUnitDraft[] = [];
  let startOffset = 0;
  let sequence = 1;
  let match: RegExpExecArray | null;

  const append = (endOffset: number, unitType: AnswerUnitDraft['unitType']) => {
    const raw = text.slice(startOffset, endOffset);
    const leadingWhitespace = raw.match(/^\s*/u)?.[0].length ?? 0;
    const trailingWhitespace = raw.match(/\s*$/u)?.[0].length ?? 0;
    const trimmedStart = startOffset + leadingWhitespace;
    const trimmedEnd = endOffset - trailingWhitespace;
    const value = text.slice(trimmedStart, trimmedEnd);
    if (value) {
      units.push({
        sequence,
        unitType,
        startOffset: trimmedStart,
        endOffset: trimmedEnd,
        text: value,
      });
      sequence += 1;
    }
    startOffset = endOffset;
  };

  while ((match = boundary.exec(text))) {
    const endOffset = match.index + match[0].length;
    append(endOffset, /[.!?。！？]/u.test(match[0]) ? 'SENTENCE' : 'CLAUSE');
  }
  if (startOffset < text.length) append(text.length, 'SENTENCE');
  return units;
}

export class AnswerUnitService {
  constructor(private readonly prisma: PrismaClient) {}

  async ensure(answerId: string) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const answer = await transaction.trainingAnswer.findUnique({
          where: { id: answerId },
          include: { units: { orderBy: { sequence: 'asc' } } },
        });
        if (!answer) throw new AnswerUnitValidationError('回答不存在。', 'ANSWER_NOT_FOUND');
        if (answer.units.length > 0) return answer.units;

        const drafts = segmentAnswerText(answer.text);
        if (drafts.length === 0) {
          throw new AnswerUnitValidationError('回答没有可回链的文字单元。', 'ANSWER_EMPTY');
        }
        await transaction.answerUnit.createMany({
          data: drafts.map((unit) => ({ trainingAnswerId: answer.id, ...unit })),
        });
        return transaction.answerUnit.findMany({
          where: { trainingAnswerId: answer.id },
          orderBy: { sequence: 'asc' },
        });
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
      return this.prisma.answerUnit.findMany({
        where: { trainingAnswerId: answerId },
        orderBy: { sequence: 'asc' },
      });
    }
  }
}

export class AnswerUnitValidationError extends Error {
  constructor(
    message: string,
    readonly code: 'ANSWER_NOT_FOUND' | 'ANSWER_EMPTY',
  ) {
    super(message);
    this.name = 'AnswerUnitValidationError';
  }
}
