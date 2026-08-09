'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { dict } from '@/i18n';
import type { Locale } from '@/lib/locale';

/**
 * 两步登录：填邮箱 → 收验证码 → 填回来。
 *
 * 原来是 magic link，必须在收信那个客户端里点开。手机上收信在邮件 App，
 * 点开进的是 App 内置浏览器，和 Safari / Chrome 不共享 cookie——人想在
 * 自己浏览器里登录就没辙。验证码把「在哪收信」和「在哪登录」解耦。
 *
 * 文案在客户端自己取。字典里有函数（sentTo、resendIn），函数跨不过
 * server → client 那道序列化边界，整片切片当 props 传会让页面直接崩。
 * 只传 locale——它仍是服务端算好的，这边不读 cookie，不会闪一下中文。
 */
export default function LoginForm({ locale }: { locale: Locale }) {
  const t = useMemo(() => dict(locale).login, [locale]);
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'verifying'>('idle');
  const [errorText, setErrorText] = useState('');
  /** 服务端对同一个人有 60 秒冷却，界面上倒计时，别让人反复点了没反应 */
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  // 进到第二步就把光标放进验证码框，省一次点击
  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
  }, [step]);

  const sendCode = async () => {
    const e = email.trim();
    if (!/^.+@.+\..+$/.test(e)) {
      setErrorText(t.formError);
      return;
    }
    if (status === 'sending' || cooldown > 0) return;
    setStatus('sending');
    setErrorText('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: e }),
      });
      if (!res.ok) throw new Error('failed');
      // 服务端一律回 ok（不暴露这个邮箱有没有注册），所以这里无条件进第二步。
      // 没注册的人填了码也进不去，看到的是同一句「验证码不对」——
      // 任何区分都等于把成员名单漏出去。
      setStep('code');
      setCode('');
      setCooldown(60);
    } catch {
      setErrorText(t.formError);
    } finally {
      setStatus('idle');
    }
  };

  const verify = async () => {
    const c = code.replace(/\s+/g, '');
    if (c.length !== 6 || status === 'verifying') return;
    setStatus('verifying');
    setErrorText('');
    try {
      const res = await fetch('/api/login/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: c }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.memberId) {
        // 整页跳转而不是 router.push：导航栏的登录态是挂载时问一次服务器的，
        // 软跳转它不会重新问，会显示成还没登录。
        window.location.href = `/creators/${json.memberId}`;
        return;
      }
      setErrorText(res.status === 429 ? t.code.error.tooMany : t.code.error.invalid);
      setStatus('idle');
    } catch {
      setErrorText(t.code.error.network);
      setStatus('idle');
    }
  };

  if (step === 'code') {
    return (
      <div className="space-y-3">
        <p className="text-[13px] leading-relaxed text-text-secondary">
          {t.code.sentTo(email.trim())}
          <br />
          <span className="text-text-light">{t.code.hint}</span>
        </p>
        <input
          ref={codeRef}
          value={code}
          onChange={e => setCode(e.target.value.replace(/[^\d\s]/g, '').slice(0, 8))}
          onKeyDown={e => {
            if (e.key === 'Enter') void verify();
          }}
          // 手机上直接弹数字键盘；one-time-code 让 iOS / Android 能从
          // 邮件通知里一键填充，不用来回切 App
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          placeholder={t.code.placeholder}
          className="w-full rounded-lg border-[1.5px] border-mist bg-warm-cream px-4 py-3 text-center font-mono text-[20px] tracking-[0.4em] text-text-primary outline-none transition-all focus:border-coral-soft focus:bg-white"
        />
        <button
          type="button"
          onClick={verify}
          disabled={code.replace(/\s+/g, '').length !== 6 || status === 'verifying'}
          className="w-full rounded-full bg-forest-deep py-3 text-[14px] font-medium text-white transition-colors hover:bg-forest-mid disabled:opacity-50"
        >
          {status === 'verifying' ? t.code.verifying : t.code.submit}
        </button>
        {errorText && <p className="text-[12px] text-coral">{errorText}</p>}
        <div className="flex items-center justify-between pt-1 text-[12px]">
          <button
            type="button"
            onClick={() => {
              setStep('email');
              setCode('');
              setErrorText('');
            }}
            className="text-text-light underline-offset-2 hover:text-forest-deep hover:underline"
          >
            {t.code.changeEmail}
          </button>
          <button
            type="button"
            onClick={sendCode}
            disabled={cooldown > 0 || status === 'sending'}
            className="text-text-light underline-offset-2 hover:text-forest-deep hover:underline disabled:no-underline disabled:hover:text-text-light"
          >
            {cooldown > 0 ? t.code.resendIn(cooldown) : t.code.resend}
          </button>
        </div>
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
          if (e.key === 'Enter') void sendCode();
        }}
        placeholder={t.emailPlaceholder}
        autoComplete="email"
        className="w-full rounded-lg border-[1.5px] border-mist bg-warm-cream px-4 py-3 font-sans text-[14px] text-text-primary outline-none transition-all placeholder:text-text-light/50 focus:border-coral-soft focus:bg-white"
      />
      <button
        type="button"
        onClick={sendCode}
        disabled={status === 'sending'}
        className="w-full rounded-full bg-forest-deep py-3 text-[14px] font-medium text-white transition-colors hover:bg-forest-mid disabled:opacity-60"
      >
        {status === 'sending' ? t.sending : t.submit}
      </button>
      {errorText && <p className="text-[12px] text-coral">{errorText}</p>}
    </div>
  );
}
