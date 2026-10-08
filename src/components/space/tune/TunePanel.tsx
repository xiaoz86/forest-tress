'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { tokensToStyle, type DimensionKey, type StyleVector, type ThemeTokens } from '@/lib/space/themes';
import {
  ACCENTS, KNOBS, KNOB_ORDER, MAX_ROUNDS, NOTME_BLOCKS, NOTME_TOPICS, PAPERS, QUICK,
  accentName, applyTune, contrastReport, nearestAccent, nextRound, nudge, optionLabel, ownDiff, remix, sameAsTheme,
  themeExact, themeKnobs, usableAccent,
  type Change, type KnobKey, type KnobValue, type Knobs, type NotMeAnswer, type Round, type RoundResult,
} from '@/lib/space/tune';
import './tune.css';

/**
 * 调风格面板：在本人自己的网站上，实时拨旋钮。
 *
 * 四种方式拨同一组旋钮——说一句（AI 或常用说法）、二选一（一轮只改一处，像验光）、细调（自己拨、锁住喜欢的、再来一版）、
 * 以及页面上每一块的「这不像我」（只问一个具体问题）。改动直接写到 .sp 的 CSS 变量上，所见即所得；
 * 点「保存」才存下，访客才看到。本人说过的偏好（更安静、更暖……）随保存一起写回画像。
 *
 * 手机上面板是底部抽屉，会挡住大半页：每次改完自动收起，收起的那一条说清刚改了什么、怎么接着来。
 */

type Note = { block: string; said: string; dim: DimensionKey; dir: 1 | -1 };
type Swatch = { hex: string; name: string; from: string };
type Tab = 'say' | 'pick' | 'fine';
/** 撤销以「一步」为单位：一步之前的旋钮和说过的偏好一起存，撤销就整步退回去 */
type Step = { knobs: Knobs; notes: Note[] };
type NotMeState = {
  block: string; topic: string | null; result: string | null;
  before: Knobs | null; keys: KnobKey[]; notes: Note[];
  /** 想改的旋钮被锁住了：给「去细调解锁」，不给「好多了」 */
  blocked?: boolean;
  /** 这一步是第几步（history 长度）：撤销这一下时判断之后有没有再动过 */
  step?: number;
  /** 这一步拨成了什么：撤销时只放回还是这个值的旋钮 */
  set?: Knobs;
  /** 这一下什么都没改成（到头了、已经是这样）：不给「好多了」，给「换一个方向」 */
  noop?: boolean;
};

export type TunePanelProps = {
  memberId: string;
  /** 没叠微调的主题 */
  base: { id: string; name: string; tokens: ThemeTokens };
  /** 已存的微调（只有 base 对得上才给） */
  saved: { knobs: Knobs; locks: KnobKey[] } | null;
  /** 之前在另一套主题上调过：那一套的名字 */
  otherBase: string | null;
  /** 保存会把网站固定成这一套（现在用的是推荐、或者本人选定的是别的一套） */
  willPin: boolean;
  /** 访客现在看到的是不是这一套（不是的话，本人是在预览另一套） */
  isLive: boolean;
  /** 访客现在看到的那一套的名字 */
  liveName: string;
  /** 这个人的审美位置（画像 + 测试 + 说过的偏好）：挑候选用 */
  vector: StyleVector;
  /** 有没有照片：没有的话「照片」这个旋钮拨了也看不出来，不让它占用改动 */
  hasPhoto: boolean;
  closeHref: string;
};

const TABS: { id: Tab; label: string }[] = [
  { id: 'say', label: '说一句' },
  { id: 'pick', label: '二选一' },
  { id: 'fine', label: '细调' },
];

/** 页面上每一块对应的元素：「这不像我」打开时，手机上先把这一块滚到抽屉上方 */
const BLOCK_EL: Record<string, string> = {
  cover: '#top', knowing: '#knowing', path: '#path', offer: '#offer', seed: '#seed', end: '#connect',
};

const narrow = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches;

function Dot({ hex, big }: { hex: string; big?: boolean }) {
  return <span className={`tn-dot ${big ? 'is-big' : ''}`} style={{ background: hex }} aria-hidden />;
}

/** 一个档位给人看的样子：颜色类带色块 */
function ValueView({ k, v }: { k: KnobKey; v: KnobValue }) {
  if (k === 'accent') return <><Dot hex={String(v)} />{optionLabel(k, v)}</>;
  if (k === 'paper') {
    const p = PAPERS.find(x => x.id === v);
    return <>{p && <Dot hex={p.bg} />}{optionLabel(k, v)}</>;
  }
  return <>{optionLabel(k, v)}</>;
}

export default function TunePanel(p: TunePanelProps) {
  const router = useRouter();
  /** 「·原」标在哪一档（最接近主题本来的值） */
  const own = useMemo(() => themeKnobs(p.base.tokens), [p.base.tokens]);
  /** 拨旋钮的起点：主题本来的精确值（晨光花园留白 64，不往 56 凑） */
  const base0 = useMemo(() => themeExact(p.base.tokens), [p.base.tokens]);
  /** 和主题本来一模一样的档位不记：「恢复原样」就是清空 */
  const tidy = useCallback((k: Knobs): Knobs => ownDiff(p.base.tokens, k), [p.base.tokens]);
  /** 页面上现在是不是这一档：拨过就看拨的值，没拨过就看是不是正好等于主题本来的值 */
  const isSel = (k: KnobKey, v: KnobValue) => (k in knobs ? knobs[k] === v : sameAsTheme(p.base.tokens, k, v));

  const initial = useMemo(() => tidy(p.saved?.knobs ?? {}), [p.saved, tidy]);
  const [knobs, setKnobs] = useState<Knobs>(initial);
  const [locks, setLocks] = useState<KnobKey[]>(p.saved?.locks ?? []);
  const [savedState, setSavedState] = useState(() => JSON.stringify({ k: initial, l: p.saved?.locks ?? [] }));
  const [history, setHistory] = useState<Step[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [tab, setTab] = useState<Tab>('say');
  const [open, setOpen] = useState(true);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  /** 收起时那一条上显示的：刚改了什么、怎么接着来 */
  const [status, setStatus] = useState('');

  const eff = useMemo(() => ({ ...base0, ...knobs }) as Required<Knobs>, [base0, knobs]);
  // 异步里（等照片取色时）读最新的旋钮和锁：闭包里的是点「开始」那一刻的旧值
  const live = useRef({ knobs, locks });
  live.current = { knobs, locks };
  // 没有照片时，「照片」当作锁住：说一句、再来一版、二选一都不去拨它
  const lockSet: KnobKey[] = p.hasPhoto ? locks : [...new Set<KnobKey>([...locks, 'photo'])];
  const dirty = JSON.stringify({ k: knobs, l: locks }) !== savedState || notes.length > 0;
  const changed = Object.keys(knobs).length;
  // 什么都没改，但这一套还没被选定（在预览别的主题，或者网站还跟着推荐走）：可以直接「用这一套」
  const pinOnly = !dirty && p.willPin;

  /** 手机上改完就收起来，让人看整页；收起的那一条说清刚才改了什么 */
  function peekAfter(text: string) {
    setStatus(text);
    if (narrow()) setOpen(false);
  }

  // ── 照片取色 ──
  const [palette, setPalette] = useState<Swatch[] | null>(null);
  const [palBusy, setPalBusy] = useState(false);
  const [palMsg, setPalMsg] = useState('');
  async function loadPalette(): Promise<Swatch[]> {
    if (palette) return palette;
    setPalBusy(true);
    setPalMsg('');
    try {
      const res = await fetch(`/api/space/palette?id=${p.memberId}`);
      const j = await res.json().catch(() => ({}));
      // 和现成色板几乎一样的不要：多一个看不出差别的色块只会让人犹豫
      const list: Swatch[] = (Array.isArray(j.swatches) ? j.swatches : [])
        .filter((s: Swatch) => nearestAccent(s.hex).d >= 1);
      setPalette(list);
      setPalMsg(list.length ? '' : j.message || '照片里的颜色和上面的差不多，没有新的可加。');
      return list;
    } catch {
      setPalMsg('照片暂时读不到，过一会再试。');
      return [];
    } finally {
      setPalBusy(false);
    }
  }
  const photoHexes = (palette ?? []).map(s => s.hex);

  // ── 二选一 ──
  const [rounds, setRounds] = useState<RoundResult[]>([]);
  const [round, setRound] = useState<Round | null>(null);
  const [side, setSide] = useState<'a' | 'b'>('b');
  const [calState, setCalState] = useState<'idle' | 'loading' | 'on' | 'done'>('idle');
  const roundLine = (r: Round, n: number) => `第 ${n} 轮 · ${KNOBS[r.key].label}`;

  // ── 改动、撤销 ──
  /** 二选一进行到一半，正在比的那个旋钮被别处改了、或者被锁住了：A「现在的」不对了，重出这一轮（页面先看 A） */
  function syncRound(nextKnobs: Knobs, nextLocks: KnobKey[] = lockSet) {
    if (calState !== 'on' || !round) return;
    const e = { ...base0, ...nextKnobs } as Required<Knobs>;
    if (e[round.key] === round.a && !nextLocks.includes(round.key)) return;
    const r = nextRound(e, nextLocks, p.vector, rounds, photoHexes);
    setRound(r);
    setSide('a');
    if (!r) setCalState('done');
  }

  const lastPush = useRef(0);
  /** 所有改动都走这里：记一步（旋钮 + 说过的偏好），换上新的，二选一跟着对齐 */
  function commit(nextKnobs: Knobs, nextNotes: Note[] = notes, opts: { coalesce?: boolean; fromRound?: boolean } = {}) {
    // 点了已经选中的那一档：什么都没变，不记一步（不然要多按几下撤销才回得去）
    if (JSON.stringify(tidy(nextKnobs)) === JSON.stringify(knobs) && nextNotes.length === notes.length
      && nextNotes.every((n, i) => n === notes[i])) return;
    const now = Date.now();
    // 拖取色器时会连着触发：800ms 内的算一次，撤销一下就回到拖之前
    if (!opts.coalesce || now - lastPush.current > 800) setHistory(h => [...h.slice(-29), { knobs, notes }]);
    lastPush.current = now;
    const k = tidy(nextKnobs);
    setKnobs(k);
    setNotes(nextNotes.slice(-12));
    setMsg('');
    setStatus('');
    if (!opts.fromRound) syncRound(k);
  }
  const change = (patch: Knobs, opts: { coalesce?: boolean; fromRound?: boolean } = {}) => commit({ ...knobs, ...patch }, notes, opts);
  /** 撤销一整步：旋钮、这一步说过的偏好一起退回；这一步留下的结果框、提示都收掉，免得说的和页面对不上 */
  function undo() {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory(history.slice(0, -1));
    setKnobs(last.knobs);
    setNotes(last.notes);
    setMsg('');
    setStatus('');
    setSayOut(null);
    setNotMe(null);
    setRemixMsg('');
    syncRound(last.knobs);
  }
  const patchOf = (cs: Change[]) => Object.fromEntries(cs.map(c => [c.key, c.value])) as Knobs;
  /**
   * 「不要这次的」「撤销这一下」：这一步之后没再动过，就是整步撤销；
   * 之后又在别处拨过，就只把这一步动过的旋钮放回去（别处拨的不受影响），这一步说过的偏好也去掉。
   */
  function revertStep(step: number, set: Knobs, before: Knobs, stepNotes: Note[]) {
    if (history.length === step) { undo(); return; }
    const next: Knobs = { ...knobs };
    for (const k of Object.keys(set) as KnobKey[]) {
      // 之后在别处又拨过这个旋钮（比如另选了一个颜色）：那是后来的决定，不动它
      if (eff[k] !== set[k]) continue;
      if (k in before) (next as Record<string, KnobValue>)[k] = before[k] as KnobValue;
      else delete next[k];
    }
    commit(next, notes.filter(n => !stepNotes.includes(n)));
  }

  /** 开始校准时的样子：完成页按「问过的旋钮现在和那时比」来数改了几处，撤销、别处改过也对得上 */
  const [calStart, setCalStart] = useState<Required<Knobs> | null>(null);
  async function startCal() {
    setCalState('loading');
    const pal = await loadPalette();
    // 取色要等一会儿：这期间可能撤销了、锁了一个旋钮——按此刻最新的来出题
    const { knobs: k1, locks: l1 } = live.current;
    const e1 = { ...base0, ...k1 } as Required<Knobs>;
    const lk1: KnobKey[] = p.hasPhoto ? l1 : [...new Set<KnobKey>([...l1, 'photo'])];
    const r = nextRound(e1, lk1, p.vector, [], pal.map(s => s.hex));
    setCalStart(e1);
    setRounds([]);
    setRound(r);
    setSide('b');
    setCalState(r ? 'on' : 'done');
    if (r) peekAfter('');
  }
  function answer(pick: 'a' | 'b' | 'same') {
    if (!round) return;
    // 这一轮出题之后才锁上的旋钮：不改它（按「差不多」算）
    const choice = pick === 'b' && lockSet.includes(round.key) ? 'same' : pick;
    const done = [...rounds, { key: round.key, a: round.a, b: round.b, pick: choice }];
    let next = knobs;
    if (choice === 'b') {
      next = tidy({ ...knobs, [round.key]: round.b });
      change({ [round.key]: round.b }, { fromRound: true });
    }
    const r = nextRound({ ...base0, ...next } as Required<Knobs>, lockSet, p.vector, done, photoHexes);
    setRounds(done);
    setRound(r);
    setSide('b');
    if (!r) setCalState('done');
    else peekAfter('');
  }
  const calChanges = useMemo(() => {
    if (!calStart) return [];
    const asked = [...new Set(rounds.map(r => r.key))];
    return asked.filter(k => eff[k] !== calStart[k]).map(k => [k, { from: calStart[k], to: eff[k] }] as const);
  }, [rounds, calStart, eff]);

  // ── 这不像我 ──
  const [notMe, setNotMe] = useState<NotMeState | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const block = (e as CustomEvent<{ block?: string }>).detail?.block;
      if (!block || !NOTME_BLOCKS[block]) return;
      setNotMe({ block, topic: null, result: null, before: null, keys: [], notes: [] });
      // 二选一进行中：页面先回到「现在的」，这不像我改了什么才看得见，回答完也不会被 B 盖回去
      setSide('a');
      setOpen(true);
      // 手机上抽屉挡住下半屏：把这一块滚到上面露出来的地方
      if (narrow()) document.querySelector(BLOCK_EL[block])?.scrollIntoView({ block: 'start' });
      requestAnimationFrame(() => panelRef.current?.focus({ preventScroll: true }));
    };
    window.addEventListener('sp:notme', on);
    return () => window.removeEventListener('sp:notme', on);
  }, []);
  function notMeAnswer(a: NotMeAnswer) {
    if (!notMe?.topic) return;
    const topic = NOTME_TOPICS[notMe.topic];
    let patch: Knobs = {};
    let lines: string[] = [];
    if (a.set) {
      const entries = Object.entries(a.set) as [KnobKey, KnobValue][];
      const blocked = entries.filter(([k]) => locks.includes(k)).map(([k]) => KNOBS[k].label);
      if (blocked.length) {
        setNotMe({ ...notMe, result: `你锁住了「${blocked.join('、')}」。想改的话，先在「细调」里解锁。`, before: null, keys: [], notes: [], blocked: true });
        return;
      }
      const fresh = entries.filter(([k, v]) => eff[k] !== v);
      patch = Object.fromEntries(fresh) as Knobs;
      lines = fresh.map(([k, v]) => `${KNOBS[k].label}换成「${optionLabel(k, v)}」`);
    } else if (a.dim && a.dir) {
      const cs = nudge(a.dim, a.dir, eff, { locks: lockSet, only: a.only });
      patch = patchOf(cs);
      lines = cs.map(c => c.what);
      if (!cs.length && a.only?.some(k => locks.includes(k))) {
        const names = a.only.filter(k => locks.includes(k)).map(k => KNOBS[k].label);
        setNotMe({ ...notMe, result: `你锁住了「${names.join('、')}」。想改的话，先在「细调」里解锁。`, before: null, keys: [], notes: [], blocked: true });
        return;
      }
    }
    const before = knobs;
    // 只有真改了样子，才把这句偏好记进画像（什么都没变时记下来，等于替本人说了一句他没验证过的话）
    const ns: Note[] = lines.length && a.dim && a.dir
      ? [{ block: notMe.block, said: `${NOTME_BLOCKS[notMe.block].label}的${topic.label}：${a.label}`, dim: a.dim, dir: a.dir }]
      : [];
    if (lines.length) commit({ ...knobs, ...patch }, [...notes, ...ns]);
    const result = lines.length ? `改了：${lines.join('；')}。这样呢？` : a.set ? '现在已经是这样了。换一个方向试试？' : '这一边已经拨到头了。换一个方向试试？';
    setNotMe({
      ...notMe, result, before: lines.length ? before : null, keys: Object.keys(patch) as KnobKey[], notes: ns,
      step: lines.length ? history.length + 1 : undefined, set: patch, noop: !lines.length,
    });
    if (lines.length) peekAfter(`${a.label}——改好了，点这里说说怎么样`);
  }
  function notMeUndo() {
    if (!notMe) return;
    const back: NotMeState = { ...notMe, result: null, before: null, keys: [], notes: [], step: undefined, set: undefined, noop: false };
    if (notMe.step !== undefined && notMe.before) revertStep(notMe.step, notMe.set ?? {}, notMe.before, notMe.notes);
    // 整步撤销会把这不像我收起来；撤完回到刚才那个问题，好换个方向再选
    setNotMe(back);
    setStatus('');
  }

  // ── 页面上现在显示的：二选一时可以临时看 B（「这不像我」打开时不看，免得它的改动被 B 盖住） ──
  const peek = tab === 'pick' && !notMe && calState === 'on' && round && side === 'b'
    ? tidy({ ...knobs, [round.key]: round.b }) : null;
  const shown = peek ?? knobs;
  const applied = useMemo(() => applyTune(p.base.tokens, shown), [p.base.tokens, shown]);
  useEffect(() => {
    const el = document.querySelector<HTMLElement>('.sp');
    if (!el) return;
    const t = applied.tokens;
    for (const [k, v] of Object.entries(tokensToStyle(t))) el.style.setProperty(k, v);
    el.dataset.edge = t.edge;
    el.dataset.cover = t.cover;
    el.dataset.align = t.coverAlign;
    if (t.lede) el.dataset.lede = '';
    else delete el.dataset.lede;
  }, [applied]);

  // 没保存就关页面：提醒一下
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // ── 说一句 ──
  const [say, setSay] = useState('');
  const [sayBusy, setSayBusy] = useState(false);
  const [sayOut, setSayOut] = useState<{ reply: string; changes: Change[]; before: Knobs; notes: Note[]; step: number } | null>(null);
  async function askAI(text: string) {
    const said = text.trim();
    if (!said || sayBusy) return;
    setSayBusy(true);
    setSayOut(null);
    try {
      const res = await fetch(`/api/space/tune?id=${p.memberId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ say: said, base: p.base.id, knobs, locks: lockSet }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSayOut({ reply: j.message || '没调成，过一会再试。', changes: [], before: knobs, notes: [], step: -1 });
        return;
      }
      const cs: Change[] = Array.isArray(j.changes) ? j.changes : [];
      const ns: Note[] = (Array.isArray(j.dims) ? j.dims : []).map((d: { dim: DimensionKey; dir: 1 | -1 }) => ({ block: 'say', said, dim: d.dim, dir: d.dir }));
      const before = knobs;
      const stepped = cs.length > 0 || ns.length > 0;
      if (stepped) commit({ ...knobs, ...patchOf(cs) }, [...notes, ...ns]);
      setSayOut({ reply: j.reply || '', changes: cs, before, notes: ns, step: stepped ? history.length + 1 : -1 });
      if (cs.length) peekAfter(`「${said}」——改了 ${cs.length} 处，点这里看`);
    } catch {
      setSayOut({ reply: '网络不太好，没调成。', changes: [], before: knobs, notes: [], step: -1 });
    } finally {
      setSayBusy(false);
    }
  }
  function quick(q: (typeof QUICK)[number]) {
    const cs = nudge(q.dim, q.dir, eff, { locks: lockSet });
    const before = knobs;
    // 真改了样子才记这句偏好
    const ns: Note[] = cs.length ? [{ block: 'quick', said: q.label, dim: q.dim, dir: q.dir }] : [];
    if (cs.length) commit({ ...knobs, ...patchOf(cs) }, [...notes, ...ns]);
    setSayOut({
      reply: cs.length ? `${q.label}——这样呢？` : '这一边已经拨到头了，或者相关的旋钮被你锁住了。',
      changes: cs, before, notes: ns, step: cs.length ? history.length + 1 : -1,
    });
    if (cs.length) peekAfter(`${q.label}——改了 ${cs.length} 处，点这里看`);
  }
  function revertSay() {
    if (!sayOut) return;
    if (sayOut.step > 0) revertStep(sayOut.step, patchOf(sayOut.changes), sayOut.before, sayOut.notes);
    setSayOut(null);
  }

  // ── 细调 ──
  const [remixMsg, setRemixMsg] = useState('');
  function toggleLock(k: KnobKey) {
    const next = locks.includes(k) ? locks.filter(x => x !== k) : [...locks, k];
    setLocks(next);
    // 正在二选一比的就是这个旋钮，刚被锁上：换一轮，不再拿它来比
    syncRound(knobs, p.hasPhoto ? next : [...new Set<KnobKey>([...next, 'photo'])]);
  }
  function doRemix() {
    const patch = remix(eff, lockSet, p.vector, photoHexes);
    const keys = Object.keys(patch) as KnobKey[];
    if (keys.length) change(patch);
    setRemixMsg(keys.length ? `换了：${keys.map(k => KNOBS[k].label).join('、')}` : '都锁住了，没有可以换的。');
  }

  /** 恢复原样 = 重新开始：说过的偏好、没回答完的问题也一起放下，不然一保存还会记进画像 */
  function restore() {
    commit({}, []);
    setSayOut(null);
    setNotMe(null);
    setNotes([]);
    setRemixMsg('');
    setStatus('');
    if (calState !== 'idle') {
      setCalState('idle');
      setRound(null);
      setRounds([]);
    }
  }

  // ── 保存 ──
  async function save() {
    // 什么都没改、只是把网站固定成这一套：这一下改的是访客看到的整站，先问一句
    if (pinOnly && !window.confirm(p.isLive
      ? `网站会固定用「${p.base.name}」，不再跟着推荐变。确定吗？`
      : `访客看到的网站会从「${p.liveName}」换成「${p.base.name}」。确定吗？`)) return;
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch(`/api/space/tune?id=${p.memberId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base: p.base.id, knobs, locks, notes }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(j.message || '没存上，过一会再试。');
        return;
      }
      setSavedState(JSON.stringify({ k: knobs, l: locks }));
      setNotes([]);
      setStatus('');
      setMsg(j.pinned
        ? `存好了。网站从现在起用「${p.base.name}」${changed ? '，加上你的微调' : ''}。`
        : '存好了，访客现在看到的就是这一版。');
      router.refresh();
    } catch {
      setMsg('网络不太好，没存上。');
    } finally {
      setSaving(false);
    }
  }

  const report = contrastReport(applied.tokens);
  const minRatio = Math.min(...report.map(r => r.ratio));
  // 色块的名字和上面「强调色 ×× 」用同一个叫法（accentName），不会一个叫「深绿」、选上了又叫「近森绿」
  const accentChoices: { hex: string; name: string }[] = [
    ...(ACCENTS.some(a => a.hex === own.accent) ? [] : [{ hex: own.accent, name: accentName(own.accent) }]),
    ...ACCENTS,
  ];
  // 现在用的颜色既不在色板里也不是照片里的（挪过、自选的）：也放进来，好看出选中的是哪个
  if (!accentChoices.some(a => a.hex === eff.accent) && !photoHexes.includes(eff.accent)) {
    accentChoices.push({ hex: eff.accent, name: accentName(eff.accent) });
  }
  // 没有照片：「照片」这个旋钮拨了看不出来，不摆出来
  const segKeys: KnobKey[] = KNOB_ORDER.filter(k => k !== 'accent' && k !== 'paper' && (p.hasPhoto || k !== 'photo'));
  /** ·原：正好是主题本来的值；主题的值落在两档之间时，标在最近的那一档上，说明是「最接近」 */
  const origMark = (k: KnobKey, v: KnobValue) => (own[k] !== v ? null : (
    <i title={sameAsTheme(p.base.tokens, k, v) ? '主题本来的样子' : '最接近主题本来的样子'}>·原</i>
  ));

  // 最要紧的放前面（改了几处、有没有保存），预览说明放最后：一行放不下时被截掉的是它
  const sub = [
    p.base.name,
    changed ? `改了 ${changed} 处` : '',
    dirty ? '未保存' : '',
    p.isLive ? '' : `预览中，网站现在是「${p.liveName}」`,
  ].filter(Boolean).join(' · ');
  const roundOn = tab === 'pick' && !notMe && calState === 'on' && round;
  const collapsedLine = roundOn
    ? <>{roundLine(round, rounds.length + 1)} · <span className="tn-nw">点这里作答</span></>
    : status || sub;
  const saveLabel = saving ? '正在存…' : dirty ? '保存' : pinOnly ? (p.isLive ? '固定用这一套' : '换成这一套') : '已保存';
  const pinHint = p.willPin && (dirty || pinOnly)
    ? (p.isLive ? `保存后，网站固定用「${p.base.name}」，不再跟着推荐变。` : `保存后，网站从「${p.liveName}」换成「${p.base.name}」。`)
    : '';

  const lockBtn = (k: KnobKey) => (
    <button type="button" className={`tn-lock ${locks.includes(k) ? 'is-on' : ''}`}
      aria-pressed={locks.includes(k)} onClick={() => toggleLock(k)}>
      {locks.includes(k) ? '已锁住' : '锁住'}
    </button>
  );
  const swatch = (a: { hex: string; name: string; from?: string }) => {
    const orig = a.hex === own.accent;
    const label = `${a.name}${a.from ? `，取自${a.from}` : ''}${orig ? '（主题原色）' : ''}`;
    const on = isSel('accent', a.hex);
    return (
      <button key={a.hex} type="button" className={`tn-sw ${on ? 'is-on' : ''}`}
        title={label} aria-label={label} aria-pressed={on} onClick={() => change({ accent: a.hex })}>
        <Dot hex={a.hex} big />
        {orig && <i className="tn-orig" aria-hidden>原</i>}
      </button>
    );
  };

  return (
    <aside className={`tn ${open ? 'is-open' : ''}`} aria-label="调风格" ref={panelRef} tabIndex={-1}>
      {/* 点标题这一条的空白处（手机上的把手也在这里）同样收起、展开；键盘用户用里面的按钮 */}
      <header className="tn-head" onClick={e => { if (e.target === e.currentTarget) setOpen(o => !o); }}>
        <button type="button" className="tn-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
          <b>调风格<i className="tn-chev" aria-hidden>{open ? '收起' : '展开'}</i></b>
          <span>{open ? sub : collapsedLine}</span>
        </button>
        {/* 收起来看整页时，二选一还能直接切 A / B */}
        {!open && roundOn && (
          <span className="tn-mini-ab" role="radiogroup" aria-label="页面上显示哪一个">
            {(['a', 'b'] as const).map(s => (
              <button key={s} type="button" role="radio" aria-checked={side === s}
                className={side === s ? 'is-on' : ''} onClick={() => setSide(s)}>
                {s.toUpperCase()}
              </button>
            ))}
          </span>
        )}
        <a className="tn-close" href={p.closeHref} aria-label="关闭调风格"
          onClick={e => { if (dirty && !window.confirm('还没保存，确定不要这些改动吗？')) e.preventDefault(); }}>
          完成
        </a>
      </header>

      {open && (
        <div className="tn-body">
          {p.otherBase && !p.saved && (
            <p className="tn-note">你之前在「{p.otherBase}」上调过。在这一套上保存，会换掉那一份。</p>
          )}

          {notMe ? (
            <section className="tn-notme" aria-live="polite">
              <p className="tn-q">
                {notMe.topic ? NOTME_TOPICS[notMe.topic].question : `${NOTME_BLOCKS[notMe.block].label}哪里不像你？`}
              </p>
              {!notMe.topic && (
                <div className="tn-chips">
                  {NOTME_BLOCKS[notMe.block].topics.filter(t => p.hasPhoto || t !== 'photo').map(t => (
                    <button key={t} type="button" className="tn-chip" onClick={() => setNotMe({ ...notMe, topic: t })}>
                      {NOTME_TOPICS[t].label}
                    </button>
                  ))}
                  <button type="button" className="tn-chip" onClick={() => { setNotMe(null); setTab('say'); }}>
                    说不上来，我用一句话说
                  </button>
                </div>
              )}
              {notMe.topic && !notMe.result && (
                <div className="tn-chips">
                  {NOTME_TOPICS[notMe.topic].answers.map(a => (
                    <button key={a.label} type="button" className="tn-chip" onClick={() => notMeAnswer(a)}>{a.label}</button>
                  ))}
                  <button type="button" className="tn-link" onClick={() => setNotMe({ ...notMe, topic: null })}>← 不是这个</button>
                </div>
              )}
              {notMe.result && (
                <>
                  <p className="tn-result">{notMe.result}</p>
                  <div className="tn-row-acts">
                    {notMe.blocked ? (
                      <>
                        <button type="button" className="tn-btn is-main" onClick={() => { setNotMe(null); setTab('fine'); }}>去细调解锁</button>
                        <button type="button" className="tn-btn" onClick={() => setNotMe({ ...notMe, topic: null, result: null, blocked: false })}>
                          换一个
                        </button>
                      </>
                    ) : (
                      <>
                        {notMe.noop ? (
                          <>
                            <button type="button" className="tn-btn is-main" onClick={() => setNotMe({ ...notMe, result: null, noop: false })}>换一个方向</button>
                            <button type="button" className="tn-btn" onClick={() => { setNotMe(null); setStatus(''); }}>算了</button>
                          </>
                        ) : (
                          <>
                            <button type="button" className="tn-btn is-main" onClick={() => { setNotMe(null); setStatus(''); }}>好多了</button>
                            <button type="button" className="tn-btn" onClick={() => { setNotMe({ ...notMe, topic: null, result: null, before: null, keys: [], notes: [] }); setStatus(''); }}>
                              还是不像
                            </button>
                          </>
                        )}
                        {notMe.before && <button type="button" className="tn-link" onClick={notMeUndo}>撤销这一下</button>}
                      </>
                    )}
                  </div>
                </>
              )}
              {!notMe.result && <button type="button" className="tn-link tn-cancel" onClick={() => setNotMe(null)}>算了</button>}
            </section>
          ) : (
            <>
              <nav className="tn-tabs" role="tablist" aria-label="调风格的方式">
                {TABS.map(t => (
                  <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
                    className={tab === t.id ? 'is-on' : ''} onClick={() => { setTab(t.id); setStatus(''); }}>
                    {t.label}
                  </button>
                ))}
              </nav>

              {tab === 'say' && (
                <section className="tn-sec">
                  <form className="tn-say" onSubmit={e => { e.preventDefault(); askAI(say); }}>
                    <input value={say} onChange={e => setSay(e.target.value)} maxLength={80}
                      placeholder="比如：像秋天的下午 / 更像一本书" aria-label="用一句话说想要的感觉" />
                    <button type="submit" className="tn-btn is-main" disabled={!say.trim() || sayBusy}>
                      {sayBusy ? '在想…' : '让 AI 调'}
                    </button>
                  </form>
                  <div className="tn-chips">
                    {QUICK.map(q => (
                      <button key={q.label} type="button" className="tn-chip" onClick={() => quick(q)}>{q.label}</button>
                    ))}
                  </div>
                  {sayOut && (
                    <div className="tn-out" aria-live="polite">
                      {sayOut.reply && <p className="tn-result">{sayOut.reply}</p>}
                      {sayOut.changes.length > 0 && (
                        <ul className="tn-changes">
                          {sayOut.changes.map(c => <li key={c.key}>{c.why}</li>)}
                        </ul>
                      )}
                      {sayOut.changes.length > 0 && (
                        <div className="tn-row-acts">
                          <button type="button" className="tn-link" onClick={revertSay}>不要这次的</button>
                        </div>
                      )}
                    </div>
                  )}
                  <p className="tn-hint">说的话只拨下面「细调」里的那些旋钮，不会做出看不清的页面。你说过的偏好，保存时会记进你的审美画像。</p>
                </section>
              )}

              {tab === 'pick' && (
                <section className="tn-sec">
                  {calState === 'idle' && (
                    <>
                      <p className="tn-lead">每一轮只改一处，其余不动。你在页面上看看 A 和 B，选更像你的那个。最多 {MAX_ROUNDS} 轮。</p>
                      <button type="button" className="tn-btn is-main" onClick={startCal}>开始</button>
                    </>
                  )}
                  {calState === 'loading' && <p className="tn-lead">先从你的照片里取几种颜色…</p>}
                  {calState === 'on' && round && (
                    <div className="tn-round">
                      <p className="tn-step">{roundLine(round, rounds.length + 1)}</p>
                      <p className="tn-q">{round.question}</p>
                      <div className="tn-ab" role="radiogroup" aria-label="页面上显示哪一个">
                        {(['a', 'b'] as const).map(s => (
                          <button key={s} type="button" role="radio" aria-checked={side === s}
                            className={side === s ? 'is-on' : ''} onClick={() => setSide(s)}>
                            <b>{s.toUpperCase()}</b>
                            <span><ValueView k={round.key} v={s === 'a' ? round.a : round.b} /></span>
                            <small>{s === 'a' ? '现在的' : '换一换'}</small>
                          </button>
                        ))}
                      </div>
                      <p className="tn-hint">点 A、B 切换，页面跟着变；上下滚动看看整体。</p>
                      <div className="tn-row-acts">
                        <button type="button" className="tn-btn" onClick={() => answer('a')}>A 更像我</button>
                        <button type="button" className="tn-btn" onClick={() => answer('b')}>B 更像我</button>
                        <button type="button" className="tn-link" onClick={() => answer('same')}>差不多</button>
                      </div>
                    </div>
                  )}
                  {calState === 'done' && (
                    <>
                      <p className="tn-lead">
                        {rounds.length ? `校准完了：这次比了 ${rounds.length} 轮，最后改了 ${calChanges.length} 处。` : '没有可以校准的了（可能都锁住了）。'}
                      </p>
                      {calChanges.length > 0 && (
                        <ul className="tn-changes">
                          {calChanges.map(([k, v]) => (
                            <li key={k}>{KNOBS[k].label}：{optionLabel(k, v.from)} → {optionLabel(k, v.to)}</li>
                          ))}
                        </ul>
                      )}
                      <div className="tn-row-acts">
                        <button type="button" className="tn-btn" onClick={startCal}>再校准一次</button>
                      </div>
                    </>
                  )}
                </section>
              )}

              {tab === 'fine' && (
                <section className="tn-sec">
                  <div className="tn-row-acts tn-remix">
                    <button type="button" className="tn-btn is-main" onClick={doRemix}>再来一版</button>
                    <span className="tn-hint" role="status">{remixMsg || '只换没锁住的；越像你的越容易被挑中。'}</span>
                  </div>

                  <div className="tn-knob">
                    <div className="tn-knob-h">
                      <span>{KNOBS.accent.label}<em>{optionLabel('accent', eff.accent)}</em></span>
                      {lockBtn('accent')}
                    </div>
                    <div className="tn-swatches">
                      {accentChoices.map(a => swatch(a))}
                      <label className="tn-custom" title="自己挑一个颜色">
                        <input type="color" value={eff.accent}
                          onChange={e => { const v = usableAccent(e.target.value); if (v) change({ accent: v }, { coalesce: true }); }} />
                        自选
                      </label>
                    </div>
                    {palette && palette.length > 0 && (
                      <div className="tn-photo">
                        <span className="tn-sub">取自你的照片</span>
                        <div className="tn-swatches">
                          {palette.map(s => swatch({ hex: s.hex, name: accentName(s.hex), from: s.from }))}
                        </div>
                      </div>
                    )}
                    {!palette && (
                      <button type="button" className="tn-link" onClick={loadPalette} disabled={palBusy}>
                        {palBusy ? '正在取色…' : '从我的照片里取色 →'}
                      </button>
                    )}
                    {palMsg && <p className="tn-hint">{palMsg}</p>}
                  </div>

                  <div className="tn-knob">
                    <div className="tn-knob-h">
                      <span>{KNOBS.paper.label}<em>{optionLabel('paper', eff.paper)}</em></span>
                      {lockBtn('paper')}
                    </div>
                    <div className="tn-swatches">
                      {PAPERS.map(pp => (
                        <button key={pp.id} type="button" className={`tn-paper ${isSel('paper', pp.id) ? 'is-on' : ''}`}
                          aria-pressed={isSel('paper', pp.id)} onClick={() => change({ paper: pp.id })}
                          style={{ background: pp.bg }}>
                          {pp.name}{origMark('paper', pp.id)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {segKeys.map(k => (
                    <div className="tn-knob" key={k}>
                      <div className="tn-knob-h">
                        <span>{KNOBS[k].label}</span>
                        {lockBtn(k)}
                      </div>
                      <div className="tn-seg" role="radiogroup" aria-label={KNOBS[k].label}>
                        {KNOBS[k].options.map(o => (
                          <button key={String(o.value)} type="button" role="radio" aria-checked={isSel(k, o.value)}
                            className={isSel(k, o.value) ? 'is-on' : ''} onClick={() => change({ [k]: o.value } as Knobs)}>
                            {o.label}{origMark(k, o.value)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}

          {/* 常驻底部：保存、撤销、对比度——在面板里滚到哪都看得到 */}
          <footer className="tn-foot">
            <div className="tn-row-acts">
              <button type="button" className="tn-btn is-main" onClick={save} disabled={saving || (!dirty && !pinOnly)}>
                {saveLabel}
              </button>
              <button type="button" className="tn-link" onClick={undo} disabled={!history.length}>撤销</button>
              <button type="button" className="tn-link" onClick={restore} disabled={!changed && !notes.length}
                title={`恢复「${p.base.name}」原样`}>
                恢复原样
              </button>
            </div>
            <p className="tn-check" title={applied.notes.join('；')}>
              <span className={minRatio >= 4.5 ? 'is-ok' : 'is-bad'}>{minRatio >= 4.5 ? '✓' : '!'}</span>
              字都看得清（对比度最低 {minRatio.toFixed(1)}:1）
              {applied.notes.length > 0 && <em> · 自动加深了 {applied.notes.length} 处</em>}
            </p>
            {msg ? <p className="tn-msg" role="status">{msg}</p> : pinHint && <p className="tn-hint">{pinHint}</p>}
          </footer>
        </div>
      )}
    </aside>
  );
}
