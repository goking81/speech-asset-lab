'use client';

import { useEffect, useState } from 'react';

import { isCloudTrialRuntime } from '@/lib/runtime-mode';

export function StatusStrip() {
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const isCloudTrial = isCloudTrialRuntime();

  useEffect(() => {
    void fetch('/api/ai/config')
      .then(async (response) => {
        const result = (await response.json()) as { configs?: Array<{ isEnabled: boolean }> };
        setAiConfigured(
          response.ok && (result.configs?.some((config) => config.isEnabled) ?? false),
        );
      })
      .catch(() => setAiConfigured(false));
  }, []);

  return (
    <header className="status-strip" aria-label="应用状态">
      <p>{isCloudTrial ? '内置资产试用版 · 私有访问' : '桌面优先 · 本地运行'}</p>
      <dl>
        <div>
          <dt>AI 服务</dt>
          <dd className={aiConfigured ? 'status-strip__saved' : 'status-strip__pending'}>
            {aiConfigured === null ? '检查中' : aiConfigured ? '已配置' : '未配置'}
          </dd>
        </div>
        <div>
          <dt>{isCloudTrial ? '云端数据' : '本地数据'}</dt>
          <dd className="status-strip__saved">已保存</dd>
        </div>
      </dl>
    </header>
  );
}
