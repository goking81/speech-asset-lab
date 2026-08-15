'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type TodayPlanTask = {
  id: string;
  taskType: 'ASSET_READING' | 'ASSET_REPRODUCTION' | 'SINGLE_ASSET_INVOCATION' | 'ASSET_STITCHING';
  sequence: number;
  reason: string | null;
  assetName: string | null;
  internalStage: string | null;
  participantNames: string[];
};

type TodayPlan = {
  reason: string | null;
  tasks: TodayPlanTask[];
};

type AssetRecord = {
  id: string;
  versions: Array<{
    id: string;
    title: string;
    coreIdea: string;
    coreFlow: string;
  }>;
  personalAssets: Array<{
    versions: Array<{
      id: string;
      triggerName: string;
      coreFlow: string;
    }>;
  }>;
};

type CoachAdvice = {
  summary: string;
  taskNotes: Array<{ taskId: string; reason: string }>;
};

type CoachView = {
  status: 'NOT_REQUESTED' | 'DRAFT_READY' | 'LOCAL_FALLBACK' | 'NO_LOCAL_TASKS';
  taskStatus: string | null;
  advice: CoachAdvice | null;
  fallbackReason: string | null;
};

const taskLabels: Record<TodayPlanTask['taskType'], string> = {
  ASSET_READING: '熟读与理解',
  ASSET_REPRODUCTION: '复现与表达',
  SINGLE_ASSET_INVOCATION: '单资产调用',
  ASSET_STITCHING: '多资产拼贴',
};

const practiceImages = [
  '/images/practice-forest-path.png',
  '/images/practice-morning-desk.png',
  '/images/practice-mountain-walk.png',
];

function getPracticeImage(assetName: string | null, index: number) {
  const title = assetName ?? '';

  if (/游泳|泳/.test(title)) return '/images/practice-swimming-relief.png';
  if (/喝水|饮水|补水|水分/.test(title)) return '/images/practice-hydration.png';
  if (/提问|追问|对话|沟通|汇报|关系|领导/.test(title)) return '/images/practice-conversation.png';
  if (/旅行|徒步|远行|山/.test(title)) return '/images/practice-mountain-walk.png';
  if (/放慢|慢生活|节奏|专注|阅读|早晨|日常/.test(title))
    return '/images/practice-morning-desk.png';
  if (/自助|努力|成长|坚持|改变|力量|放松|自然/.test(title))
    return '/images/practice-forest-path.png';

  return practiceImages[index % practiceImages.length];
}

const fiveStepPath = ['熟读理解', '关键词唤醒', '逻辑骨架复现', '无提示复现', '锚点问题调用'];

export function TodayPlanPage() {
  const router = useRouter();
  const [plan, setPlan] = useState<TodayPlan | null>(null);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [coach, setCoach] = useState<CoachView | null>(null);
  const [error, setError] = useState('');
  const [coachStatus, setCoachStatus] = useState('');
  const [isRequestingCoach, setIsRequestingCoach] = useState(false);
  const [startingTaskId, setStartingTaskId] = useState('');
  const [trainingStatus, setTrainingStatus] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState('');

  useEffect(() => {
    void fetch('/api/plans/today')
      .then(async (response) => {
        const result = await readJsonResponse<{
          plan?: TodayPlan;
          coach?: CoachView;
          error?: string;
        }>(response, '线上内置资产库正在配置，请稍后刷新。');
        if (!response.ok) throw new Error(result.error ?? '无法读取今日计划。');
        const nextPlan = result.plan ?? null;
        setPlan(nextPlan);
        setCoach(result.coach ?? null);
        setSelectedTaskId((current) => current || nextPlan?.tasks[0]?.id || '');
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : '无法读取今日计划。'),
      );
  }, []);

  useEffect(() => {
    void fetch('/api/assets')
      .then(async (response) => {
        const result = await readJsonResponse<{ assets?: AssetRecord[]; error?: string }>(
          response,
          '暂时无法读取资产详情。',
        );
        if (!response.ok) throw new Error(result.error ?? '无法读取资产库。');
        setAssets(result.assets ?? []);
      })
      .catch(() => {
        // 今日训练在资产详情暂不可读时仍可使用本地计划中的训练理由。
      });
  }, []);

  async function requestCoachDraft() {
    setIsRequestingCoach(true);
    setCoachStatus('正在请求 AI 补充说明。');
    try {
      const response = await fetch('/api/plans/today/coach', { method: 'POST' });
      const result = await readJsonResponse<{
        plan?: TodayPlan;
        coach?: CoachView;
        error?: string;
      }>(response, '暂时无法请求 AI 补充说明。');
      if (!response.ok || !result.coach) {
        throw new Error(result.error ?? '无法请求 AI 补充说明。');
      }
      setPlan(result.plan ?? plan);
      setCoach(result.coach);
      setCoachStatus(
        result.coach.status === 'DRAFT_READY'
          ? 'AI 补充说明已生成；今日训练顺序没有被改动。'
          : '这次没有生成可用说明；下方本地训练不受影响，可稍后重试。',
      );
    } catch (reason: unknown) {
      setCoachStatus(reason instanceof Error ? reason.message : '无法请求 AI 补充说明。');
    } finally {
      setIsRequestingCoach(false);
    }
  }

  async function startAssetPractice(task: TodayPlanTask) {
    if (task.taskType === 'ASSET_STITCHING') {
      setTrainingStatus('多资产拼贴尚未在本轮单资产训练会话中开放；不会伪造可执行训练。');
      return;
    }
    setStartingTaskId(task.id);
    setTrainingStatus('正在恢复或建立本地资产训练会话。');
    try {
      const response = await fetch('/api/practice/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ trainingTaskId: task.id }),
      });
      const result = await readJsonResponse<{ sessionId?: string; error?: string }>(
        response,
        '暂时无法建立资产训练会话。',
      );
      if (!response.ok || !result.sessionId) {
        throw new Error(result.error ?? '无法建立资产训练会话。');
      }
      router.push(`/train/assets/${encodeURIComponent(result.sessionId)}`);
    } catch (reason: unknown) {
      setTrainingStatus(reason instanceof Error ? reason.message : '无法建立资产训练会话。');
      setStartingTaskId('');
    }
  }

  return (
    <main className="page today-plan today-plan--forest-workspace">
      <header className="page-heading">
        <p className="page-heading__eyebrow">TODAY / LOCAL PLAN</p>
        <h1 className="today-plan__title">
          <span>今日训练</span>
          <small>/ Today&apos;s practice</small>
        </h1>
        <p>从已确认的个人资产中，开始你的英语表达训练。</p>
      </header>

      {error && <p className="today-plan__status">{error}</p>}
      {!plan && !error && <p className="today-plan__status">正在生成本地今日计划。</p>}
      {plan?.tasks.length === 0 && <TodayPlanEmpty reason={plan.reason} />}
      {plan && plan.tasks.length > 0 && (
        <>
          <TodayPracticeWorkspace
            assets={assets}
            onChoose={setSelectedTaskId}
            onStart={(task) => void startAssetPractice(task)}
            selectedTaskId={selectedTaskId}
            startingTaskId={startingTaskId}
            status={trainingStatus}
            tasks={plan.tasks}
          />
          <CoachPanel
            coach={coach}
            requestStatus={coachStatus}
            isRequesting={isRequestingCoach}
            onRequest={() => void requestCoachDraft()}
          />
          {plan.tasks.length > 3 && (
            <TodayPlanMoreTasks
              onStart={(task) => void startAssetPractice(task)}
              startingTaskId={startingTaskId}
              tasks={plan.tasks.slice(3)}
            />
          )}
        </>
      )}
    </main>
  );
}

async function readJsonResponse<T extends { error?: string }>(response: Response, fallback: string) {
  const body = await response.text();

  if (!body.trim()) {
    return { error: fallback } as T;
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    return { error: fallback } as T;
  }
}

function TodayPracticeWorkspace({
  assets,
  onChoose,
  onStart,
  selectedTaskId,
  startingTaskId,
  status,
  tasks,
}: {
  assets: AssetRecord[];
  onChoose: (taskId: string) => void;
  onStart: (task: TodayPlanTask) => void;
  selectedTaskId: string;
  startingTaskId: string;
  status: string;
  tasks: TodayPlanTask[];
}) {
  const featuredTasks = tasks.slice(0, 3);
  const selectedTask =
    featuredTasks.find((task) => task.id === selectedTaskId) ?? featuredTasks[0] ?? null;
  const selectedAsset = selectedTask ? findAssetForTask(selectedTask, assets) : null;

  if (!selectedTask) return null;

  const assetTitle = selectedTask.assetName ?? '个人语流资产';
  const context = selectedAsset?.source?.coreIdea ?? selectedTask.reason ?? '由本地资格规则生成。';
  const coreFlow =
    selectedAsset?.personal?.coreFlow ??
    selectedAsset?.source?.coreFlow ??
    '该资产的核心语流尚未载入，请在资产详情中查看来源版本。';

  return (
    <section className="today-plan__workspace" aria-labelledby="today-featured-heading">
      <div className="today-plan__featured-heading">
        <p className="today-plan__serial">TODAY / AVAILABLE TRAINING</p>
        <h2 id="today-featured-heading">今日可选训练</h2>
      </div>

      <div className="today-plan__featured-grid" role="list">
        {featuredTasks.map((task, index) => {
          const isSelected = task.id === selectedTask.id;
          return (
            <button
              aria-pressed={isSelected}
              className={`today-plan__feature-card${isSelected ? ' is-selected' : ''}`}
              key={task.id}
              onClick={() => onChoose(task.id)}
              type="button"
            >
              <Image
                alt=""
                height={410}
                sizes="(max-width: 920px) 150px, (max-width: 1180px) 112px, 136px"
                src={getPracticeImage(task.assetName, index)}
                width={272}
              />
              <span className="today-plan__feature-copy">
                <span className="today-plan__feature-title">
                  {task.assetName ?? '个人语流资产'}
                </span>
                <span className="today-plan__feature-tag">{taskLabels[task.taskType]}</span>
                <span className="today-plan__feature-reason">
                  {task.reason ?? '由本地资格规则生成。'}
                </span>
                <span className="today-plan__feature-action">
                  {isSelected ? '正在查看训练详情' : '选择这项训练'}
                </span>
              </span>
              {isSelected && <span className="today-plan__selection-state">已选</span>}
            </button>
          );
        })}
      </div>

      <article className="today-plan__focus-card" aria-labelledby="today-focus-heading">
        <header className="today-plan__focus-header">
          <div className="today-plan__focus-heading">
            <Image
              alt=""
              className="today-plan__focus-badge"
              height={96}
              src="/images/focus-leaf-badge.png"
              width={96}
            />
            <div className="today-plan__focus-title-row">
              <h2 id="today-focus-heading">{assetTitle}</h2>
              <span>{taskLabels[selectedTask.taskType]}</span>
            </div>
          </div>
          {selectedAsset?.id && (
            <Link className="today-plan__asset-link" href={`/assets/${selectedAsset.id}`}>
              查看资产
            </Link>
          )}
        </header>

        <div className="today-plan__focus-details">
          <section>
            <h3>语境 / Context</h3>
            <p>{context}</p>
          </section>
          <section>
            <h3>核心表达 / Key flow</h3>
            <p className="today-plan__core-flow">{coreFlow}</p>
          </section>
        </div>

        <section className="today-plan__five-step" aria-labelledby="today-five-step-heading">
          <h3 id="today-five-step-heading">开始五步训练</h3>
          <ol>
            {fiveStepPath.map((step, index) => (
              <li className={index === 0 ? 'is-current' : ''} key={step}>
                <span>{index + 1}</span>
                <strong>{step}</strong>
              </li>
            ))}
          </ol>
          <button
            className="today-plan__start-action"
            disabled={Boolean(startingTaskId)}
            onClick={() => onStart(selectedTask)}
            type="button"
          >
            {startingTaskId === selectedTask.id
              ? '正在打开训练'
              : selectedTask.taskType === 'ASSET_STITCHING'
                ? '查看拼贴状态'
                : '开始五步训练'}
          </button>
        </section>
      </article>

      {status && (
        <p className="today-plan__training-status" aria-live="polite">
          {status}
        </p>
      )}
    </section>
  );
}

function TodayPlanMoreTasks({
  onStart,
  startingTaskId,
  tasks,
}: {
  onStart: (task: TodayPlanTask) => void;
  startingTaskId: string;
  tasks: TodayPlanTask[];
}) {
  return (
    <details className="today-plan__more-tasks">
      <summary>还有 {tasks.length} 项今日训练</summary>
      <div>
        {tasks.map((task) => (
          <article key={task.id}>
            <span>{taskLabels[task.taskType]}</span>
            <strong>{task.assetName ?? '个人语流资产'}</strong>
            <button disabled={Boolean(startingTaskId)} onClick={() => onStart(task)} type="button">
              开始训练
            </button>
          </article>
        ))}
      </div>
    </details>
  );
}

function findAssetForTask(task: TodayPlanTask, assets: AssetRecord[]) {
  const match = assets.find((asset) => {
    const source = asset.versions[0];
    const personal = asset.personalAssets[0]?.versions[0];
    return source?.title === task.assetName || personal?.triggerName === task.assetName;
  });

  if (!match) return null;
  return {
    id: match.id,
    personal: match.personalAssets[0]?.versions[0],
    source: match.versions[0],
  };
}

function CoachPanel({
  coach,
  requestStatus,
  isRequesting,
  onRequest,
}: {
  coach: CoachView | null;
  requestStatus: string;
  isRequesting: boolean;
  onRequest: () => void;
}) {
  const advice = coach?.status === 'DRAFT_READY' ? coach.advice : null;
  const hasDraft = Boolean(advice);
  const fallback = coach?.status === 'LOCAL_FALLBACK';

  return (
    <section
      className="today-plan__coach today-plan__coach--compact"
      aria-labelledby="today-coach-heading"
    >
      <details>
        <summary>
          <span className="today-plan__serial">OPTIONAL AI / DRAFT ONLY</span>
          <strong id="today-coach-heading">AI 补充（可选）</strong>
          <small>需要时可展开 AI 解析、词汇拓展或表达建议草稿。</small>
        </summary>
        <div className="today-plan__coach-content">
          {hasDraft ? (
            <p>{advice!.summary}</p>
          ) : (
            <p>
              {coach?.status === 'NO_LOCAL_TASKS'
                ? '今天没有本地训练任务，因此不会伪造 Coach 建议。'
                : fallback
                  ? 'AI 这次没有返回可用的结构化说明。上方训练任务仍可直接执行；你可以稍后重试，也可以忽略它。'
                  : '需要时，AI 可以补充今天的练习重点；训练任务、资格理由和顺序仍完全来自本地规则。'}
            </p>
          )}
          <p className="today-plan__coach-boundary">
            它不会新增任务或资产，也不能改变阶段、资格、拼贴解锁、任务类型或正式顺序。
          </p>
          {requestStatus && <p className="today-plan__coach-status">{requestStatus}</p>}
          <button
            disabled={isRequesting || coach?.status === 'NO_LOCAL_TASKS'}
            onClick={onRequest}
            type="button"
          >
            {isRequesting
              ? '正在生成说明…'
              : hasDraft
                ? '重新生成补充说明'
                : fallback
                  ? '重试生成说明'
                  : '生成 AI 补充说明'}
          </button>
        </div>
      </details>
    </section>
  );
}

function TodayPlanEmpty({ reason }: { reason: string | null }) {
  const hasInactiveAssets = reason === 'NO_ACTIVE_CONFIRMED_PERSONAL_ASSETS';

  return (
    <section className="today-plan__empty" aria-labelledby="today-plan-empty-heading">
      <p className="today-plan__serial">LOCAL TRAINING QUEUE</p>
      <h2 id="today-plan-empty-heading">
        {hasInactiveAssets ? '还没有处于训练中的个人资产' : '还没有可训练的个人资产'}
      </h2>
      <p>
        {hasInactiveAssets
          ? '已确认的个人资产尚未进入本地训练队列，因此今天不会伪造训练任务。'
          : '普通来源资产需建立个人版本；已导入的初始学习资产会自动具备可训练版本。'}
      </p>
      <div className="today-plan__actions">
        <Link
          className="today-plan__primary-action"
          href={hasInactiveAssets ? '/assets' : '/content'}
        >
          {hasInactiveAssets ? '查看资产库' : '前往内容工作台'}
        </Link>
      </div>
    </section>
  );
}
