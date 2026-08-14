'use client';

import Link from 'next/link';
import { useState } from 'react';

type ImportState =
  | { kind: 'IDLE' }
  | { kind: 'SAVING' }
  | {
      kind: 'SUCCESS';
      batchId: string;
      status: string;
      files: Array<{ relativePath: string; status: string; skipReason?: string | null }>;
    }
  | { kind: 'ERROR'; message: string };

export function ImportIntakePage() {
  const [collectionTitle, setCollectionTitle] = useState('');
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [state, setState] = useState<ImportState>({ kind: 'IDLE' });

  async function submit() {
    setState({ kind: 'SAVING' });

    try {
      const response = await fetch('/api/imports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          collectionTitle,
          text,
          files: await Promise.all(
            files.map(async (file) => ({
              relativePath: getRelativePath(file),
              originalFileName: file.name,
              extension: `.${file.name.split('.').pop() ?? ''}`,
              contentBase64: await readFileAsBase64(file),
            })),
          ),
        }),
      });
      const payload = (await response.json()) as {
        batchId?: string;
        status?: string;
        files?: Array<{ relativePath: string; status: string; skipReason?: string | null }>;
        error?: string;
      };

      if (!response.ok || !payload.batchId || !payload.status) {
        throw new Error(payload.error ?? '导入批次创建失败。');
      }

      setState({
        kind: 'SUCCESS',
        batchId: payload.batchId,
        status: payload.status,
        files: payload.files ?? [],
      });
    } catch (error) {
      setState({
        kind: 'ERROR',
        message: error instanceof Error ? error.message : '导入批次创建失败。',
      });
    }
  }

  const canSubmit =
    collectionTitle.trim().length > 0 &&
    (text.trim().length > 0 || files.length > 0) &&
    state.kind !== 'SAVING';

  return (
    <main className="page page--with-back-link import-intake">
      <Link className="page-back-link" href="/content">
        ← 返回内容工作台
      </Link>
      <header className="page-heading">
        <p className="page-heading__eyebrow">F1-01 / LOCAL INTAKE</p>
        <h1>导入内容</h1>
        <p>本轮仅接收和本地保存来源文件；不会解析内容、生成资产或调用 AI。</p>
      </header>
      <section className="gate-demo__card" aria-labelledby="import-heading">
        <h2 id="import-heading">粘贴文本</h2>
        <label>
          课程集合名称
          <input
            aria-label="课程集合名称"
            value={collectionTitle}
            onChange={(event) => setCollectionTitle(event.target.value)}
          />
        </label>
        <label>
          来源文本
          <textarea
            aria-label="来源文本"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <label>
          本地文件
          <input
            aria-label="本地文件"
            multiple
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            type="file"
          />
        </label>
        <p className="gate-demo__status">
          {files.length > 0 ? `已选择 ${files.length} 个文件。` : '可选择一个或多个本地文件。'}
        </p>
        <button disabled={!canSubmit} onClick={submit} type="button">
          {state.kind === 'SAVING' ? '正在接收…' : '创建本地导入批次'}
        </button>
        <p aria-live="polite" className="gate-demo__status">
          {state.kind === 'IDLE' && '填写名称和文本后可接收。'}
          {state.kind === 'SAVING' && '正在保存到本地目录。'}
          {state.kind === 'SUCCESS' && `批次 ${state.batchId} 已创建：${state.status}。`}
          {state.kind === 'ERROR' && state.message}
        </p>
        {state.kind === 'SUCCESS' && (
          <>
            <ul className="import-intake__file-list" aria-label="导入文件状态">
              {state.files.map((file) => (
                <li key={file.relativePath}>
                  <strong>{file.relativePath}</strong>：{file.status}
                  {file.skipReason ? `（${file.skipReason}）` : ''}
                </li>
              ))}
            </ul>
            <Link className="import-intake__back" href={`/content/import/${state.batchId}`}>
              查看批次详情
            </Link>
          </>
        )}
      </section>
    </main>
  );
}

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('本地文件读取失败。'));
    reader.readAsDataURL(file);
  });
}

function getRelativePath(file: File & { webkitRelativePath?: string }) {
  return file.webkitRelativePath || file.name;
}
