import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterAll, beforeAll, expect, test } from 'vitest';

import { MockAiProvider, type AiProviderRequest, type AiProviderResult } from '@/ai/provider';
import { ensureLocalR4Release } from '@/server/ai/r4-release-service';
import { createDatabaseClient } from '@/server/db/client';

import { ReleaseGateService } from './release-gate-service';

const projectRoot = process.cwd();
const testDatabasePath = path.join(projectRoot, 'data', 'f7-release-gates.db');
const testDatabaseUrl = 'file:../data/f7-release-gates.db';
const prisma = createDatabaseClient(testDatabaseUrl);

beforeAll(async () => {
  await mkdir(path.dirname(testDatabasePath), { recursive: true });
  await Promise.all(
    [
      testDatabasePath,
      `${testDatabasePath}-journal`,
      `${testDatabasePath}-shm`,
      `${testDatabasePath}-wal`,
    ].map((file) => rm(file, { force: true })),
  );
  await writeFile(testDatabasePath, '');
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: 'pipe',
  });
  execFileSync(process.execPath, ['prisma/seed.mjs'], {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: 'pipe',
  });
});

afterAll(async () => {
  await prisma.$disconnect();
  await Promise.all(
    [
      testDatabasePath,
      `${testDatabasePath}-journal`,
      `${testDatabasePath}-shm`,
      `${testDatabasePath}-wal`,
    ].map((file) => rm(file, { force: true })),
  );
});

test('候选 Bundle 必须通过 Golden Set 并人工批准后才可以激活', async () => {
  const service = new ReleaseGateService(prisma);
  const candidate = await createR4Candidate(service, 'f7-r4-candidate-a');

  await expect(service.activate(candidate.id)).rejects.toMatchObject({
    code: 'BUNDLE_STATE_INVALID',
  });
  await expect(service.approve(candidate.id)).rejects.toMatchObject({
    code: 'GOLDEN_SET_REQUIRED',
  });

  const run = await service.runGoldenSet({
    bundleId: candidate.id,
    provider: new RoleFixtureProvider(),
    providerKey: 'mock',
    modelName: 'release-gate-fixture',
  });
  expect(run).toMatchObject({ gateStatus: 'PASSED', results: [{ status: 'PASSED' }] });
  expect(run.results[0]?.outputDigest).toMatch(/^[a-f0-9]{64}$/u);
  expect(run.results[0]).not.toHaveProperty('rawResponse');

  await expect(service.approve(candidate.id)).resolves.toMatchObject({ status: 'APPROVED' });
  await expect(service.activate(candidate.id)).resolves.toMatchObject({ status: 'ACTIVE' });
  await expect(ensureLocalR4Release(prisma)).resolves.toMatchObject({ id: candidate.id });
  await expect(
    prisma.aiReleaseAuditEvent.findMany({ where: { aiReleaseBundleId: candidate.id } }),
  ).resolves.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ action: 'CANDIDATE_CREATED' }),
      expect.objectContaining({ action: 'GOLDEN_SET_PASSED' }),
      expect.objectContaining({ action: 'APPROVED' }),
      expect.objectContaining({ action: 'ACTIVATED' }),
    ]),
  );
});

test('结构错误或 Provider 失败的 Golden Set 不能被批准，并保留本地失败摘要', async () => {
  const service = new ReleaseGateService(prisma);
  const candidate = await createR4Candidate(service, 'f7-r4-candidate-invalid');
  const run = await service.runGoldenSet({
    bundleId: candidate.id,
    provider: new MockAiProvider({ kind: 'DRAFT', draft: 'not-json' }),
    providerKey: 'mock',
    modelName: 'invalid-fixture',
  });

  expect(run).toMatchObject({
    gateStatus: 'FAILED',
    failureSummary: '1 个合成 Golden Set 未通过。',
  });
  expect(run.results[0]).toMatchObject({
    status: 'FAILED',
    failureCode: 'STRUCTURE_INVALID',
    failureMessage: 'Golden Set 草稿没有通过本地结构或安全边界校验。',
  });
  await expect(service.approve(candidate.id)).rejects.toMatchObject({
    code: 'GOLDEN_SET_REQUIRED',
  });
  await expect(prisma.aiTask.count({ where: { releaseBundleId: candidate.id } })).resolves.toBe(0);
});

test('回滚只切换新会话的可用 Bundle，不改写历史会话的冻结引用', async () => {
  const service = new ReleaseGateService(prisma);
  const first = await createR4Candidate(service, 'f7-r4-candidate-b');
  await passApproveActivate(service, first.id);

  const historicalSession = await createHistoricalSession(first.id);
  const second = await createR4Candidate(service, 'f7-r4-candidate-c');
  await passApproveActivate(service, second.id);
  await expect(
    prisma.aiReleaseBundle.findUniqueOrThrow({ where: { id: first.id } }),
  ).resolves.toMatchObject({
    status: 'DEPRECATED',
  });

  await expect(service.rollback(first.id)).resolves.toMatchObject({ status: 'ACTIVE' });
  await expect(
    prisma.trainingSession.findUniqueOrThrow({ where: { id: historicalSession.id } }),
  ).resolves.toMatchObject({
    releaseBundleId: first.id,
  });
  await expect(
    prisma.aiReleaseBundle.findUniqueOrThrow({ where: { id: second.id } }),
  ).resolves.toMatchObject({
    status: 'DEPRECATED',
  });
});

test('Provider 兼容性不配置或失败时保留本地安全降级，并可在报告中审计', async () => {
  const service = new ReleaseGateService(prisma);
  await expect(
    service.testProviderCompatibility({
      providerKey: 'deepseek',
      modelName: 'not-configured',
      provider: null,
    }),
  ).resolves.toMatchObject({
    status: 'NOT_CONFIGURED',
    fallbackStatus: 'LOCAL_FALLBACK',
    failureCode: 'PROVIDER_NOT_CONFIGURED',
  });
  await expect(
    service.testProviderCompatibility({
      providerKey: 'mock',
      modelName: 'fixture',
      provider: new MockAiProvider({ kind: 'ERROR', code: 'TIMEOUT' }),
    }),
  ).resolves.toMatchObject({
    status: 'INCOMPATIBLE',
    fallbackStatus: 'LOCAL_FALLBACK',
    failureCode: 'TIMEOUT',
  });

  await prisma.aiProviderConfig.create({
    data: {
      userId: 'local-user',
      providerKey: 'mock',
      modelName: 'fixture',
      isEnabled: true,
      maskedKeySuffix: '1234',
    },
  });
  const report = await service.getReport();
  expect(report.providers).toContainEqual(
    expect.objectContaining({
      providerKey: 'mock',
      modelName: 'fixture',
      compatibility: expect.objectContaining({ status: 'INCOMPATIBLE' }),
    }),
  );
});

async function createR4Candidate(service: ReleaseGateService, version: string) {
  return service.createCandidate({
    version,
    prompts: [
      {
        role: 'R4',
        key: `${version}-prompt`,
        version: '1',
        content: '只生成由冻结资产支撑的问题草稿；不得发布或编造经历。',
      },
    ],
  });
}

async function passApproveActivate(service: ReleaseGateService, bundleId: string) {
  await service.runGoldenSet({
    bundleId,
    provider: new RoleFixtureProvider(),
    providerKey: 'mock',
    modelName: 'release-gate-fixture',
  });
  await service.approve(bundleId);
  await service.activate(bundleId);
}

async function createHistoricalSession(releaseBundleId: string) {
  const question = await prisma.question.create({
    data: { text: `历史冻结问题 ${releaseBundleId}`, source: 'MANUAL' },
  });
  const plan = await prisma.questionPlan.create({
    data: {
      questionId: question.id,
      version: 1,
      questionText: question.text,
      distance: 'L1',
      status: 'VALIDATED',
    },
  });
  return prisma.trainingSession.create({
    data: { userId: 'local-user', questionPlanId: plan.id, releaseBundleId },
  });
}

class RoleFixtureProvider extends MockAiProvider {
  async execute(request: AiProviderRequest): Promise<AiProviderResult> {
    const draft =
      request.role === 'R4'
        ? JSON.stringify({ questionText: 'How do you explain one supported action?' })
        : JSON.stringify({ draft: 'synthetic fixture' });
    return { kind: 'DRAFT', draft };
  }
}
