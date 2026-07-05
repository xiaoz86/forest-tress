'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { PHIL_PATHS, getPhilPath, type PhilPath } from '@/lib/philCoach';

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

  function begin(p: PhilPath) {
    setDraft('');
    setCopied(false);
    setError('');
    setSession({ pathId: p.id, thread: seedThread(p) });
  }

  function reset() {
    setSession(null);
    setDraft('');
    setCopied(false);
    setLoading(false);
    setError('');
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
      const res = await fetch('/api/phil-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pathId: path.id,
          messages: nextThread.map(item => ({
            role: item.kind === 'coach' ? 'assistant' : 'user',
            content: item.text,
          })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || typeof json.reply !== 'string') {
        throw new Error(json.error || 'reply-failed');
      }

      setSession(current =>
        current && current.pathId === path.id
          ? { ...current, thread: [...current.thread, { kind: 'coach', text: json.reply.trim() }] }
          : current,
      );
    } catch {
      setError('刚才这段没有送出去。可以稍后再试，或先把它留给自己。');
    } finally {
      setLoading(false);
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

  if (!session || !path) {
    return (
      <div>
        <div className="mb-8 flex items-center gap-4 text-[12px] text-white/36">
          <span className="h-px w-10 bg-white/20" />
          <span>不用选对，只选最像今天的那一条。先从一条小径开始，剩下的慢慢聊。</span>
        </div>
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
          <div className="mt-2 text-[12px] text-white/30">这一段，只在此刻发生 · 不存入数据库</div>
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
