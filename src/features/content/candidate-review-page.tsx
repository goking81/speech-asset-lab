'use client';

import { ArrowLeft, FileText, Sparkle } from '@phosphor-icons/react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type ReviewDocument = {
  id: string;
  title: string;
  segments: Array<{ id: string; sequence: number; text: string }>;
};

type ReviewCandidate = {
  id: string;
  title: string;
  coreIdea: string;
  flowText: string;
  status: string;
  sourceDocument: { id: string; title: string };
  evidence: Array<{
    startOffset: number;
    endOffset: number;
    sourceSegment: { id: string; sequence: number; text: string };
  }>;
  nodes: Array<{ text: string }>;
  sourceAssetVersion: { id: string; version: number } | null;
  modelDraftJson: string | null;
};

type ReviewPayload = { documents: ReviewDocument[]; candidates: ReviewCandidate[] };

export function CandidateReviewPage({ jobId }: { jobId: string }) {
  const [payload, setPayload] = useState<ReviewPayload | null>(null);
  const [documentId, setDocumentId] = useState('');
  const [segmentId, setSegmentId] = useState('');
  const [title, setTitle] = useState('');
  const [coreIdea, setCoreIdea] = useState('');
  const [flowText, setFlowText] = useState('');
  const [nodeText, setNodeText] = useState('');
  const [expressionText, setExpressionText] = useState('');
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [status, setStatus] = useState('正在读取本地审核数据。');
  const [isSaving, setIsSaving] = useState(false);
  const [isRequestingR1, setIsRequestingR1] = useState(false);

  const selectedDocument = useMemo(
    () => payload?.documents.find((document) => document.id === documentId),
    [documentId, payload],
  );
  const selectedSegment = selectedDocument?.segments.find((segment) => segment.id === segmentId);
  const reviewCandidates = useMemo(
    () =>
      payload?.candidates.filter((candidate) => candidate.sourceDocument.id === documentId) ?? [],
    [documentId, payload],
  );

  async function refresh() {
    const response = await fetch('/api/content/candidates');
    const result = (await response.json()) as ReviewPayload & { error?: string };

    if (!response.ok) {
      throw new Error(result.error ?? '无法读取候选审核数据。');
    }

    setPayload(result);
    const firstDocument = result.documents[0];
    if (!documentId && firstDocument) {
      setDocumentId(firstDocument.id);
      setSegmentId(firstDocument.segments[0]?.id ?? '');
    }
    setStatus('');
  }

  useEffect(() => {
    void fetch('/api/content/candidates')
      .then(async (response) => {
        const result = (await response.json()) as ReviewPayload & { error?: string };
        if (!response.ok) {
          throw new Error(result.error ?? '无法读取候选审核数据。');
        }
        setPayload(result);
        const firstDocument = result.documents[0];
        if (firstDocument) {
          setDocumentId(firstDocument.id);
          setSegmentId(firstDocument.segments[0]?.id ?? '');
        }
        setStatus('');
      })
      .catch((error: unknown) =>
        setStatus(error instanceof Error ? error.message : '无法读取候选审核数据。'),
      );
  }, []);

  async function createCandidate() {
    if (!selectedSegment) {
      return;
    }

    setIsSaving(true);
    setStatus(editingCandidateId ? '正在保存候选修改。' : '正在保存手动候选草稿。');
    try {
      await request({
        action: editingCandidateId ? 'UPDATE' : 'CREATE',
        ...(editingCandidateId ? { candidateId: editingCandidateId } : {}),
        sourceDocumentId: selectedDocument?.id,
        sourceSegmentId: selectedSegment.id,
        title,
        coreIdea,
        flowText,
        nodeText,
        nodeType: 'CLAIM',
        startOffset: 0,
        endOffset: selectedSegment.text.length,
        expressionUnits: expressionText.trim()
          ? [{ unitType: 'PHRASE_CHUNK', text: expressionText.trim() }]
          : [],
      });
      setTitle('');
      setCoreIdea('');
      setFlowText('');
      setNodeText('');
      setExpressionText('');
      setEditingCandidateId(null);
      setIsEditorOpen(false);
      await refresh();
      setStatus(editingCandidateId ? '候选修改已保存。' : '候选草稿已保存，等待你逐项审核。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '候选草稿保存失败。');
    } finally {
      setIsSaving(false);
    }
  }

  async function requestR1Draft() {
    if (!selectedDocument) return;
    setIsRequestingR1(true);
    setStatus('正在检查 R1 发布包与 Provider 配置。');
    try {
      const response = await fetch('/api/content/r1', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId: selectedDocument.id }),
      });
      const result = (await response.json()) as {
        status?: string;
        reason?: string;
        error?: string;
        candidateCount?: number;
        rejectedCount?: number;
        reused?: boolean;
        resultReference?: string | null;
      };
      if (!response.ok) throw new Error(result.error ?? 'R1 请求失败。');
      if (result.status === 'AWAITING_USER_CONFIRMATION') {
        await refresh();
        if (result.resultReference === 'R1_NO_USABLE_FLOW') {
          setStatus('AI 已检查该来源，没有筛选出足够完整、可训练的英文语流；未创建候选。');
        } else if (result.reused) {
          setStatus('这份来源已有 AI 候选草稿；下方显示的项目仍需你逐项审核。');
        } else {
          const rejected = result.rejectedCount
            ? `；已过滤 ${result.rejectedCount} 条不符合来源或完整性要求的草稿`
            : '';
          setStatus(
            `AI 已生成 ${result.candidateCount ?? 0} 条候选草稿${rejected}。请在下方逐项审核。`,
          );
        }
      } else if (result.reason === 'AI_PROVIDER_NOT_CONFIGURED') {
        setStatus('R1 未运行：尚未配置 AI Provider，未创建任何候选。');
      } else {
        setStatus('R1 未能生成候选草稿，可检查 AI 服务状态后重试。');
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'R1 请求失败。');
    } finally {
      setIsRequestingR1(false);
    }
  }

  function beginEdit(candidate: ReviewCandidate) {
    setEditingCandidateId(candidate.id);
    setDocumentId(candidate.sourceDocument.id);
    setSegmentId(candidate.evidence[0]?.sourceSegment.id ?? '');
    setTitle(candidate.title);
    setCoreIdea(candidate.coreIdea);
    setFlowText(candidate.flowText);
    setNodeText(candidate.nodes[0]?.text ?? '');
    setExpressionText('');
    setIsEditorOpen(true);
    setStatus('正在编辑该候选；来源证据保持不变。');
  }

  function beginManualCandidate() {
    setEditingCandidateId(null);
    setTitle('');
    setCoreIdea('');
    setFlowText('');
    setNodeText('');
    setExpressionText('');
    setIsEditorOpen(true);
    setStatus('可基于左侧当前来源段落手动建立一条候选草稿。');
  }

  function showCandidateSource(candidate: ReviewCandidate) {
    setDocumentId(candidate.sourceDocument.id);
    setSegmentId(candidate.evidence[0]?.sourceSegment.id ?? '');
    setStatus('已在左侧定位该候选的来源段落。');
  }

  async function transition(
    candidateId: string,
    action: 'APPROVE' | 'TRANSITION',
    target?: string,
  ) {
    setIsSaving(true);
    setStatus(action === 'APPROVE' ? '正在确认来源资产版本。' : '正在更新候选状态。');
    try {
      await request({ action, candidateId, ...(target ? { status: target } : {}) });
      await refresh();
      setStatus(action === 'APPROVE' ? '已创建只读来源资产版本。' : '候选状态已更新。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '候选状态更新失败。');
    } finally {
      setIsSaving(false);
    }
  }

  const canCreate = Boolean(
    selectedSegment &&
    title.trim() &&
    coreIdea.trim() &&
    flowText.trim() &&
    nodeText.trim() &&
    !isSaving,
  );

  return (
    <main className="page page--with-back-link candidate-review candidate-review--workbench candidate-review--reference">
      <Link className="page-back-link" href="/content">
        <ArrowLeft aria-hidden="true" size={19} weight="regular" />
        返回内容工作台
      </Link>
      <header className="page-heading candidate-review__heading">
        <div>
          <p className="page-heading__eyebrow">HUMAN REVIEW</p>
          <h1 className="candidate-review__title">
            候选审核 <span>/ Review candidates</span>
          </h1>
          <p>请核对 AI 生成的候选语音素材，确认优质内容后加入素材库。</p>
        </div>
        <button
          className="candidate-review__filter-action"
          disabled={!selectedDocument || isRequestingR1}
          onClick={requestR1Draft}
          type="button"
        >
          <Sparkle aria-hidden="true" size={19} weight="fill" />
          {isRequestingR1 ? '正在筛选…' : 'AI 筛选候选'}
        </button>
      </header>

      <p aria-live="polite" className="candidate-review__status">
        {status}
      </p>

      {!payload && !status && <p className="candidate-review__status">正在读取本地审核数据。</p>}

      {payload?.documents.length === 0 && <EmptyState jobId={jobId} />}

      {payload && payload.documents.length > 0 && (
        <section className="candidate-review__workbench" aria-label="来源与候选并排审核区">
          <aside className="candidate-review__source-panel">
            <div className="candidate-review__panel-heading">
              <div>
                <p className="candidate-review__serial">
                  <FileText aria-hidden="true" size={19} weight="regular" />
                  SOURCE MATERIAL
                </p>
                <h2>
                  来源段落 <span>/ Source material</span>
                </h2>
              </div>
            </div>
            <div className="candidate-review__source-controls">
              <label>
                选择文档
                <select
                  aria-label="来源文档"
                  value={documentId}
                  onChange={(event) => {
                    const nextDocument = payload.documents.find(
                      (document) => document.id === event.target.value,
                    );
                    setDocumentId(event.target.value);
                    setSegmentId(nextDocument?.segments[0]?.id ?? '');
                  }}
                >
                  {payload.documents.map((document) => (
                    <option key={document.id} value={document.id}>
                      {document.title}
                    </option>
                  ))}
                </select>
              </label>
              <p className="candidate-review__source-section-label">原文（只读）</p>
            </div>
            <div className="candidate-review__source-text" tabIndex={0}>
              {selectedSegment?.text ?? '请选择来源段落。'}
            </div>
            <label className="candidate-review__segment-picker">
              查看其他段落
              <select
                aria-label="来源段落"
                value={segmentId}
                onChange={(event) => setSegmentId(event.target.value)}
              >
                {selectedDocument?.segments.map((segment) => (
                  <option key={segment.id} value={segment.id}>
                    {`第 ${segment.sequence} 段：${segment.text.slice(0, 44)}`}
                  </option>
                ))}
              </select>
            </label>
            <p className="candidate-review__source-note">
              原始证据已保留；确认候选不会改写来源文档。
            </p>
          </aside>

          <section
            className="candidate-review__candidate-panel"
            aria-labelledby="candidate-list-heading"
          >
            <div className="candidate-review__panel-heading">
              <div>
                <p className="candidate-review__serial">REVIEW ITEMS</p>
                <h2 id="candidate-list-heading">
                  待确认候选 <span>/ Candidate drafts</span>
                  <b>{reviewCandidates.length}</b>
                </h2>
              </div>
              <button
                className="candidate-review__outline-button"
                onClick={beginManualCandidate}
                type="button"
              >
                手动新建
              </button>
            </div>
            <p className="candidate-review__candidate-count">
              当前文档有 {reviewCandidates.length}{' '}
              条待审核候选；已确认或忽略的历史项目不会在此显示。
            </p>
            <div className="candidate-review__candidate-scroll">
              {reviewCandidates.length === 0 ? (
                <p className="candidate-review__empty-candidates">
                  尚无待审核候选。你可以在左侧运行 AI 筛选，或手动新建一条草稿。
                </p>
              ) : (
                reviewCandidates.map((candidate, index) => (
                  <article className="candidate-review__candidate-card" key={candidate.id}>
                    <header className="candidate-review__candidate-header">
                      <span className="candidate-review__candidate-number">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <h3>{candidate.title}</h3>
                      <span className="candidate-review__draft-status">草稿</span>
                    </header>
                    <p className="candidate-review__idea">
                      <span>核心思想</span>
                      {candidate.coreIdea}
                    </p>
                    <p className="candidate-review__flow-label">
                      关键表达（节选） / Key flow (excerpt)
                    </p>
                    <blockquote className="candidate-review__flow-text">
                      {candidate.flowText}
                    </blockquote>
                    <footer className="candidate-review__candidate-evidence">
                      <div>
                        <strong>来源证据</strong>
                        <span>
                          第 {candidate.evidence[0]?.sourceSegment.sequence ?? '—'} 段 ·
                          原始证据已保留
                        </span>
                        {isAiReconstructedCandidate(candidate.modelDraftJson) && (
                          <span>AI 重建草稿，请对照原文确认。</span>
                        )}
                      </div>
                      <button onClick={() => showCandidateSource(candidate)} type="button">
                        查看原文
                      </button>
                    </footer>
                    <div className="candidate-review__item-actions">
                      <button
                        disabled={isSaving}
                        onClick={() => beginEdit(candidate)}
                        type="button"
                      >
                        编辑
                      </button>
                      <button
                        disabled={isSaving}
                        onClick={() => transition(candidate.id, 'APPROVE')}
                        type="button"
                      >
                        确认资产
                      </button>
                      <button
                        disabled={isSaving}
                        onClick={() => transition(candidate.id, 'TRANSITION', 'IGNORED')}
                        type="button"
                      >
                        忽略
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </section>
      )}

      {payload && payload.documents.length > 0 && (
        <details
          className="candidate-review__editor"
          onToggle={(event) => setIsEditorOpen(event.currentTarget.open)}
          open={isEditorOpen}
        >
          <summary>{editingCandidateId ? '编辑当前候选草稿' : '手动建立候选草稿'}</summary>
          <section className="candidate-review__form" aria-labelledby="manual-candidate-heading">
            <div>
              <p className="candidate-review__serial">MANUAL CANDIDATE</p>
              <h2 id="manual-candidate-heading">
                {editingCandidateId ? '编辑候选草稿' : '从当前来源段落建立候选'}
              </h2>
              <p>保存为待审核草稿；不会自动发布为来源资产。</p>
            </div>
            <label>
              候选标题
              <input
                aria-label="候选标题"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label>
              核心观点
              <input
                aria-label="核心观点"
                value={coreIdea}
                onChange={(event) => setCoreIdea(event.target.value)}
              />
            </label>
            <label>
              来源语流
              <textarea
                aria-label="来源语流"
                value={flowText}
                onChange={(event) => setFlowText(event.target.value)}
              />
            </label>
            <label>
              逻辑节点
              <input
                aria-label="逻辑节点"
                value={nodeText}
                onChange={(event) => setNodeText(event.target.value)}
              />
            </label>
            <label>
              可选表达单元
              <input
                aria-label="可选表达单元"
                value={expressionText}
                onChange={(event) => setExpressionText(event.target.value)}
              />
            </label>
            <button disabled={!canCreate} onClick={createCandidate} type="button">
              {isSaving ? '正在保存…' : editingCandidateId ? '保存候选修改' : '保存候选草稿'}
            </button>
          </section>
        </details>
      )}
    </main>
  );
}

function isAiReconstructedCandidate(modelDraftJson: string | null) {
  try {
    return (
      (JSON.parse(modelDraftJson ?? '{}') as { isAiReconstructed?: unknown }).isAiReconstructed ===
      true
    );
  } catch {
    return false;
  }
}

function EmptyState({ jobId }: { jobId: string }) {
  return (
    <section className="candidate-review__empty" aria-labelledby="candidate-empty-heading">
      <p className="candidate-review__serial">REVIEW JOB · {jobId}</p>
      <h2 id="candidate-empty-heading">当前没有可建立候选的来源段落</h2>
      <p>请先导入并解析来源内容。解析文档、段落和原文件不会被直接当作来源资产。</p>
      <div className="candidate-review__actions">
        <Link className="candidate-review__primary-action" href="/content/import">
          导入来源内容
        </Link>
        <Link className="candidate-review__secondary-action" href="/content">
          返回内容工作台
        </Link>
      </div>
    </section>
  );
}

async function request(body: Record<string, unknown>) {
  const response = await fetch('/api/content/candidates', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as { error?: string };

  if (!response.ok) {
    throw new Error(result.error ?? '候选审核操作失败。');
  }
}
