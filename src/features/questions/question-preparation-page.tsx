'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

type QuestionPlan = {
  id: string;
  questionText: string;
  assets: Array<{ role: string; triggerName: string; version: number }>;
  obligations: Array<{
    id: string;
    sequence: number;
    description: string;
    englishExpression: string | null;
    supports: Array<{ type: string; explanation: string | null }>;
  }>;
};

export function QuestionPreparationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planId = searchParams.get('planId');
  const [plan, setPlan] = useState<QuestionPlan | null>(null);
  const [error, setError] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [startStatus, setStartStatus] = useState('');

  useEffect(() => {
    if (!planId) return;
    void fetch(`/api/questions/${encodeURIComponent(planId)}`)
      .then(async (response) => {
        const result = (await response.json()) as { plan?: QuestionPlan; error?: string };
        if (!response.ok || !result.plan) throw new Error(result.error ?? '无法读取问题准备。');
        setPlan(result.plan);
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : '无法读取问题准备。'),
      );
  }, [planId]);

  if (!planId) {
    return <NoPreparationState description="请先在问题训练页创建一份受支撑的问题准备。" />;
  }
  if (error) return <NoPreparationState description={error} />;
  if (!plan) {
    return (
      <main className="page page--with-back-link question-preparation">
        <Link className="page-back-link" href="/practice">
          ← 返回问题训练
        </Link>
        <p className="question-preparation__status">正在读取问题准备。</p>
      </main>
    );
  }

  const primary = plan.assets.find((asset) => asset.role === 'PRIMARY');
  async function startP08Session() {
    if (!plan) return;
    setIsStarting(true);
    setStartStatus('正在建立或恢复本地问题回答会话。');
    try {
      const response = await fetch('/api/training/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ questionPlanId: plan.id }),
      });
      const result = (await response.json()) as { sessionId?: string; error?: string };
      if (!response.ok || !result.sessionId) {
        throw new Error(result.error ?? '无法建立问题回答会话。');
      }
      router.push(`/practice/${encodeURIComponent(result.sessionId)}`);
    } catch (reason: unknown) {
      setStartStatus(reason instanceof Error ? reason.message : '无法建立问题回答会话。');
      setIsStarting(false);
    }
  }
  return (
    <main className="page page--with-back-link question-preparation">
      <Link className="page-back-link" href="/practice">
        ← 返回问题训练
      </Link>
      <header className="page-heading">
        <p className="page-heading__eyebrow">P07 / QUESTION PREPARATION</p>
        <h1>问题准备</h1>
        <p>准备材料来自已冻结的个人资产版本；展开英文表达只用于准备，不会记为正式提示等级。</p>
      </header>
      <section className="question-preparation__question">
        <p className="question-preparation__serial">SUPPORTED QUESTION</p>
        <h2>{plan.questionText}</h2>
        <p>
          主资产：
          {primary ? `${primary.triggerName} · v${primary.version}` : '已冻结的个人资产版本'}
        </p>
      </section>
      <section className="question-preparation__skeleton" aria-labelledby="skeleton-heading">
        <p className="question-preparation__serial">CHINESE SKELETON</p>
        <h2 id="skeleton-heading">回答骨架</h2>
        <ol>
          {plan.obligations.map((obligation) => (
            <li key={obligation.id}>
              <p>{String(obligation.sequence).padStart(2, '0')}</p>
              <div>
                <h3>{obligation.description}</h3>
                <details>
                  <summary>查看英文表达</summary>
                  <p>{obligation.englishExpression ?? '当前节点没有可展示的英文表达。'}</p>
                </details>
                <span>{obligation.supports.map((support) => support.type).join(' · ')}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section className="question-preparation__boundary">
        <h2>开始第一次回答</h2>
        <p>
          进入 P08
          后，第一次、最多三轮受支撑追问和第二次回答都会独立保存。追问失败、无支撑或你选择结束时，会安全进入空白的第二次回答。
        </p>
        <button disabled={isStarting} onClick={() => void startP08Session()} type="button">
          {isStarting ? '正在打开回答会话' : '开始第一次回答'}
        </button>
        {startStatus && <p className="question-preparation__start-status">{startStatus}</p>}
      </section>
    </main>
  );
}

function NoPreparationState({ description }: { description: string }) {
  return (
    <main className="page page--with-back-link question-preparation">
      <Link className="page-back-link" href="/practice">
        ← 返回问题训练
      </Link>
      <section className="question-preparation__empty">
        <p className="question-preparation__serial">P07 / PREPARATION</p>
        <h1>尚未选择问题准备</h1>
        <p>{description}</p>
      </section>
    </main>
  );
}
