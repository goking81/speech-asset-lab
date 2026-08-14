'use client';

import { useEffect, useState } from 'react';

type HistoryView = {
  records: Array<{
    id: string;
    kind: 'QUESTION_TRAINING' | 'ASSET_PRACTICE';
    status: string;
    createdAt: string;
    updatedAt: string;
    question: string;
    assets: Array<{ id: string; triggerName: string; version: number }>;
    answers: { first: string | null; second: string | null };
    hints: Array<{ level: string; context: string; createdAt: string }>;
    releaseBundle: { version: string; status: string } | null;
    aiStates: Array<{ role: string; status: string; fallbackReason: string | null }>;
    evaluations: Array<{ answerId: string; status: string; totalScore: number | null }>;
    comparison: {
      factsStatus: string;
      interpretationStatus: string;
      finalDisplayStatus: string;
    } | null;
    assetPractice: {
      currentStep: string;
      completedAt: string | null;
      attempts: Array<{
        stepType: string;
        status: string;
        oralAttemptConfirmed: boolean;
        completionRating: string | null;
        difficultyRating: string | null;
        highestHintLevel: string;
        textAnswer: string | null;
        completedAt: string | null;
      }>;
    } | null;
  }>;
  filterOptions: {
    assets: Array<{ id: string; label: string }>;
    statuses: string[];
  };
};

export function TrainingHistoryPage() {
  const [history, setHistory] = useState<HistoryView | null>(null);
  const [assetId, setAssetId] = useState('');
  const [question, setQuestion] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const parameters = new URLSearchParams();
    if (assetId) parameters.set('assetId', assetId);
    if (question.trim()) parameters.set('question', question.trim());
    if (status) parameters.set('status', status);
    void fetch(`/api/history?${parameters.toString()}`)
      .then(async (response) => {
        const result = (await response.json()) as { history?: HistoryView; error?: string };
        if (!response.ok || !result.history)
          throw new Error(result.error ?? '无法读取本地训练记录。');
        if (active) setHistory(result.history);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : '无法读取本地训练记录。');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [assetId, question, status]);

  return (
    <main className="page history-page">
      <header className="page-heading">
        <p className="page-heading__eyebrow">P13 / TRAINING HISTORY</p>
        <h1>训练记录</h1>
        <p>只读回看已保存的会话、回答、提示、评价状态、降级来源和冻结版本。</p>
      </header>

      <section className="history-page__filters" aria-label="训练记录筛选">
        <label>
          资产
          <select onChange={(event) => setAssetId(event.target.value)} value={assetId}>
            <option value="">全部资产</option>
            {history?.filterOptions.assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          问题
          <input
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="按已保存问题筛选"
            type="search"
            value={question}
          />
        </label>
        <label>
          会话状态
          <select onChange={(event) => setStatus(event.target.value)} value={status}>
            <option value="">全部状态</option>
            {history?.filterOptions.statuses.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </section>

      {isLoading && <p className="history-page__status">正在读取本地训练记录。</p>}
      {error && <p className="history-page__error">{error}</p>}
      {!isLoading && !error && history?.records.length === 0 && (
        <section className="history-page__empty">
          <p className="training-session__serial">NO SAVED SESSIONS</p>
          <h2>暂无符合条件的训练记录</h2>
          <p>保存问题回答或完成资产训练后，记录会显示在这里。</p>
        </section>
      )}
      <div className="history-page__records">
        {history?.records.map((record) => (
          <article className="history-page__record" key={record.id}>
            <div className="history-page__record-heading">
              <div>
                <p className="training-session__serial">
                  {record.kind === 'ASSET_PRACTICE' ? 'P05 ASSET PRACTICE' : 'SAVED SESSION'}
                </p>
                <h2>{record.question}</h2>
              </div>
              <span>{record.status}</span>
            </div>
            <p className="history-page__metadata">
              更新于 {formatDate(record.updatedAt)} ·{' '}
              {record.assets.map(assetLabel).join(' / ') || '无可读资产'}
            </p>
            <div className="history-page__columns">
              {record.assetPractice ? (
                <HistoryAssetPractice practice={record.assetPractice} />
              ) : (
                <HistoryAnswers answers={record.answers} />
              )}
              <HistoryState record={record} />
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}

function HistoryAssetPractice({
  practice,
}: {
  practice: NonNullable<HistoryView['records'][number]['assetPractice']>;
}) {
  return (
    <section>
      <h3>P05 单资产训练</h3>
      <p>
        当前步骤：{practice.currentStep} · 已保存 {practice.attempts.length} 次步骤尝试
      </p>
      {practice.attempts.map((attempt) => (
        <details key={`${attempt.stepType}-${attempt.completedAt ?? attempt.status}`}>
          <summary>
            {attempt.stepType} · {attempt.status}
          </summary>
          <p>
            自评：{attempt.completionRating ?? '未填写'} / {attempt.difficultyRating ?? '未填写'}；
            主动提示：{attempt.highestHintLevel}
          </p>
          {attempt.textAnswer && <p>文字锚点：{attempt.textAnswer}</p>}
        </details>
      ))}
    </section>
  );
}

function HistoryAnswers({ answers }: { answers: HistoryView['records'][number]['answers'] }) {
  return (
    <section>
      <h3>两次已保存回答</h3>
      <details>
        <summary>第一次回答</summary>
        <p>{answers.first ?? '尚未保存'}</p>
      </details>
      <details>
        <summary>第二次回答</summary>
        <p>{answers.second ?? '尚未保存'}</p>
      </details>
    </section>
  );
}

function HistoryState({ record }: { record: HistoryView['records'][number] }) {
  return (
    <section>
      <h3>本地状态与版本</h3>
      <p>冻结 Bundle：{record.releaseBundle?.version ?? '历史会话未冻结 Bundle'}</p>
      <p>
        主动提示：
        {record.hints.length ? record.hints.map((hint) => hint.level).join(' / ') : '未使用'}
      </p>
      <ul className="history-page__states">
        {record.aiStates.length ? (
          record.aiStates.map((state) => (
            <li key={state.role}>
              <span>
                {state.role} · {state.status}
              </span>
              {state.fallbackReason && <small>降级：{state.fallbackReason}</small>}
            </li>
          ))
        ) : (
          <li>当前没有已保存的 AI 角色状态。</li>
        )}
      </ul>
      {record.evaluations.length > 0 && (
        <p>
          R7B 总分：
          {record.evaluations
            .map((item) => (item.totalScore === null ? '未生成' : item.totalScore))
            .join(' / ')}
        </p>
      )}
      {record.comparison && (
        <p>
          P09：{record.comparison.finalDisplayStatus} · {record.comparison.factsStatus} /{' '}
          {record.comparison.interpretationStatus}
        </p>
      )}
    </section>
  );
}

function assetLabel(asset: { triggerName: string; version: number }) {
  return `${asset.triggerName} · v${asset.version}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '未知时间'
    : date.toLocaleString('zh-CN', { hour12: false });
}
