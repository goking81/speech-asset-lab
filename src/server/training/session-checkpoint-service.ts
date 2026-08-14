import type { PrismaClient } from '@prisma/client';

export type CreateSessionCheckpointInput = {
  trainingSessionId: string;
  checkpointType: string;
  payload?: unknown;
};

export class SessionCheckpointValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionCheckpointValidationError';
  }
}

function serializePayload(payload: unknown) {
  if (payload === undefined) {
    return undefined;
  }

  try {
    return JSON.stringify(payload);
  } catch {
    throw new SessionCheckpointValidationError('Checkpoint 数据必须可序列化为 JSON。');
  }
}

export class SessionCheckpointService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateSessionCheckpointInput) {
    if (!input.checkpointType.trim()) {
      throw new SessionCheckpointValidationError('Checkpoint 类型不能为空。');
    }

    const session = await this.prisma.trainingSession.findUnique({
      where: { id: input.trainingSessionId },
      select: { id: true },
    });

    if (!session) {
      throw new SessionCheckpointValidationError('训练会话不存在。');
    }

    return this.prisma.sessionCheckpoint.create({
      data: {
        trainingSessionId: session.id,
        checkpointType: input.checkpointType.trim(),
        payloadJson: serializePayload(input.payload),
      },
    });
  }

  async latest(trainingSessionId: string) {
    return this.prisma.sessionCheckpoint.findFirst({
      where: { trainingSessionId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
