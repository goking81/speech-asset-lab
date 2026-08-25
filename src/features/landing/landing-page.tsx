'use client';

import {
  ArrowRight,
  BookOpen,
  CheckCircle,
  Compass,
  FileText,
  Leaf,
  ShieldCheck,
  Sparkle,
} from '@phosphor-icons/react';
import Image from 'next/image';
import Link from 'next/link';

const pathSteps = [
  {
    title: '沉淀来源',
    description: '保留出处与原始证据，让每一条有价值的表达都可追溯。',
    icon: FileText,
  },
  {
    title: '形成个人资产',
    description: '围绕真实经历进行改写，个人版本独立保存，始终由你确认。',
    icon: Sparkle,
  },
  {
    title: '进入训练',
    description: '从熟读、复现到调用与拼贴，按节奏把表达真正用起来。',
    icon: Compass,
  },
];

const principles = [
  '来源资产可追溯，个人资产独立编辑',
  'AI 只提供草稿，不会自动发布或覆盖内容',
  '问题与追问只基于已经掌握的资产',
];

export function LandingPage() {
  return (
    <main className="landing-demo">
      <header className="landing-demo__nav">
        <Link aria-label="Speech Asset Lab Landing Page" className="landing-demo__brand" href="/">
          <Image alt="" height={52} src="/images/brand-evergreen-mark.png" width={52} />
          <span>
            <strong>Speech Asset Lab</strong>
            <small>英语语流资产工作台</small>
          </span>
        </Link>
        <nav aria-label="Landing Page 导航" className="landing-demo__nav-links">
          <a href="#example">示例</a>
          <a href="#method">方法</a>
          <a href="#trial">试用版</a>
        </nav>
        <Link className="landing-demo__nav-action" href="/lab">
          进入工作台
          <ArrowRight aria-hidden="true" size={17} weight="bold" />
        </Link>
      </header>

      <section className="landing-demo__hero" aria-labelledby="landing-title">
        <div className="landing-demo__hero-copy">
          <p className="landing-demo__eyebrow">SPEECH ASSET LAB / LEARN WITH EVIDENCE</p>
          <h1 id="landing-title">
            <span>让英语表达，</span>
            <em>成为可以积累的资产。</em>
          </h1>
          <p className="landing-demo__lead">
            把播客和文档里值得学习的英语表达，整理成可追溯、能反复训练、在真实场景中说出来的个人表达库。
          </p>
          <p className="landing-demo__audience">
            适合想把播客、文章里的好表达真正练会的中文英语学习者。
          </p>
          <div className="landing-demo__actions">
            <Link className="landing-demo__primary-action" href="/lab">
              用一条内置资产开始训练
              <ArrowRight aria-hidden="true" size={19} weight="bold" />
            </Link>
            <Link className="landing-demo__secondary-action" href="/assets">
              先看看资产库
            </Link>
          </div>
          <ul aria-label="产品特性" className="landing-demo__chips">
            <li>保留原始来源</li>
            <li>按阶段反复训练</li>
            <li>AI 草稿由你确认</li>
          </ul>
        </div>
        <div className="landing-demo__hero-visual" aria-hidden="true">
          <Image
            alt=""
            fill
            priority
            sizes="(max-width: 1120px) 42vw, 510px"
            src="/images/practice-forest-path.png"
          />
          <div className="landing-demo__asset-preview">
            <span>一条语流资产</span>
            <strong>
              从来源证据出发，
              <br />
              在真实场景中反复调用。
            </strong>
            <div>
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
          </div>
        </div>
      </section>

      <section className="landing-demo__example" id="example" aria-labelledby="asset-example-title">
        <div className="landing-demo__example-heading">
          <div>
            <p className="landing-demo__eyebrow">ONE ASSET, FROM EVIDENCE TO USE</p>
            <h2 id="asset-example-title">一条表达，怎样成为你的资产。</h2>
          </div>
          <p>
            以现有内置资产「多喝水」为例：来源版本保持只读，个人版本独立保存，再按阶段进入训练。
          </p>
        </div>

        <div className="landing-demo__example-flow">
          <article>
            <span className="landing-demo__example-icon">
              <FileText aria-hidden="true" size={24} weight="regular" />
            </span>
            <small>01 · 来源证据</small>
            <h3>保留原始出处</h3>
            <p>来源主题：喝水、健康与身体表现。来源版本只读，方便随时回看原始语境。</p>
          </article>
          <article className="landing-demo__example-personal">
            <span className="landing-demo__example-icon">
              <Sparkle aria-hidden="true" size={24} weight="regular" />
            </span>
            <small>02 · 个人版本</small>
            <h3>改成与你有关的表达</h3>
            <blockquote>
              Forming a habit of drinking enough water is crucial. Drinking enough water allows your
              body to perform at its best.
            </blockquote>
          </article>
          <article>
            <span className="landing-demo__example-icon">
              <Compass aria-hidden="true" size={24} weight="regular" />
            </span>
            <small>03 · 进入训练</small>
            <h3>从理解走向调用</h3>
            <p>先熟读、再复现，完成单资产调用后，才逐步进入多资产拼贴。</p>
            <Link href="/assets" className="landing-demo__example-link">
              浏览真实资产 <ArrowRight aria-hidden="true" size={16} weight="bold" />
            </Link>
          </article>
        </div>
      </section>

      <section className="landing-demo__method" id="method" aria-labelledby="method-title">
        <div className="landing-demo__section-heading">
          <p className="landing-demo__eyebrow">A CALM, REPEATABLE PATH</p>
          <h2 id="method-title">把理解，慢慢变成表达。</h2>
          <p>不靠随机题库，也不跳过练习门槛。每一步都建立在你已经拥有或确认的资产上。</p>
        </div>
        <ol className="landing-demo__path">
          {pathSteps.map(({ title, description, icon: Icon }, index) => (
            <li key={title}>
              <span className="landing-demo__step-index">0{index + 1}</span>
              <span className="landing-demo__step-icon">
                <Icon aria-hidden="true" size={25} weight="regular" />
              </span>
              <h3>{title}</h3>
              <p>{description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-demo__training" aria-labelledby="training-title">
        <div className="landing-demo__training-art" aria-hidden="true">
          <Image alt="" fill sizes="420px" src="/images/practice-morning-desk.png" />
        </div>
        <div className="landing-demo__training-copy">
          <p className="landing-demo__eyebrow">THE TRAINING PATH</p>
          <h2 id="training-title">熟读 → 复现 → 调用 → 拼贴</h2>
          <p>
            新资产先在单条语流里建立理解与熟悉感，再进入调用与多资产拼贴。练习记录帮助你看见自己的积累，而不是替你判断口语表现。
          </p>
          <Link href="/lab" className="landing-demo__text-action">
            查看今日训练 <ArrowRight aria-hidden="true" size={17} weight="bold" />
          </Link>
        </div>
      </section>

      <section
        className="landing-demo__principles"
        id="principles"
        aria-labelledby="principles-title"
      >
        <div className="landing-demo__principles-intro">
          <span>
            <ShieldCheck aria-hidden="true" size={27} weight="regular" />
          </span>
          <p className="landing-demo__eyebrow">YOUR MATERIAL, YOUR CONFIRMATION</p>
          <h2 id="principles-title">AI 是安静的辅助，不是替你做决定的人。</h2>
        </div>
        <ul>
          {principles.map((principle) => (
            <li key={principle}>
              <CheckCircle aria-hidden="true" size={21} weight="fill" />
              {principle}
            </li>
          ))}
        </ul>
      </section>

      <section className="landing-demo__trial" id="trial" aria-labelledby="trial-title">
        <div>
          <p className="landing-demo__eyebrow">CURRENTLY AVAILABLE</p>
          <h2 id="trial-title">内置资产试用版</h2>
          <p>现在可浏览内置资产、进入五步训练，并查看自己的训练记录。</p>
        </div>
        <div className="landing-demo__trial-next">
          <BookOpen aria-hidden="true" size={26} weight="regular" />
          <div>
            <strong>下一步：私有资料导入与 AI 整理</strong>
            <p className="landing-demo__trial-flow">
              导入播客 / PDF → AI 筛选候选 → 你确认后进入资产库
            </p>
            <p>将在完成私有存储、资料保护与人工确认流程后开放。</p>
          </div>
          <span>规划中</span>
        </div>
      </section>

      <footer className="landing-demo__footer">
        <span>
          <Leaf aria-hidden="true" size={17} weight="fill" /> Speech Asset Lab
        </span>
        <p>为长期学习而设计的英语语流资产工作台。</p>
        <Link href="/lab">
          进入试用工作台 <ArrowRight aria-hidden="true" size={15} weight="bold" />
        </Link>
      </footer>
    </main>
  );
}
