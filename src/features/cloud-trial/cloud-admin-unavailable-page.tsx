import Link from 'next/link';

/** 管理区需在 Access 政策和私有服务变量同时就绪后才可使用。 */
export function CloudAdminUnavailablePage() {
  return (
    <main className="page cloud-trial-unavailable">
      <header className="page-heading">
        <p className="page-heading__eyebrow">PRIVATE ADMINISTRATION</p>
        <h1>管理员资料区尚未启用</h1>
        <p>公开试用版已经可用；导入、OCR、AI 筛选和人工入库会在 Cloudflare Access 保护完成后单独启用。</p>
      </header>
      <section className="asset-library__empty">
        <p className="asset-library__serial">SECURITY BOUNDARY</p>
        <h2>不会在未保护状态下接收来源文件</h2>
        <p>启用后，来源原件私有保存，AI 只生成候选草稿，仍由管理员逐项确认入库。</p>
        <Link className="asset-library__primary-action" href="/lab">
          返回公开试用
        </Link>
      </section>
    </main>
  );
}
