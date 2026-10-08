'use client';

import { useEffect, useId, useState } from 'react';
import CopyLink from '@/app/space/b/CopyLink';
import './book.css';

export type BookButtonProps = {
  memberId: string;
  /** 服务单里的标题；为空 = 没有服务单时泛泛的「想约个时间」 */
  serviceTitle: string;
  open: boolean;
  preview: boolean;
  /** 登录的森林成员自己的名字：预填「你的名字」 */
  viewerName?: string;
};

type Phase = 'closed' | 'form' | 'sending' | 'done';

const NOTE_MAX = 300;

/**
 * 预约成功后把查看口令存在这台设备上：刷新、过几天再来，服务单这一行还能找到「查看我的预约」。
 * 一个空间一个 key，值是 { [服务标题]: 口令 }（泛预约的标题是空字符串）。
 */
const storeKey = (memberId: string) => `sp_book_${memberId}`;

function readMine(memberId: string): Record<string, string> {
  try {
    const v: unknown = JSON.parse(window.localStorage.getItem(storeKey(memberId)) || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, string> : {};
  } catch {
    // 隐私模式下 localStorage 不可用、或者存坏了：不影响预约
    return {};
  }
}

function saveMine(memberId: string, serviceTitle: string, token: string) {
  try {
    window.localStorage.setItem(storeKey(memberId), JSON.stringify({ ...readMine(memberId), [serviceTitle]: token }));
  } catch {
    // 同上
  }
}

/**
 * 服务单每一行右侧的「预约这个 →」。渲染在 .sp-menu li 的 grid 里：
 * 按钮留在原位（.sp-menu-a 的位置），展开的表单用一个跨列的容器放在这一行下面。
 * 没有服务单、只有「可以提供」原话时，SpaceSite 用空标题调它：换一套「想约个时间」的文案。
 */
export default function BookButton({ memberId, serviceTitle, open, preview, viewerName }: BookButtonProps) {
  const uid = useId();
  const formId = `${uid}-form`;
  const [phase, setPhase] = useState<Phase>('closed');
  const [name, setName] = useState(viewerName ?? '');
  const [contact, setContact] = useState('');
  const [preferred, setPreferred] = useState('');
  const [note, setNote] = useState('');
  const [website, setWebsite] = useState('');
  const [error, setError] = useState('');
  const [token, setToken] = useState<string | null>(null);
  /** 这台设备上以前对这一项发过的预约 */
  const [mine, setMine] = useState<string | null>(null);

  useEffect(() => {
    const t = readMine(memberId)[serviceTitle];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 只能在挂载后读
    if (typeof t === 'string' && t) setMine(t);
  }, [memberId, serviceTitle]);

  if (!open) return <a className="sp-menu-a" href="#connect">问问这个 →</a>;

  const generic = !serviceTitle;

  const expanded = phase !== 'closed';

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (phase === 'sending') return;
    if (!name.trim()) return setError('先写一下你的名字，好让 TA 知道你是谁。');
    if (contact.trim().length < 3) return setError('留一个联系方式吧（微信号、手机或邮箱都行），不然 TA 没法回复你。');
    setError('');
    setPhase('sending');
    try {
      const res = await fetch(`/api/space/book?id=${encodeURIComponent(memberId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceTitle, name, contact, preferred, note, website }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string; token?: string };
      if (res.ok) {
        const t = typeof data.token === 'string' ? data.token : null;
        setToken(t);
        if (t) {
          saveMine(memberId, serviceTitle, t);
          setMine(t);
        }
        setPhase('done');
        return;
      }
      setError(explain(res.status, data));
    } catch {
      setError('没送出去，网络好像断了。你填的内容还在，等网络好了再点一次「送出预约」。');
    }
    setPhase('form');
  }

  const sending = phase === 'sending';
  return (
    <>
      <button
        type="button"
        className="sp-menu-a bk-go"
        aria-expanded={expanded}
        aria-controls={formId}
        onClick={() => { setError(''); setPhase(phase === 'closed' ? 'form' : 'closed'); }}
        disabled={phase === 'done' || sending}
      >
        {phase === 'done' ? '已送出 ✓' : expanded ? '收起' : generic ? '想约个时间 →' : '预约这个 →'}
      </button>

      {mine && phase === 'closed' && (
        <p className="bk-mine">
          你之前约过{generic ? '' : '这一项'}：<a className="bk-mine-a" href={`/space/b/${mine}`}>查看我的预约 →</a>
        </p>
      )}

      {expanded && (
        <div className="bk-wrap" id={formId}>
          {phase === 'done' ? (
            <div className="bk-done" role="status">
              <p className="bk-done-t">预约请求已送到。</p>
              <p className="bk-done-d">TA 会通过你留的联系方式找你。</p>
              {token && (
                <>
                  <p className="bk-links">
                    <a className="bk-link" href={`/space/b/${token}`}>查看我的预约 →</a>
                    <CopyLink className="bk-copy" path={`/space/b/${token}`} />
                  </p>
                  <p className="bk-hint">这个链接只给你：复制下来发给自己，之后回来能看到 TA 有没有回复。这台设备上回到这里，也能找到它。</p>
                </>
              )}
            </div>
          ) : (
            <form className="bk-form" onSubmit={submit} noValidate>
              <p className="bk-lead">{generic ? '约 TA 聊聊——' : `预约「${serviceTitle}」——`}</p>
              <div className="bk-row">
                <div>
                  <label className="bk-l" htmlFor={`${uid}-n`}>你的名字</label>
                  <input className="bk-in" id={`${uid}-n`} name="name" value={name} maxLength={40} autoComplete="name" autoFocus={!viewerName}
                    onChange={e => setName(e.target.value)} placeholder="TA 该怎么称呼你" />
                </div>
                <div>
                  <label className="bk-l" htmlFor={`${uid}-c`}>怎么联系你</label>
                  <input className="bk-in" id={`${uid}-c`} name="contact" value={contact} maxLength={80} autoComplete="off" autoFocus={!!viewerName}
                    onChange={e => setContact(e.target.value)} placeholder="微信号、手机或邮箱" />
                </div>
              </div>
              <span className="bk-hint">联系方式只有 TA 能看到，不会公开。</span>
              <label className="bk-l" htmlFor={`${uid}-p`}>希望的时间</label>
              <input className="bk-in" id={`${uid}-p`} name="preferred" value={preferred} maxLength={120} autoComplete="off"
                onChange={e => setPreferred(e.target.value)} placeholder="比如「下周末下午」「10 月中旬的晚上」" />
              <label className="bk-l" htmlFor={`${uid}-t`}>想说的话 <small>（可以不写）</small></label>
              <textarea className="bk-in bk-ta" id={`${uid}-t`} name="note" value={note} rows={3}
                onChange={e => setNote([...e.target.value].slice(0, NOTE_MAX).join(''))}
                placeholder="你想做什么、有什么情况想让 TA 先知道" />
              <span className="bk-hint" aria-live="polite">还能写 {NOTE_MAX - [...note].length} 字</span>

              <div className="bk-hp" aria-hidden="true">
                <label>
                  网站
                  <input name="website" tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} />
                </label>
              </div>

              {error && <p className="bk-err" role="alert">{error}</p>}
              <div className="bk-acts">
                <button type="submit" className="sp-btn bk-send" disabled={sending}>{sending ? '正在送出…' : '送出预约'}</button>
                <button type="button" className="bk-cancel" disabled={sending} onClick={() => { setError(''); setPhase('closed'); }}>
                  先不了
                </button>
              </div>
              {preview && <p className="bk-preview">这是你自己的预览，送出去会真的进你的收件箱。</p>}
            </form>
          )}
        </div>
      )}
    </>
  );
}

/** 错误码 → 人话，并告诉访客下一步怎么做 */
const ERROR_WORDS: Record<string, string> = {
  closed: 'TA 刚刚关掉了站内预约。可以到页面最底下打个招呼，或者去附近森林找到 TA。',
  'unknown-service': '这项服务 TA 刚刚改过了。刷新一下页面，再从服务单里重新点「预约这个」。',
  'need-name': '先写一下你的名字，好让 TA 知道你是谁。',
  'need-contact': '留一个联系方式吧（微信号、手机或邮箱都行），不然 TA 没法回复你。',
  'not-found': '这部分内容现在看不到了（TA 可能刚改了谁能看到）。刷新一下页面看看。',
  'invalid-id': '页面地址好像不完整。从 TA 发给你的链接重新打开试试。',
  rejected: '没送出去。刷新一下页面再试试。',
  'bad-json': '没送出去。刷新一下页面再试试。',
  'bad-body': '没送出去。刷新一下页面再试试。',
  'database-unavailable': '我们这边的资料库暂时连不上。你填的内容还在，过一会儿再点一次「送出预约」。',
  'storage-unavailable': '我们这边暂时存不进去。你填的内容还在，过一会儿再点一次「送出预约」。',
};

function explain(status: number, data: { error?: string; message?: string }): string {
  // 太频繁：后端给的是写给人看的话（为什么、怎么办），原样显示
  if (status === 429) return data.message || '这个网络下刚刚提交得比较多，过几分钟再试。你填的内容还在。';
  const words = data.error ? ERROR_WORDS[data.error] : undefined;
  if (words) return words;
  if (status === 404) return ERROR_WORDS['not-found'];
  return '没送出去，是我们这边出了点问题。你填的内容还在，过一会儿再点一次「送出预约」。';
}
