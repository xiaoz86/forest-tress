'use client';

import { useCallback, useEffect, useState } from 'react';
import { NOTE_MAX_CHARS, type TrackNote } from '@/lib/meditationNotesShared';

type Props = {
  trackId: string;
  /** 没登录只能看，不能写 */
  loggedIn: boolean;
  /** 睡眠陪伴营是深色底，其余是林间的淡绿底——这个组件两边都要用 */
  dark?: boolean;
  onCountChange?: (trackId: string, delta: number) => void;
};

// 两套底色下的用色。深色那套是原来的；浅色这套全部换成深墨，
// 白字压在淡绿底上是读不出来的。
const TONE = {
  dark: {
    wrap: 'border-t border-white/[0.06] bg-black/20',
    field: 'border-white/12 bg-white/[0.04] text-white placeholder:text-white/28 focus:border-white/28',
    hint: 'text-white/55',
    faint: 'text-white/32',
    count: 'text-white/28',
    submit: 'bg-white text-[#111512]',
    err: 'text-coral-soft',
    link: 'text-coral-soft',
    prompt: 'text-white/42',
    empty: 'text-white/30',
    avatar: 'bg-white/10 text-white/70',
    author: 'text-white/78',
    time: 'text-white/30',
    body: 'text-white/62',
    del: 'text-white/32 hover:text-coral-soft',
  },
  light: {
    wrap: 'border-t border-forest/10 bg-white/45',
    field: 'border-forest/15 bg-white/80 text-ink placeholder:text-ink-soft/60 focus:border-forest/40',
    hint: 'text-ink-soft',
    faint: 'text-ink-soft/75',
    count: 'text-ink-soft/60',
    submit: 'bg-forest text-white',
    err: 'text-clay',
    link: 'text-clay',
    prompt: 'text-ink-soft',
    empty: 'text-ink-soft/70',
    avatar: 'bg-forest/12 text-forest',
    author: 'text-forest-deep',
    time: 'text-ink-soft/65',
    body: 'text-ink-soft',
    del: 'text-ink-soft/60 hover:text-clay',
  },
} as const;

function when(iso: string): string {
  const d = new Date(iso);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)} 小时前`;
  if (mins < 60 * 24 * 30) return `${Math.floor(mins / 1440)} 天前`;
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

export default function TrackNotes({ trackId, loggedIn, dark = false, onCountChange }: Props) {
  const t = dark ? TONE.dark : TONE.light;
  const [notes, setNotes] = useState<TrackNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [anonymous, setAnonymous] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/meditations/notes?track=${encodeURIComponent(trackId)}`)
      .then(r => (r.ok ? r.json() : { notes: [] }))
      .then(d => { if (alive) setNotes(d.notes || []); })
      .catch(() => { if (alive) setNotes([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [trackId]);

  const submit = useCallback(async () => {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/meditations/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track: trackId, body: text, anonymous }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.error === 'too-many' ? '这一段你已经写了 5 条，先歇一歇。'
            : data.error === 'too-long' ? `最多 ${NOTE_MAX_CHARS} 字。`
            : data.error === 'not-logged-in' ? '需要先登录。'
            : data.error === 'locked' ? '这一段还没解锁。'
            : '没发出去，过一会再试。',
        );
        return;
      }
      setNotes(prev => [data.note, ...prev]);
      setBody('');
      onCountChange?.(trackId, 1);
    } catch {
      setError('没发出去，过一会再试。');
    } finally {
      setBusy(false);
    }
  }, [body, busy, trackId, anonymous, onCountChange]);

  const remove = useCallback(async (id: string) => {
    const res = await fetch(`/api/meditations/notes?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setNotes(prev => prev.filter(n => n.id !== id));
      onCountChange?.(trackId, -1);
    }
  }, [trackId, onCountChange]);

  return (
    <div className={`${t.wrap} px-4 py-4`}>
      {loggedIn ? (
        <div className="mb-4">
          <textarea
            value={body}
            onChange={e => setBody(e.target.value.slice(0, NOTE_MAX_CHARS))}
            placeholder="听完之后，心里剩下什么？"
            rows={2}
            className={`w-full resize-y rounded-xl border ${t.field} px-3 py-2.5 text-[13.5px] leading-[1.75] focus:outline-none`}
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className={`flex cursor-pointer items-center gap-2 text-[12px] ${t.hint}`}>
              <input
                type="checkbox"
                checked={anonymous}
                onChange={e => setAnonymous(e.target.checked)}
                className={`h-3.5 w-3.5 ${dark ? "accent-[#e8a88e]" : "accent-[#2f513d]"}`}
              />
              匿名发布
            </label>
            <span className={`text-[11px] ${t.faint}`}>
              {anonymous ? '会显示为「森林里的一个人」' : '会带上你的名字'}
              ，所有人可见
            </span>
            <span className={`ml-auto text-[11px] tabular-nums ${t.count}`}>
              {body.length} / {NOTE_MAX_CHARS}
            </span>
            <button
              type="button"
              onClick={submit}
              disabled={busy || !body.trim()}
              className={`rounded-full ${t.submit} px-4 py-1.5 text-[12.5px] font-semibold transition-opacity disabled:opacity-35`}
            >
              {busy ? '发布中' : '写下感悟'}
            </button>
          </div>
          {error && <p className={`mt-2 text-[12px] ${t.err}`}>{error}</p>}
        </div>
      ) : (
        <p className={`mb-4 text-[12.5px] ${t.prompt}`}>
          <a href="/login" className={`${t.link} underline-offset-2 hover:underline`}>登录</a>
          {' '}之后可以写下自己的感悟。
        </p>
      )}

      {loading ? (
        <p className={`text-[12.5px] ${t.empty}`}>正在读…</p>
      ) : notes.length === 0 ? (
        <p className={`text-[12.5px] ${t.empty}`}>还没有人写下感悟。</p>
      ) : (
        <ul className="flex list-none flex-col gap-3.5 p-0">
          {notes.map(note => (
            <li key={note.id} className="flex gap-2.5">
              <span
                aria-hidden="true"
                className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full ${t.avatar} text-[11px] font-semibold`}
              >
                {note.avatarUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={note.avatarUrl} alt="" className="h-full w-full object-cover" />
                  : note.author.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className={`text-[12.5px] font-semibold ${t.author}`}>{note.author}</span>
                  <span className={`text-[11px] ${t.time}`}>{when(note.createdAt)}</span>
                  {note.mine && (
                    <button
                      type="button"
                      onClick={() => remove(note.id)}
                      className={`ml-auto text-[11px] transition-colors ${t.del}`}
                    >
                      撤回
                    </button>
                  )}
                </div>
                <p className={`mt-1 whitespace-pre-wrap break-words text-[13px] leading-[1.8] ${t.body}`}>
                  {note.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
