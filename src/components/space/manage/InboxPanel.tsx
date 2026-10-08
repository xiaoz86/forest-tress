'use client';

import { useCallback, useEffect, useState } from 'react';
import type { InboxBooking, InboxData, InboxGreeting } from '@/app/api/space/inbox/route';
import type { BookingStatus } from '@/lib/space/types';
import './inbox-panel.css';

export type InboxPanelProps = { memberId: string };

type Loaded = { data: InboxData; at: number };
type Reply = { id: string; status: BookingStatus; text: string };

const STATUS_LABEL: Record<BookingStatus, string> = {
  new: '新预约',
  accepted: '已接受',
  declined: '已婉拒',
  done: '已完成',
};
const STATUS_ORDER: Record<BookingStatus, number> = { new: 0, accepted: 1, declined: 2, done: 3 };
const ACTION_LABEL: Record<BookingStatus, string> = {
  new: '改回「新预约」',
  accepted: '接受',
  declined: '婉拒',
  done: '标为完成',
};

/** 改动失败时的错误码 → 人话，并告诉主人下一步怎么做 */
const PATCH_WORDS: Record<string, string> = {
  'not-found': '这一条已经不在了（可能在别的窗口里删掉了）。已经帮你刷新。',
  'too-many-blocked': '屏蔽名单满了（最多 500 个）。先取消几个不再需要的屏蔽。',
  forbidden: '登录好像过期了，或者换了账号。重新登录后再来改。',
  'storage-unavailable': '资料库暂时连不上，过一会儿再点一次。',
  'database-unavailable': '资料库暂时连不上，过一会儿再点一次。',
};

async function fetchInbox(memberId: string): Promise<InboxData> {
  const res = await fetch(`/api/space/inbox?id=${encodeURIComponent(memberId)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as InboxData;
}

/** 管理页的收件箱：打招呼、预约、（本地开发时）本来会发给你的提醒邮件 */
export default function InboxPanel({ memberId }: InboxPanelProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [reply, setReply] = useState<Reply | null>(null);
  const [copied, setCopied] = useState('');

  const reload = useCallback(async () => {
    try {
      const data = await fetchInbox(memberId);
      setLoaded({ data, at: Date.now() });
      setLoadError('');
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      setLoadError(code === '403'
        ? '只有这个空间的主人能看收件箱。换成自己的账号登录再来。'
        : '收件箱没加载出来。等一会儿点「刷新」再试试。');
    }
  }, [memberId]);

  useEffect(() => {
    let alive = true;
    fetchInbox(memberId).then(
      data => { if (alive) setLoaded({ data, at: Date.now() }); },
      err => {
        if (!alive) return;
        setLoadError(err instanceof Error && err.message === '403'
          ? '只有这个空间的主人能看收件箱。换成自己的账号登录再来。'
          : '收件箱没加载出来。等一会儿点「刷新」再试试。');
      },
    );
    return () => { alive = false; };
  }, [memberId]);

  async function patch(key: string, body: Record<string, unknown>): Promise<boolean> {
    setBusy(key);
    setError('');
    try {
      const res = await fetch(`/api/space/inbox?id=${encodeURIComponent(memberId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(PATCH_WORDS[d.error ?? ''] ?? '没改成功。等一会儿再点一次试试。');
        await reload();
        return false;
      }
      await reload();
      return true;
    } catch {
      setError('没改成功，网络好像断了。等网络好了再点一次。');
      return false;
    } finally {
      setBusy('');
    }
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(c => (c === key ? '' : c)), 1600);
    } catch {
      setError('这个浏览器不让自动复制。长按联系方式手动复制吧。');
    }
  }

  function block(kind: 'greetingId' | 'bookingId', id: string, blocked: boolean) {
    if (blocked) {
      void patch(`unblock:${id}`, { kind: 'unblock', [kind]: id });
      return;
    }
    const ok = window.confirm(
      '屏蔽这个人？\n\n之后 TA 用这个联系方式、或者从 TA 当时用的网络来打招呼、预约、报名，你都不会再收到，也不会收到提醒。对方不会知道被屏蔽了。\n（和 TA 用同一个网络的人也可能一起被挡住。）\n已经收到的这些不会删掉；想恢复随时可以取消屏蔽。',
    );
    if (ok) void patch(`block:${id}`, { kind: 'block', [kind]: id });
  }

  function del(kind: 'greetingId' | 'bookingId', id: string) {
    const what = kind === 'greetingId' ? '这条招呼' : '这个预约（对方的预约链接也会打不开）';
    if (window.confirm(`删掉${what}？删掉之后找不回来。`)) void patch(`del:${id}`, { kind: 'delete', [kind]: id });
  }

  async function sendReply() {
    if (!reply) return;
    const ok = await patch(`reply:${reply.id}`, { kind: 'booking', id: reply.id, status: reply.status, hostNote: reply.text });
    if (ok) setReply(null);
  }

  if (!loaded) {
    return (
      <section className="ib">
        {loadError
          ? <p className="st-err">{loadError} <button type="button" className="ib-link" onClick={() => void reload()}>刷新</button></p>
          : <p className="st-muted">正在打开收件箱…</p>}
      </section>
    );
  }

  const { data, at } = loaded;
  const greetings = [...data.greetings].sort((a, b) => Number(!!a.readAt) - Number(!!b.readAt) || b.createdAt.localeCompare(a.createdAt));
  const bookings = [...data.bookings].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.createdAt.localeCompare(a.createdAt));
  const unread = greetings.filter(g => !g.readAt).length;
  const fresh = bookings.filter(b => b.status === 'new').length;

  return (
    <section className="ib">
      <div className="ib-top">
        <p className="ib-sum">
          {unread || fresh
            ? [unread ? `${unread} 条新招呼` : '', fresh ? `${fresh} 个新预约` : ''].filter(Boolean).join(' · ')
            : '没有新的消息'}
        </p>
        <button type="button" className="ib-link" onClick={() => void reload()} disabled={!!busy}>刷新</button>
      </div>
      <p className="ib-privacy">这里的联系方式只有你（和帮忙排查问题的管理员）能看到，访客看不到别人留的任何东西。</p>
      {error && <p className="ib-err" role="alert">{error}</p>}

      <h3 className="ib-h">打个招呼 <span>{greetings.length}</span></h3>
      {!data.greetingsOpen && <p className="ib-closed">你现在关掉了站内打招呼，访客看不到这个表单。想重新打开，去『谁能看到』最下面的『互动』里改。</p>}
      {greetings.length === 0 ? (
        <p className="ib-empty">还没有人打招呼。有人在你网站最底下点「打个招呼」，就会出现在这里，你的注册邮箱也会收到提醒。</p>
      ) : (
        <ul className="ib-list">
          {greetings.map(g => (
            <GreetingItem
              key={g.id} g={g} now={at} busy={busy} copied={copied === g.id}
              onCopy={() => void copy(g.contact, g.id)}
              onRead={read => void patch(`read:${g.id}`, { kind: 'greeting', id: g.id, read })}
              onBlock={() => block('greetingId', g.id, g.blocked)}
              onDelete={() => del('greetingId', g.id)}
            />
          ))}
        </ul>
      )}

      <h3 className="ib-h">预约 <span>{bookings.length}</span></h3>
      {!data.bookingsOpen && <p className="ib-closed">你现在关掉了站内预约，服务单上显示的是「问问这个」。想重新打开，去『谁能看到』最下面的『互动』里改。</p>}
      {bookings.length === 0 ? (
        <p className="ib-empty">还没有人预约。访客在服务单上点「预约这个」，就会出现在这里。</p>
      ) : (
        <ul className="ib-list">
          {bookings.map(b => (
            <BookingItem
              key={b.id} b={b} now={at} busy={busy} copied={copied === b.id}
              reply={reply?.id === b.id ? reply : null}
              onCopy={() => void copy(b.contact, b.id)}
              onStartReply={status => setReply({ id: b.id, status, text: b.hostNote })}
              onReplyText={text => setReply(r => (r ? { ...r, text } : r))}
              onCancelReply={() => setReply(null)}
              onSendReply={() => void sendReply()}
              onBlock={() => block('bookingId', b.id, b.blocked)}
              onDelete={() => del('bookingId', b.id)}
            />
          ))}
        </ul>
      )}

      {data.outbox.length > 0 && (
        <>
          <h3 className="ib-h">发件箱（本地开发） <span>{data.outbox.length}</span></h3>
          <p className="ib-closed">本地开发不真的发信。下面是本来会发给你的提醒邮件；上线后，这些会发到你的注册邮箱。</p>
          <ul className="ib-list ib-mail">
            {data.outbox.map(m => (
              <li key={m.id} className="ib-item">
                <p className="ib-row"><b>{m.subject}</b><span className="ib-time">{ago(m.createdAt, at)}</span></p>
                <pre className="ib-mailbody">{m.text}</pre>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Who({ name, member }: { name: string; member: string | null }) {
  return (
    <>
      <b className="ib-name">{name}</b>
      {member && (
        <a className="ib-badge" href={`/creators/${member}`} target="_blank" rel="noreferrer">森林成员 ↗</a>
      )}
    </>
  );
}

function Contact({ contact, blocked, copied, onCopy }: { contact: string; blocked: boolean; copied: boolean; onCopy: () => void }) {
  return (
    <p className="ib-contact">
      <span className="ib-k">联系方式</span>
      <span className="ib-v">{contact}</span>
      <button type="button" className="ib-link ib-copy" onClick={onCopy}>{copied ? '已复制' : '复制'}</button>
      {blocked && <span className="ib-blocked">已屏蔽</span>}
    </p>
  );
}

function GreetingItem({ g, now, busy, copied, onCopy, onRead, onBlock, onDelete }: {
  g: InboxGreeting; now: number; busy: string; copied: boolean;
  onCopy: () => void; onRead: (read: boolean) => void; onBlock: () => void; onDelete: () => void;
}) {
  const working = busy.endsWith(`:${g.id}`);
  return (
    <li className="ib-item" data-new={g.readAt ? undefined : ''}>
      <p className="ib-row">
        {!g.readAt && <span className="ib-dot" aria-label="未读" />}
        <Who name={g.name} member={g.visitorMemberId} />
        <span className="ib-time">{ago(g.createdAt, now)}</span>
      </p>
      <Contact contact={g.contact} blocked={g.blocked} copied={copied} onCopy={onCopy} />
      {g.message ? <p className="ib-msg">{g.message}</p> : <p className="ib-msg ib-quiet">（TA 没有留话，只留了联系方式）</p>}
      <div className="ib-acts">
        {g.readAt
          ? <button type="button" className="ib-btn" disabled={working} onClick={() => onRead(false)}>标为未读</button>
          : <button type="button" className="ib-btn ib-btn--main" disabled={working} onClick={() => onRead(true)}>标为已读</button>}
        <button type="button" className="ib-btn" disabled={working} onClick={onBlock}>{g.blocked ? '取消屏蔽' : '屏蔽这个人'}</button>
        <button type="button" className="ib-btn ib-btn--del" disabled={working} onClick={onDelete}>删除</button>
      </div>
    </li>
  );
}

function BookingItem({ b, now, busy, copied, reply, onCopy, onStartReply, onReplyText, onCancelReply, onSendReply, onBlock, onDelete }: {
  b: InboxBooking; now: number; busy: string; copied: boolean; reply: Reply | null;
  onCopy: () => void; onStartReply: (s: BookingStatus) => void; onReplyText: (t: string) => void;
  onCancelReply: () => void; onSendReply: () => void; onBlock: () => void; onDelete: () => void;
}) {
  const working = busy.endsWith(`:${b.id}`);
  const next: BookingStatus[] = b.status === 'new' ? ['accepted', 'declined']
    : b.status === 'accepted' ? ['done', 'declined']
      : b.status === 'declined' ? ['accepted'] : [];
  return (
    <li className="ib-item" data-new={b.status === 'new' ? '' : undefined}>
      <p className="ib-row">
        {b.status === 'new' && <span className="ib-dot" aria-label="新预约" />}
        <Who name={b.name} member={b.visitorMemberId} />
        <span className="ib-status" data-status={b.status}>{STATUS_LABEL[b.status]}</span>
        <span className="ib-time">{ago(b.createdAt, now)}</span>
      </p>
      <Contact contact={b.contact} blocked={b.blocked} copied={copied} onCopy={onCopy} />
      <dl className="ib-dl">
        <dt>预约的是</dt><dd>{b.serviceTitle || '（没选具体服务，想约你的时间）'}</dd>
        <dt>希望的时间</dt><dd>{b.preferred || '（没写）'}</dd>
        {b.note && (<><dt>TA 说</dt><dd className="ib-pre">{b.note}</dd></>)}
        {b.hostNote && (<><dt>你的留言</dt><dd className="ib-pre">{b.hostNote}</dd></>)}
      </dl>

      {reply ? (
        <div className="ib-reply">
          <label className="ib-k" htmlFor={`reply-${b.id}`}>
            {reply.status === b.status ? '给 TA 留一句话' : `${ACTION_LABEL[reply.status]}，想对 TA 说一句吗？`}
            <small>（TA 在自己的预约页面能看到，可以不写）</small>
          </label>
          <textarea id={`reply-${b.id}`} className="ib-ta" rows={3} value={reply.text} maxLength={300}
            onChange={e => onReplyText(e.target.value)}
            placeholder={reply.status === 'accepted' ? '比如：我加你微信，我们约具体时间' : reply.status === 'declined' ? '比如：这个月排满了，下个月可以再来问问' : ''} />
          <div className="ib-acts">
            <button type="button" className="ib-btn ib-btn--main" disabled={working} onClick={onSendReply}>
              {reply.status === b.status ? '保存留言' : `确定${ACTION_LABEL[reply.status]}`}
            </button>
            <button type="button" className="ib-btn" disabled={working} onClick={onCancelReply}>取消</button>
          </div>
        </div>
      ) : (
        <div className="ib-acts">
          {next.map(s => (
            <button key={s} type="button" className={`ib-btn${s === 'accepted' ? ' ib-btn--main' : ''}`} disabled={working} onClick={() => onStartReply(s)}>
              {ACTION_LABEL[s]}
            </button>
          ))}
          <button type="button" className="ib-btn" disabled={working} onClick={() => onStartReply(b.status)}>
            {b.hostNote ? '改留言' : '给 TA 留言'}
          </button>
          <button type="button" className="ib-btn" disabled={working} onClick={onBlock}>{b.blocked ? '取消屏蔽' : '屏蔽这个人'}</button>
          <button type="button" className="ib-btn ib-btn--del" disabled={working} onClick={onDelete}>删除</button>
        </div>
      )}
    </li>
  );
}

/** 相对时间：「刚刚」「3 小时前」「5 天前」，再早就写日期 */
function ago(iso: string, now: number): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} 天前`;
  const d = new Date(t);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return `${sameYear ? '' : `${d.getFullYear()} 年 `}${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}
