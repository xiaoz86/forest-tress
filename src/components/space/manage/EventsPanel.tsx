'use client';

import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { formatEventTime, formatFee, formatMoment, isoToLocalInput, localInputToIso, MODE_LABEL, eventSharePath, eventShareText } from '@/lib/space/eventTime';
import { LIMITS, type EventMode, type EventStatus, type Registration, type RegistrationStatus, type SpaceEvent } from '@/lib/space/types';
import { CopyLink } from '@/components/space/interact/RegistrationActions';
import ShareEvent from '@/components/space/interact/ShareEvent';
import './events-panel.css';
import { shrinkImage } from '@/lib/space/shrinkImage';

type HostEvent = SpaceEvent & { taken: number; left: number | null };
type HostReg = Omit<Registration, 'token' | 'proofFile' | 'memberId' | 'sourceKey'> & {
  hasProof: boolean; holdExpired: boolean; holdUntil: string | null;
  /** TA 的报名链接（站内路径）：TA 丢了链接时复制了再发给 TA */
  link: string;
  blocked: boolean;
};
/** 主人操作之后要去通知的人（服务端算好：能发信的已经发了，其余的主人自己去说） */
type Notice = { id: string; name: string; contact: string; link: string; what: string; emailed: boolean; refund?: boolean };
type Group = { event: HostEvent; registrations: HostReg[]; counts: Record<'confirmed' | 'claimed' | 'pending' | 'waitlist' | 'cancelled' | 'rejected', number> };

const EVENT_STATUS: { value: EventStatus; label: string }[] = [
  { value: 'draft', label: '草稿（只有你看得到）' },
  { value: 'open', label: '开放报名' },
  { value: 'closed', label: '截止报名' },
];
const EVENT_STATUS_SHORT: Record<EventStatus, string> = { draft: '草稿', open: '开放报名', closed: '已截止', cancelled: '已取消' };
const REG_LABEL: Record<RegistrationStatus, string> = {
  confirmed: '已确认',
  pending: '等付款',
  claimed: '已传截图，待核对',
  waitlist: '排队中',
  cancelled: '已取消',
  rejected: '已驳回',
};

type Draft = {
  title: string; desc: string; starts: string; ends: string; place: string;
  mode: EventMode; capacity: string; feeYuan: string; status: EventStatus;
};

const EMPTY: Draft = { title: '', desc: '', starts: '', ends: '', place: '', mode: 'offline', capacity: '', feeYuan: '0', status: 'draft' };

function toDraft(e: SpaceEvent): Draft {
  return {
    title: e.title, desc: e.desc, starts: isoToLocalInput(e.startsAt), ends: isoToLocalInput(e.endsAt),
    place: e.place, mode: e.mode, capacity: e.capacity === null ? '' : String(e.capacity),
    feeYuan: e.feeCents ? String(e.feeCents / 100) : '0', status: e.status,
  };
}

async function call(url: string, init?: RequestInit): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { cache: 'no-store', ...init });
    // 413：请求体太大，在进到接口之前就被平台拒了（回的不是 JSON）
    if (res.status === 413) return { ok: false, data: { message: '图太大了，换一张小一点的（4MB 以内）' } };
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: { message: '网络好像断了，检查一下再试' } };
  }
}

const msgOf = (d: Record<string, unknown>, fallback: string) => (typeof d.message === 'string' && d.message) || fallback;

/**
 * 管理页「活动」面板：收款码、活动的新建与编辑、每个活动的报名名单。
 * 报名人的联系方式只在这里出现（只有本人和管理员进得来）。
 */
export default function EventsPanel({ memberId, hostName = '' }: { memberId: string; hostName?: string }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [payQr, setPayQr] = useState(false);
  const [loadErr, setLoadErr] = useState('');
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [pageUrl, setPageUrl] = useState('');
  const [published, setPublished] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const q = `id=${encodeURIComponent(memberId)}`;

  const load = useCallback(async () => {
    const [ev, rg, st] = await Promise.all([
      call(`/api/space/events?${q}`), call(`/api/space/registrations?${q}`), call(`/api/space/settings?${q}`),
    ]);
    if (!ev.ok || !rg.ok) {
      setLoadErr('活动和报名没有读出来。刷新页面再试一次；一直这样的话，告诉管理员。');
      return;
    }
    setLoadErr('');
    setPayQr(!!ev.data.payQr);
    setGroups((rg.data.groups as Group[]) || []);
    const urls = st.data.urls as { pageUrl?: string } | undefined;
    if (urls?.pageUrl) setPageUrl(urls.pageUrl);
    setPublished(!!(st.data.settings as { published?: boolean } | undefined)?.published);
  }, [q]);

  /** 操作完：刷新数据，把要通知的人列出来 */
  const after = useCallback((d: Record<string, unknown>) => {
    const list = Array.isArray(d.notify) ? (d.notify as Notice[]) : [];
    if (list.length) setNotices(list);
    void load();
  }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载后拉一次数据
    void load();
  }, [load]);

  const hasPaid = groups?.some(g => g.event.feeCents > 0 && g.event.status !== 'cancelled') ?? false;

  return (
    <div className="sep">
      <PayQr memberId={memberId} has={payQr} needed={hasPaid} onChange={setPayQr} />
      {notices.length > 0 && <Notices items={notices} onClose={() => setNotices([])} />}

      <section className="sep-sec">
        <div className="sep-row">
          <h3 className="sep-h">活动</h3>
          {editing !== 'new' && <button type="button" className="st-btn" onClick={() => setEditing('new')}>新建活动</button>}
        </div>
        {loadErr && <p className="st-err">{loadErr}</p>}
        {editing === 'new' && (
          <EventForm memberId={memberId} initial={null} payQr={payQr} active={0}
            onDone={d => { setEditing(null); after(d); }} onClose={() => setEditing(null)} />
        )}
        {groups === null && !loadErr && <p className="st-muted">正在读…</p>}
        {groups && !groups.length && editing !== 'new' && (
          <p className="st-muted">还没有活动。建一个，开放报名之后，它会出现在你网站「一起做点什么」那一章里。</p>
        )}
        <ul className="sep-events">
          {groups?.map(g => (
            <EventRow key={g.event.id} group={g} memberId={memberId} payQr={payQr} pageUrl={pageUrl} published={published} hostName={hostName}
              editing={editing === g.event.id}
              onEdit={() => setEditing(g.event.id)} onClose={() => setEditing(null)}
              reload={load} after={after} />
          ))}
        </ul>
      </section>
    </div>
  );
}

// ─────────────── 去通知 TA ───────────────

/**
 * 主人确认、驳回、转正、取消活动、改时间地点之后，受影响的报名人列在这里。
 * 联系方式是邮箱的，服务端已经发了信（本地写进发件箱）；其余的主人按联系方式自己去说，顺手把 TA 的报名链接发过去。
 */
function Notices({ items, onClose }: { items: Notice[]; onClose: () => void }) {
  const pending = items.filter(i => !i.emailed);
  return (
    <section className="sep-sec sep-notices" aria-live="polite">
      <div className="sep-row">
        <h3 className="sep-h">{pending.length ? `去通知 ${pending.length} 个人` : '已经通知到了'}</h3>
        <button type="button" className="st-textbtn sep-tb" onClick={onClose}>知道了</button>
      </div>
      <p className="st-muted">
        {pending.length
          ? '这些人留的不是邮箱，系统没法替你说。按联系方式告诉 TA，顺手把 TA 的报名链接发过去——TA 打开就能看到最新的状态。'
          : '这些人留的是邮箱，已经发信告诉 TA 了（本地开发时写进了收件箱的「发件箱」）。'}
      </p>
      <ul className="sep-notice-list">
        {items.map(i => (
          <li key={i.id} className={i.refund ? 'is-refund' : undefined}>
            <b>{i.name}</b><span>{i.what}</span>
            {i.emailed
              ? <span className="sep-sent">已发信</span>
              : (
                <span className="sep-notice-acts">
                  <CopyLink href={i.contact} raw label={`复制联系方式（${i.contact}）`} />
                  <CopyLink href={i.link} label="复制 TA 的报名链接" />
                </span>
              )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─────────────── 收款码 ───────────────

function PayQr({ memberId, has, needed, onChange }: { memberId: string; has: boolean; needed: boolean; onChange: (v: boolean) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ver, setVer] = useState(0);
  const url = `/api/space/pay-qr?id=${encodeURIComponent(memberId)}`;

  async function pick(ev: ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    setBusy(true);
    setErr('');
    const fd = new FormData();
    // 收款码要锐利：保留 PNG，只把过大的缩到 1600px
    fd.append('file', await shrinkImage(file, { keepPng: true }));
    const r = await call(url, { method: 'POST', body: fd });
    setBusy(false);
    if (!r.ok) return setErr(msgOf(r.data, '没有传上，过一会再试一次'));
    setVer(v => v + 1);
    onChange(true);
  }

  async function drop() {
    if (!window.confirm(needed ? '删掉收款码后，等着付款的人会看到「主人还没放收款码」。确定删掉吗？' : '确定删掉收款码吗？')) return;
    setBusy(true);
    setErr('');
    const r = await call(url, { method: 'DELETE' });
    setBusy(false);
    if (!r.ok) return setErr(msgOf(r.data, '没有删掉，过一会再试一次'));
    onChange(false);
  }

  return (
    <section className="sep-sec sep-qr">
      <h3 className="sep-h">收款码</h3>
      <p className="st-muted">
        收费活动用它收款：报名的人只在付款那一步看得到，不会出现在你的公开页面上。付完款，TA 传一张截图，你对着收款记录确认就好。
      </p>
      {!has && needed && <p className="st-note">你有收费活动，但还没放收款码——报了名的人没法付款。先传一张。</p>}
      <div className="sep-qr-body">
        {has && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="sep-qr-img" src={`${url}&v=${ver}`} alt="你的收款码" width={140} height={140} />
        )}
        <div className="sep-acts">
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} hidden />
          <button type="button" className="st-btn" onClick={() => input.current?.click()} disabled={busy}>
            {busy ? '正在处理…' : has ? '换一张' : '上传收款码'}
          </button>
          {has && <button type="button" className="st-textbtn sep-tb" onClick={drop} disabled={busy}>删掉</button>}
        </div>
      </div>
      {err && <p className="st-err">{err}</p>}
    </section>
  );
}

// ─────────────── 活动表单 ───────────────

function EventForm({ memberId, initial, payQr, active, onDone, onClose }: {
  memberId: string; initial: SpaceEvent | null; payQr: boolean;
  /** 这个活动进行中的报名数（已确认、等付款、待核对、排队） */
  active: number;
  onDone: (d: Record<string, unknown>) => void; onClose: () => void;
}) {
  const uid = useId();
  const [d, setD] = useState<Draft>(initial ? toDraft(initial) : EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD(p => ({ ...p, [k]: v }));
  const fee = Number(d.feeYuan || 0);
  const paid = Number.isFinite(fee) && fee > 0;

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (busy) return;
    if (!d.title.trim()) return setErr('活动得有个名字');
    const startsAt = localInputToIso(d.starts);
    if (!startsAt) return setErr('填一下开始时间');
    const endsAt = d.ends ? localInputToIso(d.ends) : null;
    if (d.ends && !endsAt) return setErr('结束时间的格式不对');
    if (!Number.isFinite(fee) || fee < 0) return setErr('费用填一个数字，免费就填 0');
    const feeCents = Math.round(fee * 100);
    const capacity = d.capacity.trim() === '' ? null : Number(d.capacity);
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) return setErr('名额填一个正整数，不限名额就空着');
    if (feeCents > 0 && d.status === 'open' && !payQr) return setErr('收费活动开放报名之前，先在上面放一张收款码。也可以先存成草稿。');
    if (initial && initial.status === 'open' && d.status !== 'open' && active > 0) {
      const what = d.status === 'draft' ? '改成草稿后，公开页上就不显示这个活动了' : '截止之后，公开页上不再给报名按钮';
      if (!window.confirm(`已经有 ${active} 人报名。${what}；已经报名的人不受影响。确定吗？`)) return;
    }

    setBusy(true);
    setErr('');
    const body = JSON.stringify({ title: d.title, desc: d.desc, startsAt, endsAt, place: d.place, mode: d.mode, capacity, feeCents, status: d.status });
    const r = initial
      ? await call(`/api/space/events/${initial.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body })
      : await call(`/api/space/events?id=${encodeURIComponent(memberId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    setBusy(false);
    if (!r.ok) return setErr(msgOf(r.data, '没有存上，过一会再试一次'));
    onDone(r.data);
  }

  return (
    <form className="sep-form" onSubmit={submit} noValidate>
      <label className="sep-f" htmlFor={`${uid}-t`}>
        <span>活动名字</span>
        <input id={`${uid}-t`} value={d.title} onChange={e => set('title', e.target.value)} maxLength={LIMITS.eventTitle} placeholder="比如：秋天的一次读书会" />
      </label>
      <label className="sep-f" htmlFor={`${uid}-d`}>
        <span>介绍<small>做什么、适合谁、要准备什么</small></span>
        <textarea id={`${uid}-d`} value={d.desc} onChange={e => set('desc', e.target.value)} maxLength={LIMITS.eventDesc} rows={5} />
      </label>
      <div className="sep-2">
        <label className="sep-f" htmlFor={`${uid}-s`}>
          <span>开始<small>北京时间</small></span>
          <input id={`${uid}-s`} type="datetime-local" value={d.starts} onChange={e => set('starts', e.target.value)} />
        </label>
        <label className="sep-f" htmlFor={`${uid}-e`}>
          <span>结束<small>建议填上：开始之后就不能再报名了</small></span>
          <input id={`${uid}-e`} type="datetime-local" value={d.ends} onChange={e => set('ends', e.target.value)} />
        </label>
      </div>
      <fieldset className="sep-f sep-radios">
        <legend>线上还是线下</legend>
        {(Object.keys(MODE_LABEL) as EventMode[]).map(m => (
          <label key={m}><input type="radio" name={`${uid}-mode`} checked={d.mode === m} onChange={() => set('mode', m)} />{MODE_LABEL[m]}</label>
        ))}
      </fieldset>
      <label className="sep-f" htmlFor={`${uid}-p`}>
        <span>地点<small>{d.mode === 'online' ? '比如：腾讯会议，链接报名后发' : '写到别人能找到就行'}</small></span>
        <input id={`${uid}-p`} value={d.place} onChange={e => set('place', e.target.value)} maxLength={LIMITS.place} />
      </label>
      <div className="sep-2">
        <label className="sep-f" htmlFor={`${uid}-c`}>
          <span>名额<small>空着 = 不限</small></span>
          <input id={`${uid}-c`} type="number" inputMode="numeric" min={1} value={d.capacity} onChange={e => set('capacity', e.target.value)} />
        </label>
        <label className="sep-f" htmlFor={`${uid}-f`}>
          <span>费用（元）<small>0 = 免费</small></span>
          <input id={`${uid}-f`} type="number" inputMode="decimal" min={0} step="0.01" value={d.feeYuan} onChange={e => set('feeYuan', e.target.value)} />
        </label>
      </div>
      {paid && !payQr && <p className="st-note">这是收费活动，但你还没放收款码。先在上面传一张，才能开放报名；现在可以先存成草稿。</p>}
      {paid && payQr && <p className="st-muted">收费活动：报名的人会分到一个四位口令，付款时写在备注里；名额先给 TA 留一小时，付完传截图，你对过收款记录再确认。</p>}
      {initial && active > 0 && initial.feeCents !== Math.round((Number.isFinite(fee) ? fee : 0) * 100) && (
        <p className="st-note">已经有人报名，费用改不了。要改的话，取消这场、重新建一场。</p>
      )}
      <label className="sep-f" htmlFor={`${uid}-st`}>
        <span>状态<small>要取消活动，用活动下面的「取消活动」</small></span>
        <select id={`${uid}-st`} value={d.status} onChange={e => set('status', e.target.value as EventStatus)}>
          {EVENT_STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </label>
      {err && <p className="st-err" role="alert">{err}</p>}
      <div className="sep-acts">
        <button type="submit" className="st-btn" disabled={busy}>{busy ? '正在存…' : initial ? '存好' : '建好'}</button>
        <button type="button" className="st-textbtn sep-tb" onClick={onClose} disabled={busy}>算了</button>
      </div>
    </form>
  );
}

// ─────────────── 一个活动 + 报名名单 ───────────────

function EventRow({ group, memberId, payQr, pageUrl, published, hostName, editing, onEdit, onClose, reload, after }: {
  group: Group; memberId: string; payQr: boolean; pageUrl: string; published: boolean; hostName: string; editing: boolean;
  onEdit: () => void; onClose: () => void; reload: () => Promise<void>; after: (d: Record<string, unknown>) => void;
}) {
  const { event: e, registrations: regs, counts } = group;
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const active = counts.confirmed + counts.claimed + counts.pending + counts.waitlist;
  const paidCount = regs.filter(r => r.status === 'claimed' || (r.status === 'confirmed' && r.feeCents > 0)).length;

  async function del() {
    let ask: string;
    if (e.status === 'cancelled') ask = '把这个已取消的活动从列表里移走？';
    else if (!regs.length) ask = '确定删掉这个活动吗？';
    else {
      ask = `取消「${e.title}」？\n\n已经有 ${active} 人报名`
        + (paidCount ? `，其中 ${paidCount} 人付过款，要退款给 TA 们` : '')
        + '。取消之后公开页不再显示这个活动；报名的人在自己的报名页会看到「活动取消了」，留了邮箱的会收到信，其余的人接下来会列出来，你按联系方式去说。';
    }
    if (!window.confirm(ask)) return;
    const r = await call(`/api/space/events/${e.id}`, { method: 'DELETE' });
    if (!r.ok) return setErr(msgOf(r.data, '没有删掉，过一会再试一次'));
    after(r.data);
  }

  if (editing) {
    return (
      <li className="sep-ev">
        <EventForm memberId={memberId} initial={e} payQr={payQr} active={active}
          onDone={d => { onClose(); after(d); }} onClose={onClose} />
      </li>
    );
  }

  const bits = [
    counts.confirmed && `已确认 ${counts.confirmed}`,
    counts.claimed && `待核对 ${counts.claimed}`,
    counts.pending && `等付款 ${counts.pending}`,
    counts.waitlist && `排队 ${counts.waitlist}`,
  ].filter(Boolean);

  return (
    <li className="sep-ev" data-status={e.status}>
      <div className="sep-ev-head">
        <span className="sep-tag" data-status={e.status}>{EVENT_STATUS_SHORT[e.status]}</span>
        <h4 className="sep-ev-t">{e.title}</h4>
      </div>
      <p className="sep-ev-meta">
        <span>{formatEventTime(e.startsAt, e.endsAt)}</span>
        <span>{e.place ? `${MODE_LABEL[e.mode]} · ${e.place}` : MODE_LABEL[e.mode]}</span>
        <span>{formatFee(e.feeCents)}</span>
        <span>{e.capacity === null ? `占名额 ${e.taken}（不限）` : `占名额 ${e.taken} / ${e.capacity}`}</span>
      </p>
      {e.feeCents > 0 && e.status === 'open' && !payQr && <p className="st-err">还没放收款码，报了名的人没法付款。</p>}
      {e.status !== 'cancelled' && <Cover event={e} onChange={() => void reload()} />}
      <div className="sep-acts">
        <button type="button" className="st-textbtn sep-tb" onClick={() => setOpen(v => !v)} aria-expanded={open}>
          {open ? '收起名单' : `报名名单（${active}${bits.length ? `：${bits.join('、')}` : ''}）`}
        </button>
        {e.status !== 'cancelled' && <button type="button" className="st-textbtn sep-tb" onClick={onEdit}>编辑</button>}
        {/* 分享这一场（链接带 ?e=，发出去的预览卡片是这一场）。网站还没发布时不给：那时链接打开是 404 */}
        {e.status === 'open' && pageUrl && published && (
          <ShareEvent
            path={eventSharePath(pageUrl, e.id)}
            title={e.title}
            text={eventShareText(e, hostName)}
          />
        )}
        {e.status !== 'cancelled' ? (
          <button type="button" className="st-textbtn sep-tb sep-danger" onClick={del}>{regs.length ? '取消活动' : '删掉'}</button>
        ) : !active ? (
          <button type="button" className="st-textbtn sep-tb" onClick={del}>从列表里移走</button>
        ) : null}
      </div>
      {err && <p className="st-err">{err}</p>}
      {open && <RegList regs={regs} after={after} />}
    </li>
  );
}

/** 活动封面：一张照片，出现在公开页活动标题上方 */
function Cover({ event: e, onChange }: { event: HostEvent; onChange: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const url = `/api/space/event-image?e=${encodeURIComponent(e.id)}`;

  async function pick(ev: ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    setBusy(true);
    setErr('');
    const fd = new FormData();
    // 手机照片动辄好几 MB：先在浏览器里缩到 1600px，线上接口收不了 4.5MB 以上的请求
    fd.append('file', await shrinkImage(file));
    const r = await call(url, { method: 'POST', body: fd });
    setBusy(false);
    if (!r.ok) return setErr(msgOf(r.data, '照片没有传上，换一张试试'));
    onChange();
  }

  async function drop() {
    if (!window.confirm('删掉这张封面照片？')) return;
    setBusy(true);
    const r = await call(url, { method: 'DELETE' });
    setBusy(false);
    if (!r.ok) return setErr(msgOf(r.data, '没有删掉，过一会再试一次'));
    onChange();
  }

  return (
    <div className="sep-cover">
      {e.coverImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`${url}&v=${Date.parse(e.updatedAt) || 0}`} alt="活动封面" width={120} height={80} />
      )}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} hidden />
      <button type="button" className="st-textbtn sep-tb" onClick={() => input.current?.click()} disabled={busy}>
        {busy ? '正在处理…' : e.coverImage ? '换一张封面' : '加一张封面照片'}
      </button>
      {e.coverImage && <button type="button" className="st-textbtn sep-tb" onClick={drop} disabled={busy}>删掉封面</button>}
      {err && <span className="st-err">{err}</span>}
    </div>
  );
}

function RegList({ regs, after }: { regs: HostReg[]; after: (d: Record<string, unknown>) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  if (!regs.length) return <p className="st-muted sep-empty">还没有人报名。</p>;

  async function act(r: HostReg, action: 'confirm' | 'reject' | 'promote' | 'cancel' | 'delete' | 'block' | 'unblock') {
    let hostNote = '';
    let cancelToo = false;
    if (action === 'block') {
      if (!window.confirm(`屏蔽 ${r.name}？\n\n之后用这个联系方式、或者从 TA 当时的网络来报名、打招呼、预约，你都不会再收到。对方不会知道被屏蔽了。想恢复随时可以取消屏蔽。`)) return;
      cancelToo = ['confirmed', 'pending', 'claimed', 'waitlist'].includes(r.status)
        && window.confirm(`顺便取消 ${r.name} 的这条报名、把名额空出来吗？`);
    } else if (action === 'reject') {
      const v = window.prompt('驳回的原因（报名人在自己的报名页能看到，可以不填）', r.status === 'claimed' ? '付款记录里没对上' : '');
      if (v === null) return;
      hostNote = v;
    } else if (action === 'promote' && r.feeCents > 0
      && !window.confirm(`把 ${r.name} 转正？TA 会分到一个付款口令，名额从现在起留一小时。接下来会提示你去通知 TA。`)) return;
    else if (action === 'cancel' && !window.confirm(`替 ${r.name} 取消这条报名？`)) return;
    else if (action === 'delete' && !window.confirm(`删掉 ${r.name} 的这条报名？删了就找不回来了。`)) return;
    setBusy(r.id);
    setErr('');
    const res = action === 'delete'
      ? await call(`/api/space/registrations/${r.id}`, { method: 'DELETE' })
      : await call(`/api/space/registrations/${r.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, hostNote, cancel: cancelToo }),
      });
    setBusy(null);
    if (!res.ok) return setErr(msgOf(res.data, '没有成功，刷新一下再试'));
    after(res.data);
  }

  return (
    <>
      {err && <p className="st-err">{err}</p>}
      <ol className="sep-regs">
        {regs.map(r => {
          const b = busy === r.id;
          return (
            <li key={r.id} className="sep-reg" data-status={r.status}>
              <div className="sep-reg-top">
                <b className="sep-reg-name">{r.name}</b>
                <span className="sep-reg-st" data-status={r.status}>
                  {REG_LABEL[r.status]}
                  {r.holdExpired ? '（超过一小时没付款，名额没再留）' : r.status === 'pending' && r.holdUntil ? `（名额留到 ${formatMoment(r.holdUntil)}）` : ''}
                </span>
                {r.blocked && <span className="sep-reg-blocked">已屏蔽</span>}
              </div>
              <p className="sep-reg-contact">
                {r.contact}
                <CopyLink href={r.contact} raw label="复制" textClassName="sep-mini-link" />
                <CopyLink href={r.link} label="复制 TA 的报名链接" textClassName="sep-mini-link" />
              </p>
              {r.note && <p className="sep-reg-note">{r.note}</p>}
              <p className="sep-reg-meta">
                <span>{formatEventTime(r.createdAt)} 报名</span>
                {r.feeCents > 0 && <span>{formatFee(r.feeCents)}</span>}
                {r.payCode && (r.status === 'pending' || r.status === 'claimed' || r.status === 'confirmed') && <span>口令 <b className="sep-code">{r.payCode}</b></span>}
                {r.hasProof && <a href={`/api/space/registration/proof?r=${r.id}`} target="_blank" rel="noreferrer">看截图</a>}
                {r.status === 'rejected' && r.hostNote && <span>驳回原因：{r.hostNote}</span>}
              </p>
              <div className="sep-acts sep-reg-acts">
                {(r.status === 'pending' || r.status === 'claimed' || r.status === 'rejected') && (
                  <button type="button" className="sep-mini is-main" disabled={b} onClick={() => act(r, 'confirm')}>
                    {r.status === 'rejected' ? '改回确认' : '确认收到款'}
                  </button>
                )}
                {r.status === 'waitlist' && (
                  <button type="button" className="sep-mini is-main" disabled={b} onClick={() => act(r, 'promote')}>从排队转正</button>
                )}
                {(r.status === 'pending' || r.status === 'claimed' || r.status === 'waitlist' || r.status === 'confirmed') && (
                  <button type="button" className="sep-mini" disabled={b} onClick={() => act(r, 'reject')}>驳回</button>
                )}
                {(r.status === 'pending' || r.status === 'claimed' || r.status === 'waitlist' || r.status === 'confirmed') && (
                  <button type="button" className="sep-mini" disabled={b} onClick={() => act(r, 'cancel')}>取消</button>
                )}
                {(r.status === 'cancelled' || r.status === 'rejected') && (
                  <button type="button" className="sep-mini" disabled={b} onClick={() => act(r, 'delete')}>删掉</button>
                )}
                <button type="button" className="sep-mini" disabled={b} onClick={() => act(r, r.blocked ? 'unblock' : 'block')}>
                  {r.blocked ? '取消屏蔽' : '屏蔽'}
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
