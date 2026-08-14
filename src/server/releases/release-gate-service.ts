import { createHash } from 'node:crypto';

import type { AiRole, PrismaClient } from '@prisma/client';

import { AiProviderError, type AiProviderAdapter } from '@/ai/provider';

const LOCAL_USER_ID = 'local-user';
const GOLDEN_SET_VERSION = '1';

type GoldenSetExpectation = {
  requiredKeys: string[];
  forbiddenTerms: string[];
};

type GoldenSetCaseDefinition = {
  key: string;
  role: AiRole;
  input: Record<string, unknown>;
  expectation: GoldenSetExpectation;
};

const goldenSetCases: GoldenSetCaseDefinition[] = [
  goldenCase('R1', ['candidates']),
  goldenCase('R2', ['changeSet']),
  goldenCase('R3', ['triggerName', 'coreIdea', 'coreFlow', 'scenario']),
  goldenCase('R4', ['questionText']),
  goldenCase('R4A', ['draft']),
  goldenCase('R5', ['summary', 'taskNotes']),
  goldenCase('R6', ['action']),
  goldenCase('R7A', ['assets', 'obligationCoverage']),
  goldenCase('R7B', ['dimensions', 'issues', 'recommendations', 'corrections']),
  goldenCase('R7C', ['observations', 'limitation']),
];

export type ReleaseReport = {
  bundles: Array<{
    id: string;
    version: string;
    status: string;
    bundleHash: string;
    roles: string[];
    createdAt: Date;
    activatedAt: Date | null;
    latestGoldenSet: {
      id: string;
      status: string;
      gateStatus: string;
      completedAt: Date | null;
      failureSummary: string | null;
      resultCount: number;
      passedCount: number;
    } | null;
    audits: Array<{
      action: string;
      actor: string;
      createdAt: Date;
      detail: Record<string, unknown>;
    }>;
  }>;
  providers: Array<{
    providerKey: string;
    modelName: string;
    isEnabled: boolean;
    timeoutMs: number;
    retryCount: number;
    maskedKeySuffix: string | null;
    compatibility: {
      status: string;
      fallbackStatus: string;
      failureCode: string | null;
      testedAt: Date;
    } | null;
  }>;
};

export class ReleaseGateValidationError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'BUNDLE_NOT_FOUND'
      | 'BUNDLE_STATE_INVALID'
      | 'GOLDEN_SET_REQUIRED'
      | 'PROVIDER_NOT_CONFIGURED'
      | 'CANDIDATE_INVALID',
  ) {
    super(message);
    this.name = 'ReleaseGateValidationError';
  }
}

/**
 * F7 发布门禁只记录合成 Golden Set 的摘要与输出 Hash，不保存用户回答、原始模型输出或密钥。
 * Bundle 的候选、批准、激活、撤回和回滚都在本服务内裁决，避免页面直接改写发布状态。
 */
export class ReleaseGateService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async ensureGoldenSetCases() {
    for (const definition of goldenSetCases) {
      await this.prisma.aiGoldenSetCase.upsert({
        where: { key_version: { key: definition.key, version: GOLDEN_SET_VERSION } },
        update: {},
        create: {
          key: definition.key,
          version: GOLDEN_SET_VERSION,
          role: definition.role,
          inputJson: JSON.stringify(definition.input),
          expectationJson: JSON.stringify(definition.expectation),
        },
      });
    }
  }

  /** 创建不可变候选包；此操作不批准、不激活，也不改写任意历史 Bundle。 */
  async createCandidate(input: {
    version: string;
    prompts: Array<{
      role: AiRole;
      key: string;
      version: string;
      content: string;
      schemaJson?: string;
    }>;
    actor?: string;
  }) {
    const version = input.version.trim();
    if (
      !version ||
      input.prompts.length === 0 ||
      new Set(input.prompts.map((item) => item.role)).size !== input.prompts.length
    ) {
      throw new ReleaseGateValidationError(
        '候选发布包必须包含唯一角色和版本。',
        'CANDIDATE_INVALID',
      );
    }
    const normalizedPrompts = input.prompts.map((prompt) => ({
      ...prompt,
      key: prompt.key.trim(),
      version: prompt.version.trim(),
      content: prompt.content.trim(),
      schemaJson: prompt.schemaJson?.trim() || null,
    }));
    if (normalizedPrompts.some((prompt) => !prompt.key || !prompt.version || !prompt.content)) {
      throw new ReleaseGateValidationError('候选 Prompt 不能包含空字段。', 'CANDIDATE_INVALID');
    }
    const bundleHash = createHash('sha256')
      .update(
        JSON.stringify({
          version,
          prompts: normalizedPrompts
            .map((prompt) => ({
              role: prompt.role,
              key: prompt.key,
              version: prompt.version,
              content: prompt.content,
              schemaJson: prompt.schemaJson,
            }))
            .sort((left, right) => left.role.localeCompare(right.role)),
        }),
      )
      .digest('hex');

    return this.prisma.$transaction(async (transaction) => {
      const promptIds: Array<{ role: AiRole; promptDefinitionId: string }> = [];
      for (const prompt of normalizedPrompts) {
        const existing = await transaction.promptDefinition.findUnique({
          where: { key_version: { key: prompt.key, version: prompt.version } },
        });
        if (existing) {
          if (existing.content !== prompt.content || existing.schemaJson !== prompt.schemaJson) {
            throw new ReleaseGateValidationError(
              '同一 Prompt 标识已经指向不同内容；请创建新版本。',
              'CANDIDATE_INVALID',
            );
          }
          promptIds.push({ role: prompt.role, promptDefinitionId: existing.id });
          continue;
        }
        const created = await transaction.promptDefinition.create({
          data: {
            key: prompt.key,
            version: prompt.version,
            content: prompt.content,
            schemaJson: prompt.schemaJson,
          },
        });
        promptIds.push({ role: prompt.role, promptDefinitionId: created.id });
      }
      const existing = await transaction.aiReleaseBundle.findFirst({
        where: { OR: [{ version }, { bundleHash }] },
      });
      if (existing) {
        if (existing.bundleHash === bundleHash) return existing;
        throw new ReleaseGateValidationError('发布版本已存在，不能覆盖。', 'CANDIDATE_INVALID');
      }
      const bundle = await transaction.aiReleaseBundle.create({
        data: {
          version,
          bundleHash,
          status: 'CANDIDATE',
          prompts: { create: promptIds },
        },
      });
      await transaction.aiReleaseAuditEvent.create({
        data: {
          aiReleaseBundleId: bundle.id,
          action: 'CANDIDATE_CREATED',
          actor: input.actor ?? LOCAL_USER_ID,
          detailJson: JSON.stringify({ roles: promptIds.map((prompt) => prompt.role).sort() }),
        },
      });
      return bundle;
    });
  }

  async runGoldenSet(input: {
    bundleId: string;
    provider: AiProviderAdapter;
    providerKey?: string;
    modelName?: string;
    actor?: string;
  }) {
    await this.ensureGoldenSetCases();
    const bundle = await this.prisma.aiReleaseBundle.findUnique({
      where: { id: input.bundleId },
      include: { prompts: { select: { role: true } } },
    });
    if (!bundle) throw new ReleaseGateValidationError('发布包不存在。', 'BUNDLE_NOT_FOUND');
    if (!['CANDIDATE', 'APPROVED', 'DEPRECATED'].includes(bundle.status)) {
      throw new ReleaseGateValidationError(
        '当前发布状态不能运行 Golden Set。',
        'BUNDLE_STATE_INVALID',
      );
    }
    const roles = bundle.prompts.map((prompt) => prompt.role);
    const cases = await this.prisma.aiGoldenSetCase.findMany({
      where: { role: { in: roles }, isEnabled: true },
      orderBy: { key: 'asc' },
    });
    if (cases.length !== new Set(roles).size) {
      throw new ReleaseGateValidationError(
        '发布包缺少对应角色的 Golden Set。',
        'GOLDEN_SET_REQUIRED',
      );
    }
    const run = await this.prisma.aiGoldenSetRun.create({
      data: {
        aiReleaseBundleId: bundle.id,
        providerKey: input.providerKey ?? input.provider.name,
        modelName: input.modelName ?? null,
        runtimeJson: JSON.stringify(runtimeSnapshot()),
      },
    });
    let failed = 0;
    for (const goldenCase of cases) {
      const startedAt = Date.now();
      const result = await runGoldenCase(input.provider, bundle.version, goldenCase);
      if (!result.passed) failed += 1;
      await this.prisma.aiGoldenSetResult.create({
        data: {
          aiGoldenSetRunId: run.id,
          aiGoldenSetCaseId: goldenCase.id,
          status: result.passed ? 'PASSED' : 'FAILED',
          outputKind: result.outputKind,
          outputDigest: result.outputDigest,
          failureCode: result.failureCode,
          failureMessage: result.failureMessage,
          durationMs: Math.max(0, Date.now() - startedAt),
        },
      });
    }
    const gateStatus = failed === 0 ? 'PASSED' : 'FAILED';
    const completed = await this.prisma.aiGoldenSetRun.update({
      where: { id: run.id },
      data: {
        status: 'COMPLETED',
        gateStatus,
        failureSummary: failed ? `${failed} 个合成 Golden Set 未通过。` : null,
        completedAt: this.now(),
      },
      include: { results: true },
    });
    await this.prisma.aiReleaseAuditEvent.create({
      data: {
        aiReleaseBundleId: bundle.id,
        action: gateStatus === 'PASSED' ? 'GOLDEN_SET_PASSED' : 'GOLDEN_SET_FAILED',
        actor: input.actor ?? LOCAL_USER_ID,
        detailJson: JSON.stringify({ runId: run.id, caseCount: cases.length, failedCount: failed }),
      },
    });
    return completed;
  }

  async approve(bundleId: string, actor = LOCAL_USER_ID) {
    const bundle = await this.getBundleWithLatestRun(bundleId);
    if (bundle.status !== 'CANDIDATE') {
      throw new ReleaseGateValidationError('只有候选发布包可以批准。', 'BUNDLE_STATE_INVALID');
    }
    assertPassingGoldenSet(bundle);
    return this.prisma.$transaction(async (transaction) => {
      const approved = await transaction.aiReleaseBundle.update({
        where: { id: bundle.id },
        data: { status: 'APPROVED' },
      });
      await transaction.aiReleaseAuditEvent.create({
        data: {
          aiReleaseBundleId: bundle.id,
          action: 'APPROVED',
          actor,
          detailJson: JSON.stringify({ goldenSetRunId: bundle.goldenSetRuns[0]?.id }),
        },
      });
      return approved;
    });
  }

  async activate(bundleId: string, actor = LOCAL_USER_ID) {
    const bundle = await this.getBundleWithLatestRun(bundleId);
    if (bundle.status !== 'APPROVED') {
      throw new ReleaseGateValidationError('只有已批准发布包可以激活。', 'BUNDLE_STATE_INVALID');
    }
    assertPassingGoldenSet(bundle);
    return this.activateApprovedBundle(bundle.id, 'ACTIVATED', actor);
  }

  async rollback(bundleId: string, actor = LOCAL_USER_ID) {
    const bundle = await this.getBundleWithLatestRun(bundleId);
    if (!['APPROVED', 'DEPRECATED'].includes(bundle.status)) {
      throw new ReleaseGateValidationError(
        '只能回滚到已批准的历史发布包。',
        'BUNDLE_STATE_INVALID',
      );
    }
    assertPassingGoldenSet(bundle);
    return this.activateApprovedBundle(bundle.id, 'ROLLED_BACK', actor);
  }

  async revoke(bundleId: string, actor = LOCAL_USER_ID) {
    const bundle = await this.prisma.aiReleaseBundle.findUnique({ where: { id: bundleId } });
    if (!bundle) throw new ReleaseGateValidationError('发布包不存在。', 'BUNDLE_NOT_FOUND');
    if (bundle.status === 'REVOKED') return bundle;
    return this.prisma.$transaction(async (transaction) => {
      const revoked = await transaction.aiReleaseBundle.update({
        where: { id: bundle.id },
        data: { status: 'REVOKED' },
      });
      await transaction.aiReleaseAuditEvent.create({
        data: {
          aiReleaseBundleId: bundle.id,
          action: 'REVOKED',
          actor,
          detailJson: JSON.stringify({ previousStatus: bundle.status }),
        },
      });
      return revoked;
    });
  }

  /** 兼容性检查只发送合成固定文本；用户必须主动触发，原始结果不会落库。 */
  async testProviderCompatibility(input: {
    providerKey: string;
    modelName: string;
    provider: AiProviderAdapter | null;
    userId?: string;
  }) {
    const userId = input.userId ?? LOCAL_USER_ID;
    let status = 'NOT_CONFIGURED';
    let fallbackStatus = 'LOCAL_FALLBACK';
    let failureCode: string | null = 'PROVIDER_NOT_CONFIGURED';
    if (input.provider) {
      try {
        const result = await input.provider.execute({
          taskId: 'provider-compatibility-check',
          role: 'R1',
          releaseBundleVersion: 'compatibility-fixture-v1',
          text: 'Synthetic compatibility fixture. Return a draft only; do not publish or retain data.',
        });
        if (result.kind === 'DRAFT' && result.draft.trim()) {
          status = 'COMPATIBLE';
          fallbackStatus = 'NOT_REQUIRED';
          failureCode = null;
        } else {
          status = 'INCOMPATIBLE';
          failureCode = 'UNEXPECTED_RESULT_KIND';
        }
      } catch (error) {
        status = 'INCOMPATIBLE';
        failureCode = error instanceof AiProviderError ? error.code : 'FAILED';
      }
    }
    return this.prisma.aiProviderCompatibility.upsert({
      where: {
        userId_providerKey_modelName: {
          userId,
          providerKey: input.providerKey,
          modelName: input.modelName,
        },
      },
      update: {
        status,
        fallbackStatus,
        failureCode,
        runtimeJson: JSON.stringify(runtimeSnapshot()),
        testedAt: this.now(),
      },
      create: {
        userId,
        providerKey: input.providerKey,
        modelName: input.modelName,
        status,
        fallbackStatus,
        failureCode,
        runtimeJson: JSON.stringify(runtimeSnapshot()),
      },
    });
  }

  async getReport(userId = LOCAL_USER_ID): Promise<ReleaseReport> {
    const [bundles, configs, compatibility] = await Promise.all([
      this.prisma.aiReleaseBundle.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          prompts: { select: { role: true }, orderBy: { role: 'asc' } },
          goldenSetRuns: {
            orderBy: { startedAt: 'desc' },
            take: 1,
            include: { results: { select: { status: true } } },
          },
          auditEvents: { orderBy: { createdAt: 'desc' }, take: 8 },
        },
      }),
      this.prisma.aiProviderConfig.findMany({
        where: { userId },
        select: {
          providerKey: true,
          modelName: true,
          isEnabled: true,
          timeoutMs: true,
          retryCount: true,
          maskedKeySuffix: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.aiProviderCompatibility.findMany({ where: { userId } }),
    ]);
    const compatibilityByProvider = new Map(
      compatibility.map((item) => [`${item.providerKey}:${item.modelName}`, item]),
    );
    return {
      bundles: bundles.map((bundle) => {
        const latestRun = bundle.goldenSetRuns[0] ?? null;
        return {
          id: bundle.id,
          version: bundle.version,
          status: bundle.status,
          bundleHash: bundle.bundleHash,
          roles: bundle.prompts.map((prompt) => prompt.role),
          createdAt: bundle.createdAt,
          activatedAt: bundle.activatedAt,
          latestGoldenSet: latestRun
            ? {
                id: latestRun.id,
                status: latestRun.status,
                gateStatus: latestRun.gateStatus,
                completedAt: latestRun.completedAt,
                failureSummary: latestRun.failureSummary,
                resultCount: latestRun.results.length,
                passedCount: latestRun.results.filter((result) => result.status === 'PASSED')
                  .length,
              }
            : null,
          audits: bundle.auditEvents.map((event) => ({
            action: event.action,
            actor: event.actor,
            createdAt: event.createdAt,
            detail: parseDetail(event.detailJson),
          })),
        };
      }),
      providers: configs.map((config) => {
        const record =
          compatibilityByProvider.get(`${config.providerKey}:${config.modelName}`) ?? null;
        return {
          ...config,
          compatibility: record
            ? {
                status: record.status,
                fallbackStatus: record.fallbackStatus,
                failureCode: record.failureCode,
                testedAt: record.testedAt,
              }
            : null,
        };
      }),
    };
  }

  private async getBundleWithLatestRun(bundleId: string) {
    const bundle = await this.prisma.aiReleaseBundle.findUnique({
      where: { id: bundleId },
      include: {
        prompts: { select: { role: true } },
        goldenSetRuns: {
          orderBy: { startedAt: 'desc' },
          take: 1,
          include: {
            results: { select: { status: true, aiGoldenSetCase: { select: { role: true } } } },
          },
        },
      },
    });
    if (!bundle) throw new ReleaseGateValidationError('发布包不存在。', 'BUNDLE_NOT_FOUND');
    return bundle;
  }

  private async activateApprovedBundle(
    bundleId: string,
    action: 'ACTIVATED' | 'ROLLED_BACK',
    actor: string,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const target = await transaction.aiReleaseBundle.findUniqueOrThrow({
        where: { id: bundleId },
        include: { prompts: { select: { role: true } } },
      });
      const targetRoles = new Set(target.prompts.map((prompt) => prompt.role));
      const activeBundles = await transaction.aiReleaseBundle.findMany({
        where: { status: 'ACTIVE', id: { not: target.id } },
        include: { prompts: { select: { role: true } } },
      });
      const replaced = activeBundles.filter((bundle) =>
        bundle.prompts.some((prompt) => targetRoles.has(prompt.role)),
      );
      for (const bundle of replaced) {
        await transaction.aiReleaseBundle.update({
          where: { id: bundle.id },
          data: { status: 'DEPRECATED' },
        });
        await transaction.aiReleaseAuditEvent.create({
          data: {
            aiReleaseBundleId: bundle.id,
            action: 'DEPRECATED',
            actor,
            detailJson: JSON.stringify({ replacedBy: target.id }),
          },
        });
      }
      const active = await transaction.aiReleaseBundle.update({
        where: { id: target.id },
        data: { status: 'ACTIVE', activatedAt: this.now() },
      });
      await transaction.aiReleaseAuditEvent.create({
        data: {
          aiReleaseBundleId: target.id,
          action,
          actor,
          detailJson: JSON.stringify({ replacedBundleIds: replaced.map((bundle) => bundle.id) }),
        },
      });
      return active;
    });
  }
}

function goldenCase(role: AiRole, requiredKeys: string[]): GoldenSetCaseDefinition {
  return {
    key: `synthetic-${role.toLowerCase()}-release-gate`,
    role,
    input: {
      fixture: 'speech-asset-lab-release-golden-set-v1',
      role,
      text: 'Synthetic fixture only. No user content, asset, answer or personal fact is included.',
    },
    expectation: {
      requiredKeys,
      forbiddenTerms: ['published', 'auto-publish', '自动发布', '已发布正式资产'],
    },
  };
}

async function runGoldenCase(
  provider: AiProviderAdapter,
  releaseBundleVersion: string,
  goldenCase: {
    id: string;
    key: string;
    role: AiRole;
    inputJson: string;
    expectationJson: string;
  },
) {
  try {
    const result = await provider.execute({
      taskId: `golden-${goldenCase.id}`,
      role: goldenCase.role,
      releaseBundleVersion,
      text: goldenCase.inputJson,
    });
    if (result.kind !== 'DRAFT') {
      return {
        passed: false,
        outputKind: result.kind,
        outputDigest: null,
        failureCode: 'UNEXPECTED_RESULT_KIND',
        failureMessage: 'Golden Set 未获得可校验的草稿结果。',
      };
    }
    const expectation = parseExpectation(goldenCase.expectationJson);
    assertDraftContract(result.draft, expectation);
    return {
      passed: true,
      outputKind: result.kind,
      outputDigest: digest(result.draft),
      failureCode: null,
      failureMessage: null,
    };
  } catch (error) {
    return {
      passed: false,
      outputKind: null,
      outputDigest: null,
      failureCode: error instanceof AiProviderError ? error.code : 'STRUCTURE_INVALID',
      failureMessage:
        error instanceof AiProviderError
          ? 'Provider 不可用，已保持本地安全降级。'
          : 'Golden Set 草稿没有通过本地结构或安全边界校验。',
    };
  }
}

function assertDraftContract(value: string, expectation: GoldenSetExpectation) {
  const draft = JSON.parse(value) as Record<string, unknown>;
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
    throw new Error('Golden Set 输出不是对象。');
  }
  if (expectation.requiredKeys.some((key) => !(key in draft))) {
    throw new Error('Golden Set 输出缺少角色必需字段。');
  }
  const normalized = value.toLocaleLowerCase();
  if (expectation.forbiddenTerms.some((term) => normalized.includes(term.toLocaleLowerCase()))) {
    throw new Error('Golden Set 输出包含发布越权声明。');
  }
}

function parseExpectation(value: string): GoldenSetExpectation {
  try {
    const parsed = JSON.parse(value) as Partial<GoldenSetExpectation>;
    if (
      Array.isArray(parsed.requiredKeys) &&
      parsed.requiredKeys.every((key) => typeof key === 'string') &&
      Array.isArray(parsed.forbiddenTerms) &&
      parsed.forbiddenTerms.every((term) => typeof term === 'string')
    ) {
      return { requiredKeys: parsed.requiredKeys, forbiddenTerms: parsed.forbiddenTerms };
    }
  } catch {
    // 使用统一校验失败，防止损坏的 Golden Set 静默放行发布。
  }
  throw new Error('Golden Set 期望结构无效。');
}

function assertPassingGoldenSet(bundle: {
  prompts: Array<{ role: AiRole }>;
  goldenSetRuns: Array<{
    gateStatus: string;
    results: Array<{ status: string; aiGoldenSetCase: { role: AiRole } }>;
  }>;
}) {
  const latest = bundle.goldenSetRuns[0];
  const roles = new Set(bundle.prompts.map((prompt) => prompt.role));
  const passedRoles = new Set(
    latest?.results
      .filter((result) => result.status === 'PASSED')
      .map((result) => result.aiGoldenSetCase.role),
  );
  if (
    !latest ||
    latest.gateStatus !== 'PASSED' ||
    [...roles].some((role) => !passedRoles.has(role))
  ) {
    throw new ReleaseGateValidationError(
      '发布包尚未通过完整 Golden Set，不能继续。',
      'GOLDEN_SET_REQUIRED',
    );
  }
}

function runtimeSnapshot() {
  return {
    runtime: 'local-node',
    node: process.version,
    goldenSetVersion: GOLDEN_SET_VERSION,
  };
}

function parseDetail(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
