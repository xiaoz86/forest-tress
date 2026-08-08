'use client';

// phil-coach 模块反馈 / 咨询真人教练陪伴。放在体验区下方，任何人都可提交。

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
      <section className="mt-16 rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center max-md:p-6">
        <p className="text-[15px] leading-[1.9] text-white/72">
          {t.doneLead}
          {kind === 'coach-inquiry' ? t.doneCoach : t.doneFeedback}
        </p>
        <button
          onClick={() => setState('idle')}
          type="button"
          className="mt-5 text-[13px] text-white/45 underline-offset-4 transition-colors hover:text-white hover:underline"
        >
          {t.doneAgain}
        </button>
      </section>
    );
  }

  return (
    <section className="mt-16 rounded-2xl border border-white/10 bg-white/[0.03] p-8 max-md:p-6">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-white/32">
        {t.eyebrow}
      </div>
      <h2 className="text-2xl font-semibold">{t.title}</h2>
      <p className="mt-3 text-[14px] leading-[1.9] text-white/52">
        {t.lede}
      </p>

      <div className="mt-6 flex gap-2">
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
            className={`rounded-full px-4 py-2 text-[13px] transition-colors ${
              kind === opt.id
                ? 'bg-coral-soft text-[#20140f]'
                : 'border border-white/16 bg-white/[0.05] text-white/70 hover:bg-white/12'
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
        className="mt-5 w-full resize-none rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-[15px] leading-relaxed text-white placeholder:text-white/28 focus:border-coral-soft/60 focus:outline-none"
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
        className="mt-3 w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-[14px] text-white placeholder:text-white/28 focus:border-coral-soft/60 focus:outline-none"
      />

      <div className="mt-4 flex items-center gap-4">
        <button
          onClick={submit}
          disabled={!message.trim() || state === 'sending'}
          type="button"
          className="rounded-full bg-white px-6 py-2.5 text-[14px] font-medium text-[#141a12] transition-opacity disabled:opacity-35"
        >
          {state === 'sending' ? t.sending : t.send}
        </button>
        {state === 'error' && (
          <span className="text-[13px] text-coral-soft">{t.failed}</span>
        )}
      </div>
    </section>
  );
}
