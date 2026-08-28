'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { readJsonResponse } from '@/lib/api-response';
import { canSubmitTextAnswer } from '@/lib/practice-gates';

type P08Phase =
  'FIRST_ANSWER' | 'FIRST_ANSWER_SAVED' | 'REFINEMENT' | 'SECOND_ANSWER' | 'COMPLETED';
type DraftPhase = 'FIRST_ANSWER' | 'FOLLOW_UP_ANSWER' | 'SECOND_ANSWER';

type TrainingSession = {
  id: string;
  businessVersion: number;
  status: string;
  phase: P08Phase;
  question: string;
  questionPlanId: string;
  assets: Array<{
    role: string;
    personalAssetVersionId: string;
    triggerName: string;
    version: number;
    coreFlow: string;
  }>;
  candidates: Array<{ id: string; questionText: string }>;
  obligations: Array<{
    id: string;
    sequence: number;
    description: string;
    englishExpression: string | null;
  }>;
  answers: {
    first: { id: string; text: string; createdAt: string } | null;
    second: { id: string; text: string; createdAt: string } | null;
  };
  followUp: {
    current: {
      id: string;
      issuedIndex: number;
      questionText: string;
      support: { obligationDescription: string | null; supportLabels: string[] };
    } | null;
    endReason: string | null;
    taskStatus: string | null;
  };
  checkpoint: { type: string; draft: string; createdAt: string } | null;
};

export function P08PracticePage({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<TrainingSession | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const answerKeys = useRef<Partial<Record<DraftPhase, string>>>({});

  useEffect(() => {
    let isCurrent = true;
    void fetch(`/api/training/sessions/${encodeURIComponent(sessionId)}`)
      .then(async (response) => {
        const result = await readJsonResponse<{ session?: TrainingSession; error?: string }>(
          response,
          '无法读取问题回答会话。',
        );
        if (!response.ok || !result.session) {
          throw new Error(result.error ?? '无法读取问题回答会话。');
        }
        if (!isCurrent) return;
        receiveSession(result.session, setSession, setDraft);
      })
      .catch((reason: unknown) => {
        if (isCurrent) {
          setError(reason instanceof Error ? reason.message : '无法读取问题回答会话。');
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [sessionId]);

  async function saveAnswer(answerType: 'FIRST_ANSWER' | 'SECOND_ANSWER') {
    if (!session) return;
    setIsSubmitting(true);
    setError('');
    setStatus('正在保存回答。');
    const idempotencyKey = answerKeys.current[answerType] ?? createIdempotencyKey();
    answerKeys.current[answerType] = idempotencyKey;
    try {
      const response = await fetch(
        `/api/training/sessions/${encodeURIComponent(session.id)}/answers`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            expectedBusinessVersion: session.businessVersion,
            answerType,
            text: draft,
            idempotencyKey,
          }),
        },
      );
      const result = await readJsonResponse<{ session?: TrainingSession; error?: string }>(
        response,
        '无法保存回答。',
      );
      if (!response.ok || !result.session) throw new Error(result.error ?? '无法保存回答。');
      receiveSession(result.session, setSession, setDraft);
      delete answerKeys.current[answerType];
      setStatus(
        answerType === 'FIRST_ANSWER'
          ? '回答已保存。保存不会等待 AI，你现在可以决定是否继续练习。'
          : '重新组织后的回答已保存；两次回答会保留，便于之后对照。',
      );
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '无法保存回答。');
      setStatus('');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function requestRefinement() {
    if (!session) return;
    setIsSubmitting(true);
    setError('');
    setStatus('正在准备一个可跳过的补充建议。');
    try {
      const response = await fetch(
        `/api/training/sessions/${encodeURIComponent(session.id)}/refinement`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ expectedBusinessVersion: session.businessVersion }),
        },
      );
      const result = await readJsonResponse<{ session?: TrainingSession; error?: string }>(
        response,
        '无法准备补充建议。',
      );
      if (!response.ok || !result.session) {
        throw new Error(result.error ?? '无法准备补充建议。');
      }
      receiveSession(result.session, setSession, setDraft);
      setStatus(
        result.session.phase === 'REFINEMENT'
          ? '已准备一个具体补充点；你可以回答它，也可以直接跳过。'
          : '没有必要补充的单一关键点；你仍可重新组织一次，或结束本轮。',
      );
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : '暂时无法准备补充建议；你仍可直接结束或重新组织回答。',
      );
      setStatus('');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function saveRefinement() {
    if (!session?.followUp.current) return;
    setIsSubmitting(true);
    setError('');
    setStatus('正在保存补充内容。');
    const idempotencyKey = answerKeys.current.FOLLOW_UP_ANSWER ?? createIdempotencyKey();
    answerKeys.current.FOLLOW_UP_ANSWER = idempotencyKey;
    try {
      const response = await fetch(
        `/api/training/sessions/${encodeURIComponent(session.id)}/follow-ups`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            expectedBusinessVersion: session.businessVersion,
            followUpId: session.followUp.current.id,
            text: draft,
            idempotencyKey,
          }),
        },
      );
      const result = await readJsonResponse<{ session?: TrainingSession; error?: string }>(
        response,
        '无法保存补充内容。',
      );
      if (!response.ok || !result.session) throw new Error(result.error ?? '无法保存补充内容。');
      receiveSession(result.session, setSession, setDraft);
      delete answerKeys.current.FOLLOW_UP_ANSWER;
      setStatus('补充内容已保存。现在可按需重新组织原题，也可以结束本轮。');
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '无法保存补充内容。');
      setStatus('');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function startReanswer() {
    if (!session) return;
    setIsSubmitting(true);
    setError('');
    setStatus('正在打开空白回答框。');
    try {
      const response = await fetch(
        `/api/training/sessions/${encodeURIComponent(session.id)}/advance`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ expectedBusinessVersion: session.businessVersion }),
        },
      );
      const result = await readJsonResponse<{ session?: TrainingSession; error?: string }>(
        response,
        '无法打开重新回答。',
      );
      if (!response.ok || !result.session) throw new Error(result.error ?? '无法打开重新回答。');
      receiveSession(result.session, setSession, setDraft);
      setStatus('这是一个新的空白回答框；第一次回答仍被完整保留。');
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '无法打开重新回答。');
      setStatus('');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function finishRound() {
    if (!session) return;
    setIsSubmitting(true);
    setError('');
    setStatus('正在结束本轮。');
    try {
      const response = await fetch(
        `/api/training/sessions/${encodeURIComponent(session.id)}/complete`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ expectedBusinessVersion: session.businessVersion }),
        },
      );
      const result = await readJsonResponse<{ session?: TrainingSession; error?: string }>(
        response,
        '无法结束本轮。',
      );
      if (!response.ok || !result.session) throw new Error(result.error ?? '无法结束本轮。');
      receiveSession(result.session, setSession, setDraft);
      setStatus('本轮已结束，原回答已保留。');
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '无法结束本轮。');
      setStatus('');
    } finally {
      setIsSubmitting(false);
    }
  }

  function chooseCandidate(planId: string) {
    if (!session || planId === session.questionPlanId || session.phase !== 'FIRST_ANSWER') return;
    router.push(`/practice/new?planId=${encodeURIComponent(planId)}`);
  }

  function chooseRandomCandidate() {
    if (!session || session.phase !== 'FIRST_ANSWER') return;
    const alternatives = session.candidates.filter(
      (candidate) => candidate.id !== session.questionPlanId,
    );
    const selected = alternatives[Math.floor(Math.random() * alternatives.length)];
    if (selected) chooseCandidate(selected.id);
  }

  if (isLoading) return <P08LoadingState />;
  if (!session) {
    return (
      <main className="page page--with-back-link training-session">
        <Link className="page-back-link" href="/practice">
          ← 返回问题训练
        </Link>
        <p className="training-session__error">{error || '问题回答会话不可用。'}</p>
      </main>
    );
  }

  const currentDraftPhase = phaseToDraftPhase(session);
  const canSubmit = canSubmitTextAnswer({
    text: draft,
    sessionVersionIsCurrent: Boolean(currentDraftPhase),
    isSubmitting,
  });

  return (
    <main className="page page--with-back-link training-session training-session--focused">
      <Link className="page-back-link" href="/practice">
        ← 返回问题训练
      </Link>
      <header className="page-heading">
        <p className="page-heading__eyebrow">P08 / QUESTION PRACTICE</p>
        <h1>围绕一个问题，调用一条资产</h1>
        <p>每轮只面对一道题。问题可换，调用的主资产保持锁定；所有“补充”和“重新回答”都由你决定。</p>
      </header>

      {error && (
        <p className="training-session__error" role="alert">
          {error}
        </p>
      )}
      {status && (
        <p className="training-session__status" aria-live="polite">
          {status}
        </p>
      )}

      <div className="training-session__focused-layout">
        <section className="training-session__work" aria-labelledby="p08-current-heading">
          <QuestionPrompt
            assets={session.assets}
            candidateCount={session.candidates.length}
            question={session.question}
          />
          {session.phase === 'FIRST_ANSWER' && (
            <AnswerEditor
              canSubmit={canSubmit}
              draft={draft}
              heading="先自然回答一次"
              isSubmitting={isSubmitting}
              onChange={setDraft}
              onSubmit={() => void saveAnswer('FIRST_ANSWER')}
              submitLabel="保存回答"
              supportingText="保存只写入本地，不等待 AI；通常会很快完成。"
            />
          )}
          {session.phase === 'FIRST_ANSWER_SAVED' && (
            <SavedAnswerActions
              firstAnswer={session.answers.first?.text ?? ''}
              isSubmitting={isSubmitting}
              onComplete={() => void finishRound()}
              onReanswer={() => void startReanswer()}
              onRefine={() => void requestRefinement()}
            />
          )}
          {session.phase === 'REFINEMENT' && (
            <RefinementEditor
              canSubmit={canSubmit}
              currentFollowUp={session.followUp.current}
              draft={draft}
              isSubmitting={isSubmitting}
              onChange={setDraft}
              onComplete={() => void finishRound()}
              onSubmit={() => void saveRefinement()}
            />
          )}
          {session.phase === 'SECOND_ANSWER' && (
            <AnswerEditor
              canSubmit={canSubmit}
              draft={draft}
              heading="重新回答原题（可选）"
              isSubmitting={isSubmitting}
              onChange={setDraft}
              onSubmit={() => void saveAnswer('SECOND_ANSWER')}
              secondaryAction={{ label: '本轮到此为止', onClick: () => void finishRound() }}
              submitLabel="保存重新组织后的回答"
              supportingText="这是一个新的空白回答框；第一次回答不会被覆盖。若不想重答，可直接结束本轮。"
            />
          )}
          {session.phase === 'COMPLETED' && <CompletedRound session={session} />}
        </section>
        <CandidateDeck
          candidates={session.candidates}
          currentPlanId={session.questionPlanId}
          disabled={session.phase !== 'FIRST_ANSWER' || isSubmitting}
          onRandomize={chooseRandomCandidate}
          onSelect={chooseCandidate}
        />
      </div>
    </main>
  );
}

function QuestionPrompt({
  question,
  assets,
  candidateCount,
}: {
  question: string;
  assets: TrainingSession['assets'];
  candidateCount: number;
}) {
  const primary = assets.find((asset) => asset.role === 'PRIMARY');
  return (
    <section className="training-session__question">
      <p className="training-session__serial">本轮问题 / 候选池 {candidateCount || 1}</p>
      <h2 id="p08-current-heading">{question}</h2>
      <div className="training-session__asset-strip">
        <span>本轮调用资产</span>
        <strong>
          {primary ? `${primary.triggerName} · v${primary.version}` : '已冻结个人资产版本'}
        </strong>
      </div>
      <ol className="training-session__logic-chips" aria-label="本轮回答结构">
        <li>先说观点</li>
        <li>解释原因</li>
        <li>落到行动</li>
      </ol>
    </section>
  );
}

function AnswerEditor({
  heading,
  draft,
  isSubmitting,
  canSubmit,
  submitLabel,
  supportingText,
  onChange,
  onSubmit,
  secondaryAction,
}: {
  heading: string;
  draft: string;
  isSubmitting: boolean;
  canSubmit: boolean;
  submitLabel: string;
  supportingText: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  secondaryAction?: { label: string; onClick: () => void };
}) {
  return (
    <section className="training-session__editor">
      <p className="training-session__serial">TEXT RESPONSE</p>
      <h2>{heading}</h2>
      <p>按自己的方式完整表达即可。不要求词数或句数，也不会自动改写你的文字。</p>
      <label htmlFor="p08-answer">本次回答</label>
      <textarea
        id="p08-answer"
        onChange={(event) => onChange(event.target.value)}
        placeholder="输入你的回答。"
        rows={9}
        value={draft}
      />
      <div className="training-session__editor-actions">
        <button
          className="training-session__primary-action"
          disabled={!canSubmit}
          onClick={onSubmit}
          type="button"
        >
          {isSubmitting ? '正在保存' : submitLabel}
        </button>
        {secondaryAction && (
          <button
            className="training-session__secondary-action"
            disabled={isSubmitting}
            onClick={secondaryAction.onClick}
            type="button"
          >
            {secondaryAction.label}
          </button>
        )}
      </div>
      <p className="training-session__input-boundary">{supportingText}</p>
    </section>
  );
}

function SavedAnswerActions({
  firstAnswer,
  isSubmitting,
  onRefine,
  onReanswer,
  onComplete,
}: {
  firstAnswer: string;
  isSubmitting: boolean;
  onRefine: () => void;
  onReanswer: () => void;
  onComplete: () => void;
}) {
  return (
    <section className="training-session__next-actions">
      <p className="training-session__serial">ANSWER SAVED</p>
      <h2>回答已保存，下一步由你决定</h2>
      <p>没有固定追问轮次，也不要求再回答一次。你的原回答会保持不变。</p>
      <details>
        <summary>回看已保存的回答</summary>
        <p>{firstAnswer}</p>
      </details>
      <div className="training-session__choice-grid">
        <article>
          <h3>补一个关键点（可选）</h3>
          <p>AI 只会提出一个具体、可跳过的补充点；不会重复原题或给你的回答打分。</p>
          <button
            className="training-session__primary-action"
            disabled={isSubmitting}
            onClick={onRefine}
            type="button"
          >
            {isSubmitting ? '正在准备' : '请求一个补充建议'}
          </button>
        </article>
        <article>
          <h3>重新组织一次（可选）</h3>
          <p>打开新的空白回答框来重答原题，第一次回答仍会被完整保留。</p>
          <button
            className="training-session__secondary-action"
            disabled={isSubmitting}
            onClick={onReanswer}
            type="button"
          >
            重新回答原题
          </button>
        </article>
      </div>
      <button
        className="training-session__finish-action"
        disabled={isSubmitting}
        onClick={onComplete}
        type="button"
      >
        本轮到此为止
      </button>
    </section>
  );
}

function RefinementEditor({
  currentFollowUp,
  draft,
  canSubmit,
  isSubmitting,
  onChange,
  onSubmit,
  onComplete,
}: {
  currentFollowUp: TrainingSession['followUp']['current'];
  draft: string;
  canSubmit: boolean;
  isSubmitting: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onComplete: () => void;
}) {
  if (!currentFollowUp) {
    return (
      <section className="training-session__next-actions">
        <h2>暂时没有补充建议</h2>
        <p>原回答已安全保存。你可以重新组织一次，或直接结束本轮。</p>
        <button
          className="training-session__finish-action"
          disabled={isSubmitting}
          onClick={onComplete}
          type="button"
        >
          本轮到此为止
        </button>
      </section>
    );
  }
  return (
    <>
      <section className="training-session__refinement">
        <p className="training-session__serial">OPTIONAL REFINEMENT</p>
        <h2>补一个具体点（可选）</h2>
        <p className="training-session__refinement-purpose">
          建议补：{currentFollowUp.support.obligationDescription ?? '一项未充分展开的回答内容'}
        </p>
        <p className="training-session__refinement-question">{currentFollowUp.questionText}</p>
        <p>这不是对原回答的评分，也不是要求你重复回答。若现在不想补充，直接跳过即可。</p>
      </section>
      <AnswerEditor
        canSubmit={canSubmit}
        draft={draft}
        heading="补充这个点"
        isSubmitting={isSubmitting}
        onChange={onChange}
        onSubmit={onSubmit}
        secondaryAction={{ label: '跳过，保持原回答', onClick: onComplete }}
        submitLabel="保存补充内容"
        supportingText="保存后你可选择重新回答原题，也可以结束本轮。"
      />
    </>
  );
}

function CompletedRound({ session }: { session: TrainingSession }) {
  return (
    <section className="training-session__completed">
      <p className="training-session__serial">ROUND COMPLETE</p>
      <h2>本轮已完成</h2>
      <p>
        {session.answers.second
          ? '两次回答都已保留，可在训练记录中对照。'
          : '你选择保留第一次回答结束本轮；以后需要时仍可用其他候选问题继续练习。'}
      </p>
      <Link className="training-session__back" href="/history">
        查看训练记录
      </Link>
    </section>
  );
}

function CandidateDeck({
  candidates,
  currentPlanId,
  disabled,
  onRandomize,
  onSelect,
}: {
  candidates: TrainingSession['candidates'];
  currentPlanId: string;
  disabled: boolean;
  onRandomize: () => void;
  onSelect: (planId: string) => void;
}) {
  return (
    <aside className="training-session__candidates" aria-labelledby="candidate-questions-heading">
      <p className="training-session__serial">CANDIDATE QUESTIONS</p>
      <h2 id="candidate-questions-heading">候选问题</h2>
      <p>每张卡都是一道独立问题。首次回答前可以换题，主资产不变。</p>
      {candidates.length > 1 && (
        <button
          className="training-session__randomize-question"
          disabled={disabled}
          onClick={onRandomize}
          type="button"
        >
          换一个问题
        </button>
      )}
      <ol>
        {candidates.map((candidate) => {
          const isCurrent = candidate.id === currentPlanId;
          return (
            <li key={candidate.id}>
              <button
                aria-current={isCurrent ? 'true' : undefined}
                className={isCurrent ? 'is-current' : ''}
                disabled={disabled || isCurrent}
                onClick={() => onSelect(candidate.id)}
                type="button"
              >
                {candidate.questionText}
              </button>
            </li>
          );
        })}
      </ol>
      {!disabled && candidates.length > 1 && (
        <p className="training-session__candidate-note">
          选择另一题后会回到准备页，不会覆盖当前题。
        </p>
      )}
    </aside>
  );
}

function receiveSession(
  nextSession: TrainingSession,
  setSession: (session: TrainingSession) => void,
  setDraft: (draft: string) => void,
) {
  setSession(nextSession);
  const phase = phaseToDraftPhase(nextSession);
  const expectedCheckpointType = checkpointTypeFor(
    phase,
    nextSession.followUp.current?.issuedIndex,
  );
  setDraft(
    expectedCheckpointType && nextSession.checkpoint?.type === expectedCheckpointType
      ? nextSession.checkpoint.draft
      : '',
  );
}

function phaseToDraftPhase(session: TrainingSession | null | undefined): DraftPhase | null {
  if (!session) return null;
  if (session.phase === 'FIRST_ANSWER' || session.phase === 'SECOND_ANSWER') return session.phase;
  if (session.phase === 'REFINEMENT' && session.followUp.current) return 'FOLLOW_UP_ANSWER';
  return null;
}

function checkpointTypeFor(phase: DraftPhase | null, followUpIndex?: number) {
  if (phase === 'FIRST_ANSWER') return 'P08_FIRST_ANSWER_DRAFT';
  if (phase === 'SECOND_ANSWER') return 'P08_SECOND_ANSWER_DRAFT';
  if (phase === 'FOLLOW_UP_ANSWER' && followUpIndex) return `P08_FOLLOW_UP_${followUpIndex}_DRAFT`;
  return null;
}

function createIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `p08-${Date.now()}-${Math.random()}`;
}

function P08LoadingState() {
  return (
    <main className="page training-session">
      <p className="training-session__status">正在恢复本地问题回答会话。</p>
    </main>
  );
}
