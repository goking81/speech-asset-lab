import { createHash } from 'node:crypto';
import type { AiRole, PrismaClient } from '@prisma/client';

import { ensureLocalR1Release } from './r1-release-service';

/** R2/R3 草稿任务只引用正式版本，不具备任何覆盖写入能力。 */
export class DraftTaskService {
  constructor(private readonly prisma: PrismaClient) {}

  async queue(role: Extract<AiRole, 'R2' | 'R3'>, entityId: string, entityVersion: number) {
    const bundle = await ensureLocalR1Release(this.prisma);
    const fingerprint = createHash('sha256')
      .update(`${role}:${entityId}:${entityVersion}`)
      .digest('hex');
    return this.prisma.aiTask.upsert({
      where: {
        role_entityId_entityVersion_releaseBundleId_inputFingerprint: {
          role,
          entityId,
          entityVersion,
          releaseBundleId: bundle.id,
          inputFingerprint: fingerprint,
        },
      },
      update: {},
      create: {
        releaseBundleId: bundle.id,
        role,
        entityType: role === 'R2' ? 'SourceAssetVersion' : 'PersonalAssetVersion',
        entityId,
        entityVersion,
        inputFingerprint: fingerprint,
      },
    });
  }
}
