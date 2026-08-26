import { NextResponse } from 'next/server';

import { DeepSeekAiProvider, UnconfiguredAiProvider } from '@/ai/provider';
import { syncEnvironmentProviderConfig } from '@/server/ai/provider-config-service';
import { R5CoachService, R5CoachValidationError } from '@/server/ai/r5-coach-service';
import { createDatabaseClient } from '@/server/db/client';
import { LocalDailyPlanService } from '@/server/planning/local-daily-plan-service';
import { isCloudTrialRuntime } from '@/lib/runtime-mode';
import { cloudTrialUnavailableResponse } from '@/server/cloud-trial-response';

export const dynamic = 'force-dynamic';

export async function POST() {
  if (isCloudTrialRuntime()) return cloudTrialUnavailableResponse();

  const prisma = createDatabaseClient();
  try {
    const plan = await new LocalDailyPlanService(prisma).getOrCreateTodayPlan();
    await syncEnvironmentProviderConfig(prisma);
    const configured = await prisma.aiProviderConfig.findFirst({
      where: { userId: 'local-user', isEnabled: true },
      select: { id: true },
    });
    const provider = configured ? new DeepSeekAiProvider() : new UnconfiguredAiProvider();
    const coach = await new R5CoachService(prisma, provider).request('local-user', plan.id);
    return NextResponse.json({ plan, coach });
  } catch (error) {
    const message =
      error instanceof R5CoachValidationError || error instanceof Error
        ? error.message
        : '无法请求 R5 Coach 草稿。';
    return NextResponse.json({ error: message }, { status: 400 });
  } finally {
    await prisma.$disconnect();
  }
}
