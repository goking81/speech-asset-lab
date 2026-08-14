'use client';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="error-page">
      <p className="page-heading__eyebrow">WORKSPACE STATUS</p>
      <h1>这个页面暂时无法显示</h1>
      <p>本地内容没有被修改。请重新加载页面；如果问题持续出现，可稍后再试。</p>
      <button type="button" onClick={reset}>
        重新加载页面
      </button>
    </main>
  );
}
