import { NextResponse } from 'next/server';

import {
  SupportedQuestionService,
  SupportedQuestionValidationError,
} from '@/server/questions/supported-question-service';
import { createDatabaseClient } from '@/server/db/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  let prisma: ReturnType<typeof createDatabaseClient> | undefined;
  try {
    prisma = createDatabaseClient();
    const overview = await new SupportedQuestionService(prisma).getPracticeOverview('local-user');
    return NextResponse.json(overview);
  } catch (error) {
    console.error('读取问题训练数据失败。', error);
    return NextResponse.json({ error: '问题训练数据暂时不可用，请稍后刷新。' }, { status: 503 });
  } finally {
    await prisma?.$disconnect();
  }
}

export async function POST(request: Request) {
  const prisma = createDatabaseClient();
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const source = body.source === 'AI_GENERATED' ? 'AI_GENERATED' : 'USER_REAL';
    const result = await new SupportedQuestionService(prisma).createPlan({
      userId: 'local-user',
      questionText: stringValue(body.questionText),
      source,
      primaryPersonalAssetVersionId: stringValue(body.primaryPersonalAssetVersionId),
      secondaryPersonalAssetVersionId: optionalStringValue(body.secondaryPersonalAssetVersionId),
      confirmedFactIds: stringArray(body.confirmedFactIds),
    });
    return NextResponse.json({ planId: result.plan.id, questionId: result.question.id });
  } catch (error) {
    const message =
      error instanceof SupportedQuestionValidationError || error instanceof Error
        ? error.message
        : '无法创建受支撑问题计划。';
    return NextResponse.json({ error: message }, { status: 400 });
  } finally {
    await prisma.$disconnect();
  }
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function optionalStringValue(value: unknown) {
  return typeof value === 'string' && value ? value : undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
