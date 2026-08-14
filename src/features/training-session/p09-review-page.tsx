'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Review = {
  status: string;
  question: string | null;
  answers: {
    first: {
      id: string;
      text: string;
      units: Array<{ id: string; sequence: number; text: string }>;
    } | null;
    second: {
      id: string;
      text: string;
      units: Array<{ id: string; sequence: number; text: string }>;
    } | null;
  };
  comparison: {
    id: string;
    factsStatus: string;
    interpretationStatus: string;
    finalDisplayStatus: string;
    firstTotalScore: number | null;
    secondTotalScore: number | null;
    limitations: string[];
    dimensions: Array<{
      id: string;
      label: string;
      firstRating: number | null;
      secondRating: number | null;
      firstStatus: string;
      secondStatus: string;
      changeType: string;
    }>;
    obligations: Array<{
      id: string;
      description: string;
      firstStatus: string;
      secondStatus: string;
      changeType: string;
    }>;
    nodes: Array<{
      id: string;
      text: string;
      firstUsed: boolean;
      secondUsed: boolean;
      changeType: string;
    }>;
    interpretation: {
      observations: Array<{ factId: string; changeType: string; text: string }>;
      limitation: string;
    } | null;
  } | null;
  localTemplate: string;
};

const changeLabels: Record<string, string> = {
  INCREASED: '增加',
  DECREASED: '减少',
  UNCHANGED: '无变化',
  COVERED_NOW: '本次覆盖',
  NO_LONGER_COVERED: '本次未覆盖',
  ADDED: '本次调用',
  REMOVED: '本次未调用',
  NOT_COMPARABLE: '不可比较',
};

const coverageLabels: Record<string, string> = {
  COVERED: '已覆盖',
  PARTIAL: '部分覆盖',
  NOT_COVERED: '未覆盖',
  NOT_EVALUABLE: '未生成',
};

export function P09ReviewPage({ sessionId }: { sessionId: string }) {
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void fetch(`/api/training/sessions/${encodeURIComponent(sessionId)}/review`)
      .then(async (response) => {
        const result = (await response.json()) as { review?: Review; error?: string };
        if (!response.ok || !result.review) throw new Error(result.error ?? '无法读取本地复盘。');
        if (active) setReview(result.review);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : '无法读取本地复盘。');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sessionId]);

  if (isLoading) {
    return (
      <main className="page page--with-back-link review-page">
        <Link className="page-back-link" href={`/practice/${sessionId}`}>
          ← 返回问题回答
        </Link>
        <p className="review-page__status">正在读取本地复盘。</p>
      </main>
    );
  }
  if (!review) {
    return (
      <main className="page page--with-back-link review-page">
        <Link className="page-back-link" href={`/practice/${sessionId}`}>
          ← 返回问题回答
        </Link>
        <p className="review-page__error">{error || '本地复盘不可用。'}</p>
      </main>
    );
  }

  return (
    <main className="page page--with-back-link review-page">
      <Link className="page-back-link" href={`/practice/${sessionId}`}>
        ← 返回问题回答
      </Link>
      <header className="page-heading">
        <p className="page-heading__eyebrow">P09 / LOCAL REVIEW</p>
        <h1>回答复盘</h1>
        <p>只比较同一会话中已经保存的两次文字回答；本页不会改写回答、资产调用或总分。</p>
      </header>

      <section className="review-page__summary" aria-label="复盘状态">
        <p className="training-session__serial">{review.status}</p>
        <h2>{review.question ?? '已冻结问题'}</h2>
        <p>{review.localTemplate}</p>
      </section>

      <section className="review-page__answers" aria-label="两次已保存回答">
        <AnswerCard answer={review.answers.first} title="第一次回答" />
        <AnswerCard answer={review.answers.second} title="第二次回答" />
      </section>

      {!review.comparison ? (
        <section className="review-page__notice">
          <h2>暂不可比较</h2>
          <p>完成同一会话的第二次回答后，系统才会建立本地比较事实。</p>
        </section>
      ) : (
        <ReviewFacts comparison={review.comparison} />
      )}
    </main>
  );
}

function AnswerCard({ answer, title }: { answer: Review['answers']['first']; title: string }) {
  return (
    <article className="review-page__answer-card">
      <p className="training-session__serial">SAVED TEXT</p>
      <h2>{title}</h2>
      <p>{answer?.text ?? '尚未保存'}</p>
      {answer && (
        <p className="review-page__units">
          本地分段：{answer.units.map((unit) => unit.text).join(' / ')}
        </p>
      )}
    </article>
  );
}

function ReviewFacts({ comparison }: { comparison: NonNullable<Review['comparison']> }) {
  const hasDraft = comparison.interpretation?.observations.length;
  return (
    <div className="review-page__facts">
      <section className="review-page__score-card">
        <p className="training-session__serial">LOCAL EVALUATION</p>
        <h2>总分</h2>
        <dl>
          <div>
            <dt>第一次</dt>
            <dd>{displayScore(comparison.firstTotalScore)}</dd>
          </div>
          <div>
            <dt>第二次</dt>
            <dd>{displayScore(comparison.secondTotalScore)}</dd>
          </div>
        </dl>
        <p>仅在六项维度均有效时展示本地总分；否则保持“未生成”。</p>
      </section>

      <section className="review-page__fact-card">
        <h2>六维本地比较</h2>
        <FactTable>
          <thead>
            <tr>
              <th>维度</th>
              <th>第一次</th>
              <th>第二次</th>
              <th>变化</th>
            </tr>
          </thead>
          <tbody>
            {comparison.dimensions.map((dimension) => (
              <tr key={dimension.id}>
                <td>{dimension.label}</td>
                <td>{displayRating(dimension.firstRating, dimension.firstStatus)}</td>
                <td>{displayRating(dimension.secondRating, dimension.secondStatus)}</td>
                <td>{changeLabel(dimension.changeType)}</td>
              </tr>
            ))}
          </tbody>
        </FactTable>
      </section>

      <section className="review-page__fact-card">
        <h2>问题义务变化</h2>
        <FactTable>
          <thead>
            <tr>
              <th>义务</th>
              <th>第一次</th>
              <th>第二次</th>
              <th>变化</th>
            </tr>
          </thead>
          <tbody>
            {comparison.obligations.map((obligation) => (
              <tr key={obligation.id}>
                <td>{obligation.description}</td>
                <td>{coverageLabel(obligation.firstStatus)}</td>
                <td>{coverageLabel(obligation.secondStatus)}</td>
                <td>{changeLabel(obligation.changeType)}</td>
              </tr>
            ))}
          </tbody>
        </FactTable>
      </section>

      <section className="review-page__fact-card">
        <h2>资产节点调用变化</h2>
        <FactTable>
          <thead>
            <tr>
              <th>节点</th>
              <th>第一次</th>
              <th>第二次</th>
              <th>变化</th>
            </tr>
          </thead>
          <tbody>
            {comparison.nodes.map((node) => (
              <tr key={node.id}>
                <td>{node.text}</td>
                <td>{node.firstUsed ? '已调用' : '未调用'}</td>
                <td>{node.secondUsed ? '已调用' : '未调用'}</td>
                <td>{changeLabel(node.changeType)}</td>
              </tr>
            ))}
          </tbody>
        </FactTable>
      </section>

      <section className="review-page__notice">
        <h2>{hasDraft ? 'R7C 草稿解释' : '本地模板'}</h2>
        {hasDraft ? (
          <>
            <ul>
              {comparison.interpretation?.observations.map((observation) => (
                <li key={observation.factId}>{observation.text}</li>
              ))}
            </ul>
            <p>{comparison.interpretation?.limitation}</p>
          </>
        ) : (
          <p>R7C 草稿暂不可用。本页保留已冻结的本地事实，不补写对比结论。</p>
        )}
        {comparison.limitations.length > 0 && (
          <ul className="review-page__limitations">
            {comparison.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FactTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="review-page__table-wrap">
      <table>{children}</table>
    </div>
  );
}

function displayScore(score: number | null) {
  return score === null ? '未生成' : score;
}

function displayRating(rating: number | null, status: string) {
  return rating === null ? coverageLabel(status) : rating;
}

function changeLabel(value: string) {
  return changeLabels[value] ?? value;
}

function coverageLabel(value: string) {
  return coverageLabels[value] ?? (value === 'VALID' ? '有效' : value);
}
