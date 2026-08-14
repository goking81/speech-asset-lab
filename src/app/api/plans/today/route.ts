import { NextResponse } from 'next/server';

import { UnconfiguredAiProvider } from '@/ai/provider';
import { R5CoachService } from '@/server/ai/r5-coach-service';
import { createDatabaseClient } from '@/server/db/client';
import { LocalDailyPlanService } from '@/server/planning/local-daily-plan-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  const prisma = createDatabaseClient();

  try {
    const plan = await new LocalDailyPlanService(prisma).getOrCreateTodayPlan();
    const coach = await new R5CoachService(prisma, new UnconfiguredAiProvider()).getSavedAdvice(
      'local-user',
      plan.id,
    );
    return NextResponse.json({ plan, coach });
  } catch (error) {
    const message = error instanceof Error ? error.message : '无法生成本地日计划。';
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
