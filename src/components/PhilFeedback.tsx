'use client';

// phil-coach 模块反馈 / 咨询真人教练陪伴。收在「关于这段对话」最后一条里，任何人都可提交。

import { useMemo, useState } from 'react';
import { dict } from '@/i18n';
import type { Locale } from '@/lib/locale';

type Kind = 'feedback' | 'coach-inquiry';

/**
 * 文案在客户端自己取。字典里有函数（英文单复数用的），函数跨不过
 * server → client 的序列化边界，整片切片当 props 传会让页面直接崩。
 * 只传 locale——它仍是服务端算好的，这边不读 cookie，不会闪一下中文。
 */
export default function PhilFeedback({ locale }: { locale: Locale }) {
  const t = useMemo(() => dict(locale).philCoach.feedback, [locale]);
  const [kind, setKind] = useState<Kind>('feedback');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');

  async function submit() {
    if (!message.trim() || state === 'sending') return;
    setState('sending');
    try {
      const res = await fetch('/api/phil-coach/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, message: message.trim(), contact: contact.trim() }),
      });
      if (!res.ok) throw new Error('failed');
      setState('done');
      setMessage('');
      setContact('');
    } catch {
      setState('error');
    }
  }

  if (state === 'done') {
    return (
      <div role="status">
        <p className="m-0 text-[15px] leading-[1.9] text-pc-ink">
          {t.doneLead}
          {kind === 'coach-inquiry' ? t.doneCoach : t.doneFeedback}
        </p>
        <button
          onClick={() => setState('idle')}
          type="button"
          className="mt-3 text-[13px] text-pc-plum underline decoration-pc-plum/40 underline-offset-4 hover:decoration-pc-plum"
        >
          {t.doneAgain}
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="m-0">{t.lede}</p>

      <div className="mt-5 flex flex-wrap gap-2">
        {(
          [
            { id: 'feedback', label: t.kindFeedback },
            { id: 'coach-inquiry', label: t.kindCoach },
          ] as { id: Kind; label: string }[]
        ).map(opt => (
          <button
            key={opt.id}
            onClick={() => setKind(opt.id)}
            type="button"
            aria-pressed={kind === opt.id}
            className={`inline-flex min-h-10 items-center rounded-full border px-4 text-[13px] transition-colors ${
              kind === opt.id
                ? 'border-pc-ink bg-pc-ink text-pc-ivory'
                : 'border-pc-ink/15 bg-pc-paper/60 text-pc-ink-2 hover:text-pc-ink'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        rows={4}
        maxLength={2000}
        placeholder={
          kind === 'coach-inquiry'
            ? t.placeholderCoach
            : t.placeholderFeedback
        }
        aria-label={kind === 'coach-inquiry' ? t.placeholderCoach : t.placeholderFeedback}
        className="mt-4 block w-full resize-none rounded-xl border border-pc-line bg-pc-paper px-4 py-3 text-[16px] leading-relaxed text-pc-ink placeholder:text-pc-ink-3 focus:border-pc-plum focus:outline-none"
      />
      <input
        value={contact}
        onChange={e => setContact(e.target.value)}
        maxLength={200}
        placeholder={
          kind === 'coach-inquiry'
            ? t.contactCoach
            : t.contactFeedback
        }
        aria-label={kind === 'coach-inquiry' ? t.contactCoach : t.contactFeedback}
        className="mt-3 block w-full rounded-xl border border-pc-line bg-pc-paper px-4 py-3 text-[16px] text-pc-ink placeholder:text-pc-ink-3 focus:border-pc-plum focus:outline-none"
      />

      <div className="mt-4 flex items-center gap-4">
        <button
          onClick={submit}
          disabled={!message.trim() || state === 'sending'}
          type="button"
          className="inline-flex min-h-11 items-center rounded-full bg-pc-ink px-6 text-[14px] font-medium text-pc-ivory transition-colors disabled:bg-pc-ink/15 disabled:text-pc-ink-3"
        >
          {state === 'sending' ? t.sending : t.send}
        </button>
        {state === 'error' && (
          <span role="alert" className="text-[13px] text-pc-brick">{t.failed}</span>
        )}
      </div>
    </div>
  );
}
