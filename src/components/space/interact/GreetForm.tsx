'use client';

import { useEffect, useId, useRef, useState } from 'react';
import './greet.css';

export type GreetFormProps = {
  memberId: string;
  hostName: string;
  open: boolean;
  preview: boolean;
  viewerName?: string;
};

type Phase = 'closed' | 'form' | 'sending' | 'done';

const MAX = 500;

/**
 * 网站最底部「尾声」里的「打个招呼」。深色底（--sp-back），也可能是浅色底（晨雾湖面），
 * 所以颜色全从 currentColor 来，不写死浅色输入框。
 *
 * 首屏、页眉、第三章的「打个招呼」都是 href="#greet"（外层容器由 SpaceSite 包成 #greet）：
 * 地址里带着 #greet 打开页面、hash 变成 #greet、或者再点一次指向 #greet 的链接时，直接展开表单、滚进视口、
 * 聚焦第一个要填的输入框——一次点击就能写字，不用到底部再点一次。
 */
export default function GreetForm({ memberId, hostName, open, preview, viewerName }: GreetFormProps) {
  const uid = useId();
  const [phase, setPhase] = useState<Phase>('closed');
  const [name, setName] = useState(viewerName ?? '');
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState('');
  const [error, setError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  // 展开之后要不要把表单滚进视口、聚焦输入框（点按钮展开也要聚焦，但不用滚）
  const focusNext = useRef<'scroll' | 'focus' | null>(null);

  useEffect(() => {
    if (!open) return;
    const reveal = () => {
      focusNext.current = 'scroll';
      setPhase(p => (p === 'closed' ? 'form' : p));
      // 已经展开着：state 不变不会触发下面的 effect，这里直接滚过去
      // 还没展开的话表单还不在（formRef 为空），留给下面的 effect 处理
      window.requestAnimationFrame(() => {
        if (!focusNext.current || !formRef.current) return;
        settle(formRef.current, focusNext.current);
        focusNext.current = null;
      });
    };
    if (window.location.hash === '#greet') reveal();
    const onHash = () => { if (window.location.hash === '#greet') reveal(); };
    // hash 已经是 #greet 时再点同一个链接不会触发 hashchange：直接听点击
    const onClick = (e: MouseEvent) => {
      const a = e.target instanceof Element ? e.target.closest('a[href="#greet"]') : null;
      if (a && window.location.hash === '#greet') reveal();
    };
    window.addEventListener('hashchange', onHash);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('hashchange', onHash);
      document.removeEventListener('click', onClick);
    };
  }, [open]);

  useEffect(() => {
    if (phase !== 'form' || !focusNext.current || !formRef.current) return;
    settle(formRef.current, focusNext.current);
    focusNext.current = null;
  }, [phase]);

  if (!open) {
    return <p className="gr-off">{hostName} 暂时没有开放站内打招呼。</p>;
  }

  if (phase === 'done') {
    return (
      <div className="gr" role="status">
        <p className="gr-done">已经告诉 {hostName} 了。TA 会通过你留的联系方式找你。</p>
      </div>
    );
  }

  if (phase === 'closed') {
    return (
      <div className="gr">
        <button type="button" className="sp-btn sp-btn--end gr-open" onClick={() => { focusNext.current = 'focus'; setPhase('form'); }}>
          打个招呼
        </button>
        {preview && <p className="gr-preview">这是你自己的预览，发出去会真的进你的收件箱。</p>}
      </div>
    );
  }

  const left = MAX - [...message].length;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (phase === 'sending') return;
    if (!name.trim()) return setError('先写一下你的名字，好让 TA 知道你是谁。');
    if (contact.trim().length < 3) return setError('留一个联系方式吧（微信号、手机或邮箱都行），不然 TA 没法找到你。');
    setError('');
    setPhase('sending');
    try {
      const res = await fetch(`/api/space/greet?id=${encodeURIComponent(memberId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, contact, message, website }),
      });
      if (res.ok) {
        setPhase('done');
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      setError(explain(res.status, data, hostName));
    } catch {
      setError('没发出去，网络好像断了。你写的话还在，等网络好了再点一次「发出去」就行。');
    }
    setPhase('form');
  }

  const sending = phase === 'sending';
  return (
    <form ref={formRef} className="gr gr-form" onSubmit={submit} noValidate>
      <p className="gr-lead">跟 {hostName} 打个招呼——</p>
      <label className="gr-l" htmlFor={`${uid}-n`}>你的名字</label>
      <span className="gr-f">
        <input id={`${uid}-n`} name="name" value={name} maxLength={40} autoComplete="name"
          onChange={e => setName(e.target.value)} placeholder="TA 该怎么称呼你" />
      </span>
      <label className="gr-l" htmlFor={`${uid}-c`}>怎么联系你</label>
      <span className="gr-f">
        <input id={`${uid}-c`} name="contact" value={contact} maxLength={80} autoComplete="off"
          onChange={e => setContact(e.target.value)} placeholder="微信号、手机或邮箱" />
      </span>
      <span className="gr-hint">只有 {hostName} 能看到，不会公开。</span>
      <label className="gr-l" htmlFor={`${uid}-m`}>想说的话</label>
      <span className="gr-f">
        <textarea id={`${uid}-m`} name="message" value={message} rows={4}
          onChange={e => setMessage([...e.target.value].slice(0, MAX).join(''))}
          placeholder="比如：你是怎么找到这里的、想聊点什么" />
      </span>
      <span className="gr-hint" aria-live="polite">还能写 {left} 字</span>

      <div className="gr-hp" aria-hidden="true">
        <label>
          网站
          <input name="website" tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} />
        </label>
      </div>

      {error && <p className="gr-err" role="alert">{error}</p>}
      <div className="gr-acts">
        <button type="submit" className="sp-btn sp-btn--end gr-send" disabled={sending}>
          {sending ? '正在发…' : '发出去'}
        </button>
        <button type="button" className="gr-cancel" onClick={() => { setError(''); setPhase('closed'); }} disabled={sending}>
          先不了
        </button>
      </div>
      {preview && <p className="gr-preview">这是你自己的预览，发出去会真的进你的收件箱。</p>}
    </form>
  );
}

/** 展开后：把表单滚进视口（跳转过来时），聚焦第一个还没填的输入框 */
function settle(form: HTMLFormElement, how: 'scroll' | 'focus') {
  if (how === 'scroll') {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    form.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  }
  const fields = [...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input:not([tabindex="-1"]), textarea')];
  const first = fields.find(f => !f.value.trim()) ?? fields[0];
  first?.focus({ preventScroll: true });
}

function explain(status: number, data: { error?: string; message?: string }, host: string): string {
  const code = data.error;
  // 太频繁：后端给的是写给人看的话（为什么、怎么办），原样显示
  if (status === 429) return data.message || '这个网络下刚刚提交得比较多，过几分钟再试。你写的话还在。';
  if (code === 'closed') return `${host} 刚刚关掉了站内打招呼。可以去附近森林找到 TA。`;
  if (code === 'need-name') return '先写一下你的名字，好让 TA 知道你是谁。';
  if (code === 'need-contact') return '留一个联系方式吧（微信号、手机或邮箱都行），不然 TA 没法找到你。';
  if (status === 404) return '这个页面暂时看不到了，刷新一下再试试。';
  if (code === 'rejected') return '没发出去。刷新一下页面再试试。';
  return '没发出去，是我们这边出了点问题。你写的话还在，过一会儿再点一次「发出去」。';
}
