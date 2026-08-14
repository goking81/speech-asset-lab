'use client';

import {
  AirplaneTilt,
  BookOpen,
  Briefcase,
  ChatCircleText,
  CheckCircle,
  Drop,
  Heart,
  Leaf,
  Mountains,
  Question,
  ShieldCheck,
  Sun,
  Target,
  Tree,
  UsersThree,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { isCloudTrialRuntime } from '@/lib/runtime-mode';

type AssetRecord = {
  id: string;
  versions: Array<{
    id: string;
    version: number;
    title: string;
    coreIdea: string;
    coreFlow: string;
    sourceType: string;
  }>;
  personalAssets: Array<{
    versions: Array<{ id: string; version: number; triggerName: string; coreFlow: string }>;
  }>;
};

export function AssetLibraryPage() {
  const [assets, setAssets] = useState<AssetRecord[] | null>(null);
  const [error, setError] = useState('');
  const isCloudTrial = isCloudTrialRuntime();

  useEffect(() => {
    void fetch('/api/assets')
      .then(async (response) => {
        const result = (await response.json()) as { assets?: AssetRecord[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? '无法读取资产库。');
        setAssets(result.assets ?? []);
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : '无法读取资产库。'),
      );
  }, []);

  return (
    <main className="page asset-library asset-library--index asset-library--reference">
      <header className="page-heading asset-library__heading">
        <div>
          <p className="page-heading__eyebrow">ASSET LIBRARY</p>
          <h1 className="asset-library__title">
            我的语流资产 <span>/ My Assets</span>
          </h1>
          <p>浏览、管理你的英语表达语流，选择合适的语流用于训练。</p>
        </div>
        {isCloudTrial ? (
          <span className="asset-library__import-action asset-library__import-action--static">
            内置资产试用版
          </span>
        ) : (
          <Link className="asset-library__import-action" href="/content/import">
            导入来源素材
          </Link>
        )}
      </header>

      {error && <p className="asset-library__status">{error}</p>}
      {!assets && !error && <p className="asset-library__status">正在读取本地资产库。</p>}
      {assets?.length === 0 && <EmptyState isCloudTrial={isCloudTrial} />}
      {assets && assets.length > 0 && (
        <section className="asset-library__list" aria-label="资产列表">
          {assets.map((asset) => {
            const source = asset.versions[0];
            const personal = asset.personalAssets[0]?.versions[0];
            const isInitialAsset = source.sourceType === 'BACKEND_IMPORT_HUMAN_AUTHORIZED';
            const statusLabel = personal ? '可直接训练' : '来源只读';
            const versionLabel = personal
              ? isInitialAsset
                ? '初始学习资产'
                : '已有个人版本'
              : '需建立个人版本';
            const description = personal
              ? isInitialAsset
                ? '初始学习资产已就绪，可直接进入训练。'
                : `个人版本已确认，可继续用于${isCloudTrial ? '线上' : '本地'}训练。`
              : source.coreIdea;
            const flow = personal?.coreFlow ?? source.coreFlow;

            return (
              <article className="asset-library__item" key={asset.id}>
                <div className="asset-library__card-top">
                  <span className="asset-library__icon-wrap">
                    <AssetTopicIcon
                      coreIdea={source.coreIdea}
                      coreFlow={flow}
                      title={personal?.triggerName ?? source.title}
                    />
                  </span>
                  {personal && (
                    <span className="asset-library__ready-mark">
                      <CheckCircle aria-hidden="true" size={27} weight="fill" />
                    </span>
                  )}
                </div>
                <div className="asset-library__title-row">
                  <h2 title={personal?.triggerName ?? source.title}>
                    {personal?.triggerName ?? source.title}
                  </h2>
                  <span className="asset-library__category">{versionLabel}</span>
                </div>
                <p className="asset-library__description">{description}</p>
                <div className="asset-library__divider" />
                <p className="asset-library__flow">{flow}</p>
                <footer className="asset-library__card-footer">
                  <span
                    className={
                      personal
                        ? 'asset-library__state asset-library__state--ready'
                        : 'asset-library__state'
                    }
                  >
                    {statusLabel}
                  </span>
                  <span className="asset-library__version">SOURCE v{source.version}</span>
                  <Link
                    className="asset-library__detail-link"
                    href={personal ? `/assets/${asset.id}` : `/assets/${asset.id}/personalize`}
                  >
                    {personal ? '进入资产' : '建立版本'}
                  </Link>
                </footer>
              </article>
            );
          })}
        </section>
      )}
      <section className="asset-library__boundary" aria-labelledby="asset-boundary-heading">
        <p className="asset-library__serial">TRAINING BOUNDARY</p>
        <h2 id="asset-boundary-heading">尚未进入多资产拼贴</h2>
        <p>个人资产建立后，训练仍将依次经过熟读、复现和单资产调用；本阶段不会解锁拼贴训练。</p>
      </section>
    </main>
  );
}

function AssetTopicIcon({
  title,
  coreIdea,
  coreFlow,
}: {
  title: string;
  coreIdea: string;
  coreFlow: string;
}) {
  const titleKey = title.toLowerCase();
  const subject = `${title} ${coreIdea} ${coreFlow}`.toLowerCase();
  const iconProps = { 'aria-hidden': true as const, size: 36, weight: 'regular' as const };

  if (/追问|follow.?up/.test(titleKey)) return <ChatCircleText {...iconProps} />;
  if (/可信|信任|trust/.test(titleKey)) return <ShieldCheck {...iconProps} />;
  if (/目的|purpose/.test(titleKey)) return <Target {...iconProps} />;
  if (/群体|一对一|group/.test(titleKey)) return <UsersThree {...iconProps} />;
  if (/water|drink|hydration|喝水|饮水|补水|水分/.test(subject)) return <Drop {...iconProps} />;
  if (/旅行|徒步|远行|山|travel|walk|mountain/.test(subject)) return <Mountains {...iconProps} />;
  if (/航班|飞机|出行|flight|airplane/.test(subject)) return <AirplaneTilt {...iconProps} />;
  if (/领导|汇报|工作|管理|职场|work|manager|leader/.test(subject))
    return <Briefcase {...iconProps} />;
  if (/感激|感谢|同理|支持|关系|情绪|heart|support|empathy/.test(subject))
    return <Heart {...iconProps} />;
  if (/早晨|早起|日常|专注|morning|daily|focus/.test(subject)) return <Sun {...iconProps} />;
  if (/阅读|书|学习|read|learn/.test(subject)) return <BookOpen {...iconProps} />;
  if (/森林|自然|慢|节奏|放松|成长|自助|坚持|努力|forest|nature|relax/.test(subject))
    return <Tree {...iconProps} />;
  if (/提问|对话|沟通|conversation|question|dialogue|ask/.test(subject))
    return <Question {...iconProps} />;

  return <Leaf {...iconProps} />;
}

function EmptyState({ isCloudTrial }: { isCloudTrial: boolean }) {
  return (
    <section className="asset-library__empty" aria-labelledby="asset-empty-heading">
      <p className="asset-library__serial">PERSONAL ASSET NEXT</p>
      <h2 id="asset-empty-heading">还没有可个人化的来源资产</h2>
      <p>
        {isCloudTrial
          ? '内置资产尚未完成种子初始化。完成后会自动提供可训练的个人版本。'
          : '普通来源资产需要建立个人版本；初始学习资产会在导入时自动建立可训练版本。'}
      </p>
      <div className="asset-library__actions">
        {isCloudTrial ? (
          <Link className="asset-library__primary-action" href="/">
            返回今日训练
          </Link>
        ) : (
          <Link className="asset-library__primary-action" href="/content/jobs/manual-review">
            查看来源资产候选
          </Link>
        )}
        <Link className="asset-library__secondary-action" href="/content">
          返回内容工作台
        </Link>
      </div>
    </section>
  );
}
