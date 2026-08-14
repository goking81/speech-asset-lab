import { expect, test, type Page } from '@playwright/test';

let releaseCandidateStatus = 'CANDIDATE';
let releaseGoldenSetStatus = 'PENDING';

test('P13 展示可筛选的已保存回答、降级来源和冻结 Bundle', async ({ page }) => {
  await page.route('**/api/history**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ history: historyView() }),
    });
  });
  await page.goto('/history');

  await expect(page.getByRole('heading', { name: '训练记录', level: 1 })).toBeVisible();
  await expect(page.getByRole('combobox', { name: '资产' })).toContainText('项目应对');
  await expect(
    page.getByRole('heading', { name: '项目变化时如何说明你的行动？', level: 2 }),
  ).toBeVisible();
  await expect(page.getByText('冻结 Bundle：training-r6-r7a-r7b-r7c-local-v1')).toBeVisible();
  await expect(page.getByText('降级：R7C_PROVIDER_UNAVAILABLE')).toBeVisible();
  await page.getByText('第一次回答').click();
  await expect(page.getByText('I clarify the change.')).toBeVisible();
});

test('P15 提供本地备份、隔离恢复警告与日志隐私操作', async ({ page }) => {
  await mockSettingsRoutes(page);
  await page.goto('/settings#backup');

  await expect(page.getByRole('heading', { name: '备份与恢复', level: 2 })).toBeVisible();
  await expect(page.getByText('恢复只会生成隔离副本')).toBeVisible();
  await expect(page.getByText('data/speech-asset-lab.db')).toBeVisible();
  await page.getByRole('button', { name: '创建本地备份' }).click();
  await expect(page.getByText('本地备份已完成并通过 manifest 记录。')).toBeVisible();

  await page.getByRole('link', { name: 'AI 日志与隐私' }).click();
  await expect(page).toHaveURL(/\/settings#privacy$/);
  await page.getByRole('checkbox', { name: '允许未来 AI 原始响应写入本地日志' }).check();
  await page.getByRole('spinbutton', { name: '日志保留天数' }).fill('14');
  await page.getByRole('button', { name: '保存日志隐私设置' }).click();
  await expect(page.getByText('日志隐私设置已保存到本地。')).toBeVisible();
  await page.getByRole('button', { name: '按保留期清理日志' }).click();
  await expect(page.getByText('已按 14 天保留期清理 2 个本地日志文件。')).toBeVisible();
});

test('F7 发布门禁要求 Golden Set 和人工批准，且只作用于后续会话', async ({ page }) => {
  releaseCandidateStatus = 'CANDIDATE';
  releaseGoldenSetStatus = 'PENDING';
  await mockSettingsRoutes(page);
  await page.route('**/api/releases/provider-compatibility', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        compatibility: { status: 'COMPATIBLE', fallbackStatus: 'NOT_REQUIRED' },
      }),
    });
  });
  await page.route('**/api/releases/release-candidate/golden-set', async (route) => {
    releaseGoldenSetStatus = 'PASSED';
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ run: { gateStatus: 'PASSED', results: [{ status: 'PASSED' }] } }),
    });
  });
  await page.route('**/api/releases/release-candidate', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { action?: string };
      if (body.action === 'APPROVE') releaseCandidateStatus = 'APPROVED';
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ release: {} }),
      });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ release: releaseView() }),
    });
  });
  await page.route('**/api/releases', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ release: releaseView() }),
    });
  });

  await page.goto('/settings#ai');

  await expect(page.getByRole('heading', { name: 'AI 服务', level: 2 })).toBeVisible();
  await expect(page.getByText('release-candidate')).toBeVisible();
  await expect(page.getByRole('button', { name: '人工批准' })).toBeDisabled();
  await page.getByRole('button', { name: '运行 Golden Set' }).click();
  await expect(
    page.getByText('Golden Set 通过（1 个合成用例）。现在仍需要人工批准。'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '人工批准' })).toBeEnabled();
  await page.getByRole('button', { name: '人工批准' }).click();
  await expect(
    page.getByText('候选 Bundle 已人工批准，仍需单独激活后才会影响新会话。'),
  ).toBeVisible();
});

async function mockSettingsRoutes(page: Page) {
  await page.route('**/api/ai/config', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        configs: [
          {
            providerKey: 'deepseek',
            modelName: 'fixture-model',
            isEnabled: true,
            maskedKeySuffix: '1234',
          },
        ],
      }),
    });
  });
  await page.route('**/api/settings/local', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(localSettings()) });
  });
  await page.route('**/api/backups', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        contentType: 'application/json',
        status: 201,
        body: JSON.stringify({ backup: {} }),
      });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ backups: localSettings().backups }),
    });
  });
  await page.route('**/api/settings/privacy', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ privacy: { storeRawAiResponses: true, retentionDays: 14 } }),
    });
  });
  await page.route('**/api/logs/cleanup', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        result: { deletedFileCount: 2, deletedBytes: 100, retentionDays: 14 },
      }),
    });
  });
}

function localSettings() {
  return {
    training: {
      dailyTargetMinutes: 30,
      dailyNewAssetTarget: 3,
      dailyNewAssetMax: 4,
      activeAssetLimit: 8,
    },
    storage: {
      database: 'data/speech-asset-lab.db',
      files: 'data/files',
      logs: 'data/logs',
      backups: 'data/backups',
    },
    backups: [
      {
        id: 'backup-1',
        kind: 'MANUAL',
        formatVersion: 1,
        status: 'COMPLETED',
        contentHash: 'hash',
        sizeBytes: 2048,
        createdAt: '2026-07-27T00:00:00.000Z',
        restoredAt: null,
        restorePath: null,
      },
    ],
    privacy: { storeRawAiResponses: false, retentionDays: 30 },
  };
}

function historyView() {
  return {
    records: [
      {
        id: 'session-1',
        status: 'COMPLETED',
        createdAt: '2026-07-27T00:00:00.000Z',
        updatedAt: '2026-07-27T00:10:00.000Z',
        question: '项目变化时如何说明你的行动？',
        assets: [{ id: 'asset-1', triggerName: '项目应对', version: 1 }],
        answers: { first: 'I clarify the change.', second: 'I choose one useful action.' },
        hints: [
          {
            level: 'H2_ASSET_NAME',
            context: 'P08_FIRST_ANSWER',
            createdAt: '2026-07-27T00:01:00.000Z',
          },
        ],
        releaseBundle: { version: 'training-r6-r7a-r7b-r7c-local-v1', status: 'ACTIVE' },
        aiStates: [
          {
            role: 'R7C',
            status: 'FAILED_RETRYABLE',
            fallbackReason: 'R7C_PROVIDER_UNAVAILABLE',
          },
        ],
        evaluations: [{ answerId: 'first', status: 'DRAFT_READY', totalScore: 82 }],
        comparison: {
          factsStatus: 'COMPLETE',
          interpretationStatus: 'UNAVAILABLE',
          finalDisplayStatus: 'LOCAL_TEMPLATE',
        },
      },
    ],
    filterOptions: { assets: [{ id: 'asset-1', label: '项目应对' }], statuses: ['COMPLETED'] },
  };
}

function releaseView() {
  return {
    bundles: [
      {
        id: 'release-candidate',
        version: 'release-candidate',
        status: releaseCandidateStatus,
        bundleHash: 'release-hash',
        roles: ['R4'],
        createdAt: '2026-07-27T00:00:00.000Z',
        activatedAt: null,
        latestGoldenSet:
          releaseGoldenSetStatus === 'PASSED'
            ? {
                id: 'run-1',
                status: 'COMPLETED',
                gateStatus: 'PASSED',
                completedAt: '2026-07-27T00:01:00.000Z',
                failureSummary: null,
                resultCount: 1,
                passedCount: 1,
              }
            : null,
        audits: [],
      },
    ],
    providers: [
      {
        providerKey: 'deepseek',
        modelName: 'fixture-model',
        isEnabled: true,
        timeoutMs: 60000,
        retryCount: 1,
        maskedKeySuffix: '1234',
        compatibility: null,
      },
    ],
  };
}
