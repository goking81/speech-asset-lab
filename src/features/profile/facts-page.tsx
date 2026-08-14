'use client';
import { useEffect, useState } from 'react';
type Fact = { id: string; text: string; status: string };
export function FactsPage() {
  const [facts, setFacts] = useState<Fact[]>([]);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const load = async () => {
    const r = await fetch('/api/facts');
    setFacts(((await r.json()) as { facts: Fact[] }).facts);
  };
  useEffect(() => {
    void fetch('/api/facts').then(async (response) => {
      setFacts(((await response.json()) as { facts: Fact[] }).facts);
    });
  }, []);
  const save = async (action: 'CREATE' | 'CONFIRM', id?: string) => {
    const r = await fetch('/api/facts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, id, text }),
    });
    if (!r.ok) {
      setStatus('保存失败。');
      return;
    }
    setText('');
    setStatus(action === 'CONFIRM' ? '事实已确认，可用于 R3。' : '事实草稿已保存。');
    await load();
  };
  return (
    <main className="page candidate-review">
      <header className="page-heading">
        <p className="page-heading__eyebrow">PROFILE / CONFIRMED FACTS</p>
        <h1>关于我</h1>
        <p>只维护你亲自确认的事实；AI 不会创建或确认这些记录。</p>
      </header>
      <section className="candidate-review__form">
        <label>
          新增个人事实
          <textarea
            aria-label="新增个人事实"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <button disabled={!text.trim()} onClick={() => void save('CREATE')} type="button">
          保存事实草稿
        </button>
        <p className="candidate-review__status">{status}</p>
        {facts.map((f) => (
          <article className="candidate-review__item" key={f.id}>
            <p>
              {f.text} · {f.status}
            </p>
            {f.status === 'DRAFT' && (
              <button onClick={() => void save('CONFIRM', f.id)} type="button">
                确认事实
              </button>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}
