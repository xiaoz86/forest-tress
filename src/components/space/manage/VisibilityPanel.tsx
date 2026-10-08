'use client';

import { useState } from 'react';
import { AUDIENCES, VISIBILITY_ITEMS, type Audience, type VisibilityKey } from '@/lib/space/types';

/**
 * 逐项可见性（v2 §7.4）：四个板块、两项联系方式，各自选「谁能看到」。
 * 另外两个开关：站内打招呼、服务预约开不开。
 * 每次改动立即保存；失败就退回原来的选择并说明。
 */
export default function VisibilityPanel({ memberId, initial }: {
  memberId: string;
  initial: { visibility: Record<VisibilityKey, Audience>; greetingsOpen: boolean; bookingsOpen: boolean };
}) {
  const [vis, setVis] = useState(initial.visibility);
  const [greetingsOpen, setGreetingsOpen] = useState(initial.greetingsOpen);
  const [bookingsOpen, setBookingsOpen] = useState(initial.bookingsOpen);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(patch: Record<string, unknown>, undo: () => void) {
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch(`/api/space/settings?id=${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setMsg('已保存');
    } catch (e) {
      undo();
      setMsg(`没存上（${(e as Error).message}），刷新后再试一次。`);
    } finally {
      setBusy(false);
    }
  }

  function choose(key: VisibilityKey, a: Audience) {
    const prev = vis[key];
    if (prev === a) return;
    setVis(v => ({ ...v, [key]: a }));
    save({ visibility: { [key]: a } }, () => setVis(v => ({ ...v, [key]: prev })));
  }

  const groups: { title: string; hint: string; group: 'section' | 'contact' }[] = [
    { title: '板块', hint: '看不到的板块，对那位访客来说整章不出现，页面上不会留空位。', group: 'section' },
    { title: '联系方式', hint: '看不到时，页面底部会告诉对方怎样才能看到（加入附近森林，或扫你的名片）。', group: 'contact' },
  ];

  return (
    <div className="mg-vis">
      {groups.map(g => (
        <section key={g.group} className="mg-card">
          <h3>{g.title}</h3>
          <p className="mg-hint">{g.hint}</p>
          {VISIBILITY_ITEMS.filter(x => x.group === g.group).map(item => (
            <fieldset key={item.key} className="mg-row" disabled={busy}>
              <legend>{item.label}</legend>
              <div className="mg-seg" role="radiogroup" aria-label={item.label}>
                {AUDIENCES.map(a => (
                  <label key={a.value} className={vis[item.key] === a.value ? 'is-on' : ''} title={a.hint}>
                    <input type="radio" name={`vis-${item.key}`} value={a.value}
                      checked={vis[item.key] === a.value} onChange={() => choose(item.key, a.value)} />
                    {a.label}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </section>
      ))}

      <section className="mg-card">
        <h3>互动</h3>
        <label className="mg-switch">
          <input type="checkbox" checked={greetingsOpen} disabled={busy} onChange={e => {
            const v = e.target.checked;
            setGreetingsOpen(v);
            save({ greetingsOpen: v }, () => setGreetingsOpen(!v));
          }} />
          <span>开放站内「打个招呼」<small>关掉之后，页面底部会写「暂时没有开放站内打招呼」</small></span>
        </label>
        <label className="mg-switch">
          <input type="checkbox" checked={bookingsOpen} disabled={busy} onChange={e => {
            const v = e.target.checked;
            setBookingsOpen(v);
            save({ bookingsOpen: v }, () => setBookingsOpen(!v));
          }} />
          <span>开放服务预约<small>关掉之后，服务单每一行只剩「问问这个」</small></span>
        </label>
      </section>

      <section className="mg-card">
        <h3>用别人的身份看看</h3>
        <p className="mg-hint">设置完，用这几种身份打开自己的空间，看看对方到底能看到什么。</p>
        <p className="mg-links">
          <a href={`/space/${memberId}?as=visitor`}>陌生访客</a>
          <a href={`/space/${memberId}?as=card`}>扫过名片的人</a>
          <a href={`/space/${memberId}?as=member`}>森林成员</a>
        </p>
      </section>
      <p className="mg-msg" aria-live="polite">{msg}</p>
    </div>
  );
}
