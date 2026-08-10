'use client';

import { useCallback, useEffect, useState } from 'react';
import { dict } from '@/i18n';
import type { Locale } from '@/lib/locale';
import { NOTE_MAX_CHARS, type TrackNote } from '@/lib/meditationNotesShared';

type Props = {
  /**
   * 文案在客户端自己取。
   *
   * 不能像服务端组件那样把字典切片当 props 传进来——字典里为了英文单复数
   * 用了函数（progress、phaseLocked 这些），而函数跨不过 server → client
   * 那道序列化边界，页面会直接崩在「Functions cannot be passed directly
   * to Client Components」。所以只传 locale 这个字符串，字典在这边查。
   *
   * 这也不违反「客户端不要自己判断语言」那条：locale 仍然是服务端算好的，
   * 这里不读 cookie，不会先渲染一遍中文再闪成英文。
   */
  locale: Locale;
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

function when(iso: string, t: ReturnType<typeof dict>['meditations']['notes']): string {
  const d = new Date(iso);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return t.time.justNow;
  if (mins < 60) return t.time.minutes(mins);
  if (mins < 60 * 24) return t.time.hours(Math.floor(mins / 60));
  if (mins < 60 * 24 * 30) return t.time.days(Math.floor(mins / 1440));
  return t.time.date(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export default function TrackNotes({trackId, loggedIn, dark = false, onCountChange, locale}: Props) {
  const _d = dict(locale).meditations;
  const t = _d.notes;
  const tone = dark ? TONE.dark : TONE.light;
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
          data.error === 'too-many' ? t.error.tooMany
            : data.error === 'too-long' ? t.error.tooLong(NOTE_MAX_CHARS)
            : data.error === 'not-logged-in' ? t.error.notLoggedIn
            : data.error === 'locked' ? t.error.locked
            : t.error.failed,
        );
        return;
      }
      setNotes(prev => [data.note, ...prev]);
      setBody('');
      onCountChange?.(trackId, 1);
    } catch {
      setError(t.error.failed);
    } finally {
      setBusy(false);
    }
  }, [body, busy, trackId, anonymous, onCountChange, t]);

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
    <div className={`${tone.wrap} px-4 py-4`}>
      {loggedIn ? (
        <div className="mb-4">
          <textarea
            value={body}
            onChange={e => setBody(e.target.value.slice(0, NOTE_MAX_CHARS))}
            placeholder={t.placeholder}
            rows={2}
            className={`w-full resize-y rounded-xl border ${tone.field} px-3 py-2.5 text-[13.5px] leading-[1.75] focus:outline-none`}
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className={`flex cursor-pointer items-center gap-2 text-[12px] ${tone.hint}`}>
              <input
                type="checkbox"
                checked={anonymous}
                onChange={e => setAnonymous(e.target.checked)}
                className={`h-3.5 w-3.5 ${dark ? "accent-[#e8a88e]" : "accent-[#2f513d]"}`}
              />
              {t.anonymousToggle}
            </label>
            <span className={`text-[11px] ${tone.faint}`}>
              {anonymous ? t.asAnonymous : t.asNamed}
            </span>
            <span className={`ml-auto text-[11px] tabular-nums ${tone.count}`}>
              {body.length} / {NOTE_MAX_CHARS}
            </span>
            <button
              type="button"
              onClick={submit}
              disabled={busy || !body.trim()}
              className={`rounded-full ${tone.submit} px-4 py-1.5 text-[12.5px] font-medium transition-opacity disabled:opacity-35`}
            >
              {busy ? t.publishing : t.publish}
            </button>
          </div>
          {error && <p className={`mt-2 text-[12px] ${tone.err}`}>{error}</p>}
        </div>
      ) : (
        <p className={`mb-4 text-[12.5px] ${tone.prompt}`}>
          <a href="/login" className={`${tone.link} underline-offset-2 hover:underline`}>{t.signInPrompt.link}</a>
          {t.signInPrompt.after}
        </p>
      )}

      {loading ? (
        <p className={`text-[12.5px] ${tone.empty}`}>正在读…</p>
      ) : notes.length === 0 ? (
        <p className={`text-[12.5px] ${tone.empty}`}>{tone.empty}</p>
      ) : (
        <ul className="flex list-none flex-col gap-3.5 p-0">
          {notes.map(note => (
            <li key={note.id} className="flex gap-2.5">
              <span
                aria-hidden="true"
                className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full ${tone.avatar} text-[11px] font-semibold`}
              >
                {note.avatarUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={note.avatarUrl} alt="" className="h-full w-full object-cover" />
                  : note.author.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className={`text-[12.5px] font-semibold ${tone.author}`}>{note.author}</span>
                  <span className={`text-[11px] ${tone.time}`}>{when(note.createdAt, t)}</span>
                  {note.mine && (
                    <button
                      type="button"
                      onClick={() => remove(note.id)}
                      className={`ml-auto text-[11px] transition-colors ${tone.del}`}
                    >
                      {t.withdraw}
                    </button>
                  )}
                </div>
                <p className={`mt-1 whitespace-pre-wrap break-words text-[13px] leading-[1.8] ${tone.body}`}>
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
