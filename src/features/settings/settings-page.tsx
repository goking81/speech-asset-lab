'use client';

import { useEffect, useState } from 'react';

import { settingsSections, type SettingsSectionId } from '@/lib/settings-navigation';

type LocalSettings = {
  training: {
    dailyTargetMinutes: number;
    dailyNewAssetTarget: number;
    dailyNewAssetMax: number;
    activeAssetLimit: number;
  };
  storage: { database: string; files: string; logs: string; backups: string };
  backups: Array<{
    id: string;
    kind: string;
    formatVersion: number;
    status: string;
    contentHash: string | null;
    sizeBytes: number | null;
    createdAt: string;
    restoredAt: string | null;
    restorePath: string | null;
  }>;
  privacy: { storeRawAiResponses: boolean; retentionDays: number };
};

type ReleaseReport = {
  bundles: Array<{
    id: string;
    version: string;
    status: string;
    bundleHash: string;
    roles: string[];
    createdAt: string;
    activatedAt: string | null;
    latestGoldenSet: {
      id: string;
      status: string;
      gateStatus: string;
      completedAt: string | null;
      failureSummary: string | null;
      resultCount: number;
      passedCount: number;
    } | null;
    audits: Array<{
      action: string;
      actor: string;
      createdAt: string;
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
      testedAt: string;
    } | null;
  }>;
};

function currentSectionFromHash() {
  const section = settingsSections.find((item) => `#${item.id}` === window.location.hash);

  return section?.id ?? null;
}

export function SettingsPage() {
  const [currentSection, setCurrentSection] = useState<SettingsSectionId | null>(null);
  const [aiStatus, setAiStatus] = useState('正在读取本地 AI 配置。');
  const [localSettings, setLocalSettings] = useState<LocalSettings | null>(null);
  const [releaseReport, setReleaseReport] = useState<ReleaseReport | null>(null);
  const [localStatus, setLocalStatus] = useState('正在读取本地目录、备份和日志隐私设置。');
  const [releaseStatus, setReleaseStatus] = useState('正在读取本地发布门禁。');
  const [error, setError] = useState('');
  const [isWorking, setIsWorking] = useState(false);

  async function loadLocalSettings() {
    const response = await fetch('/api/settings/local');
    const result = (await response.json()) as {
      settings?: LocalSettings;
      error?: string;
    } & LocalSettings;
    const settings = result.settings ?? (result.storage ? result : null);
    if (!response.ok || !settings) throw new Error(result.error ?? '无法读取本地设置。');
    setLocalSettings(settings);
    setLocalStatus('本地目录、备份和日志隐私设置已读取。');
    return settings;
  }

  async function loadReleaseReport() {
    const response = await fetch('/api/releases');
    const result = (await response.json()) as { release?: ReleaseReport; error?: string };
    if (!response.ok || !result.release) throw new Error(result.error ?? '无法读取本地发布门禁。');
    setReleaseReport(result.release);
    setReleaseStatus(
      '已读取本地 AI 规则版本。新规则须完成质量验收并由你确认后，才会用于之后的新草稿。',
    );
    return result.release;
  }

  useEffect(() => {
    const syncCurrentSection = () => setCurrentSection(currentSectionFromHash());

    syncCurrentSection();
    window.addEventListener('hashchange', syncCurrentSection);

    return () => window.removeEventListener('hashchange', syncCurrentSection);
  }, []);

  useEffect(() => {
    void fetch('/api/ai/config')
      .then(async (response) => {
        const result = (await response.json()) as {
          configs?: Array<{
            providerKey: string;
            modelName: string;
            isEnabled: boolean;
            maskedKeySuffix: string | null;
          }>;
          error?: string;
        };
        if (!response.ok) throw new Error(result.error ?? '无法读取 AI 配置。');
        const enabled = result.configs?.filter((config) => config.isEnabled) ?? [];
        setAiStatus(
          enabled.length
            ? `已配置 ${enabled.length} 个本地 Provider（密钥仅显示掩码）。`
            : '未配置 Provider：AI 任务会保留本地数据并安全降级。',
        );
      })
      .catch(() => setAiStatus('无法读取 AI 配置；AI 功能保持未配置降级。'));
    let active = true;
    void fetch('/api/settings/local')
      .then(async (response) => {
        const result = (await response.json()) as {
          settings?: LocalSettings;
          error?: string;
        } & LocalSettings;
        const settings = result.settings ?? (result.storage ? result : null);
        if (!response.ok || !settings) throw new Error(result.error ?? '无法读取本地设置。');
        if (!active) return;
        setLocalSettings(settings);
        setLocalStatus('本地目录、备份和日志隐私设置已读取。');
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : '无法读取本地设置。');
        setLocalStatus('本地设置暂不可用。');
      });
    void fetch('/api/releases')
      .then(async (response) => {
        const result = (await response.json()) as { release?: ReleaseReport; error?: string };
        if (!response.ok || !result.release)
          throw new Error(result.error ?? '无法读取本地发布门禁。');
        if (!active) return;
        setReleaseReport(result.release);
        setReleaseStatus(
          '已读取本地 AI 规则版本。新规则须完成质量验收并由你确认后，才会用于之后的新草稿。',
        );
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setReleaseStatus(reason instanceof Error ? reason.message : '本地发布门禁暂不可用。');
      });
    return () => {
      active = false;
    };
  }, []);

  async function createBackup() {
    setIsWorking(true);
    setError('');
    setLocalStatus('正在创建本地备份包。');
    try {
      const response = await fetch('/api/backups', { method: 'POST' });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? '无法创建本地备份。');
      await loadLocalSettings();
      setLocalStatus('本地备份已完成并通过 manifest 记录。');
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '无法创建本地备份。');
    } finally {
      setIsWorking(false);
    }
  }

  async function restoreBackup(backupId: string) {
    const confirmed = window.confirm(
      '恢复会先创建自动安全备份，再将所选备份恢复到隔离目录。当前 SQLite、来源文件和训练记录不会被覆盖。是否继续？',
    );
    if (!confirmed) return;
    setIsWorking(true);
    setError('');
    setLocalStatus('正在校验备份并建立隔离恢复副本。');
    try {
      const response = await fetch(`/api/backups/${encodeURIComponent(backupId)}/restore`, {
        method: 'POST',
      });
      const result = (await response.json()) as {
        restore?: { stagingPath: string; safetyBackup: { id: string } };
        error?: string;
      };
      if (!response.ok || !result.restore)
        throw new Error(result.error ?? '无法隔离恢复本地备份。');
      await loadLocalSettings();
      setLocalStatus(`隔离恢复已验证：${result.restore.stagingPath}。已创建自动安全备份。`);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '无法隔离恢复本地备份。');
    } finally {
      setIsWorking(false);
    }
  }

  async function savePrivacy(policy: LocalSettings['privacy']) {
    setIsWorking(true);
    setError('');
    try {
      const response = await fetch('/api/settings/privacy', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(policy),
      });
      const result = (await response.json()) as {
        privacy?: LocalSettings['privacy'];
        error?: string;
      };
      if (!response.ok || !result.privacy)
        throw new Error(result.error ?? '无法保存日志隐私设置。');
      setLocalSettings((current) => (current ? { ...current, privacy: result.privacy! } : current));
      setLocalStatus('日志隐私设置已保存到本地。');
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '无法保存日志隐私设置。');
    } finally {
      setIsWorking(false);
    }
  }

  async function saveTrainingTargets(training: LocalSettings['training']) {
    setIsWorking(true);
    setError('');
    try {
      const response = await fetch('/api/settings/training', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(training),
      });
      const result = (await response.json()) as {
        training?: LocalSettings['training'];
        error?: string;
      };
      if (!response.ok || !result.training) {
        throw new Error(result.error ?? '无法保存训练目标。');
      }
      setLocalSettings((current) =>
        current ? { ...current, training: result.training! } : current,
      );
      setLocalStatus('训练目标已保存到本地；阶段与资产解锁规则没有被改写。');
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '无法保存训练目标。');
    } finally {
      setIsWorking(false);
    }
  }

  async function clearExpiredLogs() {
    setIsWorking(true);
    setError('');
    try {
      const response = await fetch('/api/logs/cleanup', { method: 'POST' });
      const result = (await response.json()) as {
        result?: { deletedFileCount: number; retentionDays: number };
        error?: string;
      };
      if (!response.ok || !result.result) throw new Error(result.error ?? '无法清理本地日志。');
      setLocalStatus(
        `已按 ${result.result.retentionDays} 天保留期清理 ${result.result.deletedFileCount} 个本地日志文件。`,
      );
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '无法清理本地日志。');
    } finally {
      setIsWorking(false);
    }
  }

  async function runGoldenSet(bundleId: string) {
    setIsWorking(true);
    setError('');
    setReleaseStatus('正在运行合成 Golden Set；只会发送固定测试内容。');
    try {
      const response = await fetch(`/api/releases/${encodeURIComponent(bundleId)}/golden-set`, {
        method: 'POST',
      });
      const result = (await response.json()) as {
        status?: string;
        run?: { gateStatus: string; results: unknown[] };
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? 'Golden Set 运行失败。');
      if (result.status === 'NOT_CONFIGURED') {
        setReleaseStatus('未配置可用 Provider，Golden Set 未运行；应用继续使用本地安全降级。');
        return;
      }
      if (!result.run) throw new Error(result.error ?? 'Golden Set 未返回可审计结果。');
      await loadReleaseReport();
      setReleaseStatus(
        result.run.gateStatus === 'PASSED'
          ? `Golden Set 通过（${result.run.results.length} 个合成用例）。现在仍需要人工批准。`
          : 'Golden Set 未通过；候选包不能被批准或激活。',
      );
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Golden Set 运行失败。');
    } finally {
      setIsWorking(false);
    }
  }

  async function changeRelease(
    bundleId: string,
    action: 'APPROVE' | 'ACTIVATE' | 'REVOKE' | 'ROLLBACK',
  ) {
    const confirmation =
      action === 'ACTIVATE'
        ? '激活只影响之后新建的会话；历史会话继续使用已冻结 Bundle。是否继续？'
        : action === 'ROLLBACK'
          ? '回滚只影响之后新建的会话；历史会话不会被改写。是否继续？'
          : action === 'REVOKE'
            ? '停用后该 AI 规则不能再用于新任务；历史会话继续保留冻结引用。是否继续？'
            : null;
    if (confirmation && !window.confirm(confirmation)) return;
    setIsWorking(true);
    setError('');
    try {
      const response = await fetch(`/api/releases/${encodeURIComponent(bundleId)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? '本地发布操作失败。');
      await loadReleaseReport();
      setReleaseStatus(releaseActionMessage(action));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '本地发布操作失败。');
    } finally {
      setIsWorking(false);
    }
  }

  async function testProviderCompatibility() {
    setIsWorking(true);
    setError('');
    setReleaseStatus('正在检查 Provider/模型兼容性；只会发送固定合成文本。');
    try {
      const response = await fetch('/api/releases/provider-compatibility', { method: 'POST' });
      const result = (await response.json()) as {
        status?: string;
        compatibility?: { status: string; fallbackStatus: string };
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? 'Provider 兼容性检查失败。');
      if (result.status === 'NOT_CONFIGURED') {
        setReleaseStatus('未配置 Provider，已确认使用本地安全降级。');
        return;
      }
      await loadReleaseReport();
      setReleaseStatus(
        result.compatibility?.status === 'COMPATIBLE'
          ? 'AI 服务连接检查通过。若要替换当前 AI 规则，仍需完成对应的质量验收。'
          : 'AI 服务连接检查未通过；应用将保持本地安全降级。',
      );
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Provider 兼容性检查失败。');
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <main className="page settings-page">
      <header className="page-heading">
        <p className="page-heading__eyebrow">SETTINGS / 08</p>
        <h1>设置</h1>
        <p>所有配置均面向单用户、本地运行的工作台。密钥从不在这里明文显示或保存。</p>
      </header>
      {error && <p className="settings-page__error">{error}</p>}
      {!error && <p className="settings-page__status">{localStatus}</p>}
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="设置分区">
          {settingsSections.map((section) => (
            <a
              href={`#${section.id}`}
              key={section.id}
              aria-current={currentSection === section.id ? 'page' : undefined}
              onClick={() => setCurrentSection(section.id)}
            >
              {section.label}
            </a>
          ))}
        </nav>
        <div className="settings-sections">
          {settingsSections.map((section) => (
            <section id={section.id} key={section.id} tabIndex={-1}>
              <p className="settings-sections__serial">{section.id.toUpperCase()}</p>
              <h2>{section.label}</h2>
              <p>{section.description}</p>
              {section.id === 'training' && localSettings && (
                <TrainingTargetsPanel
                  disabled={isWorking}
                  onSave={(training) => void saveTrainingTargets(training)}
                  training={localSettings.training}
                />
              )}
              {section.id === 'training' && !localSettings && (
                <div className="settings-sections__empty">{localStatus}</div>
              )}
              {section.id === 'ai' && (
                <ReleaseGatePanel
                  aiStatus={aiStatus}
                  disabled={isWorking}
                  onAction={(bundleId, action) => void changeRelease(bundleId, action)}
                  onGoldenSet={(bundleId) => void runGoldenSet(bundleId)}
                  onProviderCompatibility={() => void testProviderCompatibility()}
                  release={releaseReport}
                  status={releaseStatus}
                />
              )}
              {section.id === 'storage' && (
                <StoragePanel settings={localSettings} status={localStatus} />
              )}
              {section.id === 'backup' && (
                <BackupPanel
                  backups={localSettings?.backups ?? []}
                  disabled={isWorking}
                  onCreate={() => void createBackup()}
                  onRestore={(backupId) => void restoreBackup(backupId)}
                />
              )}
              {section.id === 'privacy' && localSettings && (
                <PrivacyPanel
                  disabled={isWorking}
                  key={`${localSettings.privacy.storeRawAiResponses}-${localSettings.privacy.retentionDays}`}
                  onClear={() => void clearExpiredLogs()}
                  onSave={(policy) => void savePrivacy(policy)}
                  policy={localSettings.privacy}
                />
              )}
              {section.id === 'privacy' && !localSettings && (
                <div className="settings-sections__empty">{localStatus}</div>
              )}
              {section.id === 'experiments' && (
                <div className="settings-sections__empty">当前版本暂无实验功能</div>
              )}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

function TrainingTargetsPanel({
  disabled,
  onSave,
  training,
}: {
  disabled: boolean;
  onSave: (training: LocalSettings['training']) => void;
  training: LocalSettings['training'];
}) {
  const [draft, setDraft] = useState(training);
  const fields: Array<{ key: keyof LocalSettings['training']; label: string; hint: string }> = [
    { key: 'dailyTargetMinutes', label: '每日目标时长（分钟）', hint: '用于显示本地训练目标。' },
    { key: 'dailyNewAssetTarget', label: '每日新增目标', hint: '用于本地计划的新增容量。' },
    { key: 'dailyNewAssetMax', label: '每日新增上限', hint: '目标不能超过此上限。' },
    {
      key: 'activeAssetLimit',
      label: '活跃资产上限',
      hint: '限制同时处于本地训练队列的资产数量。',
    },
  ];

  return (
    <div className="settings-panel settings-panel__training-targets">
      <div className="settings-panel__training-grid">
        {fields.map((field) => (
          <label key={field.key}>
            <span>{field.label}</span>
            <input
              min="0"
              onChange={(event) =>
                setDraft((current) => ({ ...current, [field.key]: Number(event.target.value) }))
              }
              type="number"
              value={draft[field.key]}
            />
            <small>{field.hint}</small>
          </label>
        ))}
      </div>
      <button disabled={disabled} onClick={() => onSave(draft)} type="button">
        保存训练目标
      </button>
    </div>
  );
}

function ReleaseGatePanel({
  aiStatus,
  disabled,
  onAction,
  onGoldenSet,
  onProviderCompatibility,
  release,
  status,
}: {
  aiStatus: string;
  disabled: boolean;
  onAction: (bundleId: string, action: 'APPROVE' | 'ACTIVATE' | 'REVOKE' | 'ROLLBACK') => void;
  onGoldenSet: (bundleId: string) => void;
  onProviderCompatibility: () => void;
  release: ReleaseReport | null;
  status: string;
}) {
  if (!release) return <div className="settings-sections__empty">{status}</div>;
  const enabledProvider = release.providers.some((provider) => provider.isEnabled);
  return (
    <div className="settings-panel release-gate-panel">
      <details className="release-gate-panel__advanced">
        <summary>
          <span>AI 规则发布管理（高级）</span>
          <small>仅在更换模型或调整 AI 规则版本时需要使用</small>
        </summary>
        <div className="release-gate-panel__content">
          <p aria-live="polite">{aiStatus}</p>
          <p className="settings-panel__warning">
            此处管理的是 AI 草稿规则版本。发布只影响之后新建的 AI
            任务与会话，不会改写训练回答、正式资产或已冻结历史记录。
          </p>
          <div className="settings-panel__provider-list">
            {release.providers.length ? (
              release.providers.map((provider) => (
                <p key={`${provider.providerKey}-${provider.modelName}`}>
                  {provider.providerKey} / {provider.modelName} · 连接检查：
                  {provider.compatibility?.status ?? '尚未检查'} · Key 掩码：
                  {provider.maskedKeySuffix ? `••••${provider.maskedKeySuffix}` : '未显示'}
                </p>
              ))
            ) : (
              <p>未配置 AI 服务；质量验收和兼容性检查会保持本地安全降级。</p>
            )}
          </div>
          <div className="settings-panel__actions">
            <button
              disabled={disabled || !enabledProvider}
              onClick={onProviderCompatibility}
              type="button"
            >
              检查 AI 服务连接
            </button>
          </div>
          <p className="settings-panel__release-status">{status}</p>
          {release.bundles.length === 0 ? (
            <p className="settings-sections__empty">暂无候选或已发布的 AI 规则版本。</p>
          ) : (
            <ul className="settings-panel__release-list">
              {release.bundles.map((bundle) => (
                <li key={bundle.id}>
                  <div>
                    <strong>{bundleRoleLabel(bundle.roles)}</strong>
                    <span>
                      {bundle.version} ·{' '}
                      {bundle.status === 'ACTIVE' ? '当前用于新建 AI 草稿' : bundle.status}
                    </span>
                    <small>
                      质量验收（Golden Set）：
                      {bundle.latestGoldenSet
                        ? `${bundle.latestGoldenSet.gateStatus} (${bundle.latestGoldenSet.passedCount}/${bundle.latestGoldenSet.resultCount})`
                        : '尚未运行'}
                    </small>
                    {bundle.latestGoldenSet?.failureSummary && (
                      <small>{bundle.latestGoldenSet.failureSummary}</small>
                    )}
                    {bundle.audits[0] && <small>最近操作：{bundle.audits[0].action}</small>}
                  </div>
                  <ReleaseActions
                    bundle={bundle}
                    disabled={disabled}
                    enabledProvider={enabledProvider}
                    onAction={onAction}
                    onGoldenSet={onGoldenSet}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </div>
  );
}

function bundleRoleLabel(roles: string[]) {
  const labels: Record<string, string> = {
    R1: 'R1 · 来源资产候选草稿',
    R5: 'R5 · 今日训练补充说明',
  };
  return roles.map((role) => labels[role] ?? role).join(' / ') || '未分配 AI 规则';
}

function ReleaseActions({
  bundle,
  disabled,
  enabledProvider,
  onAction,
  onGoldenSet,
}: {
  bundle: ReleaseReport['bundles'][number];
  disabled: boolean;
  enabledProvider: boolean;
  onAction: (bundleId: string, action: 'APPROVE' | 'ACTIVATE' | 'REVOKE' | 'ROLLBACK') => void;
  onGoldenSet: (bundleId: string) => void;
}) {
  const hasPassedGoldenSet = bundle.latestGoldenSet?.gateStatus === 'PASSED';
  return (
    <div className="settings-panel__release-actions">
      {['CANDIDATE', 'APPROVED', 'DEPRECATED'].includes(bundle.status) && (
        <button
          disabled={disabled || !enabledProvider}
          onClick={() => onGoldenSet(bundle.id)}
          type="button"
        >
          运行 Golden Set
        </button>
      )}
      {bundle.status === 'CANDIDATE' && (
        <button
          disabled={disabled || !hasPassedGoldenSet}
          onClick={() => onAction(bundle.id, 'APPROVE')}
          type="button"
        >
          人工批准
        </button>
      )}
      {bundle.status === 'APPROVED' && (
        <button
          disabled={disabled || !hasPassedGoldenSet}
          onClick={() => onAction(bundle.id, 'ACTIVATE')}
          type="button"
        >
          激活用于新会话
        </button>
      )}
      {bundle.status === 'DEPRECATED' && (
        <button
          disabled={disabled || !hasPassedGoldenSet}
          onClick={() => onAction(bundle.id, 'ROLLBACK')}
          type="button"
        >
          回滚到此版本
        </button>
      )}
      {!['REVOKED', 'DRAFT'].includes(bundle.status) && (
        <button
          className="settings-panel__secondary"
          disabled={disabled}
          onClick={() => onAction(bundle.id, 'REVOKE')}
          type="button"
        >
          停用（高级操作）
        </button>
      )}
    </div>
  );
}

function StoragePanel({ settings, status }: { settings: LocalSettings | null; status: string }) {
  if (!settings) return <div className="settings-sections__empty">{status}</div>;
  return (
    <dl className="settings-panel__paths">
      <div>
        <dt>SQLite</dt>
        <dd>{settings.storage.database}</dd>
      </div>
      <div>
        <dt>来源文件</dt>
        <dd>{settings.storage.files}</dd>
      </div>
      <div>
        <dt>日志</dt>
        <dd>{settings.storage.logs}</dd>
      </div>
      <div>
        <dt>备份</dt>
        <dd>{settings.storage.backups}</dd>
      </div>
    </dl>
  );
}

function BackupPanel({
  backups,
  disabled,
  onCreate,
  onRestore,
}: {
  backups: LocalSettings['backups'];
  disabled: boolean;
  onCreate: () => void;
  onRestore: (backupId: string) => void;
}) {
  return (
    <div className="settings-panel">
      <p className="settings-panel__warning">
        恢复只会生成隔离副本；开始前会自动创建安全备份，不会覆盖当前 SQLite、来源文件或训练记录。
      </p>
      <button disabled={disabled} onClick={onCreate} type="button">
        创建本地备份
      </button>
      {backups.length === 0 ? (
        <p className="settings-sections__empty">暂无本地备份记录。</p>
      ) : (
        <ul className="settings-panel__backup-list">
          {backups.map((backup) => (
            <li key={backup.id}>
              <div>
                <strong>
                  {backup.kind === 'PRE_RESTORE_SAFETY' ? '自动安全备份' : '手动备份'}
                </strong>
                <span>
                  {backup.status} · {formatBytes(backup.sizeBytes)} · {formatDate(backup.createdAt)}
                </span>
                {backup.restorePath && <small>已隔离恢复：{backup.restorePath}</small>}
              </div>
              <button
                disabled={disabled || !['COMPLETED', 'RESTORED'].includes(backup.status)}
                onClick={() => onRestore(backup.id)}
                type="button"
              >
                校验并隔离恢复
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PrivacyPanel({
  policy,
  disabled,
  onSave,
  onClear,
}: {
  policy: LocalSettings['privacy'];
  disabled: boolean;
  onSave: (policy: LocalSettings['privacy']) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState(policy);

  return (
    <div className="settings-panel">
      <label className="settings-panel__checkbox">
        <input
          checked={draft.storeRawAiResponses}
          disabled={disabled}
          onChange={(event) =>
            setDraft((current) => ({ ...current, storeRawAiResponses: event.target.checked }))
          }
          type="checkbox"
        />
        允许未来 AI 原始响应写入本地日志
      </label>
      <p>
        默认关闭；无论开关状态如何，完整 API Key、Authorization、密码、Secret 和 Token 都会被脱敏。
      </p>
      <label className="settings-panel__retention">
        日志保留天数
        <input
          disabled={disabled}
          max={3650}
          min={1}
          onChange={(event) =>
            setDraft((current) => ({ ...current, retentionDays: Number(event.target.value) }))
          }
          type="number"
          value={draft.retentionDays}
        />
      </label>
      <div className="settings-panel__actions">
        <button disabled={disabled} onClick={() => onSave(draft)} type="button">
          保存日志隐私设置
        </button>
        <button
          className="settings-panel__secondary"
          disabled={disabled}
          onClick={onClear}
          type="button"
        >
          按保留期清理日志
        </button>
      </div>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '未知时间'
    : date.toLocaleString('zh-CN', { hour12: false });
}

function formatBytes(value: number | null) {
  if (value === null) return '大小未记录';
  if (value < 1024) return `${value} B`;
  return `${(value / 1024 / 1024).toFixed(2)} MiB`;
}

function releaseActionMessage(action: 'APPROVE' | 'ACTIVATE' | 'REVOKE' | 'ROLLBACK') {
  if (action === 'APPROVE') return '候选 Bundle 已人工批准，仍需单独激活后才会影响新会话。';
  if (action === 'ACTIVATE') return 'Bundle 已激活；只会用于之后新建的任务和会话。';
  if (action === 'ROLLBACK') return '已回滚到选定 Bundle；历史冻结引用没有被改写。';
  return 'AI 规则已停用；历史会话继续保留其冻结引用。';
}
