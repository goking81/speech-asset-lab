'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type SourceVersion = {
  id: string;
  title: string;
  coreIdea: string;
  coreFlow: string;
  version: number;
};

type PersonalVersion = {
  triggerName: string;
  coreIdea: string;
  coreFlow: string;
  scenario: string | null;
  version: number;
};

type PersonalDraft = {
  triggerName: string;
  coreIdea: string;
  coreFlow: string;
  scenario: string;
};

export function PersonalizePage({ assetId }: { assetId: string }) {
  const [source, setSource] = useState<SourceVersion | null>(null);
  const [triggerName, setTriggerName] = useState('');
  const [coreIdea, setCoreIdea] = useState('');
  const [coreFlow, setCoreFlow] = useState('');
  const [scenario, setScenario] = useState('');
  const [personalExperience, setPersonalExperience] = useState('');
  const [draft, setDraft] = useState<PersonalDraft | null>(null);
  const [draftStatus, setDraftStatus] = useState('');
  const [isDrafting, setIsDrafting] = useState(false);
  const [status, setStatus] = useState('正在读取来源资产。');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetch(`/api/assets/${assetId}`)
      .then(async (response) => {
        const result = (await response.json()) as {
          sourceVersion?: SourceVersion;
          personalVersion?: PersonalVersion | null;
          error?: string;
        };
        if (!response.ok || !result.sourceVersion)
          throw new Error(result.error ?? '无法读取来源资产。');
        setSource(result.sourceVersion);
        const current = result.personalVersion;
        setTriggerName(current?.triggerName ?? result.sourceVersion.title);
        setCoreIdea(current?.coreIdea ?? result.sourceVersion.coreIdea);
        setCoreFlow(current?.coreFlow ?? result.sourceVersion.coreFlow);
        setScenario(current?.scenario ?? '');
        setStatus('');
      })
      .catch((error: unknown) =>
        setStatus(error instanceof Error ? error.message : '无法读取来源资产。'),
      );
  }, [assetId]);

  async function save() {
    if (!source) return;
    setSaving(true);
    setStatus('正在保存新的个人资产版本。');
    try {
      const response = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceAssetVersionId: source.id,
          triggerName,
          coreIdea,
          coreFlow,
          scenario,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? '个人资产保存失败。');
      setStatus('新的个人资产版本已确认。来源版本保持不变。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '个人资产保存失败。');
    } finally {
      setSaving(false);
    }
  }

  async function createAiDraft() {
    if (!personalExperience.trim()) {
      setDraftStatus('请先用中文写下你想补充的个人经历。');
      return;
    }
    setIsDrafting(true);
    setDraftStatus('正在基于你的中文经历生成个人化草稿。');
    setDraft(null);
    try {
      const response = await fetch(`/api/assets/${assetId}/personalization-draft`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ personalExperience }),
      });
      const result = (await response.json()) as { draft?: PersonalDraft; error?: string };
      if (!response.ok || !result.draft) throw new Error(result.error ?? 'AI 草稿生成失败。');
      setDraft(result.draft);
      setDraftStatus('AI 草稿已生成。请检查后再填入表单；尚未保存为个人版本。');
    } catch (error: unknown) {
      setDraftStatus(error instanceof Error ? error.message : 'AI 草稿生成失败。');
    } finally {
      setIsDrafting(false);
    }
  }

  function applyDraft() {
    if (!draft) return;
    setTriggerName(draft.triggerName);
    setCoreIdea(draft.coreIdea);
    setCoreFlow(draft.coreFlow);
    setScenario(draft.scenario);
    setStatus('AI 草稿已填入表单。请自行修改并确认保存。');
  }
  const enabled = Boolean(
    source && triggerName.trim() && coreIdea.trim() && coreFlow.trim() && !saving,
  );
  return (
    <main className="page page--with-back-link candidate-review personalize-page">
      <Link className="page-back-link" href="/assets">
        ← 返回资产库
      </Link>
      <header className="page-heading">
        <p className="page-heading__eyebrow">F1-04 / PERSONAL VERSION</p>
        <h1>手动改写个人版本</h1>
        <p>来源版本只读。可直接填写你的说法；确认后会另存为新的个人版本。</p>
      </header>
      <p className="candidate-review__status" aria-live="polite">
        {status}
      </p>
      {source && (
        <section className="candidate-review__form">
          <p className="candidate-review__serial">SOURCE v{source.version} · READ ONLY</p>
          <p className="candidate-review__evidence">{source.coreFlow}</p>
          <label>
            个人触发名
            <input
              aria-label="个人触发名"
              value={triggerName}
              onChange={(event) => setTriggerName(event.target.value)}
            />
          </label>
          <label>
            个人核心观点
            <input
              aria-label="个人核心观点"
              value={coreIdea}
              onChange={(event) => setCoreIdea(event.target.value)}
            />
          </label>
          <label>
            我的连续语流
            <textarea
              aria-label="个人连续语流"
              value={coreFlow}
              onChange={(event) => setCoreFlow(event.target.value)}
            />
          </label>
          <label>
            我的使用场景（可选）
            <input
              aria-label="使用场景"
              value={scenario}
              onChange={(event) => setScenario(event.target.value)}
            />
          </label>
          <section className="personalize-page__ai" aria-labelledby="personalize-ai-heading">
            <p className="candidate-review__serial">AI DRAFT · OPTIONAL</p>
            <h2 id="personalize-ai-heading">用中文补充我的个人经历</h2>
            <p>点击生成即确认本次输入可作为本地个人事实。AI 只生成草稿，不会自动保存为资产。</p>
            <textarea
              aria-label="中文个人经历"
              placeholder="例如：我最近开始把水杯放在办公桌上。下午注意力下降时，我会先喝水再继续处理工作。"
              value={personalExperience}
              onChange={(event) => setPersonalExperience(event.target.value)}
            />
            <button disabled={isDrafting} onClick={() => void createAiDraft()} type="button">
              {isDrafting ? '正在生成草稿…' : '确认经历并生成 AI 草稿'}
            </button>
            {draftStatus && <p className="candidate-review__status">{draftStatus}</p>}
            {draft && (
              <aside className="personalize-page__draft">
                <p>触发名：{draft.triggerName}</p>
                <p>核心观点：{draft.coreIdea}</p>
                <p className="asset-flow">{draft.coreFlow}</p>
                <button onClick={applyDraft} type="button">
                  使用这份草稿填入表单
                </button>
              </aside>
            )}
          </section>
          <button disabled={!enabled} onClick={save} type="button">
            {saving ? '正在确认…' : '保存为新的个人版本'}
          </button>
        </section>
      )}
    </main>
  );
}
