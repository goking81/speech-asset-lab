'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import {
  canSaveOralAttempt,
  canSubmitTextAnswer,
  type CompletionRating,
  type DifficultyRating,
} from '@/lib/practice-gates';

type P05Step =
  'READING' | 'KEYWORD_RECALL' | 'LOGIC_SKELETON_RECALL' | 'NO_HINT_RECALL' | 'ANCHOR_TEXT';
type HintLevel = 'H0_NONE';

type CheckpointPayload = {
  oralAttemptConfirmed?: boolean;
  completionRating?: CompletionRating | null;
  difficultyRating?: DifficultyRating | null;
  highestHintLevel?: HintLevel;
  textDraft?: string;
  stepStartedAt?: string;
};

type PracticeSession = {
  id: string;
  currentStep: P05Step;
  status: string;
  startedAt: string;
  completedAt: string | null;
  checkpoint: { currentStep: P05Step; payload: CheckpointPayload; updatedAt: string } | null;
  personalAssetVersion: {
    id: string;
    version: number;
    triggerName: string;
    coreIdea: string;
    coreFlow: string;
    extendedFlow: string | null;
    scenario: string | null;
    nodes: Array<{ id: string; nodeType: string; sequence: number; text: string }>;
    expressionUnits: Array<{ id: string; text: string; retrievalCue: string | null }>;
    flowSpans: Array<{
      id: string;
      personalAssetNodeId: string;
      startOffset: number;
      endOffset: number;
      sequence: number;
    }>;
  };
};

type PracticeForm = {
  oralAttemptConfirmed: boolean;
  completionRating: CompletionRating | null;
  difficultyRating: DifficultyRating | null;
  highestHintLevel: HintLevel;
  textDraft: string;
};

const steps: Array<{ id: P05Step; label: string; lookAt: string; action: string }> = [
  { id: 'READING', label: '看全文读顺', lookAt: '完整资产', action: '连续读顺' },
  { id: 'KEYWORD_RECALL', label: '看词伙说出', lookAt: '英文词伙', action: '组回表达' },
  { id: 'LOGIC_SKELETON_RECALL', label: '看结构复述', lookAt: '中文结构', action: '组织英文' },
  { id: 'NO_HINT_RECALL', label: '无提示复现', lookAt: '不看提示', action: '口头复现' },
  { id: 'ANCHOR_TEXT', label: '默写输出', lookAt: '不看提示', action: '写下表达' },
];

const completionOptions: Array<{ value: CompletionRating; label: string }> = [
  { value: 'COMPLETE', label: '完整' },
  { value: 'BASIC', label: '基本' },
  { value: 'PARTIAL', label: '部分' },
  { value: 'NOT_COMPLETED', label: '未完成' },
];

const difficultyOptions: Array<{ value: DifficultyRating; label: string }> = [
  { value: 'EASY', label: '轻松' },
  { value: 'RIGHT', label: '合适' },
  { value: 'DIFFICULT', label: '困难' },
];

const nodeClass: Record<string, string> = {
  CLAIM: 'flow-claim',
  REASON: 'flow-reason',
  EXPLANATION: 'flow-reason',
  EXAMPLE: 'flow-example',
  CONTRAST: 'flow-contrast',
  CONDITION: 'flow-contrast',
  ACTION: 'flow-action',
  RESULT: 'flow-action',
};

const nodeSkeletonLabel: Record<string, string> = {
  CLAIM: '观点',
  REASON: '原因',
  EXPLANATION: '解释',
  EXAMPLE: '例子',
  CONTRAST: '对比',
  CONDITION: '条件',
  ACTION: '行动',
  RESULT: '结果',
};

export function AssetPracticePage({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<PracticeSession | null>(null);
  const [form, setForm] = useState<PracticeForm>(emptyForm());
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRetraining, setIsRetraining] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const attemptKeys = useRef<Partial<Record<P05Step, string>>>({});

  useEffect(() => {
    let isCurrent = true;
    void fetch(`/api/practice/sessions/${encodeURIComponent(sessionId)}`)
      .then(async (response) => {
        const result = (await response.json()) as { session?: PracticeSession; error?: string };
        if (!response.ok || !result.session) {
          throw new Error(result.error ?? '无法读取资产训练会话。');
        }
        if (!isCurrent) return;
        receiveSession(result.session, setSession, setForm);
        setIsHydrated(true);
      })
      .catch((reason: unknown) => {
        if (isCurrent)
          setError(reason instanceof Error ? reason.message : '无法读取资产训练会话。');
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [sessionId]);

  // 本地草稿以短延时写入当前 Checkpoint；它不会创建或改写历史 Attempt。
  useEffect(() => {
    if (!session || !isHydrated || session.status !== 'IN_PROGRESS' || isSubmitting) return;
    const currentStep = session.currentStep;
    const timeout = window.setTimeout(() => {
      void fetch(`/api/practice/sessions/${encodeURIComponent(session.id)}/checkpoint`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentStep, payload: form }),
      }).then(async (response) => {
        if (response.ok || response.status === 409) return;
        const result = (await response.json()) as { error?: string };
        setStatus(result.error ?? '草稿暂未保存；请保持此页面后重试。');
      });
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [form, isHydrated, isSubmitting, session]);

  function updateForm(patch: Partial<PracticeForm>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function saveAttempt(stepType: P05Step, payload: Record<string, unknown>) {
    if (!session) return;
    setIsSubmitting(true);
    setError('');
    setStatus('正在本地保存本次训练记录。');
    const idempotencyKey = attemptKeys.current[stepType] ?? createIdempotencyKey();
    attemptKeys.current[stepType] = idempotencyKey;
    try {
      const response = await fetch(
        `/api/practice/sessions/${encodeURIComponent(session.id)}/attempts`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ stepType, idempotencyKey, ...payload }),
        },
      );
      const result = (await response.json()) as { session?: PracticeSession; error?: string };
      if (!response.ok || !result.session) {
        throw new Error(result.error ?? '无法保存训练记录。');
      }
      receiveSession(result.session, setSession, setForm);
      delete attemptKeys.current[stepType];
      setStatus(
        result.session.status === 'COMPLETED'
          ? '默写已保存。本页不会自动评价口头过程，也不会改写资产。'
          : '已保存，继续下一步。',
      );
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '无法保存训练记录。');
      setStatus('');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function retrain() {
    if (!session) return;
    setIsRetraining(true);
    setError('');
    try {
      const response = await fetch('/api/practice/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ retrainFromSessionId: session.id }),
      });
      const result = (await response.json()) as { sessionId?: string; error?: string };
      if (!response.ok || !result.sessionId) {
        throw new Error(result.error ?? '无法建立新的训练会话。');
      }
      router.push(`/train/assets/${encodeURIComponent(result.sessionId)}`);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '无法建立新的训练会话。');
      setIsRetraining(false);
    }
  }

  if (isLoading) {
    return <PracticeLoadingState />;
  }
  if (!session) {
    return (
      <main className="page page--with-back-link asset-practice">
        <Link className="page-back-link" href="/lab">
          ← 返回今日训练
        </Link>
        <p className="asset-practice__status">{error || '资产训练会话不可用。'}</p>
      </main>
    );
  }
  if (session.status === 'COMPLETED') {
    return (
      <CompletedPracticeSession
        error={error}
        isRetraining={isRetraining}
        session={session}
        onRetrain={() => void retrain()}
      />
    );
  }

  const isOral = isOralStep(session.currentStep);
  const canSaveOral = canSaveOralAttempt({ ...form, isSaving: isSubmitting });
  const canSubmitText = canSubmitTextAnswer({
    text: form.textDraft,
    sessionVersionIsCurrent: session.status === 'IN_PROGRESS',
    isSubmitting,
  });

  return (
    <main className="page page--with-back-link asset-practice">
      <Link className="page-back-link" href="/lab">
        ← 返回今日训练
      </Link>
      <header className="page-heading">
        <p className="page-heading__eyebrow">P05 / ASSET PRACTICE</p>
        <h1>{session.personalAssetVersion.triggerName}</h1>
        <p>本地保存个人资产版本的训练过程；第 2—4 步只记录你的自报，不录音、不转写。</p>
      </header>

      {error && (
        <p className="asset-practice__error" role="alert">
          {error}
        </p>
      )}
      {status && (
        <p className="asset-practice__status" aria-live="polite">
          {status}
        </p>
      )}

      <div className="asset-practice__layout">
        <PracticeSteps currentStep={session.currentStep} />
        <section className="asset-practice__work" aria-labelledby="asset-practice-current-step">
          {session.currentStep === 'READING' && (
            <ReadingStep
              version={session.personalAssetVersion}
              isSaving={isSubmitting}
              onComplete={() => void saveAttempt('READING', {})}
            />
          )}
          {session.currentStep === 'KEYWORD_RECALL' && (
            <KeywordRecallStep
              version={session.personalAssetVersion}
              form={form}
              isSaving={isSubmitting}
              canSave={canSaveOral}
              onChange={updateForm}
              onSave={() =>
                void saveAttempt('KEYWORD_RECALL', {
                  oralAttemptConfirmed: form.oralAttemptConfirmed,
                  completionRating: form.completionRating,
                  difficultyRating: form.difficultyRating,
                  highestHintLevel: 'H0_NONE',
                })
              }
            />
          )}
          {session.currentStep === 'LOGIC_SKELETON_RECALL' && (
            <LogicSkeletonStep
              version={session.personalAssetVersion}
              form={form}
              isSaving={isSubmitting}
              canSave={canSaveOral}
              onChange={updateForm}
              onSave={() =>
                void saveAttempt('LOGIC_SKELETON_RECALL', {
                  oralAttemptConfirmed: form.oralAttemptConfirmed,
                  completionRating: form.completionRating,
                  difficultyRating: form.difficultyRating,
                  highestHintLevel: 'H0_NONE',
                })
              }
            />
          )}
          {session.currentStep === 'NO_HINT_RECALL' && (
            <NoHintRecallStep
              form={form}
              isSaving={isSubmitting}
              canSave={canSaveOral}
              stepStartedAt={session.checkpoint?.payload.stepStartedAt ?? session.startedAt}
              onChange={updateForm}
              onSave={() =>
                void saveAttempt('NO_HINT_RECALL', {
                  oralAttemptConfirmed: form.oralAttemptConfirmed,
                  completionRating: form.completionRating,
                  difficultyRating: form.difficultyRating,
                  highestHintLevel: 'H0_NONE',
                })
              }
            />
          )}
          {session.currentStep === 'ANCHOR_TEXT' && (
            <DictationStep
              text={form.textDraft}
              isSubmitting={isSubmitting}
              canSubmit={canSubmitText}
              onChange={(textDraft) => updateForm({ textDraft })}
              onSubmit={() => void saveAttempt('ANCHOR_TEXT', { textAnswer: form.textDraft })}
            />
          )}
        </section>
        <PracticeReference currentStep={session.currentStep} />
      </div>

      {isOral && (
        <p className="asset-practice__boundary">
          你可以随时按自己的节奏完成口头练习；页面不会根据停留时间判断你是否卡住，也不会评价发音或语速。
        </p>
      )}
    </main>
  );
}

function PracticeSteps({ currentStep }: { currentStep: P05Step }) {
  const currentIndex = steps.findIndex((step) => step.id === currentStep);
  return (
    <aside className="asset-practice__steps" aria-label="五步训练进度">
      <p className="asset-practice__serial">FIVE-STEP PATH</p>
      <ol>
        {steps.map((step, index) => (
          <li
            className={
              index < currentIndex ? 'is-complete' : index === currentIndex ? 'is-current' : ''
            }
            key={step.id}
          >
            <span aria-hidden="true">{index < currentIndex ? '✓' : '○'}</span>
            <span>
              <strong aria-current={step.id === currentStep ? 'step' : undefined}>
                {step.label}
              </strong>
              <small>
                看：{step.lookAt}｜做：{step.action}
              </small>
            </span>
          </li>
        ))}
      </ol>
      <p className="asset-practice__prompt-fade">
        提示会逐步减少：全文 → 词伙 → 结构 → 无提示 → 默写。
      </p>
      <p>完成标准：每一步都保存为独立训练记录；重练不会覆盖旧记录。</p>
    </aside>
  );
}

function ReadingStep({
  version,
  isSaving,
  onComplete,
}: {
  version: PracticeSession['personalAssetVersion'];
  isSaving: boolean;
  onComplete: () => void;
}) {
  return (
    <div className="asset-practice__step">
      <p className="asset-practice__serial">STEP / READING</p>
      <h2 id="asset-practice-current-step">第 1 步：看全文读顺</h2>
      <p>先看完整资产，连续读顺意思与节奏。下一步会收起全文，只保留词伙。</p>
      <p className="asset-flow asset-practice__flow">{renderFlow(version)}</p>
      <button
        className="asset-practice__primary-action"
        disabled={isSaving}
        onClick={onComplete}
        type="button"
      >
        {isSaving ? '正在保存' : '我已经读顺'}
      </button>
    </div>
  );
}

function KeywordRecallStep({ version, form, isSaving, canSave, onChange, onSave }: OralStepProps) {
  const savedPhrases = version.expressionUnits
    .map((unit) => unit.text.trim())
    .filter(Boolean)
    .slice(0, 5);
  // 早期确认资产可能尚未单独保存词伙；此时只取已冻结的逻辑节点作为词伙兜底，不回退展示全文。
  const phrases =
    savedPhrases.length > 0
      ? savedPhrases
      : version.nodes
          .map((node) => node.text.trim())
          .filter(Boolean)
          .slice(0, 5);
  return (
    <div className="asset-practice__step">
      <p className="asset-practice__serial">STEP / KEYWORD RECALL</p>
      <h2 id="asset-practice-current-step">第 2 步：看词伙说出</h2>
      <p>只看英文词伙，把它们组回自己的完整表达；这一轮不再展示全文。</p>
      <section className="asset-practice__cue" aria-label="英文词伙">
        <p>本轮词伙</p>
        {phrases.length > 0 ? (
          <ul>
            {phrases.map((phrase) => (
              <li key={phrase}>{phrase}</li>
            ))}
          </ul>
        ) : (
          <p>此资产暂未保存可展示的词伙；请按你已记住的表达完成本轮口头尝试。</p>
        )}
      </section>
      <OralAttemptControls
        canSave={canSave}
        form={form}
        isSaving={isSaving}
        onChange={onChange}
        onSave={onSave}
      />
    </div>
  );
}

function LogicSkeletonStep({ version, form, isSaving, canSave, onChange, onSave }: OralStepProps) {
  const skeleton = skeletonFor(version.nodes);
  return (
    <div className="asset-practice__step">
      <p className="asset-practice__serial">STEP / LOGIC SKELETON</p>
      <h2 id="asset-practice-current-step">第 3 步：看结构复述</h2>
      <p>只看中文逻辑结构，自己组织英文。下一步连结构也会收起。</p>
      <section className="asset-practice__skeleton" aria-label="中文逻辑骨架">
        {skeleton}
      </section>
      <OralAttemptControls
        canSave={canSave}
        form={form}
        isSaving={isSaving}
        onChange={onChange}
        onSave={onSave}
      />
    </div>
  );
}

function NoHintRecallStep({
  form,
  isSaving,
  canSave,
  stepStartedAt,
  onChange,
  onSave,
}: Omit<OralStepProps, 'version'> & { stepStartedAt: string }) {
  return (
    <div className="asset-practice__step asset-practice__step--no-hint">
      <p className="asset-practice__serial">STEP / NO HINT</p>
      <h2 id="asset-practice-current-step">第 4 步：无提示复现</h2>
      <p>这一轮不看全文、词伙或结构，直接口头复现你记住的完整意思。</p>
      <PracticeTimer startedAt={stepStartedAt} />
      <p className="asset-practice__no-hint-note">
        当前没有可展开的提示材料。下一步把你记住的表达写下来。
      </p>
      <OralAttemptControls
        canSave={canSave}
        form={form}
        isSaving={isSaving}
        onChange={onChange}
        onSave={onSave}
      />
    </div>
  );
}

function DictationStep({
  text,
  isSubmitting,
  canSubmit,
  onChange,
  onSubmit,
}: {
  text: string;
  isSubmitting: boolean;
  canSubmit: boolean;
  onChange: (text: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="asset-practice__step">
      <p className="asset-practice__serial">STEP / DICTATION</p>
      <h2 id="asset-practice-current-step">第 5 步：默写输出</h2>
      <p>不看任何提示，写下你记得的英语表达。无需逐字一致，尽量保留资产的逻辑和关键表达。</p>
      <label className="asset-practice__answer-label" htmlFor="asset-dictation-answer">
        本次默写
      </label>
      <textarea
        id="asset-dictation-answer"
        onChange={(event) => onChange(event.target.value)}
        placeholder="不看任何提示，写下你现在记得的英语表达。"
        rows={8}
        value={text}
      />
      <p className="asset-practice__answer-boundary">
        去除首尾空白后非空即可保存；本页不做逐字比对，也不会自动发起 AI 评价。
      </p>
      <button
        className="asset-practice__primary-action"
        disabled={!canSubmit}
        onClick={onSubmit}
        type="button"
      >
        {isSubmitting ? '正在保存' : '保存默写并完成'}
      </button>
    </div>
  );
}

type OralStepProps = {
  version: PracticeSession['personalAssetVersion'];
  form: PracticeForm;
  isSaving: boolean;
  canSave: boolean;
  onChange: (patch: Partial<PracticeForm>) => void;
  onSave: () => void;
};

function OralAttemptControls({
  form,
  isSaving,
  canSave,
  onChange,
  onSave,
}: Omit<OralStepProps, 'version'>) {
  const missingCompletion = form.completionRating === null;
  const missingDifficulty = form.difficultyRating === null;
  return (
    <section className="asset-practice__self-report" aria-label="口头尝试自报">
      <label className="asset-practice__check-label">
        <input
          checked={form.oralAttemptConfirmed}
          disabled={isSaving}
          onChange={(event) => onChange({ oralAttemptConfirmed: event.target.checked })}
          type="checkbox"
        />
        我已完成口头尝试
      </label>
      <fieldset disabled={isSaving}>
        <legend>完成情况</legend>
        <div className="asset-practice__radio-options">
          {completionOptions.map((option) => (
            <label key={option.value}>
              <input
                checked={form.completionRating === option.value}
                name="completion-rating"
                onChange={() => onChange({ completionRating: option.value })}
                type="radio"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset disabled={isSaving}>
        <legend>难度</legend>
        <div className="asset-practice__radio-options">
          {difficultyOptions.map((option) => (
            <label key={option.value}>
              <input
                checked={form.difficultyRating === option.value}
                name="difficulty-rating"
                onChange={() => onChange({ difficultyRating: option.value })}
                type="radio"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
      {!canSave && (
        <p className="asset-practice__gate-message">
          {!form.oralAttemptConfirmed
            ? '请先确认已完成本次口头尝试。'
            : missingCompletion && missingDifficulty
              ? '请选择本次完成情况和难度。'
              : missingCompletion
                ? '请选择本次完成情况。'
                : missingDifficulty
                  ? '请选择本次难度。'
                  : '正在保存本次训练记录。'}
        </p>
      )}
      <button
        className="asset-practice__primary-action"
        disabled={!canSave}
        onClick={onSave}
        type="button"
      >
        {isSaving ? '正在保存' : '保存并继续'}
      </button>
    </section>
  );
}

function PracticeReference({ currentStep }: { currentStep: P05Step }) {
  const currentIndex = steps.findIndex((step) => step.id === currentStep);
  const current = steps[currentIndex];
  const next = steps[currentIndex + 1] ?? null;
  return (
    <aside
      className={
        currentStep === 'NO_HINT_RECALL' || currentStep === 'ANCHOR_TEXT'
          ? 'asset-practice__reference asset-practice__reference--no-hint'
          : 'asset-practice__reference'
      }
    >
      <p className="asset-practice__serial">CURRENT GUIDE</p>
      <h2>本轮提示</h2>
      <p>
        看：{current.lookAt}。做：{current.action}。
      </p>
      <section className="asset-practice__next-step">
        <p className="asset-practice__serial">NEXT</p>
        <h3>{next ? next.label : '本轮完成'}</h3>
        <p>
          {next
            ? `下一步看：${next.lookAt}；做：${next.action}。`
            : '保存后，本轮五步训练记录会独立保留。'}
        </p>
      </section>
    </aside>
  );
}

function PracticeTimer({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  const start = new Date(startedAt).getTime();
  const elapsedSeconds = Math.max(
    0,
    Math.floor((now - (Number.isNaN(start) ? now : start)) / 1000),
  );
  const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
  const seconds = String(elapsedSeconds % 60).padStart(2, '0');
  return (
    <p className="asset-practice__timer" aria-label={`练习计时 ${minutes} 分 ${seconds} 秒`}>
      计时 {minutes}:{seconds}
    </p>
  );
}

function CompletedPracticeSession({
  session,
  isRetraining,
  error,
  onRetrain,
}: {
  session: PracticeSession;
  isRetraining: boolean;
  error: string;
  onRetrain: () => void;
}) {
  return (
    <main className="page page--with-back-link asset-practice asset-practice--complete">
      <Link className="page-back-link" href="/lab">
        ← 返回今日训练
      </Link>
      <header className="page-heading">
        <p className="page-heading__eyebrow">P05 / COMPLETED</p>
        <h1>本轮资产训练已保存</h1>
        <p>
          “{session.personalAssetVersion.triggerName}
          ”的五步记录已独立保存；原有训练记录和个人资产版本均未被覆盖。
        </p>
      </header>
      {error && (
        <p className="asset-practice__error" role="alert">
          {error}
        </p>
      )}
      <section className="asset-practice__complete-card">
        <h2>默写已保存</h2>
        <p>本页没有自动评价口头过程或默写内容，也没有自动发布或改写任何资产内容。</p>
        <button
          className="asset-practice__primary-action"
          disabled={isRetraining}
          onClick={onRetrain}
          type="button"
        >
          {isRetraining ? '正在建立新会话' : '重新训练这项资产'}
        </button>
      </section>
    </main>
  );
}

function PracticeLoadingState() {
  return (
    <main className="page page--with-back-link asset-practice">
      <Link className="page-back-link" href="/lab">
        ← 返回今日训练
      </Link>
      <p className="asset-practice__status">正在恢复本地资产训练会话。</p>
    </main>
  );
}

function renderFlow(version: PracticeSession['personalAssetVersion']) {
  const types = new Map(version.nodes.map((node) => [node.id, node.nodeType]));
  let at = 0;
  return version.flowSpans.map((span, index) => (
    <span key={span.id}>
      {version.coreFlow.slice(at, span.startOffset)}
      <span
        aria-label={`逻辑节点：${nodeSkeletonLabel[types.get(span.personalAssetNodeId) ?? ''] ?? '其他'}`}
        className={nodeClass[types.get(span.personalAssetNodeId) ?? ''] ?? 'flow-transition'}
      >
        {version.coreFlow.slice(span.startOffset, span.endOffset)}
      </span>
      {(at = span.endOffset) && null}
      {index === version.flowSpans.length - 1 ? version.coreFlow.slice(at) : null}
    </span>
  ));
}

function skeletonFor(nodes: PracticeSession['personalAssetVersion']['nodes']) {
  return nodes.map((node) => nodeSkeletonLabel[node.nodeType] ?? '衔接').join(' → ');
}

function emptyForm(): PracticeForm {
  return {
    oralAttemptConfirmed: false,
    completionRating: null,
    difficultyRating: null,
    highestHintLevel: 'H0_NONE',
    textDraft: '',
  };
}

function formFromSession(nextSession: PracticeSession): PracticeForm {
  const payload = nextSession.checkpoint?.payload;
  return {
    oralAttemptConfirmed: payload?.oralAttemptConfirmed ?? false,
    completionRating: payload?.completionRating ?? null,
    difficultyRating: payload?.difficultyRating ?? null,
    // 历史会话可能保存过旧版 H1—H5；新版不再显示或续写这些提示。
    highestHintLevel: 'H0_NONE',
    textDraft: payload?.textDraft ?? '',
  };
}

function receiveSession(
  nextSession: PracticeSession,
  setSession: (session: PracticeSession) => void,
  setForm: (form: PracticeForm) => void,
) {
  setSession(nextSession);
  setForm(formFromSession(nextSession));
}

function isOralStep(step: P05Step) {
  return step === 'KEYWORD_RECALL' || step === 'LOGIC_SKELETON_RECALL' || step === 'NO_HINT_RECALL';
}

function createIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `asset-practice-${Date.now()}-${Math.random()}`;
}
