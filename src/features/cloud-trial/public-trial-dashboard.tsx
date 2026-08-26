'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { readJsonResponse } from '@/lib/api-response';

type TrialAsset = {
  id: string;
  versions: Array<{
    id: string;
    version: number;
    title: string;
    coreIdea: string;
    coreFlow: string;
  }>;
  personalAssets: Array<{
    versions: Array<{
      id: string;
      version: number;
      triggerName: string;
      coreIdea: string;
      coreFlow: string;
    }>;
  }>;
};

const steps = ['熟读理解', '关键词唤醒', '逻辑骨架复现', '无提示复现', '锚点问题调用'];
const progressKey = 'speech-asset-lab:public-trial:progress:v1';

type ProgressMap = Record<string, number>;

function loadProgress(): ProgressMap {
  try {
    const value = window.localStorage.getItem(progressKey);
    return value ? (JSON.parse(value) as ProgressMap) : {};
  } catch {
    return {};
  }
}

function saveProgress(progress: ProgressMap) {
  window.localStorage.setItem(progressKey, JSON.stringify(progress));
}

/**
 * 公开试用模式只读取内置资产；步骤完成状态保留在访客当前浏览器。
 * 这里不能调用既有单用户训练会话接口，否则不同访客会共享同一份数据库记录。
 */
export function PublicTrialDashboard() {
  const [assets, setAssets] = useState<TrialAsset[] | null>(null);
  const [error, setError] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [progress, setProgress] = useState<ProgressMap>(() =>
    typeof window === 'undefined' ? {} : loadProgress(),
  );

  useEffect(() => {
    void fetch('/api/assets')
      .then(async (response) => {
        const result = await readJsonResponse<{ assets?: TrialAsset[]; error?: string }>(
          response,
          '内置资产暂时不可读取，请稍后刷新。',
        );
        if (!response.ok) throw new Error(result.error ?? '内置资产暂时不可读取。');
        setAssets(result.assets ?? []);
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : '内置资产暂时不可读取。'),
      );
  }, []);

  const availableAssets = useMemo(
    () =>
      (assets ?? []).flatMap((asset) => {
        const source = asset.versions[0];
        const personal = asset.personalAssets[0]?.versions[0];
        if (!source || !personal) return [];
        return [{ id: asset.id, source, personal }];
      }),
    [assets],
  );
  const selected =
    availableAssets.find((asset) => asset.id === selectedAssetId) ?? availableAssets[0] ?? null;
  const completedSteps = selected ? progress[selected.id] ?? 0 : 0;

  function chooseAsset(assetId: string) {
    setSelectedAssetId(assetId);
  }

  function completeCurrentStep() {
    if (!selected) return;
    const next = Math.min(steps.length, completedSteps + 1);
    const nextProgress = { ...progress, [selected.id]: next };
    setProgress(nextProgress);
    saveProgress(nextProgress);
  }

  function resetCurrentAsset() {
    if (!selected) return;
    const nextProgress = { ...progress, [selected.id]: 0 };
    setProgress(nextProgress);
    saveProgress(nextProgress);
  }

  return (
    <main className="page public-trial-dashboard">
      <header className="page-heading">
        <p className="page-heading__eyebrow">PUBLIC TRIAL / BUILT-IN ASSETS</p>
        <h1 className="today-plan__title">
          <span>今日训练</span>
          <small>/ Try with built-in assets</small>
        </h1>
        <p>从内置语流资产中选择一项练习。进度只保存在当前浏览器，不会写入云端个人资料。</p>
      </header>

      {error && <p className="today-plan__status">{error}</p>}
      {!assets && !error && <p className="today-plan__status">正在读取内置资产。</p>}
      {assets && availableAssets.length === 0 && (
        <section className="asset-library__empty">
          <h2>内置资产正在准备</h2>
          <p>当前试用库还没有可公开训练的资产，请稍后再试。</p>
        </section>
      )}
      {selected && (
        <>
          <section className="public-trial-dashboard__asset-grid" aria-label="可选内置资产">
            {availableAssets.slice(0, 6).map((asset) => {
              const selectedCard = asset.id === selected.id;
              const cardProgress = progress[asset.id] ?? 0;
              return (
                <button
                  aria-pressed={selectedCard}
                  className={`public-trial-dashboard__asset-card${selectedCard ? ' is-selected' : ''}`}
                  key={asset.id}
                  onClick={() => chooseAsset(asset.id)}
                  type="button"
                >
                  <span className="public-trial-dashboard__asset-card-label">
                    内置资产 · 已完成 {cardProgress}/{steps.length}
                  </span>
                  <strong>{asset.personal.triggerName}</strong>
                  <span>{asset.personal.coreIdea}</span>
                  <small>{selectedCard ? '正在练习' : '选择开始练习'} →</small>
                </button>
              );
            })}
          </section>

          <article className="public-trial-dashboard__practice-card" aria-labelledby="trial-practice-title">
            <header>
              <div>
                <p className="page-heading__eyebrow">CURRENT ASSET</p>
                <h2 id="trial-practice-title">{selected.personal.triggerName}</h2>
                <p>{selected.personal.coreIdea}</p>
              </div>
              <Link href={`/assets/${selected.id}`}>查看资产详情</Link>
            </header>
            <div className="public-trial-dashboard__flow">
              <h3>核心表达 / Key flow</h3>
              <p>{selected.personal.coreFlow}</p>
            </div>
            <ol className="public-trial-dashboard__steps" aria-label="五步训练进度">
              {steps.map((step, index) => (
                <li className={index < completedSteps ? 'is-complete' : index === completedSteps ? 'is-current' : ''} key={step}>
                  <span>{index + 1}</span>
                  <strong>{step}</strong>
                  <small>
                    {index < completedSteps ? '已完成' : index === completedSteps ? '当前步骤' : '待完成'}
                  </small>
                </li>
              ))}
            </ol>
            <footer>
              <button disabled={completedSteps >= steps.length} onClick={completeCurrentStep} type="button">
                {completedSteps >= steps.length ? '已完成本轮五步训练' : `完成：${steps[completedSteps]}`}
              </button>
              {completedSteps > 0 && (
                <button className="public-trial-dashboard__reset" onClick={resetCurrentAsset} type="button">
                  从第一步重新练习
                </button>
              )}
            </footer>
          </article>
        </>
      )}
      <section className="public-trial-dashboard__notice">
        <strong>试用边界</strong>
        <p>公开版不接收文件、不调用 AI，也不会展示或改动管理员的导入资料；这些操作仅在受保护的管理区中进行。</p>
      </section>
    </main>
  );
}
