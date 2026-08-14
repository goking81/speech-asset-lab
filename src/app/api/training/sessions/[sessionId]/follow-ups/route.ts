import { NextResponse } from 'next/server';

import { DeepSeekAiProvider, UnconfiguredAiProvider } from '@/ai/provider';
import { syncEnvironmentProviderConfig } from '@/server/ai/provider-config-service';
import { createDatabaseClient } from '@/server/db/client';
import { R6FollowUpService } from '@/server/training/r6-follow-up-service';
import { R7AUsageService } from '@/server/training/r7a-usage-service';
import { R7BEvaluationService } from '@/server/training/r7b-evaluation-service';
import {
  P08SessionService,
  P08SessionValidationError,
} from '@/server/training/p08-session-service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const prisma = createDatabaseClient();
  try {
    const body = (await request.json()) as {
      expectedBusinessVersion?: unknown;
      followUpId?: unknown;
      text?: unknown;
      idempotencyKey?: unknown;
    };
    const sessionService = new P08SessionService(prisma);
    const answer = await sessionService.submitFollowUpAnswer({
      trainingSessionId: sessionId,
      expectedBusinessVersion:
        typeof body.expectedBusinessVersion === 'number'
          ? body.expectedBusinessVersion
          : Number.NaN,
      followUpId: typeof body.followUpId === 'string' ? body.followUpId : '',
      text: typeof body.text === 'string' ? body.text : '',
      idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '',
    });
    await syncEnvironmentProviderConfig(prisma);
    const configured = await prisma.aiProviderConfig.findFirst({
      where: { userId: 'local-user', isEnabled: true },
      select: { id: true },
    });
    const provider = configured ? new DeepSeekAiProvider() : new UnconfiguredAiProvider();
    await new R7AUsageService(prisma, provider).requestForAnswer({
      trainingSessionId: sessionId,
      answerId: answer.id,
    });
    await new R7BEvaluationService(prisma, provider).requestForAnswer({
      trainingSessionId: sessionId,
      answerId: answer.id,
    });
    const saved = await sessionService.getSnapshot(sessionId);
    if (saved.status === 'FOLLOW_UP_IN_PROGRESS') {
      await new R6FollowUpService(prisma, provider).requestForAnswer({
        trainingSessionId: sessionId,
        answerId: answer.id,
      });
    }
    const session = await sessionService.getSnapshot(sessionId);
    return NextResponse.json({ answer, session });
  } catch (error) {
    if (error instanceof P08SessionValidationError) {
      const status =
        error.code === 'SESSION_NOT_FOUND' ? 404 : error.code === 'SESSION_STALE' ? 409 : 400;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    return NextResponse.json({ error: '无法保存追问回答。' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
