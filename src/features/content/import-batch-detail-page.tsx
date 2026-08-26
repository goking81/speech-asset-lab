'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { isCloudImportRuntime } from '@/lib/runtime-mode';

type BatchDetail = {
  id: string;
  status: string;
  collectionTitle: string;
  files: Array<{
    id: string;
    relativePath: string;
    extension: string;
    status: string;
    skipReason?: string | null;
    parseStatus: string;
    parseProgressCurrent?: number | null;
    parseProgressTotal?: number | null;
    aiSourceDocumentId?: string | null;
    aiSourceDocumentTitle?: string | null;
  }>;
};

function parseFailureLabel(reason: string) {
  const labels: Record<string, string> = {
    PDF_TEXT_NOT_FOUND: 'PDF 没有可提取文本；扫描件需要先进行 OCR。',
    PDF_TEXT_EXTRACTION_FAILED: '无法读取此 PDF 文件。',
    PDF_PARSER_UNAVAILABLE: '本机 PDF 解析组件不可用。',
    OCR_ENGINE_UNAVAILABLE: '本机 OCR 引擎不可用。',
    OCR_LANGUAGE_UNAVAILABLE: '本机 OCR 缺少英文识别语言包。',
    PDF_RENDERER_UNAVAILABLE: '本机 PDF 页面渲染组件不可用。',
    OCR_PROCESS_FAILED: '本机 OCR 处理 PDF 失败。',
    OCR_TEXT_NOT_FOUND: 'OCR 未从 PDF 页面识别出文字。',
    LOCAL_FILE_READ_FAILED: '本机原文件无法读取。',
    CLOUD_DOCUMENT_UNSUPPORTED: '云端仅支持 TXT、PDF 与 Word（.docx）文件。',
    CLOUD_TEXT_INVALID_UTF8: '文本文件不是有效的 UTF-8 编码。请转存为 UTF-8 后重试。',
    CLOUD_TEXT_EMPTY: '来源文本为空，无法建立来源段落。',
    CLOUD_STORAGE_READ_FAILED: '私有来源存储暂时无法读取该文件，请稍后重试。',
    CLOUD_AI_BINDING_UNAVAILABLE: 'Cloudflare 文档解析服务尚未绑定。',
    CLOUD_DOCUMENT_CONVERSION_FAILED: 'Cloudflare 未能从此文档提取可靠文字。',
    CLOUD_DOCUMENT_PARSE_FAILED: '云端文档解析失败。',
    CLOUD_OCR_NOT_CONFIGURED: '扫描 PDF 需要 OCR 密钥。配置完成后点击“解析已接收文件”重试。',
    CLOUD_OCR_FREE_LIMIT_EXCEEDED:
      '扫描 PDF 超出当前免费 OCR 限制（1 MiB、最多 3 页）。请拆分后重试。',
    CLOUD_OCR_FAILED: '云端 OCR 未完成，请稍后重试。',
    CLOUD_OCR_TEXT_NOT_FOUND: 'OCR 未从扫描 PDF 中识别出可用文字。',
  };

  return labels[reason] ?? reason;
}

export function ImportBatchDetailPage({ batchId }: { batchId: string }) {
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseStartedAt, setParseStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [isDrafting, setIsDrafting] = useState(false);
  const [draftStatus, setDraftStatus] = useState<string | null>(null);
  const isCloudImport = isCloudImportRuntime();

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/imports/${batchId}`);
    const payload = await readJsonResponse<BatchDetail & { error?: string }>(response);

    if (!response.ok) {
      throw new Error(payload.error ?? '无法读取导入批次。');
    }

    setDetail(payload);
  }, [batchId]);

  useEffect(() => {
    void fetch(`/api/imports/${batchId}`)
      .then(async (response) => {
        const payload = await readJsonResponse<BatchDetail & { error?: string }>(response);

        if (!response.ok) {
          throw new Error(payload.error ?? '无法读取导入批次。');
        }

        setDetail(payload);
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : '无法读取导入批次。'),
      );
  }, [batchId]);

  useEffect(() => {
    if (!isParsing) return;
    const refreshTimer = window.setInterval(() => void refresh(), 900);
    const clockTimer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(refreshTimer);
      window.clearInterval(clockTimer);
    };
  }, [isParsing, refresh]);

  async function parse() {
    setIsParsing(true);
    const startedAt = Date.now();
    setParseStartedAt(startedAt);
    setNow(startedAt);
    setError(null);

    try {
      const response = await fetch(`/api/imports/${batchId}`, { method: 'POST' });
      const payload = await readJsonResponse<{ error?: string }>(response);

      if (!response.ok) {
        throw new Error(payload.error ?? '解析失败。');
      }

      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '解析失败。');
    } finally {
      setIsParsing(false);
      setParseStartedAt(null);
    }
  }

  async function handleReparseWithOcr(fileId: string) {
    setIsParsing(true);
    setParseStartedAt(null);
    setNow(0);
    setError(null);

    try {
      const response = await fetch(`/api/imports/${batchId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ forceOcrFileId: fileId }),
      });
      const payload = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(payload.error ?? '高精度 OCR 重新解析失败。');
      }
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : isCloudImport
            ? '云端 OCR 重新解析失败。'
            : '高精度 OCR 重新解析失败。',
      );
    } finally {
      setIsParsing(false);
      setParseStartedAt(null);
    }
  }

  async function generateDraft(sourceDocumentId: string) {
    setIsDrafting(true);
    setDraftStatus(null);
    setError(null);

    try {
      const response = await fetch('/api/content/r1', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId }),
      });
      const payload = await readJsonResponse<{ status?: string; error?: string }>(response);
      if (!response.ok) throw new Error(payload.error ?? 'AI 候选草稿生成失败。');
      if (payload.status === 'NOT_CONFIGURED') {
        setDraftStatus('AI 服务尚未配置，未生成草稿。');
      } else if (payload.status === 'AWAITING_USER_CONFIRMATION') {
        setDraftStatus('AI 建议资产草稿已生成，等待你在内容工作台审核确认。');
      } else {
        setDraftStatus('AI 草稿任务已完成，请到内容工作台查看审核结果。');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'AI 候选草稿生成失败。');
    } finally {
      setIsDrafting(false);
    }
  }

  const parsingFiles = detail?.files.filter((file) => file.status === 'PARSING') ?? [];
  const parsingFile = parsingFiles[0];
  const pageCurrent = parsingFile?.parseProgressCurrent ?? 0;
  const pageTotal = parsingFile?.parseProgressTotal ?? 0;
  const fileCount = detail?.files.length ?? 0;
  const finishedFiles =
    detail?.files.filter((file) =>
      ['PARSED', 'EXACT_DUPLICATE', 'NEAR_DUPLICATE'].includes(file.status),
    ).length ?? 0;
  const percent =
    fileCount === 0
      ? 0
      : Math.min(
          100,
          Math.round(
            ((finishedFiles + (pageTotal > 0 ? pageCurrent / pageTotal : 0)) / fileCount) * 100,
          ),
        );
  const elapsedSeconds = parseStartedAt
    ? Math.max(0, Math.floor((now - parseStartedAt) / 1000))
    : 0;
  const estimatedSeconds =
    pageCurrent > 0 && pageTotal > pageCurrent
      ? Math.ceil((elapsedSeconds / pageCurrent) * (pageTotal - pageCurrent))
      : null;
  const aiSourceDocuments = Array.from(
    new Map(
      (detail?.files ?? [])
        .filter((file): file is typeof file & { aiSourceDocumentId: string } =>
          Boolean(file.aiSourceDocumentId),
        )
        .map((file) => [
          file.aiSourceDocumentId,
          {
            id: file.aiSourceDocumentId,
            title: file.aiSourceDocumentTitle ?? file.relativePath,
          },
        ]),
    ).values(),
  );

  return (
    <main className="page page--with-back-link import-intake">
      <Link className="page-back-link" href="/content/import">
        ← 返回导入内容
      </Link>
      <header className="page-heading">
        <p className="page-heading__eyebrow">F1-02 / PARSE STATUS</p>
        <h1>导入状态详情</h1>
        <p>解析仅处理已接收的来源内容；失败或重复文件会保留在批次清单中。</p>
      </header>
      <section className="gate-demo__card" aria-labelledby="batch-detail-heading">
        <h2 id="batch-detail-heading">{detail?.collectionTitle ?? '正在读取批次'}</h2>
        {error && <p className="gate-demo__status">{error}</p>}
        {!detail && !error && <p className="gate-demo__status">正在读取本地批次状态。</p>}
        {detail && (
          <>
            <p className="gate-demo__status">批次状态：{detail.status}</p>
            {isParsing && (
              <section className="import-intake__progress" aria-live="polite">
                <div>
                  <strong>
                    正在解析 {finishedFiles + 1}/{fileCount || 1} 个文件
                  </strong>
                  <span>{percent}%</span>
                </div>
                <progress aria-label="解析进度" max={100} value={percent} />
                <p>
                  {pageTotal > 1
                    ? `扫描 PDF 第 ${pageCurrent}/${pageTotal} 页；已用时 ${elapsedSeconds} 秒${
                        estimatedSeconds === null ? '' : `，预计还需约 ${estimatedSeconds} 秒`
                      }。`
                    : `正在准备、转换或 OCR 识别文本；已用时 ${elapsedSeconds} 秒。`}
                </p>
              </section>
            )}
            <button disabled={isParsing} onClick={parse} type="button">
              {isParsing ? '正在解析…' : '解析已接收文件'}
            </button>
            {aiSourceDocuments.length > 0 && (
              <div className="import-intake__draft-actions">
                <p>
                  为每份已解析文档单独生成候选草稿；AI
                  只会从该文档的来源段落中筛选，不会自动发布资产。
                </p>
                {aiSourceDocuments.map((document) => (
                  <button
                    disabled={isDrafting}
                    key={document.id}
                    onClick={() => void generateDraft(document.id)}
                    type="button"
                  >
                    {isDrafting ? '正在生成 AI 草稿…' : `AI 筛选候选：${document.title}`}
                  </button>
                ))}
                <Link href="/content">前往内容工作台审核</Link>
                {draftStatus && <p className="gate-demo__status">{draftStatus}</p>}
              </div>
            )}
            <ul className="import-intake__file-list" aria-label="批次文件状态">
              {detail.files.map((file) => (
                <li key={file.relativePath}>
                  <strong>{file.relativePath}</strong>：接收 {file.status}；解析 {file.parseStatus}
                  {file.skipReason ? `（${parseFailureLabel(file.skipReason)}）` : ''}
                  {file.extension.toLowerCase() === '.pdf' && file.parseStatus === 'PARSED' && (
                    <button
                      disabled={isParsing}
                      onClick={() => void handleReparseWithOcr(file.id)}
                      type="button"
                    >
                      {isCloudImport ? '使用云端 OCR 重新解析' : '使用高精度 OCR 重新解析'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}

async function readJsonResponse<T extends object>(response: Response) {
  const body = await response.text();
  if (!body) {
    return { error: '服务暂时没有返回可读取的响应，请稍后重试。' } as T;
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    return { error: '服务返回了无法识别的响应，请稍后重试。' } as T;
  }
}
