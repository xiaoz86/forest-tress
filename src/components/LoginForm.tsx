'use client';

import { useMemo, useState } from 'react';
import { dict } from '@/i18n';
import type { Locale } from '@/lib/locale';

/**
 * 文案在客户端自己取。字典里有函数（英文单复数用的），函数跨不过
 * server → client 那道序列化边界，整片切片当 props 传会让页面直接崩。
 * 只传 locale——它仍是服务端算好的，这边不读 cookie，不会闪一下中文。
 */
export default function LoginForm({ locale }: { locale: Locale }) {
  const t = useMemo(() => dict(locale).login, [locale]);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const submit = async () => {
    const e = email.trim();
    if (!/^.+@.+\..+$/.test(e)) {
      setStatus('error');
      return;
    }
    setStatus('sending');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: e }),
      });
      if (res.ok) setStatus('sent');
      else setStatus('error');
    } catch {
      setStatus('error');
    }
  };

  if (status === 'sent') {
    return (
      <div className="rounded-xl border border-leaf/30 bg-leaf/8 p-4 text-[13px] leading-relaxed text-forest-deep">
        {t.sent1}
        <br />
        {t.sent2}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') submit();
        }}
        placeholder={t.emailPlaceholder}
        autoComplete="email"
        className="w-full px-4 py-3 border-[1.5px] border-mist rounded-lg font-sans text-[14px] text-text-primary bg-warm-cream outline-none transition-all focus:border-coral-soft focus:bg-white"
      />
      <button
        type="button"
        onClick={submit}
        disabled={status === 'sending'}
        className="w-full py-3 rounded-full bg-forest-deep text-white text-[14px] font-medium hover:bg-forest-mid disabled:opacity-60 transition-colors"
      >
        {status === 'sending' ? t.sending : t.submit}
      </button>
      {status === 'error' && (
        <p className="text-[12px] text-coral">{t.formError}</p>
      )}
    </div>
  );
}
