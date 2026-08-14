import Link from 'next/link';

export function CloudTrialUnavailablePage() {
  return (
    <main className="page cloud-trial-unavailable">
      <header className="page-heading">
        <p className="page-heading__eyebrow">BUILT-IN ASSET TRIAL</p>
        <h1>此功能仅在本地工作台提供</h1>
        <p>
          线上试用版只提供内置语流资产、五步训练、训练记录和可确认的 AI
          草稿，不接收来源文件，也不会上传你的本机资料。
        </p>
      </header>
      <section className="asset-library__empty" aria-labelledby="cloud-trial-boundary-heading">
        <p className="asset-library__serial">TRIAL BOUNDARY</p>
        <h2 id="cloud-trial-boundary-heading">导入、PDF 解析、OCR 与本地备份未在此版本开放</h2>
        <p>
          这不是故障。这样可确保 329
          份本机资料、原始来源文件和本地路径不会被提交到公开仓库或发送到第三方服务。
        </p>
        <div className="asset-library__actions">
          <Link className="asset-library__primary-action" href="/assets">
            浏览内置资产
          </Link>
          <Link className="asset-library__secondary-action" href="/">
            返回今日训练
          </Link>
        </div>
      </section>
    </main>
  );
}
