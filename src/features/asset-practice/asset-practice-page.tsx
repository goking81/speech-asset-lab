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
type HintLevel =
  | 'H0_NONE'
  | 'H1_ANGLE'
  | 'H2_ASSET_NAME'
  | 'H3_LOGIC_NODES'
  | 'H4_ENGLISH_CHUNKS'
  | 'H5_FULL_FLOW';

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
  anchorQuestion: string;
  personalAsset: {
    id: string;
    sourceReference: {
      title: string;
      coreFlow: string;
      extendedFlow: string | null;
      version: number;
    } | null;
  };
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

const steps: Array<{ id: P05Step; label: string }> = [
  { id: 'READING', label: '熟读理解' },
  { id: 'KEYWORD_RECALL', label: '关键词唤醒' },
  { id: 'LOGIC_SKELETON_RECALL', label: '逻辑骨架复现' },
  { id: 'NO_HINT_RECALL', label: '无提示复现' },
  { id: 'ANCHOR_TEXT', label: '锚点问题调用' },
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

const hintRank: Record<HintLevel, number> = {
  H0_NONE: 0,
  H1_ANGLE: 1,
  H2_ASSET_NAME: 2,
  H3_LOGIC_NODES: 3,
  H4_ENGLISH_CHUNKS: 4,
  H5_FULL_FLOW: 5,
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
          ? '锚点文字已保存。本页不会自动评价未提交的口头过程。'
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
        <Link className="page-back-link" href="/">
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
      <Link className="page-back-link" href="/">
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
              supplement={
                session.personalAsset.sourceReference?.extendedFlow ??
                session.personalAssetVersion.extendedFlow
              }
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
                  highestHintLevel: form.highestHintLevel,
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
            <AnchorTextStep
              question={session.anchorQuestion}
              text={form.textDraft}
              isSubmitting={isSubmitting}
              canSubmit={canSubmitText}
              onChange={(textDraft) => updateForm({ textDraft })}
              onSubmit={() => void saveAttempt('ANCHOR_TEXT', { textAnswer: form.textDraft })}
            />
          )}
        </section>
        <PracticeReference currentStep={session.currentStep} session={session} />
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
            <span aria-current={step.id === currentStep ? 'step' : undefined}>{step.label}</span>
          </li>
        ))}
      </ol>
      <p>完成标准：每一步都保存为独立训练记录；重练不会覆盖旧记录。</p>
    </aside>
  );
}

function ReadingStep({
  version,
  supplement,
  isSaving,
  onComplete,
}: {
  version: PracticeSession['personalAssetVersion'];
  supplement: string | null;
  isSaving: boolean;
  onComplete: () => void;
}) {
  return (
    <div className="asset-practice__step">
      <p className="asset-practice__serial">STEP / READING</p>
      <h2 id="asset-practice-current-step">熟读理解</h2>
      <p>请连续熟读这项已确认的个人语流。颜色仅标示逻辑位置，不代表训练成绩。</p>
      <p className="asset-flow asset-practice__flow">{renderFlow(version)}</p>
      {supplement && (
        <section className="asset-practice__supplement" aria-label="原文词伙与中文注释">
          <p className="asset-practice__supplement-title">原文词伙与中文注释</p>
          <p>{supplement}</p>
          <small>这是理解参考，不计入英文训练正文，也不会影响训练记录。</small>
        </section>
      )}
      <button
        className="asset-practice__primary-action"
        disabled={isSaving}
        onClick={onComplete}
        type="button"
      >
        {isSaving ? '正在保存' : '完成熟读'}
      </button>
    </div>
  );
}

function KeywordRecallStep({ version, form, isSaving, canSave, onChange, onSave }: OralStepProps) {
  const cues = version.expressionUnits
    .map((unit) => unit.retrievalCue?.trim() || unit.text.trim())
    .filter(Boolean)
    .slice(0, 5);
  return (
    <div className="asset-practice__step">
      <p className="asset-practice__serial">STEP / KEYWORD RECALL</p>
      <h2 id="asset-practice-current-step">关键词唤醒</h2>
      <p>请根据下方检索提示或关键词口头复现。系统不录音、不转写，也不会判断口头表现。</p>
      <section className="asset-practice__cue" aria-label="检索提示与关键词">
        <p>触发名称：{version.triggerName}</p>
        {cues.length > 0 ? (
          <ul>
            {cues.map((cue) => (
              <li key={cue}>{cue}</li>
            ))}
          </ul>
        ) : (
          <p>此资产尚未保存额外 ExpressionUnit；请先从触发名称回忆。</p>
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
      <h2 id="asset-practice-current-step">逻辑骨架复现</h2>
      <p>请只根据中文逻辑骨架口头复现英文。系统不录音，也不会推断你的真实口头表现。</p>
      <section className="asset-practice__skeleton" aria-label="中文逻辑骨架">
        {skeleton}
      </section>
      <HintPanel form={form} version={version} onChange={onChange} skeleton={skeleton} />
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
      <h2 id="asset-practice-current-step">无提示复现</h2>
      <p>请在不查看关键词、逻辑骨架、英文词伙或完整语流的情况下，口头复现这项资产。</p>
      <PracticeTimer startedAt={stepStartedAt} />
      <p className="asset-practice__no-hint-note">当前为 H0。此步骤不会显示或展开任何提示材料。</p>
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

function AnchorTextStep({
  question,
  text,
  isSubmitting,
  canSubmit,
  onChange,
  onSubmit,
}: {
  question: string;
  text: string;
  isSubmitting: boolean;
  canSubmit: boolean;
  onChange: (text: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="asset-practice__step">
      <p className="asset-practice__serial">STEP / ANCHOR TEXT</p>
      <h2 id="asset-practice-current-step">锚点问题调用</h2>
      <section className="asset-practice__anchor-question">
        <p>问题</p>
        <strong>{question}</strong>
      </section>
      <p>你可以先口头回答，再输入希望系统之后分析的版本。本页只保存实际提交的文字。</p>
      <label className="asset-practice__answer-label" htmlFor="asset-anchor-answer">
        本次文字回答
      </label>
      <textarea
        id="asset-anchor-answer"
        onChange={(event) => onChange(event.target.value)}
        placeholder="输入你的回答；任意非空文字即可保存。"
        rows={8}
        value={text}
      />
      <p className="asset-practice__answer-boundary">
        去除首尾空白后非空即可提交，不设词数、句数或字符数门槛。
      </p>
      <button
        className="asset-practice__primary-action"
        disabled={!canSubmit}
        onClick={onSubmit}
        type="button"
      >
        {isSubmitting ? '正在保存' : '提交并完成'}
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

function HintPanel({
  version,
  skeleton,
  form,
  onChange,
}: {
  version: PracticeSession['personalAssetVersion'];
  skeleton: string;
  form: PracticeForm;
  onChange: (patch: Partial<PracticeForm>) => void;
}) {
  const activeLevel = form.highestHintLevel;
  const expressionChunks = version.expressionUnits
    .map((unit) => unit.text)
    .filter(Boolean)
    .slice(0, 5);
  const hintContents: Record<Exclude<HintLevel, 'H0_NONE'>, React.ReactNode> = {
    H1_ANGLE: '先回忆这项资产要表达的方向，再组织自己的英文复现。',
    H2_ASSET_NAME: version.triggerName,
    H3_LOGIC_NODES: skeleton,
    H4_ENGLISH_CHUNKS:
      expressionChunks.length > 0
        ? expressionChunks.join(' / ')
        : '这项个人资产尚未保存可展示的英文词伙。',
    H5_FULL_FLOW: version.coreFlow,
  };
  const hintLabels: Record<Exclude<HintLevel, 'H0_NONE'>, string> = {
    H1_ANGLE: '角度提示',
    H2_ASSET_NAME: '资产名称',
    H3_LOGIC_NODES: '逻辑节点',
    H4_ENGLISH_CHUNKS: '英文词伙',
    H5_FULL_FLOW: '完整个人语流',
  };
  const visibleLevel = activeLevel === 'H0_NONE' ? null : activeLevel;
  return (
    <section className="asset-practice__hints" aria-labelledby="asset-practice-hints-heading">
      <div>
        <p className="asset-practice__serial">ACTIVE HINTS</p>
        <h3 id="asset-practice-hints-heading">主动提示</h3>
      </div>
      <p>当前最高提示：H{hintRank[activeLevel]}。只有你主动展开时才记录提示等级。</p>
      <div className="asset-practice__hint-actions">
        {(Object.keys(hintLabels) as Array<Exclude<HintLevel, 'H0_NONE'>>).map((level) => (
          <button
            className={hintRank[level] <= hintRank[activeLevel] ? 'is-used' : ''}
            key={level}
            onClick={() => {
              if (hintRank[level] > hintRank[activeLevel]) onChange({ highestHintLevel: level });
            }}
            type="button"
          >
            展开 H{hintRank[level]} {hintLabels[level]}
          </button>
        ))}
      </div>
      {visibleLevel && (
        <div className="asset-practice__hint-content">
          <strong>
            H{hintRank[visibleLevel]} {hintLabels[visibleLevel]}
          </strong>
          <p>{hintContents[visibleLevel]}</p>
        </div>
      )}
    </section>
  );
}

function PracticeReference({
  currentStep,
  session,
}: {
  currentStep: P05Step;
  session: PracticeSession;
}) {
  if (currentStep === 'NO_HINT_RECALL') {
    return (
      <aside className="asset-practice__reference asset-practice__reference--no-hint">
        <p className="asset-practice__serial">H0 / NO MATERIAL</p>
        <h2>保持无提示</h2>
        <p>本步骤不提供关键词、骨架、英文词伙、完整个人语流或来源对照。</p>
      </aside>
    );
  }
  const source = session.personalAsset.sourceReference;
  return (
    <aside className="asset-practice__reference">
      <p className="asset-practice__serial">REFERENCE</p>
      <h2>提示与来源</h2>
      {currentStep === 'LOGIC_SKELETON_RECALL' ? (
        <p>H1—H5 均需由你在当前练习区主动展开；最高等级会随本次自报保存。</p>
      ) : (
        <p>当前步骤不自动展开额外提示。</p>
      )}
      {currentStep === 'READING' && source && (
        <details>
          <summary>查看只读来源对照</summary>
          <p>
            来源版本 v{source.version}：{source.title}
          </p>
          <p>{source.coreFlow}</p>
          {source.extendedFlow && <p>{source.extendedFlow}</p>}
        </details>
      )}
      {currentStep === 'READING' && !source && <p>当前个人资产没有可显示的已确认来源版本。</p>}
      {currentStep === 'ANCHOR_TEXT' && (
        <p>AI 只可能分析你实际提交的文字；本轮不会自动发起 AI 评价。</p>
      )}
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
      <Link className="page-back-link" href="/">
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
        <h2>锚点文字已保存</h2>
        <p>本页没有自动评价口头过程，也没有自动发布或改写任何资产内容。</p>
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
      <Link className="page-back-link" href="/">
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
    highestHintLevel: payload?.highestHintLevel ?? 'H0_NONE',
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
