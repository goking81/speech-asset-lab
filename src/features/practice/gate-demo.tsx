'use client';

import Link from 'next/link';

import { useState } from 'react';

import {
  canSaveOralAttempt,
  canSubmitTextAnswer,
  type CompletionRating,
  type DifficultyRating,
} from '@/lib/practice-gates';

const completionOptions: Array<{ value: CompletionRating; label: string }> = [
  { value: 'COMPLETE', label: '完整完成' },
  { value: 'BASIC', label: '基本完成' },
  { value: 'PARTIAL', label: '部分完成' },
  { value: 'NOT_COMPLETED', label: '未完成' },
];

const difficultyOptions: Array<{ value: DifficultyRating; label: string }> = [
  { value: 'EASY', label: '轻松' },
  { value: 'RIGHT', label: '刚好' },
  { value: 'DIFFICULT', label: '困难' },
];

export function GateDemo() {
  const [oralAttemptConfirmed, setOralAttemptConfirmed] = useState(false);
  const [completionRating, setCompletionRating] = useState<CompletionRating | null>(null);
  const [difficultyRating, setDifficultyRating] = useState<DifficultyRating | null>(null);
  const [text, setText] = useState('');
  const [sessionVersionIsCurrent, setSessionVersionIsCurrent] = useState(true);

  const canSave = canSaveOralAttempt({
    oralAttemptConfirmed,
    completionRating,
    difficultyRating,
    isSaving: false,
  });
  const canSubmit = canSubmitTextAnswer({
    text,
    sessionVersionIsCurrent,
    isSubmitting: false,
  });

  return (
    <main className="page page--with-back-link gate-demo">
      <Link className="page-back-link" href="/practice">
        ← 返回问题训练
      </Link>
      <header className="page-heading">
        <p className="page-heading__eyebrow">ITERATION 03 / TEST PAGE</p>
        <h1>训练门禁演示</h1>
        <p>仅用于验证规则即时更新，不保存训练数据，也不会调用 AI 服务。</p>
      </header>

      <div className="gate-demo__grid">
        <section aria-labelledby="oral-gate-heading" className="gate-demo__card">
          <p className="gate-demo__serial">P05 / ORAL SELF-REPORT</p>
          <h2 id="oral-gate-heading">口头尝试保存</h2>
          <label className="gate-demo__check">
            <input
              checked={oralAttemptConfirmed}
              onChange={(event) => setOralAttemptConfirmed(event.target.checked)}
              type="checkbox"
            />
            我已完成口头尝试
          </label>
          <label>
            完成情况
            <select
              aria-label="完成情况"
              onChange={(event) =>
                setCompletionRating((event.target.value || null) as CompletionRating | null)
              }
              value={completionRating ?? ''}
            >
              <option value="">请选择</option>
              {completionOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            难度
            <select
              aria-label="难度"
              onChange={(event) =>
                setDifficultyRating((event.target.value || null) as DifficultyRating | null)
              }
              value={difficultyRating ?? ''}
            >
              <option value="">请选择</option>
              {difficultyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button disabled={!canSave} type="button">
            保存并继续
          </button>
          <p aria-live="polite" className="gate-demo__status">
            {canSave ? '门禁已满足' : '需要确认口头尝试并完成两项自评'}
          </p>
        </section>

        <section aria-labelledby="text-gate-heading" className="gate-demo__card">
          <p className="gate-demo__serial">P08 / TEXT ANSWER</p>
          <h2 id="text-gate-heading">文字回答提交</h2>
          <label>
            回答文本
            <textarea
              aria-label="回答文本"
              onChange={(event) => setText(event.target.value)}
              placeholder="一个单词、一个汉字或一个标点都可提交"
              value={text}
            />
          </label>
          <label className="gate-demo__check">
            <input
              checked={sessionVersionIsCurrent}
              onChange={(event) => setSessionVersionIsCurrent(event.target.checked)}
              type="checkbox"
            />
            会话版本仍有效
          </label>
          <button disabled={!canSubmit} type="button">
            提交文字
          </button>
          <p aria-live="polite" className="gate-demo__status">
            {canSubmit ? '门禁已满足' : '需要非空文本和有效会话版本'}
          </p>
        </section>
      </div>
    </main>
  );
}
