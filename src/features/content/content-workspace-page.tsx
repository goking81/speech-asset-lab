import Link from 'next/link';

const parsingStates = [
  ['待解析', '已接收的文本会先保留原文件，再按文件独立进入解析。'],
  ['已解析', '段落、规范文本 Hash 和格式范围会保存在可追溯的来源文档中。'],
  ['发现重复', '精确重复与近重复只提示，不会自动合并、替换或删除。'],
] as const;

export function ContentWorkspacePage() {
  return (
    <main className="page content-workspace">
      <header className="page-heading">
        <p className="page-heading__eyebrow">CONTENT / LOCAL SOURCES</p>
        <h1>内容工作台</h1>
        <p>从本地来源开始整理。这里保存的是可追溯的原始内容，不会直接变成训练资产。</p>
      </header>

      <section className="content-workspace__hero" aria-labelledby="content-intake-heading">
        <div>
          <p className="content-workspace__serial">STEP 01 · SOURCE INTAKE</p>
          <h2 id="content-intake-heading">导入一份来源内容</h2>
          <p>支持粘贴文本或选择本地文件。接收、解析和重复提示均在本地完成；AI 不会参与此步骤。</p>
        </div>
        <Link className="content-workspace__action" href="/content/import">
          导入内容
        </Link>
      </section>

      <section className="content-workspace__section" aria-labelledby="content-flow-heading">
        <div className="content-workspace__section-heading">
          <p className="content-workspace__serial">LOCAL PARSING FLOW</p>
          <h2 id="content-flow-heading">来源内容如何进入审核</h2>
        </div>
        <ol className="content-workspace__flow">
          {parsingStates.map(([title, description], index) => (
            <li key={title}>
              <span aria-hidden="true">0{index + 1}</span>
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="content-workspace__notice" aria-labelledby="content-boundary-heading">
        <p className="content-workspace__serial">CURRENT BOUNDARY</p>
        <h2 id="content-boundary-heading">本阶段只处理来源文本</h2>
        <p>
          候选审核和来源资产确认将在下一阶段开放。在确认前，来源文档、段落和原文件均不会被当作个人训练资产。
        </p>
        <Link className="content-workspace__review-link" href="/content/jobs/manual-review">
          查看候选审核
        </Link>
      </section>
    </main>
  );
}
