'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Detail = {
  sourceVersion: { title: string; version: number };
  personalVersion: null | {
    triggerName: string;
    coreIdea: string;
    coreFlow: string;
    version: number;
    nodes: Array<{ id: string; nodeType: string }>;
    flowSpans: Array<{ personalAssetNodeId: string; startOffset: number; endOffset: number }>;
  };
};
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
const nodeLabel: Record<string, string> = {
  CLAIM: '主张',
  REASON: '原因',
  EXPLANATION: '解释',
  EXAMPLE: '例子',
  CONTRAST: '对比',
  CONDITION: '条件',
  ACTION: '行动',
  RESULT: '结果',
  CONCLUSION: '结论',
  CONTEXT: '背景',
  OTHER: '过渡',
};

export function AssetDetailPage({ assetId }: { assetId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    void fetch(`/api/assets/${assetId}`)
      .then(async (r) => {
        const v = (await r.json()) as Detail & { error?: string };
        if (!r.ok) throw new Error(v.error);
        setDetail(v);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '无法读取资产。'));
  }, [assetId]);
  if (error)
    return (
      <main className="page page--with-back-link">
        <Link className="page-back-link" href="/assets">
          ← 返回资产库
        </Link>
        <p>{error}</p>
      </main>
    );
  if (!detail)
    return (
      <main className="page page--with-back-link">
        <Link className="page-back-link" href="/assets">
          ← 返回资产库
        </Link>
        <p>正在读取资产详情。</p>
      </main>
    );
  const personal = detail.personalVersion;
  return (
    <main className="page page--with-back-link asset-library asset-detail">
      <Link className="page-back-link" href="/assets">
        ← 返回资产库
      </Link>
      <header className="page-heading">
        <p className="page-heading__eyebrow">ASSET / DETAIL</p>
        <h1>{personal?.triggerName ?? detail.sourceVersion.title}</h1>
        <p>来源版本 v{detail.sourceVersion.version} 只读；个人版本与来源版本独立保存。</p>
      </header>
      {!personal ? (
        <section className="asset-library__empty">
          <h2>尚未建立个人版本</h2>
          <Link className="asset-library__primary-action" href={`/assets/${assetId}/personalize`}>
            建立个人版本
          </Link>
        </section>
      ) : (
        <section className="asset-library__empty">
          <p className="asset-library__serial">PERSONAL v{personal.version}</p>
          <h2>{personal.coreIdea}</h2>
          <FlowLegend nodes={personal.nodes} />
          <p className="asset-flow">{renderFlow(personal)}</p>
          <Link className="asset-library__primary-action" href={`/assets/${assetId}/personalize`}>
            手动改写为我的版本
          </Link>
          <details className="asset-detail__optional">
            <summary>AI 辅助改写（可选）</summary>
            <p>
              在“手动改写”页用中文写下你的个人经历，再由 AI
              按当前语流结构生成待确认草稿。它不会覆盖当前版本，也不影响直接练习。
            </p>
            <Link
              className="asset-library__secondary-action"
              href={`/assets/${assetId}/personalize`}
            >
              前往 AI 辅助改写
            </Link>
          </details>
        </section>
      )}
    </main>
  );
}

function FlowLegend({ nodes }: { nodes: NonNullable<Detail['personalVersion']>['nodes'] }) {
  const types = [...new Set(nodes.map((node) => node.nodeType))];
  return (
    <div className="asset-flow__legend" aria-label="本资产的逻辑节点标记">
      {types.map((type) => (
        <span
          className={`asset-flow__legend-item ${nodeClass[type] ?? 'flow-transition'}`}
          key={type}
        >
          {nodeLabel[type] ?? '过渡'}
        </span>
      ))}
    </div>
  );
}

function renderFlow(personal: NonNullable<Detail['personalVersion']>) {
  const types = new Map(personal.nodes.map((n) => [n.id, n.nodeType]));
  let at = 0;
  return personal.flowSpans.map((span, i) => (
    <span key={span.personalAssetNodeId}>
      {personal.coreFlow.slice(at, span.startOffset)}
      <span
        className={nodeClass[types.get(span.personalAssetNodeId) ?? ''] ?? 'flow-transition'}
        aria-label={`逻辑节点：${nodeLabel[types.get(span.personalAssetNodeId) ?? ''] ?? '过渡'}`}
      >
        {personal.coreFlow.slice(span.startOffset, span.endOffset)}
      </span>
      {(at = span.endOffset) && null}
      {i === personal.flowSpans.length - 1 ? personal.coreFlow.slice(at) : null}
    </span>
  ));
}
