'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, type ReactNode } from 'react';
import {
  CHAPTER_LABEL, LEARNING_KIND_LABEL, LIMITS_EDIT,
  type BlockMark, type ChapterKey, type DraftBlock, type LearningItem, type LearningKind, type ServiceFormat,
  type ServiceItem, type ValueEntry,
} from '@/lib/space/edits';
import type { WorkKind } from '@/lib/space/portrait';
import './edit.css';

/**
 * 个人空间的「编辑模式」：在自己的网站上直接改（v2 §7.2 最后一切可改；重新生成不覆盖手动修改）。
 *
 * - AI 起稿的块：就这样 / 我来改 / 不要 / 再给我两个版本
 * - 只属于网站的内容：服务单细节、章节顺序、首屏照片焦点、最近在读在听、一个生命故事
 * - 本人写的原话（正在做、经历、兴趣……）：v1 去资料页改（原话存在线上数据库，本地开发不写）
 *
 * 改动都存进本地的编辑记录（/api/space/edits），存好后刷新页面，由服务端重新渲染。
 */

async function save(memberId: string, body: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch(`/api/space/edits?id=${encodeURIComponent(memberId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return null;
    const d = await res.json().catch(() => ({}));
    return d.message || '没有存上，过一会再试一次';
  } catch {
    return '网络好像断了，检查一下再试';
  }
}

async function rewrite(memberId: string, body: Record<string, unknown>): Promise<{ list: { text: string; quote: string | null }[]; err: string | null }> {
  try {
    const res = await fetch(`/api/space/rewrite?id=${encodeURIComponent(memberId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return { list: [], err: d.message || 'AI 暂时没有回应，过一会再试' };
    return { list: d.candidates || [], err: null };
  } catch {
    return { list: [], err: '网络好像断了，检查一下再试' };
  }
}

function useSaver(memberId: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function run(body: Record<string, unknown>, after?: () => void) {
    setBusy(true);
    setErr('');
    const e = await save(memberId, body);
    setBusy(false);
    if (e) return setErr(e);
    after?.();
    router.refresh();
  }
  return { busy, err, setErr, run };
}

const MARK_TEXT: Record<BlockMark, string> = {
  ai: 'AI 起稿 · 待你确认',
  confirmed: '已确认',
  edited: '我改过的',
  hidden: '已隐藏，访客看不到',
  none: '',
};

// ─────────────── 通用外壳 ───────────────

function Shell({ label, mark, busy, err, editing, onEdit, onConfirm, onHide, onReset, children }: {
  label: string; mark: BlockMark; busy: boolean; err: string; editing: boolean;
  onEdit: () => void; onConfirm: () => void; onHide: () => void; onReset: () => void; children?: ReactNode;
}) {
  return (
    <div className="ek" data-mark={mark} data-editing={editing ? '' : undefined}>
      <div className="ek-bar">
        <span className="ek-label">{label}</span>
        {mark !== 'none' && <span className="ek-state" data-mark={mark}>{MARK_TEXT[mark]}</span>}
        <span className="ek-acts">
          {mark === 'ai' && <button type="button" className="ek-btn is-main" disabled={busy} onClick={onConfirm}>就这样</button>}
          {mark !== 'hidden' && !editing && (
            <button type="button" className="ek-btn" disabled={busy} onClick={onEdit}>{mark === 'none' ? '写一个' : mark === 'ai' ? '我来改' : '改'}</button>
          )}
          {(mark === 'ai' || mark === 'confirmed' || mark === 'edited') && (
            <button type="button" className="ek-btn" disabled={busy} onClick={onHide}>不要</button>
          )}
          {(mark === 'confirmed' || mark === 'edited' || mark === 'hidden') && (
            <button type="button" className="ek-btn is-quiet" disabled={busy} onClick={onReset}>恢复成 AI 起稿</button>
          )}
        </span>
      </div>
      {err && <p className="ek-err" role="alert">{err}</p>}
      {editing && children}
    </div>
  );
}

function Candidates({ list, onPick }: { list: { text: string; quote: string | null }[]; onPick: (c: { text: string; quote: string | null }) => void }) {
  if (!list.length) return null;
  return (
    <ul className="ek-cands" aria-label="AI 给的两个版本">
      {list.map(c => (
        <li key={c.text}>
          <button type="button" onClick={() => onPick(c)}>
            <span>{c.text}</span>
            {c.quote && <small>——你写过：「{c.quote}」</small>}
            <em>用这个</em>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ─────────────── 一句话介绍 ───────────────

export function TaglineEditor({ memberId, mark, value }: { memberId: string; mark: BlockMark; value: string }) {
  const s = useSaver(memberId);
  const uid = useId();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const [cands, setCands] = useState<{ text: string; quote: string | null }[]>([]);
  const [asking, setAsking] = useState(false);

  async function more() {
    setAsking(true);
    s.setErr('');
    const r = await rewrite(memberId, { block: 'tagline', current: text });
    setAsking(false);
    if (r.err) return s.setErr(r.err);
    setCands(r.list);
  }

  return (
    <Shell label="一句话介绍" mark={mark} busy={s.busy} err={s.err} editing={editing}
      onEdit={() => { setText(value); setEditing(true); }}
      onConfirm={() => s.run({ op: 'confirm', block: 'tagline' })}
      onHide={() => s.run({ op: 'hide', block: 'tagline' })}
      onReset={() => s.run({ op: 'reset', block: 'tagline' })}>
      <div className="ek-form">
        <label htmlFor={`${uid}-t`}>写一句你自己的话（{LIMITS_EDIT.tagline} 字以内）</label>
        <input id={`${uid}-t`} value={text} maxLength={LIMITS_EDIT.tagline} onChange={e => setText(e.target.value)} />
        <Candidates list={cands} onPick={c => { setText(c.text); setCands([]); }} />
        <div className="ek-row">
          <button type="button" className="ek-btn is-main" disabled={s.busy || !text.trim()}
            onClick={() => s.run({ op: 'set', block: 'tagline', value: text }, () => setEditing(false))}>存好</button>
          <button type="button" className="ek-btn" disabled={asking} onClick={more}>{asking ? 'AI 在想…' : '再给我两个版本'}</button>
          <button type="button" className="ek-btn is-quiet" onClick={() => setEditing(false)}>算了</button>
        </div>
      </div>
    </Shell>
  );
}

// ─────────────── 身份标签 ───────────────

export function RolesEditor({ memberId, mark, value }: { memberId: string; mark: BlockMark; value: string[] }) {
  const s = useSaver(memberId);
  const uid = useId();
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<string[]>(value.length ? value : ['']);

  return (
    <Shell label="身份标签" mark={mark} busy={s.busy} err={s.err} editing={editing}
      onEdit={() => { setItems(value.length ? value : ['']); setEditing(true); }}
      onConfirm={() => s.run({ op: 'confirm', block: 'roles' })}
      onHide={() => s.run({ op: 'hide', block: 'roles' })}
      onReset={() => s.run({ op: 'reset', block: 'roles' })}>
      <div className="ek-form">
        <p className="ek-hint">首屏上用「 / 」连成一行，最多显示 4 个。每个 {LIMITS_EDIT.role} 字以内。</p>
        {items.map((r, i) => (
          <div className="ek-row" key={i}>
            <input aria-label={`身份 ${i + 1}`} id={`${uid}-${i}`} value={r} maxLength={LIMITS_EDIT.role}
              onChange={e => setItems(xs => xs.map((x, k) => (k === i ? e.target.value : x)))} />
            <button type="button" className="ek-btn is-quiet" onClick={() => setItems(xs => xs.filter((_, k) => k !== i))}>删</button>
          </div>
        ))}
        {items.length < LIMITS_EDIT.roles && <button type="button" className="ek-add" onClick={() => setItems(xs => [...xs, ''])}>＋ 加一个身份</button>}
        <div className="ek-row">
          <button type="button" className="ek-btn is-main" disabled={s.busy}
            onClick={() => s.run({ op: 'set', block: 'roles', value: items }, () => setEditing(false))}>存好</button>
          <button type="button" className="ek-btn is-quiet" onClick={() => setEditing(false)}>算了</button>
        </div>
      </div>
    </Shell>
  );
}

// ─────────────── 我在意的 ───────────────

export function ValuesEditor({ memberId, mark, value }: { memberId: string; mark: BlockMark; value: ValueEntry[] }) {
  const s = useSaver(memberId);
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<ValueEntry[]>(value.length ? value : [{ text: '', quote: null }]);
  const [cands, setCands] = useState<{ i: number; list: { text: string; quote: string | null }[] } | null>(null);
  const [asking, setAsking] = useState<number | null>(null);

  async function more(i: number) {
    setAsking(i);
    s.setErr('');
    const r = await rewrite(memberId, { block: 'value', current: items[i]?.text || '' });
    setAsking(null);
    if (r.err) return s.setErr(r.err);
    setCands({ i, list: r.list });
  }

  return (
    <Shell label="我在意的" mark={mark} busy={s.busy} err={s.err} editing={editing}
      onEdit={() => { setItems(value.length ? value : [{ text: '', quote: null }]); setEditing(true); }}
      onConfirm={() => s.run({ op: 'confirm', block: 'values' })}
      onHide={() => s.run({ op: 'hide', block: 'values' })}
      onReset={() => s.run({ op: 'reset', block: 'values' })}>
      <div className="ek-form">
        <p className="ek-hint">每条一件你在意的事，{LIMITS_EDIT.value} 字以内。AI 给的版本会带一句你写过的原话。</p>
        {items.map((v, i) => (
          <div key={i} className="ek-item">
            <div className="ek-row">
              <input aria-label={`第 ${i + 1} 条`} value={v.text} maxLength={LIMITS_EDIT.value}
                onChange={e => setItems(xs => xs.map((x, k) => (k === i ? { text: e.target.value, quote: null } : x)))} />
              <button type="button" className="ek-btn" disabled={asking !== null} onClick={() => more(i)}>
                {asking === i ? 'AI 在想…' : '换两个说法'}
              </button>
              <button type="button" className="ek-btn is-quiet" onClick={() => setItems(xs => xs.filter((_, k) => k !== i))}>删</button>
            </div>
            {v.quote && <small className="ek-quote">——你写过：「{v.quote}」</small>}
            {cands?.i === i && (
              <Candidates list={cands.list} onPick={c => { setItems(xs => xs.map((x, k) => (k === i ? c : x))); setCands(null); }} />
            )}
          </div>
        ))}
        {items.length < LIMITS_EDIT.values && <button type="button" className="ek-add" onClick={() => setItems(xs => [...xs, { text: '', quote: null }])}>＋ 加一条</button>}
        <div className="ek-row">
          <button type="button" className="ek-btn is-main" disabled={s.busy}
            onClick={() => s.run({ op: 'set', block: 'values', value: items }, () => setEditing(false))}>存好</button>
          <button type="button" className="ek-btn is-quiet" onClick={() => setEditing(false)}>算了</button>
        </div>
      </div>
    </Shell>
  );
}

// ─────────────── 服务单 ───────────────

const FORMATS: ServiceFormat[] = ['未说明', '线上', '线下', '线上线下'];
const blankService = (): ServiceItem => ({
  id: Math.random().toString(36).slice(2, 10), title: '', desc: '', format: '未说明', duration: '', availability: '', price: '', showPrice: false,
});

export function ServicesEditor({ memberId, mark, value }: { memberId: string; mark: BlockMark; value: ServiceItem[] }) {
  const s = useSaver(memberId);
  const uid = useId();
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<ServiceItem[]>(value);
  const [cands, setCands] = useState<{ i: number; list: { text: string; quote: string | null }[] } | null>(null);
  const [asking, setAsking] = useState<number | null>(null);
  const setField = <K extends keyof ServiceItem>(i: number, k: K, v: ServiceItem[K]) =>
    setItems(xs => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const move = (i: number, d: -1 | 1) => setItems(xs => {
    const j = i + d;
    if (j < 0 || j >= xs.length) return xs;
    const out = [...xs];
    [out[i], out[j]] = [out[j], out[i]];
    return out;
  });

  async function more(i: number) {
    setAsking(i);
    s.setErr('');
    const r = await rewrite(memberId, { block: 'service', current: items[i]?.desc || '', context: items[i]?.title || '' });
    setAsking(null);
    if (r.err) return s.setErr(r.err);
    setCands({ i, list: r.list });
  }

  return (
    <Shell label="服务单" mark={mark} busy={s.busy} err={s.err} editing={editing}
      onEdit={() => { setItems(value.length ? value : [blankService()]); setEditing(true); }}
      onConfirm={() => s.run({ op: 'confirm', block: 'services' })}
      onHide={() => s.run({ op: 'hide', block: 'services' })}
      onReset={() => s.run({ op: 'reset', block: 'services' })}>
      <div className="ek-form">
        <p className="ek-hint">补上形式、时长、一般什么时候能约，访客预约时心里有数。价格默认不公开，勾上才显示。</p>
        {items.map((it, i) => (
          <fieldset key={it.id} className="ek-svc">
            <legend>第 {i + 1} 项</legend>
            <label htmlFor={`${uid}-${i}-t`}>名字</label>
            <input id={`${uid}-${i}-t`} value={it.title} maxLength={LIMITS_EDIT.serviceTitle} onChange={e => setField(i, 'title', e.target.value)} />
            <label htmlFor={`${uid}-${i}-d`}>介绍（给谁的、做什么）</label>
            <textarea id={`${uid}-${i}-d`} rows={2} value={it.desc} maxLength={LIMITS_EDIT.serviceDesc} onChange={e => setField(i, 'desc', e.target.value)} />
            {cands?.i === i && <Candidates list={cands.list} onPick={c => { setField(i, 'desc', c.text); setCands(null); }} />}
            <div className="ek-grid">
              <label>形式
                <select value={it.format} onChange={e => setField(i, 'format', e.target.value as ServiceFormat)}>
                  {FORMATS.map(f => <option key={f} value={f}>{f === '未说明' ? '不写' : f}</option>)}
                </select>
              </label>
              <label>时长<input value={it.duration} maxLength={LIMITS_EDIT.serviceShort} placeholder="60 分钟" onChange={e => setField(i, 'duration', e.target.value)} /></label>
              <label>什么时候能约<input value={it.availability} maxLength={LIMITS_EDIT.serviceShort} placeholder="周末下午" onChange={e => setField(i, 'availability', e.target.value)} /></label>
              <label>价格<input value={it.price} maxLength={LIMITS_EDIT.serviceShort} placeholder="¥300 / 次" onChange={e => setField(i, 'price', e.target.value)} /></label>
            </div>
            <label className="ek-check"><input type="checkbox" checked={it.showPrice} onChange={e => setField(i, 'showPrice', e.target.checked)} />在网站上显示价格</label>
            <div className="ek-row">
              <button type="button" className="ek-btn" disabled={asking !== null || !it.title.trim()} onClick={() => more(i)}>{asking === i ? 'AI 在想…' : '介绍换两个说法'}</button>
              <button type="button" className="ek-btn is-quiet" disabled={i === 0} onClick={() => move(i, -1)}>上移</button>
              <button type="button" className="ek-btn is-quiet" disabled={i === items.length - 1} onClick={() => move(i, 1)}>下移</button>
              <button type="button" className="ek-btn is-quiet" onClick={() => setItems(xs => xs.filter((_, j) => j !== i))}>删掉这项</button>
            </div>
          </fieldset>
        ))}
        {items.length < LIMITS_EDIT.services && <button type="button" className="ek-add" onClick={() => setItems(xs => [...xs, blankService()])}>＋ 加一项服务</button>}
        <div className="ek-row">
          <button type="button" className="ek-btn is-main" disabled={s.busy}
            onClick={() => s.run({ op: 'set', block: 'services', value: items }, () => setEditing(false))}>存好</button>
          <button type="button" className="ek-btn is-quiet" onClick={() => setEditing(false)}>算了</button>
        </div>
      </div>
    </Shell>
  );
}

// ─────────────── 作品分组 ───────────────

const KIND_LABEL: Record<WorkKind, string> = {
  work: '作品与项目（走过的路）',
  content: '在别处的我（走过的路）',
  service: '长期在做的（一起做点什么）',
  activity: '活动（一起做点什么）',
};

export function WorksEditor({ memberId, mark, works, split }: {
  memberId: string; mark: BlockMark; works: { id: string; title: string }[]; split: Record<string, WorkKind>;
}) {
  const s = useSaver(memberId);
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState<Record<string, WorkKind>>(split);
  if (!works.length) return null;
  return (
    <Shell label="作品分组" mark={mark} busy={s.busy} err={s.err} editing={editing}
      onEdit={() => { setV(split); setEditing(true); }}
      onConfirm={() => s.run({ op: 'confirm', block: 'works' })}
      onHide={() => s.run({ op: 'hide', block: 'works' })}
      onReset={() => s.run({ op: 'reset', block: 'works' })}>
      <div className="ek-form">
        <p className="ek-hint">每件作品放在哪一组。作品本身（标题、图片、介绍）在资料页的「作品」里改。</p>
        {works.map(w => (
          <label key={w.id} className="ek-work">
            <span>{w.title}</span>
            <select value={v[w.id] ?? 'work'} onChange={e => setV(x => ({ ...x, [w.id]: e.target.value as WorkKind }))}>
              {(Object.keys(KIND_LABEL) as WorkKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </label>
        ))}
        <div className="ek-row">
          <button type="button" className="ek-btn is-main" disabled={s.busy}
            onClick={() => s.run({ op: 'set', block: 'works', value: v }, () => setEditing(false))}>存好</button>
          <button type="button" className="ek-btn is-quiet" onClick={() => setEditing(false)}>算了</button>
        </div>
      </div>
    </Shell>
  );
}

// ─────────────── 本人的原话：去资料页改 ───────────────

export function OriginalLink({ memberId, what }: { memberId: string; what: string }) {
  return (
    <p className="ek-orig">
      <span>{what}是你自己写的原话</span>
      <a href={`/creators/${memberId}`} target="_blank" rel="noreferrer">去资料页改 →</a>
    </p>
  );
}

// ─────────────── 首屏照片焦点 ───────────────

export function CoverFocus({ memberId, src, focus }: { memberId: string; src: string; focus: { x: number; y: number } | null }) {
  const s = useSaver(memberId);
  const [open, setOpen] = useState(false);
  const [pt, setPt] = useState(focus ?? { x: 50, y: 50 });
  return (
    <div className="ek ek-cover">
      <div className="ek-bar">
        <span className="ek-label">照片焦点</span>
        <span className="ek-state" data-mark={focus ? 'edited' : 'none'}>{focus ? '设过了' : '现在按照片正中裁切'}</span>
        <span className="ek-acts">
          <button type="button" className="ek-btn" onClick={() => setOpen(o => !o)}>{open ? '收起' : '点一下照片里的你'}</button>
        </span>
      </div>
      {s.err && <p className="ek-err">{s.err}</p>}
      {open && (
        <div className="ek-form">
          <p className="ek-hint">在整张照片上点一下最重要的地方（通常是你）。手机上只露出照片的一部分，裁切会围着这一点。</p>
          <button type="button" className="ek-focus" aria-label="在照片上点选焦点"
            onClick={e => {
              const r = e.currentTarget.getBoundingClientRect();
              setPt({ x: Math.round(((e.clientX - r.left) / r.width) * 100), y: Math.round(((e.clientY - r.top) / r.height) * 100) });
            }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- 要完整显示原图比例，不裁切 */}
            <img src={src} alt="" />
            <i style={{ left: `${pt.x}%`, top: `${pt.y}%` }} aria-hidden />
          </button>
          <div className="ek-row">
            <button type="button" className="ek-btn is-main" disabled={s.busy} onClick={() => s.run({ op: 'cover', x: pt.x, y: pt.y }, () => setOpen(false))}>用这个位置</button>
            <button type="button" className="ek-btn is-quiet" onClick={() => setOpen(false)}>算了</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────── 章节顺序 ───────────────

export function OrderEditor({ memberId, order }: { memberId: string; order: ChapterKey[] }) {
  const s = useSaver(memberId);
  const [v, setV] = useState(order);
  const move = (i: number, d: -1 | 1) => setV(xs => {
    const j = i + d;
    if (j < 0 || j >= xs.length) return xs;
    const out = [...xs];
    [out[i], out[j]] = [out[j], out[i]];
    return out;
  });
  const changed = v.join() !== order.join();
  return (
    <div className="ek ek-order">
      <div className="ek-bar">
        <span className="ek-label">章节顺序</span>
        <span className="ek-hint-inline">「心里的种子」和底部的打招呼永远在最后。想整章隐藏，去管理页「谁能看到」选「仅自己」。</span>
      </div>
      <ol className="ek-orderlist">
        {v.map((k, i) => (
          <li key={k}>
            <span>{CHAPTER_LABEL[k]}</span>
            <button type="button" className="ek-btn is-quiet" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${CHAPTER_LABEL[k]} 上移`}>↑</button>
            <button type="button" className="ek-btn is-quiet" disabled={i === v.length - 1} onClick={() => move(i, 1)} aria-label={`${CHAPTER_LABEL[k]} 下移`}>↓</button>
          </li>
        ))}
      </ol>
      {v[0] === 'offer' && <p className="ek-hint">提醒：调研里大家更想先认识这个人，服务放在中后部更自然（v2 §0.3）。</p>}
      {s.err && <p className="ek-err">{s.err}</p>}
      {changed && (
        <div className="ek-row">
          <button type="button" className="ek-btn is-main" disabled={s.busy} onClick={() => s.run({ op: 'order', value: v })}>存好</button>
          <button type="button" className="ek-btn is-quiet" onClick={() => setV(order)}>算了</button>
        </div>
      )}
    </div>
  );
}

// ─────────────── 最近在读 / 在听 / 在学 ───────────────

const blankLearning = (): LearningItem => ({ id: Math.random().toString(36).slice(2, 10), kind: 'read', title: '', note: '', url: '' });

export function LearningEditor({ memberId, value }: { memberId: string; value: LearningItem[] }) {
  const s = useSaver(memberId);
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<LearningItem[]>(value);
  const setField = <K extends keyof LearningItem>(i: number, k: K, v: LearningItem[K]) =>
    setItems(xs => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <div className="ek" data-mark={value.length ? 'edited' : 'none'}>
      <div className="ek-bar">
        <span className="ek-label">最近在读、在听、在学</span>
        <span className="ek-acts">
          {!editing && <button type="button" className="ek-btn" onClick={() => { setItems(value.length ? value : [blankLearning()]); setEditing(true); }}>{value.length ? '改' : '写几条'}</button>}
        </span>
      </div>
      {s.err && <p className="ek-err">{s.err}</p>}
      {editing && (
        <div className="ek-form">
          <p className="ek-hint">一本书、一档播客、一门课——一句话说说为什么，可以贴链接。</p>
          {items.map((it, i) => (
            <div key={it.id} className="ek-learn">
              <select aria-label="类型" value={it.kind} onChange={e => setField(i, 'kind', e.target.value as LearningKind)}>
                {(Object.keys(LEARNING_KIND_LABEL) as LearningKind[]).map(k => <option key={k} value={k}>{LEARNING_KIND_LABEL[k]}</option>)}
              </select>
              <input aria-label="名字" placeholder="《被讨厌的勇气》" value={it.title} maxLength={LIMITS_EDIT.learningTitle} onChange={e => setField(i, 'title', e.target.value)} />
              <input aria-label="一句话" placeholder="为什么在读它（可以不写）" value={it.note} maxLength={LIMITS_EDIT.learningNote} onChange={e => setField(i, 'note', e.target.value)} />
              <input aria-label="链接" placeholder="https://（可以不填）" value={it.url} onChange={e => setField(i, 'url', e.target.value)} inputMode="url" />
              <button type="button" className="ek-btn is-quiet" onClick={() => setItems(xs => xs.filter((_, j) => j !== i))}>删</button>
            </div>
          ))}
          {items.length < LIMITS_EDIT.learning && <button type="button" className="ek-add" onClick={() => setItems(xs => [...xs, blankLearning()])}>＋ 再加一条</button>}
          <div className="ek-row">
            <button type="button" className="ek-btn is-main" disabled={s.busy} onClick={() => s.run({ op: 'learning', value: items }, () => setEditing(false))}>存好</button>
            <button type="button" className="ek-btn is-quiet" onClick={() => setEditing(false)}>算了</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────── 一个生命故事 ───────────────

export function StoryEditor({ memberId, value }: { memberId: string; value: string }) {
  const s = useSaver(memberId);
  const uid = useId();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  return (
    <div className="ek" data-mark={value ? 'edited' : 'none'}>
      <div className="ek-bar">
        <span className="ek-label">一个对我很重要的故事</span>
        <span className="ek-hint-inline">和「心里的种子」放在同一页，谁能看到也跟种子一样</span>
        <span className="ek-acts">
          {!editing && <button type="button" className="ek-btn" onClick={() => { setText(value); setEditing(true); }}>{value ? '改' : '写一个'}</button>}
        </span>
      </div>
      {s.err && <p className="ek-err">{s.err}</p>}
      {editing && (
        <div className="ek-form">
          <label htmlFor={`${uid}-s`}>一段经历、一个转折、一个改变了你的人（{LIMITS_EDIT.story} 字以内）</label>
          <textarea id={`${uid}-s`} rows={6} value={text} maxLength={LIMITS_EDIT.story} onChange={e => setText(e.target.value)} />
          <div className="ek-row">
            <button type="button" className="ek-btn is-main" disabled={s.busy} onClick={() => s.run({ op: 'story', value: text }, () => setEditing(false))}>存好</button>
            <button type="button" className="ek-btn is-quiet" onClick={() => setEditing(false)}>算了</button>
          </div>
        </div>
      )}
    </div>
  );
}

export type { DraftBlock };
