'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { PHIL_PATHS, PROFILE_PATH, getPhilPath, type PhilPath } from '@/lib/philCoach';

const MOOD_GRADIENT: Record<PhilPath['mood'], string> = {
  companion: 'bg-[linear-gradient(135deg,#cf9087_0%,#ead0bf_52%,#c7d8cb_100%)]',
  clarity: 'bg-[linear-gradient(135deg,#6f8966_0%,#bac8ad_52%,#e7dac4_100%)]',
  choice: 'bg-[linear-gradient(135deg,#738faa_0%,#b7c7d3_54%,#e5d6d2_100%)]',
  mirror: 'bg-[linear-gradient(135deg,#1d352d_0%,#668579_52%,#d3c5ac_100%)]',
};

type ThreadItem =
  | { kind: 'coach'; text: string }
  | { kind: 'me'; text: string };

type Session = {
  pathId: string;
  thread: ThreadItem[];
};

function seedThread(path: PhilPath): ThreadItem[] {
  const thread: ThreadItem[] = [];
  for (const beat of path.beats) {
    thread.push({ kind: 'coach', text: beat.coach });
    if (beat.input) break;
  }
  return thread;
}

export default function PhilCoachExperience() {
  const [session, setSession] = useState<Session | null>(null);
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [keepState, setKeepState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [profileKnown, setProfileKnown] = useState(false);
  const [importState, setImportState] = useState<'idle' | 'importing' | 'done' | 'error'>('idle');
  const [guestKnown, setGuestKnown] = useState(false);
  const [showGate, setShowGate] = useState(false);
  const [gateName, setGateName] = useState('');
  const [gateContact, setGateContact] = useState('');
  const [gateState, setGateState] = useState<'idle' | 'sending' | 'error'>('idle');
  const [pendingPathId, setPendingPathId] = useState<string | null>(null);
  const [pendingRetry, setPendingRetry] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const path = session ? getPhilPath(session.pathId) : undefined;
  const hasConversation = Boolean(session?.thread.length);

  useEffect(() => {
    if (!session) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [session]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [session?.thread.length, loading, error]);

  // 登录检测 + 第一次对话默认导入注册资料
  useEffect(() => {
    fetch('/api/phil-coach/memory')
      .then(r => (r.ok ? r.json() : null))
      .then(json => {
        if (!json) {
          setLoggedIn(false);
          return;
        }
        setLoggedIn(true);
        const mems: { path_id?: string }[] = json.memories ?? [];
        setProfileKnown(mems.some(m => m.path_id === PROFILE_PATH));
        // 第一次：还没有任何记忆时，默认把注册资料导入为「关于我」种子
        if (mems.length === 0) importProfile();
      })
      .catch(() => setLoggedIn(false));
    // 只在挂载时跑一次；importProfile 有意不入依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 轻登记检测（方案A：第一条小径免登记，之后需留称呼+微信继续）
  useEffect(() => {
    fetch('/api/phil-coach/guest')
      .then(r => (r.ok ? r.json() : null))
      .then(json => setGuestKnown(Boolean(json?.registered)))
      .catch(() => {});
  }, []);

  function pathsDone(): number {
    try {
      return Number(localStorage.getItem('nf_phil_paths_done') || '0') || 0;
    } catch {
      return 0;
    }
  }
  function markPathDone() {
    try {
      localStorage.setItem('nf_phil_paths_done', String(pathsDone() + 1));
    } catch {
      /* 无痕模式等场景忽略 */
    }
  }

  /** 把注册资料导入/刷新为 phil-coach 的「关于我」种子（默认导入 & 重新导入共用） */
  async function importProfile() {
    if (importState === 'importing') return;
    setImportState('importing');
    try {
      const res = await fetch('/api/phil-coach/memory/import-profile', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error('import-failed');
      if (json.memory) setProfileKnown(true);
      setImportState('done');
    } catch {
      setImportState('error');
    }
  }

  function begin(p: PhilPath) {
    // 方案A：走完第一条小径后，未登录且未登记 → 先留个称呼再继续
    if (!loggedIn && !guestKnown && pathsDone() >= 1) {
      setPendingPathId(p.id);
      setShowGate(true);
      return;
    }
    setDraft('');
    setCopied(false);
    setError('');
    setKeepState('idle');
    setSession({ pathId: p.id, thread: seedThread(p) });
  }

  function reset() {
    if (session?.thread.some(t => t.kind === 'me')) markPathDone();
    setSession(null);
    setDraft('');
    setCopied(false);
    setLoading(false);
    setError('');
    setKeepState('idle');
  }

  /** 明示同意的「留住」：把当前对话存进自己的记忆（仅注册用户） */
  async function keepThread() {
    if (!session || !path || keepState === 'saving') return;
    setKeepState('saving');
    try {
      const res = await fetch('/api/phil-coach/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pathId: path.id,
          messages: session.thread.map(item => ({
            role: item.kind === 'coach' ? 'assistant' : 'user',
            content: item.text,
          })),
        }),
      });
      if (!res.ok) throw new Error('keep-failed');
      setKeepState('saved');
    } catch {
      setKeepState('error');
    }
  }

  /** 发送对话线取回复；命中登记闸门时返回 'gate'（不视为错误） */
  async function sendThread(thread: ThreadItem[], pathId: string): Promise<'ok' | 'gate'> {
    const res = await fetch('/api/phil-coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pathId,
        messages: thread.map(item => ({
          role: item.kind === 'coach' ? 'assistant' : 'user',
          content: item.text,
        })),
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 403 && json.error === 'guest-required') return 'gate';
    if (!res.ok || typeof json.reply !== 'string') {
      throw new Error(json.error || 'reply-failed');
    }
    setSession(current =>
      current && current.pathId === pathId
        ? { ...current, thread: [...current.thread, { kind: 'coach', text: json.reply.trim() }] }
        : current,
    );
    // 对话有了新内容，「留住」重新可用
    setKeepState(prev => (prev === 'saved' ? 'idle' : prev));
    return 'ok';
  }

  async function submit() {
    if (!path || !session || loading) return;
    const answer = draft.trim();
    if (!answer) return;

    const nextThread: ThreadItem[] = [...session.thread, { kind: 'me', text: answer }];
    setSession({ ...session, thread: nextThread });
    setDraft('');
    setError('');
    setLoading(true);

    try {
      const r = await sendThread(nextThread, path.id);
      if (r === 'gate') {
        setPendingRetry(true);
        setShowGate(true);
      }
    } catch {
      setError('刚才这段没有送出去。可以稍后再试，或先把它留给自己。');
    } finally {
      setLoading(false);
    }
  }

  /** 轻登记：留下称呼+微信 → 种 cookie → 续上被拦下的动作 */
  async function registerGuest() {
    if (!gateName.trim() || !gateContact.trim() || gateState === 'sending') return;
    setGateState('sending');
    try {
      let from = '';
      try {
        from = new URLSearchParams(window.location.search).get('from') || '';
      } catch {
        /* ignore */
      }
      const res = await fetch('/api/phil-coach/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: gateName.trim(), contact: gateContact.trim(), from }),
      });
      if (!res.ok) throw new Error('failed');
      setGuestKnown(true);
      setShowGate(false);
      setGateState('idle');
      if (pendingPathId) {
        const p = getPhilPath(pendingPathId);
        setPendingPathId(null);
        if (p) {
          setDraft('');
          setCopied(false);
          setError('');
          setKeepState('idle');
          setSession({ pathId: p.id, thread: seedThread(p) });
        }
      } else if (pendingRetry && session && path) {
        setPendingRetry(false);
        setLoading(true);
        try {
          await sendThread(session.thread, path.id);
        } catch {
          setError('刚才这段没有送出去。可以稍后再试。');
        } finally {
          setLoading(false);
        }
      }
    } catch {
      setGateState('error');
    }
  }

  async function copyThread() {
    if (!session) return;
    const text = session.thread
      .map(item => (item.kind === 'coach' ? `phil-coach：${item.text}` : `我：${item.text}`))
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      /* 剪贴板不可用时忽略 */
    }
  }

  if (showGate) {
    return (
      <div className="rounded-2xl border border-coral-soft/25 bg-white/[0.04] p-8 max-md:p-6">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-coral-soft">
          继续之前
        </div>
        <h3 className="text-xl font-semibold">留个称呼，继续免费用</h3>
        <p className="mt-3 max-w-[560px] text-[14px] leading-[1.95] text-white/55">
          第一段路你已经走完了。留下称呼和微信号，我们为你<span className="text-white/80">开通继续免费使用的权限</span>，并邀请你加入附近森林社群——群里可以交流反馈，也有<span className="text-white/80">真人教练答疑陪伴</span>。你的对话内容仍然不会被保存。
        </p>
        <div className="mt-6 grid max-w-[560px] gap-3">
          <input
            value={gateName}
            onChange={e => setGateName(e.target.value)}
            maxLength={60}
            placeholder="怎么称呼你"
            className="w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-[14px] text-white placeholder:text-white/28 focus:border-coral-soft/60 focus:outline-none"
          />
          <input
            value={gateContact}
            onChange={e => setGateContact(e.target.value)}
            maxLength={120}
            placeholder="微信号（或邮箱）"
            className="w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-[14px] text-white placeholder:text-white/28 focus:border-coral-soft/60 focus:outline-none"
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button
            onClick={registerGuest}
            disabled={!gateName.trim() || !gateContact.trim() || gateState === 'sending'}
            type="button"
            className="rounded-full bg-coral-soft px-6 py-2.5 text-[14px] font-medium text-[#20140f] transition-opacity disabled:opacity-40"
          >
            {gateState === 'sending' ? '正在开通…' : '开通并继续'}
          </button>
          {gateState === 'error' && (
            <span className="text-[13px] text-coral-soft">没成功，稍后再试一次。</span>
          )}
        </div>
        <p className="mt-5 text-[12px] leading-relaxed text-white/32">
          这些信息只用于认识你、联系你，不做别的。已经是森林里的树？
          <Link href="/login" className="ml-1 text-white/50 underline underline-offset-2 hover:text-white">
            直接登录
          </Link>
        </p>
      </div>
    );
  }

  if (!session || !path) {
    return (
      <div>
        <div className="mb-8 flex items-center gap-4 text-[12px] text-white/36">
          <span className="h-px w-10 bg-white/20" />
          <span>不用选对，只选最像今天的那一条。先从一条小径开始，剩下的慢慢聊。</span>
        </div>
        {loggedIn && (
          <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-white/40">
            <span>
              {importState === 'importing'
                ? 'phil-coach 正在读你的资料，好认识你…'
                : profileKnown
                  ? 'phil-coach 已经认识了你的资料。'
                  : '让 phil-coach 先认识一下你的资料吧。'}
            </span>
            <button
              onClick={importProfile}
              disabled={importState === 'importing'}
              type="button"
              className="text-coral-soft underline-offset-4 transition-colors hover:text-white hover:underline disabled:opacity-50"
            >
              {profileKnown ? '重新导入' : '导入我的资料'}
            </button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-6 max-md:grid-cols-1">
          {PHIL_PATHS.map(p => (
            <button
              key={p.id}
              onClick={() => begin(p)}
              className={`group relative overflow-hidden rounded-lg border border-white/12 p-7 text-left shadow-[0_18px_60px_rgba(0,0,0,0.16)] transition-transform hover:-translate-y-0.5 ${MOOD_GRADIENT[p.mood]}`}
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_16%,rgba(255,255,255,0.24),transparent_36%),linear-gradient(180deg,transparent_0%,rgba(5,17,11,0.42)_100%)]" />
              <div className="relative">
                <div className="mb-4 h-px w-10 bg-white/50" />
                <h3
                  className="text-[1.5rem] font-semibold leading-snug text-white"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {p.label}
                </h3>
                <p className="mt-3 text-[14px] leading-relaxed text-white/78">{p.hint}</p>
                <span className="mt-6 inline-flex items-center gap-2 text-[13px] text-white/82">
                  开始对话
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-7 flex items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-coral-soft">
            {path.label}
          </div>
          <div className="mt-2 text-[12px] text-white/30">这一段只在此刻发生，不会被保存 · 说完就散</div>
        </div>
        <button
          onClick={reset}
          className="text-[13px] text-white/40 underline-offset-4 transition-colors hover:text-white"
        >
          换一条小径
        </button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 max-md:p-4">
        <div className="flex flex-col gap-4">
          {session.thread.map((item, i) =>
            item.kind === 'coach' ? (
              <div key={i} className="max-w-[86%] self-start">
                <div className="mb-1 text-[10px] tracking-[0.2em] text-white/28">
                  phil-coach
                </div>
                <div className="rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.06] px-5 py-3.5 text-[15px] leading-[1.9] text-white/82">
                  {item.text}
                </div>
              </div>
            ) : (
              <div key={i} className="max-w-[86%] self-end">
                <div className="mb-1 text-right text-[10px] uppercase tracking-[0.2em] text-white/28">
                  我
                </div>
                <div className="whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-coral-soft/85 px-5 py-3.5 text-[15px] leading-[1.9] text-[#20140f]">
                  {item.text}
                </div>
              </div>
            ),
          )}
          {loading && (
            <div className="max-w-[86%] self-start">
              <div className="mb-1 text-[10px] tracking-[0.2em] text-white/28">
                phil-coach
              </div>
              <div className="rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.06] px-5 py-3.5 text-[15px] leading-[1.9] text-white/48">
                我在听，等我把你刚才说的放在心里看一看…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="mt-6 border-t border-white/8 pt-5">
          {error && (
            <div className="mb-3 rounded-xl border border-coral-soft/25 bg-coral-soft/10 px-4 py-3 text-[13px] text-coral-soft">
              {error}
            </div>
          )}
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
            }}
            disabled={loading}
            rows={3}
            maxLength={1200}
            placeholder="照此刻真实的样子说就好…"
            className="w-full resize-none rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-[15px] leading-relaxed text-white placeholder:text-white/28 focus:border-coral-soft/60 focus:outline-none disabled:opacity-55"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <span className="text-[11px] text-white/26">慢慢写，最多 1200 字 · ⌘/Ctrl + Enter 发送</span>
            <div className="flex flex-wrap gap-3">
              {hasConversation && loggedIn && session.thread.some(t => t.kind === 'me') && (
                <button
                  onClick={keepThread}
                  disabled={keepState === 'saving' || keepState === 'saved'}
                  type="button"
                  className="rounded-full border border-coral-soft/40 bg-coral-soft/10 px-5 py-2.5 text-[14px] text-coral-soft transition-colors hover:bg-coral-soft/20 disabled:opacity-60"
                >
                  {keepState === 'saved'
                    ? '已留住 · 下次它会记得'
                    : keepState === 'saving'
                      ? '正在留住…'
                      : keepState === 'error'
                        ? '没留上，再试一次'
                        : '留住这一段'}
                </button>
              )}
              {hasConversation && (
                <button
                  onClick={copyThread}
                  type="button"
                  className="rounded-full border border-white/16 bg-white/[0.06] px-5 py-2.5 text-[14px] text-white/70 transition-colors hover:bg-white/12 hover:text-white"
                >
                  {copied ? '已复制' : '把这段留给自己'}
                </button>
              )}
              <button
                onClick={submit}
                disabled={loading || !draft.trim()}
                type="button"
                className="rounded-full bg-white px-6 py-2.5 text-[14px] font-medium text-[#141a12] transition-opacity disabled:opacity-35"
              >
                {loading ? '正在回应' : '发送'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          onClick={reset}
          type="button"
          className="rounded-full border border-white/16 bg-white/[0.06] px-5 py-2.5 text-[14px] text-white/78 transition-colors hover:bg-white/12 hover:text-white"
        >
          再走一条小径
        </button>
        <Link
          href="/login"
          className="rounded-full bg-coral-soft px-5 py-2.5 text-[14px] font-medium text-[#20140f] no-underline transition-opacity hover:opacity-90"
        >
          成为森林里的一棵树
        </Link>
      </div>
    </div>
  );
}
