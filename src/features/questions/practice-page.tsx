'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { readJsonResponse } from '@/lib/api-response';

type CallableAsset = {
  personalAssetVersionId: string;
  triggerName: string;
  coreIdea: string;
  internalStage: string;
  nodes: Array<{ id: string }>;
};

type PracticeOverview = {
  callableAssets: CallableAsset[];
  confirmedFacts: Array<{ id: string; text: string }>;
  r4Drafts: Array<{ taskId: string; questionText: string; primaryAssetName: string | null }>;
  plans: Array<{
    id: string;
    questionText: string;
    status: string;
    source: string;
    primaryAssetName: string | null;
  }>;
};

export function QuestionPracticePage() {
  const router = useRouter();
  const [overview, setOverview] = useState<PracticeOverview | null>(null);
  const [questionText, setQuestionText] = useState('');
  const [source, setSource] = useState<'USER_REAL' | 'AI_GENERATED'>('USER_REAL');
  const [primaryAssetVersionId, setPrimaryAssetVersionId] = useState('');
  const [secondaryAssetVersionId, setSecondaryAssetVersionId] = useState('');
  const [factIds, setFactIds] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const [draftQuestion, setDraftQuestion] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    void fetch('/api/questions')
      .then(async (response) => {
        const result = await readJsonResponse<PracticeOverview & { error?: string }>(
          response,
          '问题训练数据暂时不可用，请稍后刷新。',
        );
        if (!response.ok) throw new Error(result.error ?? '无法读取问题训练数据。');
        if (!isCurrent) return;
        setOverview(result);
        setPrimaryAssetVersionId(
          (current) => current || result.callableAssets[0]?.personalAssetVersionId || '',
        );
      })
      .catch((reason: unknown) => {
        if (isCurrent) {
          setStatus(reason instanceof Error ? reason.message : '无法读取问题训练数据。');
        }
      });
    return () => {
      isCurrent = false;
    };
  }, []);

  const currentAssets = overview?.callableAssets ?? [];
  const canRequestDraft = Boolean(primaryAssetVersionId) && !isSaving;
  const canCreatePlan = Boolean(primaryAssetVersionId && questionText.trim()) && !isSaving;

  async function requestR4Draft() {
    setIsSaving(true);
    setStatus('正在请求受支撑的 R4 问题草稿。');
    setDraftQuestion('');
    try {
      const response = await fetch('/api/questions/draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          primaryPersonalAssetVersionId: primaryAssetVersionId,
          secondaryPersonalAssetVersionId: secondaryAssetVersionId || undefined,
          confirmedFactIds: factIds,
        }),
      });
      const result = await readJsonResponse<{
        questionText?: string | null;
        status?: string;
        reason?: string;
        error?: string;
      }>(response, 'R4 草稿请求失败。');
      if (!response.ok) throw new Error(result.error ?? 'R4 草稿请求失败。');
      if (result.status === 'NOT_CONFIGURED') {
        setStatus('AI 尚未配置；没有生成随机问题，你仍可创建真实问题准备。');
        return;
      }
      if (result.questionText) {
        setDraftQuestion(result.questionText);
        setStatus('R4 草稿已保存，等待你决定是否采用。');
        return;
      }
      setStatus('R4 未生成可确认草稿；没有创建问题计划。');
    } catch (reason: unknown) {
      setStatus(reason instanceof Error ? reason.message : 'R4 草稿请求失败。');
    } finally {
      setIsSaving(false);
    }
  }

  function adoptDraft() {
    adoptQuestionText(draftQuestion);
  }

  function adoptQuestionText(nextQuestionText: string) {
    setQuestionText(nextQuestionText);
    setSource('AI_GENERATED');
    setStatus('草稿已填入编辑框；请检查后手动创建问题准备。');
  }

  async function createPlan() {
    setIsSaving(true);
    setStatus('正在按本地支撑规则创建问题准备。');
    try {
      const response = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          questionText,
          source,
          primaryPersonalAssetVersionId: primaryAssetVersionId,
          secondaryPersonalAssetVersionId: secondaryAssetVersionId || undefined,
          confirmedFactIds: factIds,
        }),
      });
      const result = await readJsonResponse<{ planId?: string; error?: string }>(
        response,
        '无法创建问题准备。',
      );
      if (!response.ok || !result.planId) throw new Error(result.error ?? '无法创建问题准备。');
      router.push(`/practice/new?planId=${encodeURIComponent(result.planId)}`);
    } catch (reason: unknown) {
      setStatus(reason instanceof Error ? reason.message : '无法创建问题准备。');
      setIsSaving(false);
    }
  }

  return (
    <main className="page question-practice">
      <header className="page-heading">
        <p className="page-heading__eyebrow">P06 / SUPPORTED QUESTION</p>
        <h1>问题训练</h1>
        <p>问题只能调用已经掌握的个人资产；AI 草稿始终需要你的确认，不能替你发布问题计划。</p>
      </header>

      {!overview && !status && (
        <p className="question-practice__status">正在读取本地可调用资产。</p>
      )}
      {status && <p className="question-practice__status">{status}</p>}
      {overview && currentAssets.length === 0 && <NoCallableAssetState />}
      {overview && currentAssets.length > 0 && (
        <>
          <section className="question-practice__assets" aria-labelledby="callable-assets-heading">
            <div>
              <p className="question-practice__serial">LOCAL ELIGIBILITY</p>
              <h2 id="callable-assets-heading">可调用的个人资产</h2>
            </div>
            <p>只显示已确认、已激活且处于 S2—S5 调用阶段的个人资产。</p>
            <ul>
              {currentAssets.map((asset) => (
                <li key={asset.personalAssetVersionId}>
                  <strong>{asset.triggerName}</strong>
                  <span>{asset.coreIdea}</span>
                  <small>
                    {asset.internalStage} · {asset.nodes.length} 个可追溯节点
                  </small>
                </li>
              ))}
            </ul>
          </section>

          <section className="question-practice__form" aria-labelledby="question-create-heading">
            <div>
              <p className="question-practice__serial">CREATE PREPARATION</p>
              <h2 id="question-create-heading">创建一个受支撑的问题准备</h2>
              <p>你可以输入真实问题，或请求一份只基于当前资产的 R4 草稿。</p>
            </div>
            <label>
              真实问题或已采用的草稿
              <textarea
                aria-label="真实问题或已采用的草稿"
                value={questionText}
                onChange={(event) => {
                  setQuestionText(event.target.value);
                  setSource('USER_REAL');
                }}
                placeholder="例如：When you face a problem at work, what do you usually do?"
              />
            </label>
            <div className="question-practice__asset-selects">
              <label>
                主资产
                <select
                  aria-label="主资产"
                  value={primaryAssetVersionId}
                  onChange={(event) => {
                    setPrimaryAssetVersionId(event.target.value);
                    setSecondaryAssetVersionId((current) =>
                      current === event.target.value ? '' : current,
                    );
                  }}
                >
                  {currentAssets.map((asset) => (
                    <option key={asset.personalAssetVersionId} value={asset.personalAssetVersionId}>
                      {asset.triggerName} · {asset.internalStage}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                补充资产（可选）
                <select
                  aria-label="补充资产（可选）"
                  value={secondaryAssetVersionId}
                  onChange={(event) => setSecondaryAssetVersionId(event.target.value)}
                >
                  <option value="">不添加补充资产</option>
                  {currentAssets
                    .filter((asset) => asset.personalAssetVersionId !== primaryAssetVersionId)
                    .map((asset) => (
                      <option
                        key={asset.personalAssetVersionId}
                        value={asset.personalAssetVersionId}
                      >
                        {asset.triggerName} · {asset.internalStage}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            {overview.confirmedFacts.length > 0 && (
              <fieldset>
                <legend>可选：使用已确认的个人事实</legend>
                {overview.confirmedFacts.map((fact) => (
                  <label className="question-practice__fact" key={fact.id}>
                    <input
                      type="checkbox"
                      checked={factIds.includes(fact.id)}
                      onChange={(event) =>
                        setFactIds((current) =>
                          event.target.checked
                            ? [...current, fact.id]
                            : current.filter((id) => id !== fact.id),
                        )
                      }
                    />
                    <span>{fact.text}</span>
                  </label>
                ))}
              </fieldset>
            )}
            <div className="question-practice__actions">
              <button
                disabled={!canRequestDraft}
                onClick={() => void requestR4Draft()}
                type="button"
              >
                请求 R4 问题草稿
              </button>
              <button
                className="question-practice__secondary-button"
                disabled={!canCreatePlan}
                onClick={() => void createPlan()}
                type="button"
              >
                创建问题准备
              </button>
            </div>
            {draftQuestion && (
              <aside className="question-practice__draft" aria-label="R4 待确认问题草稿">
                <p className="question-practice__serial">R4 / DRAFT ONLY</p>
                <p>{draftQuestion}</p>
                <button onClick={adoptDraft} type="button">
                  采用这份草稿
                </button>
              </aside>
            )}
          </section>
          {overview.r4Drafts.length > 0 && (
            <section
              className="question-practice__drafts"
              aria-labelledby="saved-r4-drafts-heading"
            >
              <p className="question-practice__serial">R4 / SAVED DRAFTS</p>
              <h2 id="saved-r4-drafts-heading">待确认的问题草稿</h2>
              <p>这些草稿已保存在本地，但不会自行变成问题计划。</p>
              <ul>
                {overview.r4Drafts.map((draft) => (
                  <li key={draft.taskId}>
                    <div>
                      <p>{draft.questionText}</p>
                      <span>主资产：{draft.primaryAssetName ?? '已冻结个人资产版本'}</span>
                    </div>
                    <button onClick={() => adoptQuestionText(draft.questionText)} type="button">
                      采用草稿
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {overview && overview.plans.length > 0 && (
        <section className="question-practice__plans" aria-labelledby="question-plans-heading">
          <p className="question-practice__serial">SAVED PREPARATIONS</p>
          <h2 id="question-plans-heading">已保存的问题准备</h2>
          <ul>
            {overview.plans.map((plan) => (
              <li key={plan.id}>
                <div>
                  <h3>{plan.questionText}</h3>
                  <p>
                    主资产：{plan.primaryAssetName ?? '已冻结的个人资产版本'} · {plan.source}
                  </p>
                </div>
                <Link href={`/practice/new?planId=${encodeURIComponent(plan.id)}`}>查看准备</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function NoCallableAssetState() {
  return (
    <section className="question-practice__empty" aria-labelledby="no-callable-asset-heading">
      <p className="question-practice__serial">ASSET-SUPPORTED PROMPTS</p>
      <h2 id="no-callable-asset-heading">初始资产已导入，尚未达到调用阶段</h2>
      <p>
        你已有初始学习资产，但它们目前处于熟读阶段。完成熟读、复现和单资产调用后，达到 S2
        才能用这些已掌握资产做问题训练；系统不会用未掌握资产随机出题。
      </p>
      <Link className="question-practice__primary-action" href="/">
        开始今天训练
      </Link>
    </section>
  );
}
