'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FIELD_LABEL } from '@/lib/space/fields';
import type { PortraitResult, Quote } from '@/lib/space/portrait';
import { recommend, type RecommendInput } from '@/lib/space/recommend';
import type { StyleChoice } from '@/lib/space/store';
import { DIMENSIONS, TEST_PAIRS, THEMES, testVariant, type DimensionKey, type StyleVector } from '@/lib/space/themes';
import MiniPreview from './MiniPreview';

/**
 * 风格工作室：画像 → 一分钟风格测试 → 推荐与「为什么像你」。资料太少时走看图选风格。
 * 只收白名单字段：名字、头像、兴趣、画像结果、风格选择。联系方式不进客户端。
 */

export type StudioProps = {
  memberId: string;
  name: string;
  avatarUrl?: string;
  chips: string[];
  fallbackTagline: string;
  humanCount: number;
  /** 人味四项写了多少字 */
  humanChars: number;
  /** 其他资料（正在做、经验、可以提供、作品……）写了多少字 */
  otherChars: number;
  sparse: boolean;
  result: PortraitResult | null;
  saved: StyleChoice | null;
  /** 本人在调风格时亲口说过的偏好，已经加到位置上（tune.feel） */
  feel: Partial<StyleVector>;
  /** 说过的原话，最近的在后 */
  feelNotes: { said: string; dim: DimensionKey; dir: 1 | -1 }[];
};

function QuoteLine({ q }: { q: Quote }) {
  return (
    <span className="st-quote">
      「{q.text}」<em>— {FIELD_LABEL[q.field]}</em>
    </span>
  );
}

export default function StyleStudio(p: StudioProps) {
  const [result, setResult] = useState<PortraitResult | null>(p.result);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState<'portrait' | 'fallback'>(p.saved?.mode ?? (p.sparse ? 'fallback' : 'portrait'));
  const [test, setTest] = useState<Partial<StyleVector>>(p.saved?.test ?? {});
  const [picks, setPicks] = useState<string[]>(p.saved?.picks ?? []);
  const [chosen, setChosen] = useState<string | null>(p.saved?.chosen ?? null);
  const [savedMsg, setSavedMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const tagline = result?.draft.tagline || p.fallbackTagline;
  const rec = useMemo(
    () => recommend({ mode, portrait: result?.portrait ?? null, test, picks, feel: p.feel } satisfies RecommendInput),
    [mode, result, test, picks, p.feel],
  );

  // 测试答案和挑图结果自动存下（不替本人「选定」）：去预览网站时，网站用的是校准后的推荐
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    const timer = setTimeout(() => {
      autosave.current = null;
      fetch(`/api/space/style?id=${p.memberId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 不带 chosen：服务端保留原来的选定。带上的话，这里闭包里的是 600ms 前的旧值，会盖掉刚点的「就选这一套」
        body: JSON.stringify({ mode, test, picks }),
      }).catch(() => { /* 自动保存失败不打扰；点「就选这一套」时会明确提示 */ });
    }, 600);
    autosave.current = timer;
    return () => clearTimeout(timer);
  }, [mode, test, picks]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generate() {
    setBusy(true);
    setErr('');
    try {
      const res = await fetch(`/api/space/portrait?id=${p.memberId}`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      // 画像生成成功、只是缓存没写进去：结果照样给本人看，另外说清楚
      if (json.result) {
        setResult(json.result);
        if (!res.ok) setErr('这次的画像没能存下来，刷新页面后会丢失。');
        return;
      }
      throw new Error(json.error || `HTTP ${res.status}`);
    } catch (e) {
      setErr(`生成失败（${(e as Error).message}），可以再试一次。`);
    } finally {
      setBusy(false);
    }
  }

  const autosave = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function save(themeId: string) {
    if (autosave.current) clearTimeout(autosave.current);
    const prev = chosen;
    setChosen(themeId);
    setSavedMsg('');
    setSaving(true);
    try {
      const res = await fetch(`/api/space/style?id=${p.memberId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, test, picks, chosen: themeId }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setSavedMsg('已选定。网站会默认用这一套。');
    } catch {
      setChosen(prev);
      setSavedMsg('没存上，稍后再试。');
    } finally {
      setSaving(false);
    }
  }

  const answered = TEST_PAIRS.filter(t => typeof test[t.key] === 'number').length;

  return (
    <div className="st">
      <header className="st-head">
        <p className="st-kicker">风格工作室 · v1 预览</p>
        <h1>{p.name} 的个人空间</h1>
        <p className="st-lead">
          风格从你写下的东西里来：先读你注册时的资料形成画像，再用一个很短的测试校准；资料太少时，就看图选。
        </p>
        <a className="st-go" href={`/space/${p.memberId}`}>预览我的网站 →</a>
        <a className="st-go st-go--2" href={`/space/${p.memberId}?tune=1`}>在网站上调风格 →</a>
        <a className="st-go st-go--2" href={`/space/${p.memberId}/manage`}>发布、可见性、活动与收件箱 →</a>
      </header>

      {/* ── 1. 画像 ── */}
      <section className="st-sec">
        <h2><span>1</span>画像</h2>
        {p.sparse ? (
          <div className="st-note">
            你目前写下的资料大约 <b>{p.humanChars + p.otherChars}</b> 字（兴趣、美的时刻、想守护的、种子这四项 {p.humanChars} 字），
            还不太够读出你的风格，所以先看图来定（见第 2 步）。同一个门槛也决定网站的版式：现在「认识我」和「走过的路」合成一章「关于我」；
            多写几句之后，网站会展开成两章、放上 AI 从你写的话里概括的「我在意的」，风格也可以回来重新从画像推荐。
            {result && ' 下面这份画像是用现有资料试出来的，放在这里对比。'}
          </div>
        ) : (
          <p className="st-muted">
            读了你写下的大约 {p.humanChars + p.otherChars} 字资料
            {p.humanCount < 4 && `（兴趣、美的时刻、想守护的、种子这四项填了 ${p.humanCount}/4，补上会读得更准）`}。
          </p>
        )}
        {!result ? (
          <div className="st-empty">
            <p>还没有画像。系统会读你的「正在做、经验、可以提供、兴趣、美的时刻、心里的种子」等资料，每一条判断都附上你的原话。</p>
            <button className="st-btn" onClick={generate} disabled={busy}>
              {busy ? '正在读你写下的东西…（约半分钟）' : '用我的注册资料形成画像'}
            </button>
            {err && <p className="st-err">{err}</p>}
          </div>
        ) : (
          <div className="st-portrait">
            <p className="st-essence">{result.portrait.essence}</p>
            <div className="st-traits">
              {result.portrait.traits.map(t => (
                <div key={t.name} className="st-trait">
                  <b>{t.name}</b>
                  <p>{t.why}</p>
                  <QuoteLine q={t.quote} />
                </div>
              ))}
            </div>
            {result.portrait.uniqueness && (
              <div className="st-unique">
                <b>只有你会这样写的地方</b>
                <p>{result.portrait.uniqueness.text}</p>
                <QuoteLine q={result.portrait.uniqueness.quote} />
              </div>
            )}
            <div className="st-dims">
              {DIMENSIONS.map(d => {
                const a = result.portrait.aesthetic[d.key];
                const f = p.feel[d.key] ?? 0;
                const said = p.feelNotes.filter(n => n.dim === d.key).slice(-2);
                return (
                  <div key={d.key} className="st-dim">
                    <div className="st-dim-row">
                      <span>{d.low}</span>
                      <span className="st-track">
                        <i style={{ left: `${((a.value + 2) / 4) * 100}%` }} />
                        {f !== 0 && (
                          <i className="is-feel" title="加上你说过的偏好之后"
                            style={{ left: `${((Math.max(-2, Math.min(2, a.value + f)) + 2) / 4) * 100}%` }} />
                        )}
                      </span>
                      <span>{d.high}</span>
                    </div>
                    {said.length > 0 && (
                      <span className="st-feel">你后来说过：{said.map(n => `「${n.said}」`).join('')}（空心的点是加上这些之后的位置）</span>
                    )}
                    {a.quote ? <QuoteLine q={a.quote} /> : <span className="st-muted">资料里读不出这一维的倾向</span>}
                    {a.counter && (
                      <span className="st-counter">{a.value === 0 ? '两边都有：' : '另一面：'}<QuoteLine q={a.counter} /></span>
                    )}
                  </div>
                );
              })}
            </div>
            {result.portrait.feelings.length > 0 && (
              <p className="st-muted">别人打开你的网站时，可能会感到：{result.portrait.feelings.join('、')}</p>
            )}
            <p className="st-meta">
              {new Date(result.generatedAt).toLocaleString('zh-CN')} 生成 · {result.model}
              {result.dropped > 0 && ` · 有 ${result.dropped} 条推断在你的资料里找不到原话，已丢弃`}
              {' · '}
              <button className="st-textbtn" onClick={generate} disabled={busy}>{busy ? '生成中…' : '重新生成'}</button>
            </p>
          </div>
        )}
      </section>

      {/* ── 2. 风格：测试 或 看图 ── */}
      <section className="st-sec">
        <h2><span>2</span>{mode === 'portrait' ? '一分钟风格测试' : '看图选风格'}</h2>
        <div className="st-tabs">
          <button className={mode === 'portrait' ? 'is-on' : ''} aria-pressed={mode === 'portrait'} onClick={() => setMode('portrait')} disabled={!result}>
            画像 + 风格测试
          </button>
          <button className={mode === 'fallback' ? 'is-on' : ''} aria-pressed={mode === 'fallback'} onClick={() => setMode('fallback')}>看图选</button>
        </div>

        {mode === 'portrait' ? (
          <>
            <p className="st-muted">四组二选一，每组只差一个地方。凭第一感觉选，{answered}/4。</p>
            {TEST_PAIRS.map((pair, i) => {
              const sides: ('low' | 'high')[] = pair.lowFirst ? ['low', 'high'] : ['high', 'low'];
              return (
                <div key={pair.key} className="st-pair">
                  <p className="st-q">{i + 1}. {pair.question}</p>
                  <div className="st-pair-row">
                    {sides.map(side => {
                      const val = side === 'high' ? 2 : -2;
                      const on = test[pair.key] === val;
                      return (
                        <button key={side} className={`st-pick ${on ? 'is-on' : ''}`} aria-pressed={on}
                          aria-label={`第 ${i + 1} 题，${side === sides[0] ? '左边' : '右边'}一张`}
                          onClick={() => setTest(t => ({ ...t, [pair.key]: val }))}>
                          <MiniPreview tokens={testVariant(pair.key, side)} name={p.name} tagline={tagline}
                            avatarUrl={p.avatarUrl} chips={p.chips} dense={pair.key === 'density' && side === 'high'} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </>
        ) : (
          <>
            <p className="st-muted">挑 2–3 张最像你的。不用想为什么，凭感觉。</p>
            <div className="st-boards">
              {THEMES.map(t => {
                const on = picks.includes(t.id);
                return (
                  <button key={t.id} className={`st-pick ${on ? 'is-on' : ''}`} aria-pressed={on} aria-label={t.name}
                    onClick={() => setPicks(ps => on ? ps.filter(x => x !== t.id) : ps.length >= 3 ? ps : [...ps, t.id])}>
                    <MiniPreview tokens={t.tokens} name={p.name} tagline={tagline} avatarUrl={p.avatarUrl} chips={p.chips} />
                    <span className="st-board-name">{t.name}<small>{t.temperament}</small></span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* ── 3. 推荐 ── */}
      <section className="st-sec">
        <h2><span>3</span>推荐给你的风格</h2>
        {rec.conflicts.map(c => <p key={c} className="st-caveat">{c}</p>)}
        {rec.items.length === 0 ? (
          <p className="st-muted">
            {mode === 'fallback'
              ? (picks.length === 1 ? '再挑一张——一张图只能说明你喜欢它，两张才看得出你的方向。' : '先在上面挑 2–3 张。')
              : '先形成画像。'}
          </p>
        ) : (
          <div className="st-recs">
            {rec.items.map((r, i) => (
              <article key={r.theme.id} className={`st-rec ${chosen === r.theme.id ? 'is-chosen' : ''}`}>
                <MiniPreview tokens={r.theme.tokens} name={p.name} tagline={tagline} avatarUrl={p.avatarUrl} chips={p.chips} />
                <div className="st-rec-body">
                  <p className="st-rec-rank">
                    {i === 0 ? '最像你' : r.tied ? '与上一套并列' : `第 ${i + 1} 选择`}
                    {!rec.noSignal && ` · 契合度 ${r.match}%`}
                  </p>
                  <h3>{r.theme.name}<small>{r.theme.temperament}</small></h3>
                  <p className="st-muted">{r.theme.blurb}</p>
                  {r.reasons.length > 0 && (
                    <ul className="st-why">
                      {r.reasons.map((x, k) => (
                        <li key={k}>{x.quote ? <>{x.text}：<QuoteLine q={x.quote} /></> : x.text}</li>
                      ))}
                    </ul>
                  )}
                  {r.caveat && <p className="st-caveat">{r.caveat}</p>}
                  <div className="st-rec-actions">
                    <a href={`/space/${p.memberId}?theme=${r.theme.id}`}>用它预览我的网站</a>
                    <button className="st-btn" onClick={() => save(r.theme.id)} disabled={saving}>
                      {chosen === r.theme.id ? '已选定' : '就选这一套'}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
        {savedMsg && <p className="st-muted">{savedMsg}</p>}
      </section>
    </div>
  );
}
