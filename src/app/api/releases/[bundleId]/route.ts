import { NextResponse } from 'next/server';

import { createDatabaseClient } from '@/server/db/client';
import {
  ReleaseGateService,
  ReleaseGateValidationError,
} from '@/server/releases/release-gate-service';

export const dynamic = 'force-dynamic';

/** 人工批准、激活、撤回和回滚；所有状态迁移由 ReleaseGateService 本地校验。 */
export async function POST(request: Request, context: { params: Promise<{ bundleId: string }> }) {
  const { bundleId } = await context.params;
  const prisma = createDatabaseClient();
  try {
    const body = (await request.json()) as { action?: unknown };
    const service = new ReleaseGateService(prisma);
    const action = typeof body.action === 'string' ? body.action : '';
    const release =
      action === 'APPROVE'
        ? await service.approve(bundleId)
        : action === 'ACTIVATE'
          ? await service.activate(bundleId)
          : action === 'REVOKE'
            ? await service.revoke(bundleId)
            : action === 'ROLLBACK'
              ? await service.rollback(bundleId)
              : null;
    if (!release) {
      return NextResponse.json({ error: '发布操作无效。' }, { status: 400 });
    }
    return NextResponse.json({ release });
  } catch (error) {
    const status = error instanceof ReleaseGateValidationError ? 409 : 500;
    const message =
      error instanceof ReleaseGateValidationError ? error.message : '本地发布操作失败。';
    return NextResponse.json({ error: message }, { status });
  } finally {
    await prisma.$disconnect();
  }
}
