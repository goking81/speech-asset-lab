'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { canSubmitTextAnswer } from '@/lib/practice-gates';

type P08Phase = 'FIRST_ANSWER' | 'AWAITING_FOLLOW_UP' | 'SECOND_ANSWER' | 'COMPLETED';
type DraftPhase = 'FIRST_ANSWER' | 'FOLLOW_UP_ANSWER' | 'SECOND_ANSWER';
type HintLevel =
  'H1_ANGLE' | 'H2_ASSET_NAME' | 'H3_LOGIC_NODES' | 'H4_ENGLISH_CHUNKS' | 'H5_FULL_FLOW';

type TrainingSession = {
  id: string;
  businessVersion: number;
  status: string;
  phase: P08Phase;
  question: string;
  assets: Array<{ role: string; triggerName: string; version: number; coreFlow: string }>;
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
    issuedCount: number;
    endReason: string | null;
    taskStatus: string | null;
  };
  checkpoint: { type: string; draft: string; createdAt: string } | null;
  hints: Array<{ id: string; level: HintLevel; context: string; createdAt: string }>;
};

const hintRank: Record<HintLevel, number> = {
  H1_ANGLE: 1,
  H2_ASSET_NAME: 2,
  H3_LOGIC_NODES: 3,
  H4_ENGLISH_CHUNKS: 4,
  H5_FULL_FLOW: 5,
};

const hintLabels: Record<HintLevel, string> = {
  H1_ANGLE: '答题角度',
  H2_ASSET_NAME: '主资产名称',
  H3_LOGIC_NODES: '中文逻辑骨架',
  H4_ENGLISH_CHUNKS: '已冻结英文表达',
  H5_FULL_FLOW: '完整个人语流',
};

export function P08PracticePage({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<TrainingSession | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeHint, setActiveHint] = useState<HintLevel | null>(null);
  const answerKeys = useRef<Partial<Record<DraftPhase, string>>>({});

  useEffect(() => {
    let isCurrent = true;
    void fetch(`/api/training/sessions/${encodeURIComponent(sessionId)}`)
      .then(async (response) => {
        const result = (await response.json()) as { session?: TrainingSession; error?: string };
        if (!response.ok || !result.session) {
          throw new Error(result.error ?? '无法读取问题回答会话。');
        }
        if (!isCurrent) return;
        receiveSession(result.session, setSession, setDraft);
        setActiveHint(null);
      })
      .catch((reason: unknown) => {
        if (isCurrent)
          setError(reason instanceof Error ? reason.message : '无法读取问题回答会话。');
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [sessionId]);

  const draftPhase = phaseToDraftPhase(session);
  const currentFollowUpIndex = session?.followUp.current?.issuedIndex;

  // 草稿只写入当前版本；版本已改变的旧页面不会覆盖下一阶段的输入。
  useEffect(() => {
    if (!session || !draftPhase || isSubmitting) return;
    const expectedBusinessVersion = session.businessVersion;
    const timeout = window.setTimeout(() => {
      void fetch(`/api/training/sessions/${encodeURIComponent(session.id)}/checkpoint`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedBusinessVersion,
          phase: draftPhase,
          draft,
          followUpIndex: currentFollowUpIndex,
        }),
      }).then(async (response) => {
        if (response.ok || response.status === 409) return;
        const result = (await response.json()) as { error?: string };
        setStatus(result.error ?? '草稿暂未保存；请保持此页面后重试。');
      });
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [currentFollowUpIndex, draft, draftPhase, isSubmitting, session]);

  async function submitAnswer(answerType: DraftPhase) {
    if (!session) return;
    setIsSubmitting(true);
    setError('');
    setStatus('正在本地保存回答。');
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
      const result = (await response.json()) as { session?: TrainingSession; error?: string };
      if (!response.ok || !result.session) throw new Error(result.error ?? '无法保存回答。');
      receiveSession(result.session, setSession, setDraft);
      delete answerKeys.current[answerType];
      setActiveHint(null);
      setStatus(
        answerType === 'FIRST_ANSWER'
          ? '第一次回答已保存。尚未展示任何正式 AI 评价。'
          : '第二次回答已保存。当前会话等待后续复盘能力接入。',
      );
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '无法保存回答。');
      setStatus('');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function advanceToSecondAnswer() {
    if (!session) return;
    setIsSubmitting(true);
    setError('');
    setStatus('正在建立空白的第二次回答。');
    try {
      const response = await fetch(
        `/api/training/sessions/${encodeURIComponent(session.id)}/advance`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ expectedBusinessVersion: session.businessVersion }),
        },
      );
      const result = (await response.json()) as { session?: TrainingSession; error?: string };
      if (!response.ok || !result.session) {
        throw new Error(result.error ?? '无法进入第二次回答。');
      }
      receiveSession(result.session, setSession, setDraft);
      setActiveHint(null);
      setStatus('第二次回答已准备好，输入框保持空白。');
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '无法进入第二次回答。');
      setStatus('');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitFollowUpAnswer() {
    if (!session?.followUp.current) return;
    setIsSubmitting(true);
    setError('');
    setStatus('正在本地保存追问回答。');
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
      const result = (await response.json()) as { session?: TrainingSession; error?: string };
      if (!response.ok || !result.session) throw new Error(result.error ?? '无法保存追问回答。');
      receiveSession(result.session, setSession, setDraft);
      delete answerKeys.current.FOLLOW_UP_ANSWER;
      setActiveHint(null);
      setStatus(
        result.session.phase === 'SECOND_ANSWER'
          ? '追问已结束，第二次回答已准备好且输入框保持空白。'
          : '追问回答已保存，正在准备下一轮受支撑追问。',
      );
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '无法保存追问回答。');
      setStatus('');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function requestHint(level: HintLevel) {
    if (!session || !draftPhase) return;
    setIsSubmitting(true);
    setError('');
    try {
      const response = await fetch(
        `/api/training/sessions/${encodeURIComponent(session.id)}/hints`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            expectedBusinessVersion: session.businessVersion,
            phase: draftPhase,
            level,
            followUpIndex: currentFollowUpIndex,
          }),
        },
      );
      const result = (await response.json()) as { session?: TrainingSession; error?: string };
      if (!response.ok || !result.session) throw new Error(result.error ?? '无法记录主动提示。');
      setSession(result.session);
      setActiveHint(level);
      setStatus(`已记录 H${hintRank[level]} 主动提示。`);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '无法记录主动提示。');
    } finally {
      setIsSubmitting(false);
    }
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
    <main className="page page--with-back-link training-session">
      <Link className="page-back-link" href="/practice">
        ← 返回问题训练
      </Link>
      <header className="page-heading">
        <p className="page-heading__eyebrow">P08 / QUESTION PRACTICE</p>
        <h1>问题回答</h1>
        <p>
          每次提交都会先保存在本地。当前不会展示第一次回答的正式 AI 评价，也不会自动改写你的文字。
        </p>
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

      <div className="training-session__layout">
        <SessionSteps phase={session.phase} />
        <section className="training-session__work" aria-labelledby="p08-current-heading">
          <QuestionPrompt assets={session.assets} question={session.question} />
          {session.phase === 'FIRST_ANSWER' && (
            <AnswerEditor
              canSubmit={canSubmit}
              draft={draft}
              heading="第一次回答"
              isSubmitting={isSubmitting}
              onChange={setDraft}
              onSubmit={() => void submitAnswer('FIRST_ANSWER')}
              submitLabel="保存第一次回答"
            />
          )}
          {session.phase === 'AWAITING_FOLLOW_UP' && (
            <AwaitingFollowUp
              canSubmit={canSubmit}
              currentFollowUp={session.followUp.current}
              draft={draft}
              firstAnswer={session.answers.first?.text ?? ''}
              isSubmitting={isSubmitting}
              onChange={setDraft}
              onAdvance={() => void advanceToSecondAnswer()}
              onSubmit={() => void submitFollowUpAnswer()}
              endReason={session.followUp.endReason}
              taskStatus={session.followUp.taskStatus}
            />
          )}
          {session.phase === 'SECOND_ANSWER' && (
            <AnswerEditor
              canSubmit={canSubmit}
              draft={draft}
              heading="第二次回答"
              isSubmitting={isSubmitting}
              onChange={setDraft}
              onSubmit={() => void submitAnswer('SECOND_ANSWER')}
              submitLabel="保存第二次回答"
            />
          )}
          {session.phase === 'COMPLETED' && <CompletedAnswers session={session} />}
        </section>
        <HintPanel
          activeHint={activeHint}
          assets={session.assets}
          currentPhase={currentDraftPhase}
          currentFollowUpIndex={currentFollowUpIndex}
          hints={session.hints}
          isSubmitting={isSubmitting}
          obligations={session.obligations}
          onRequest={(level) => void requestHint(level)}
        />
      </div>
    </main>
  );
}

function SessionSteps({ phase }: { phase: P08Phase }) {
  const steps: Array<{ id: P08Phase; label: string }> = [
    { id: 'FIRST_ANSWER', label: '第一次回答' },
    { id: 'AWAITING_FOLLOW_UP', label: '受支撑追问' },
    { id: 'SECOND_ANSWER', label: '第二次回答' },
    { id: 'COMPLETED', label: '等待复盘' },
  ];
  const currentIndex = steps.findIndex((step) => step.id === phase);
  return (
    <aside className="training-session__steps" aria-label="问题回答进度">
      <p className="training-session__serial">P08 PATH</p>
      <ol>
        {steps.map((step, index) => (
          <li
            className={
              index < currentIndex ? 'is-complete' : index === currentIndex ? 'is-current' : ''
            }
            key={step.id}
          >
            <span aria-hidden="true">{index < currentIndex ? '✓' : '○'}</span>
            <span aria-current={step.id === phase ? 'step' : undefined}>{step.label}</span>
          </li>
        ))}
      </ol>
      <p>追问只会使用当前冻结问题计划中的支撑；任一轮失败或结束后都可进入第二次回答。</p>
    </aside>
  );
}

function QuestionPrompt({
  question,
  assets,
}: {
  question: string;
  assets: TrainingSession['assets'];
}) {
  const primary = assets.find((asset) => asset.role === 'PRIMARY');
  return (
    <section className="training-session__question">
      <p className="training-session__serial">SUPPORTED QUESTION</p>
      <h2>{question}</h2>
      <p>
        主资产：{primary ? `${primary.triggerName} · v${primary.version}` : '已冻结的个人资产版本'}
      </p>
    </section>
  );
}

function AnswerEditor({
  heading,
  draft,
  isSubmitting,
  canSubmit,
  submitLabel,
  onChange,
  onSubmit,
}: {
  heading: string;
  draft: string;
  isSubmitting: boolean;
  canSubmit: boolean;
  submitLabel: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <section className="training-session__editor">
      <p className="training-session__serial">TEXT RESPONSE</p>
      <h2 id="p08-current-heading">{heading}</h2>
      <p>只保存你在本框提交的实际文字。去除首尾空白后非空即可，不要求词数或句数。</p>
      <label htmlFor="p08-answer">本次回答</label>
      <textarea
        id="p08-answer"
        onChange={(event) => onChange(event.target.value)}
        placeholder="输入你的回答。"
        rows={10}
        value={draft}
      />
      <p className="training-session__input-boundary">
        保存后不会自动覆盖，也不会在本页展示正式 AI 评价。
      </p>
      <button
        className="training-session__primary-action"
        disabled={!canSubmit}
        onClick={onSubmit}
        type="button"
      >
        {isSubmitting ? '正在保存' : submitLabel}
      </button>
    </section>
  );
}

function AwaitingFollowUp({
  currentFollowUp,
  draft,
  canSubmit,
  firstAnswer,
  isSubmitting,
  onChange,
  onAdvance,
  onSubmit,
  endReason,
  taskStatus,
}: {
  currentFollowUp: TrainingSession['followUp']['current'];
  draft: string;
  canSubmit: boolean;
  firstAnswer: string;
  isSubmitting: boolean;
  onChange: (value: string) => void;
  onAdvance: () => void;
  onSubmit: () => void;
  endReason: string | null;
  taskStatus: string | null;
}) {
  if (currentFollowUp) {
    return (
      <>
        <section className="training-session__transition">
          <p className="training-session__serial">
            SUPPORTED FOLLOW-UP {currentFollowUp.issuedIndex}/3
          </p>
          <h2 id="p08-current-heading">受支撑追问</h2>
          <p>{currentFollowUp.questionText}</p>
          <details>
            <summary>查看本题的支撑边界</summary>
            <p>{currentFollowUp.support.obligationDescription ?? '已冻结问题义务。'}</p>
            {currentFollowUp.support.supportLabels.length > 0 && (
              <p>{currentFollowUp.support.supportLabels.join(' / ')}</p>
            )}
          </details>
          <p className="training-session__boundary">
            这是一条受冻结支撑约束的追问，不是第一次回答的正式 AI 评价。
          </p>
        </section>
        <AnswerEditor
          canSubmit={canSubmit}
          draft={draft}
          heading={`追问回答 ${currentFollowUp.issuedIndex}/3`}
          isSubmitting={isSubmitting}
          onChange={onChange}
          onSubmit={onSubmit}
          submitLabel="保存追问回答"
        />
        <button
          className="training-session__secondary-action"
          disabled={isSubmitting}
          onClick={onAdvance}
          type="button"
        >
          {isSubmitting ? '正在准备' : '结束追问并开始第二次回答'}
        </button>
      </>
    );
  }
  return (
    <section className="training-session__transition">
      <p className="training-session__serial">FIRST ANSWER SAVED</p>
      <h2 id="p08-current-heading">第一次回答已保存</h2>
      <p>
        {taskStatus === 'RUNNING' || taskStatus === 'QUEUED'
          ? '正在检查是否存在安全、受支撑的下一题。你也可以直接结束追问。'
          : `当前没有可继续的受支撑追问${endReason ? `（${endReason}）` : ''}。你可以开始第二次回答。`}
      </p>
      <details>
        <summary>回看已保存的第一次回答</summary>
        <p>{firstAnswer}</p>
      </details>
      <p className="training-session__boundary">这里不展示第一次回答的正式 AI 评价。</p>
      <button
        className="training-session__primary-action"
        disabled={isSubmitting}
        onClick={onAdvance}
        type="button"
      >
        {isSubmitting ? '正在准备' : '结束追问并开始第二次回答'}
      </button>
    </section>
  );
}

function CompletedAnswers({ session }: { session: TrainingSession }) {
  return (
    <section className="training-session__completed">
      <p className="training-session__serial">TWO ANSWERS SAVED</p>
      <h2 id="p08-current-heading">两次回答已独立保存</h2>
      <p>两次回答已独立保存。复盘只展示本地比较事实和可用草稿，不会改写原回答。</p>
      <details>
        <summary>查看第一次回答</summary>
        <p>{session.answers.first?.text ?? '未保存'}</p>
      </details>
      <details>
        <summary>查看第二次回答</summary>
        <p>{session.answers.second?.text ?? '未保存'}</p>
      </details>
      <Link className="training-session__back" href={`/practice/${session.id}/review`}>
        进入复盘
      </Link>
    </section>
  );
}

function HintPanel({
  assets,
  obligations,
  hints,
  currentPhase,
  currentFollowUpIndex,
  activeHint,
  isSubmitting,
  onRequest,
}: {
  assets: TrainingSession['assets'];
  obligations: TrainingSession['obligations'];
  hints: TrainingSession['hints'];
  currentPhase: DraftPhase | null;
  currentFollowUpIndex: number | undefined;
  activeHint: HintLevel | null;
  isSubmitting: boolean;
  onRequest: (level: HintLevel) => void;
}) {
  const primary = assets.find((asset) => asset.role === 'PRIMARY');
  const context =
    currentPhase === 'FOLLOW_UP_ANSWER'
      ? `P08_FOLLOW_UP_ANSWER_${currentFollowUpIndex}`
      : currentPhase
        ? `P08_${currentPhase}`
        : '';
  const highestHint = hints
    .filter((hint) => hint.context === context)
    .reduce<HintLevel | null>(
      (highest, hint) =>
        !highest || hintRank[hint.level] > hintRank[highest] ? hint.level : highest,
      null,
    );
  const content = activeHint ? hintContent(activeHint, primary, obligations) : null;
  return (
    <aside className="training-session__hints" aria-labelledby="p08-hints-heading">
      <p className="training-session__serial">ACTIVE HINTS</p>
      <h2 id="p08-hints-heading">主动提示</h2>
      {currentPhase ? (
        <>
          <p>
            当前最高主动提示：H{highestHint ? hintRank[highestHint] : 0}。P07
            准备页中展开的材料不会自动记为提示。
          </p>
          <div className="training-session__hint-actions">
            {(Object.keys(hintLabels) as HintLevel[]).map((level) => (
              <button
                disabled={isSubmitting}
                key={level}
                onClick={() => onRequest(level)}
                type="button"
              >
                使用 H{hintRank[level]} {hintLabels[level]}
              </button>
            ))}
          </div>
          {activeHint && content && (
            <div className="training-session__hint-content">
              <strong>
                H{hintRank[activeHint]} {hintLabels[activeHint]}
              </strong>
              <p>{content}</p>
            </div>
          )}
        </>
      ) : (
        <p>当前阶段不提供新的提示材料；已保存的回答和正式评价保持分离。</p>
      )}
    </aside>
  );
}

function hintContent(
  level: HintLevel,
  primary: TrainingSession['assets'][number] | undefined,
  obligations: TrainingSession['obligations'],
) {
  switch (level) {
    case 'H1_ANGLE':
      return '先回到题面中的真实情境，再用已冻结资产组织自己的回答。';
    case 'H2_ASSET_NAME':
      return primary?.triggerName ?? '当前问题的已冻结主资产。';
    case 'H3_LOGIC_NODES':
      return obligations.map((obligation) => obligation.description).join(' → ');
    case 'H4_ENGLISH_CHUNKS':
      return (
        obligations
          .map((obligation) => obligation.englishExpression)
          .filter((expression): expression is string => Boolean(expression))
          .join(' / ') || '当前问题没有额外可展示的已冻结英文表达。'
      );
    case 'H5_FULL_FLOW':
      return primary?.coreFlow ?? '当前问题没有可展示的完整个人语流。';
  }
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
  if (session.phase === 'AWAITING_FOLLOW_UP' && session.followUp.current) {
    return 'FOLLOW_UP_ANSWER';
  }
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
