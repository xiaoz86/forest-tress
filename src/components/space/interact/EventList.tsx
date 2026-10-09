'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import { eventAnchor, eventSharePath, eventShareText, formatEventTime, formatFee, formatMoment, MODE_LABEL } from '@/lib/space/eventTime';
import { LIMITS, type PublicEvent, type RegistrationStatus } from '@/lib/space/types';
import { CopyLink } from './RegistrationActions';
import ShareEvent from './ShareEvent';
import './events.css';

type Props = {
  memberId: string; events: PublicEvent[]; preview: boolean; viewerName?: string;
  /** 这个人网站对外的地址（有短链用短链）：单独分享一场活动时用 */
  sharePath: string;
  hostName: string;
};

type Result = {
  token: string;
  status: RegistrationStatus;
  payCode: string | null;
  feeCents: number;
  /** 等付款的名额保留到什么时候（ISO） */
  holdUntil?: string | null;
  again: boolean;
};

/** 这台设备上报过名的，记下报名链接：下次打开还能找到「查看我的报名」 */
const storeKey = (eventId: string) => `sp_reg_${eventId}`;
const DESC_FOLD = 140;

/**
 * 网站「一起做点什么」那一章里的近期活动，每个活动可以就地报名。
 * 没有开放报名的活动时什么都不渲染。
 */
export default function EventList({ memberId, events, preview, viewerName, sharePath, hostName }: Props) {
  if (!events.length) return null;
  return (
    <div className="spe" data-member={memberId}>
      <p className="sp-lead">近期活动——</p>
      {preview && <p className="spe-preview">这是你自己的预览，报名会真的记下来，测完可以在管理页删掉</p>}
      <ol className="spe-list">
        {events.map(e => <EventItem key={e.id} event={e} viewerName={viewerName} sharePath={sharePath} hostName={hostName} />)}
      </ol>
    </div>
  );
}

function seatsText(e: PublicEvent): string | null {
  if (e.left === null) return null;
  return e.left > 0 ? `还剩 ${e.left} 个名额` : '名额已满，可以排队';
}

function placeText(e: PublicEvent): string {
  const mode = MODE_LABEL[e.mode];
  return e.place ? `${mode} · ${e.place}` : mode;
}

function EventItem({ event: e, viewerName, sharePath, hostName }: {
  event: PublicEvent; viewerName?: string; sharePath: string; hostName: string;
}) {
  const anchor = eventAnchor(e.id);
  const [hit, setHit] = useState(false);
  const [open, setOpen] = useState(false);
  const [unfold, setUnfold] = useState(false);
  const [mine, setMine] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const full = e.left !== null && e.left <= 0;
  const seats = seatsText(e);
  const longDesc = [...e.desc].length > DESC_FOLD;
  const desc = longDesc && !unfold ? `${[...e.desc].slice(0, DESC_FOLD).join('')}…` : e.desc;
  // 分享出去的那一句：标题之外，带上时间、地点和谁发起的
  const share = (
    <ShareEvent
      variant="space"
      path={eventSharePath(sharePath, e.id)}
      title={e.title}
      text={eventShareText(e, hostName)}
    />
  );

  // 带着 #e-xxxxxxxx 打开（主人单独发出去的活动链接）：滚到这场活动，并亮一下
  useEffect(() => {
    const check = () => {
      if (window.location.hash !== `#${anchor}`) return;
      setHit(true);
      document.getElementById(anchor)?.scrollIntoView({ block: 'start' });
    };
    check();
    window.addEventListener('hashchange', check);
    return () => window.removeEventListener('hashchange', check);
  }, [anchor]);

  useEffect(() => {
    try {
      const t = window.localStorage.getItem(storeKey(e.id));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 只能在挂载后读
      if (t) setMine(t);
    } catch {
      // 隐私模式下 localStorage 不可用：不影响报名
    }
  }, [e.id]);

  function done(r: Result) {
    setResult(r);
    setMine(r.token);
    setOpen(false);
    try {
      window.localStorage.setItem(storeKey(e.id), r.token);
    } catch {
      // 同上
    }
  }

  return (
    <li className={`spe-item${hit ? ' is-hit' : ''}`} id={anchor}>
      {e.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- 活动封面走自己的接口（按活动是否公开给图），不经过 next/image
        <img className="spe-cover" src={e.coverUrl} alt="" loading="lazy" />
      )}
      <h3 className="spe-t">{e.title}</h3>
      <p className="spe-meta">
        <span>{formatEventTime(e.startsAt, e.endsAt)}</span>
        <span>{placeText(e)}</span>
      </p>
      <p className="spe-meta spe-meta--2">
        <span className="spe-fee">{formatFee(e.feeCents)}</span>
        {seats && <span className={full ? 'spe-full' : undefined}>{seats}</span>}
      </p>
      {e.desc && (
        <p className="spe-d">
          {desc}
          {longDesc && (
            <button type="button" className="spe-textbtn" onClick={() => setUnfold(v => !v)}>
              {unfold ? '收起' : '展开'}
            </button>
          )}
        </p>
      )}

      {result ? (
        <Outcome r={result} />
      ) : e.started ? (
        <div className="spe-acts">
          <p className="spe-small spe-started">已经开始了，这次不能报名了。</p>
          {mine && <a className="spe-link" href={`/space/r/${mine}`}>查看我的报名</a>}
        </div>
      ) : open ? (
        <RegisterForm event={e} viewerName={viewerName} full={full} token={mine} onDone={done} onClose={() => setOpen(false)} />
      ) : (
        <div className="spe-acts">
          <button type="button" className="sp-btn spe-btn" onClick={() => setOpen(true)} aria-expanded={false}>
            {full ? '排队' : '报名'}
          </button>
          {mine && <a className="spe-link" href={`/space/r/${mine}`}>查看我的报名</a>}
          {share}
        </div>
      )}
    </li>
  );
}

function Outcome({ r }: { r: Result }) {
  const href = `/space/r/${r.token}`;
  let line: string;
  if (r.status === 'confirmed') line = r.again ? '你之前已经报上了，到时候见。' : '报上了，到时候见。';
  else if (r.status === 'pending') {
    const until = r.holdUntil ? `名额给你留到 ${formatMoment(r.holdUntil)}。` : '名额先给你留一小时。';
    line = `${r.again ? '你之前已经报过名了。' : until}下一步去付款：${formatFee(r.feeCents)}，付款备注里写 ${r.payCode}。`;
  } else if (r.status === 'claimed') line = '你之前已经报过名、传过付款截图了，等主人核对就好。';
  else if (r.status === 'waitlist') line = `${r.again ? '你之前已经在排队了。' : '名额满了，你排上队了。'}有人退出时，主人会联系你。`;
  else line = '你之前的报名没有通过，有疑问可以直接联系主人。';

  return (
    <div className="spe-done" role="status">
      <p className="spe-done-t">{line}</p>
      <div className="spe-acts">
        {r.status === 'pending'
          ? <a className="sp-btn spe-btn" href={href}>去付款</a>
          : <a className="spe-link" href={href}>查看我的报名</a>}
        <CopyLink href={href} label="复制我的报名链接" />
      </div>
      <p className="spe-small">这个链接只有你有，是查看、取消报名的入口。点右上角 ··· 收藏，或者复制链接发给「文件传输助手」。</p>
    </div>
  );
}

function RegisterForm({ event: e, viewerName, full, token, onDone, onClose }: {
  event: PublicEvent; viewerName?: string; full: boolean;
  /** 这台设备之前报过名留下的口令：再报一次时带上，服务端据此认出是同一个人，把原来那条还回来 */
  token: string | null;
  onDone: (r: Result) => void; onClose: () => void;
}) {
  const uid = useId();
  const [name, setName] = useState(viewerName || '');
  const [contact, setContact] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (busy) return;
    const website = String(new FormData(ev.currentTarget).get('website') || '');
    if (!name.trim()) return setErr('留个名字吧，主人好认出你');
    if (!contact.trim()) return setErr('留一个联系方式（微信号、手机或邮箱），主人才能找到你');
    setBusy(true);
    setErr('');
    try {
      const res = await fetch(`/api/space/events/${encodeURIComponent(e.id)}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, contact, note, website, ...(token ? { token } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.message || (res.status === 404 ? '这个活动找不到了，刷新页面看看' : '没有报上，过一会再试一次'));
        return;
      }
      onDone(data as Result);
    } catch {
      setErr('网络好像断了，检查一下再点一次');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="spe-form" onSubmit={submit} noValidate>
      {full && <p className="spe-small">名额已经满了。先排上队，有人退出时主人会联系你。</p>}
      {!full && e.feeCents > 0 && <p className="spe-small">收费活动：报名后名额给你留一小时，下一步扫码付款、传一张截图。</p>}
      <label className="spe-field" htmlFor={`${uid}-n`}>
        <span>名字</span>
        <input id={`${uid}-n`} value={name} onChange={v => setName(v.target.value)} maxLength={LIMITS.name} autoComplete="name" required />
      </label>
      <label className="spe-field" htmlFor={`${uid}-c`}>
        <span>怎么联系你<small>微信号、手机或邮箱，只有主人看得到</small></span>
        <input id={`${uid}-c`} value={contact} onChange={v => setContact(v.target.value)} maxLength={LIMITS.contact} autoComplete="off" required />
      </label>
      <label className="spe-field" htmlFor={`${uid}-m`}>
        <span>想说的话<small>可以不填</small></span>
        <textarea id={`${uid}-m`} value={note} onChange={v => setNote(v.target.value)} maxLength={LIMITS.note} rows={3} />
      </label>
      {/* 蜜罐：人看不见也不会填，脚本常常会填 */}
      <div className="spe-hp" aria-hidden="true">
        <label>网站<input name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" /></label>
      </div>
      {err && <p className="spe-err" role="alert">{err}</p>}
      <div className="spe-acts">
        <button type="submit" className="sp-btn spe-btn" disabled={busy}>
          {busy ? '正在提交…' : full ? '排队' : '提交报名'}
        </button>
        <button type="button" className="spe-textbtn spe-cancel" onClick={onClose} disabled={busy}>先不报了</button>
      </div>
    </form>
  );
}
