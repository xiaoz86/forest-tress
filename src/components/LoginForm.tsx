'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { dict } from '@/i18n';
import type { Locale } from '@/lib/locale';

/**
 * 卡片里除表单本身以外的那几段字。每一步该说什么不一样：
 *
 *   email  标题「登录到你的节点」+ 导语 + 页脚两段（想登录的人需要这些）
 *   code   导语撤掉——「输入注册时填写的邮箱」他已经填完了，
 *          表单里那句「验证码发到了 xxx」才是当下有用的话
 *   new    这个邮箱还没有节点：标题换成「第一次来，选择你的方式」，
 *          页脚两段全撤——「登录用于已加入的成员」对他不成立，
 *          「还没有节点？先填一张节点卡」和他眼前那颗按钮是同一件事
 *
 * 必须定义在 LoginForm **外面**。写在里面的话每次渲染都是一个新的函数引用，
 * React 认成不同的组件类型，整棵子树卸载重挂——邮箱输入框每敲一个字就失焦。
 */
function Chrome({
  t,
  step,
  linkError,
  children,
}: {
  t: ReturnType<typeof dict>['login'];
  step: 'email' | 'code' | 'new';
  linkError?: string | null;
  children: ReactNode;
}) {
  const isNew = step === 'new';
  return (
    <>
      <div className="text-[11px] font-semibold tracking-[0.18em] text-moss uppercase mb-2">
        {t.eyebrow}
      </div>
      <h1
        className="text-[26px] font-light tracking-[-0.01em] text-forest-deep mb-3"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {isNew ? t.newUser.title : t.title}
      </h1>
      {step === 'email' && (
        <p className="text-[14px] leading-relaxed text-text-secondary mb-6">{t.lede}</p>
      )}
      {linkError && (
        <div className="mb-4 p-3 rounded-lg bg-coral/10 border border-coral/30 text-[13px] text-coral">
          {linkError}
        </div>
      )}
      {children}
      {!isNew && (
        <>
          <p className="mt-6 text-[12px] text-text-light leading-relaxed">{t.benefits}</p>
          <p className="mt-2 text-[12px] text-text-light leading-relaxed">
            {t.noAccount.before}
            <Link href="/#join" className="text-forest-deep underline underline-offset-2 ml-1">
              {t.noAccount.link}
            </Link>
          </p>
        </>
      )}
    </>
  );
}

/**
 * 三步登录：填邮箱 → 收验证码 → 填回来。填对之后服务端才分辨这个邮箱
 * 有没有注册：已注册直接进；没注册的多出第三步，选轻登记还是完整注册。
 *
 * 原来是 magic link，必须在收信那个客户端里点开。手机上收信在邮件 App，
 * 点开进的是 App 内置浏览器，和 Safari / Chrome 不共享 cookie——人想在
 * 自己浏览器里登录就没辙。验证码把「在哪收信」和「在哪登录」解耦。
 *
 * 文案在客户端自己取。字典里有函数（sentTo、resendIn），函数跨不过
 * server → client 那道序列化边界，整片切片当 props 传会让页面直接崩。
 * 只传 locale——它仍是服务端算好的，这边不读 cookie，不会闪一下中文。
 */
export default function LoginForm({
  locale,
  /** ?err= 带回来的登录链接错误。服务端算好的，这边只负责摆在标题下面 */
  linkError,
}: {
  locale: Locale;
  linkError?: string | null;
}) {
  const t = useMemo(() => dict(locale).login, [locale]);
  const [step, setStep] = useState<'email' | 'code' | 'new'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
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
      // 发码前一律回 ok（不暴露这个邮箱有没有注册），所以这里无条件进第二步。
      // 只有验证码填对、证明拥有邮箱之后，服务端才会告知是否已注册。
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
      if (res.ok && json.registered === false) {
        setStep('new');
        setCode('');
        setStatus('idle');
        return;
      }
      setErrorText(res.status === 429 ? t.code.error.tooMany : t.code.error.invalid);
      setStatus('idle');
    } catch {
      setErrorText(t.code.error.network);
      setStatus('idle');
    }
  };

  const lightJoin = async () => {
    if (!name.trim() || status !== 'idle') return;
    setStatus('verifying');
    setErrorText('');
    try {
      const res = await fetch('/api/join/light', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401 && json.error === 'email-verification-required') {
        setStep('email');
        setErrorText(t.newUser.verificationExpired);
        setStatus('idle');
        return;
      }
      if (!res.ok || !json.memberId) throw new Error('join-failed');
      window.location.href = `/creators/${json.memberId}`;
    } catch {
      setErrorText(t.newUser.error);
      setStatus('idle');
    }
  };

  const fullJoin = () => {
    try {
      window.sessionStorage.setItem('nf_verified_join_email', email.trim());
    } catch {
      /* 无痕模式下仍可手动填写刚刚验证过的邮箱 */
    }
    window.location.href = '/#join';
  };

  const chrome = (children: ReactNode) => (
    <Chrome t={t} step={step} linkError={linkError}>
      {children}
    </Chrome>
  );

  if (step === 'new') {
    return chrome(
      <div className="space-y-3">
        <p className="text-[13px] leading-relaxed text-text-secondary">{t.newUser.body}</p>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') void lightJoin();
          }}
          maxLength={60}
          autoFocus
          placeholder={t.newUser.namePlaceholder}
          aria-label={t.newUser.namePlaceholder}
          className="w-full rounded-lg border-[1.5px] border-mist bg-warm-cream px-4 py-3 font-sans text-[14px] text-text-primary outline-none transition-all placeholder:text-text-light/50 focus:border-coral-soft focus:bg-white"
        />
        <button
          type="button"
          onClick={lightJoin}
          disabled={!name.trim() || status === 'verifying'}
          className="w-full rounded-full bg-forest-deep py-3 text-[14px] font-medium text-white transition-colors hover:bg-forest-mid disabled:opacity-50"
        >
          {status === 'verifying' ? t.newUser.joining : t.newUser.lightJoin}
        </button>
        <button
          type="button"
          onClick={fullJoin}
          disabled={status === 'verifying'}
          className="w-full rounded-full border border-forest-deep/20 py-3 text-[14px] font-medium text-forest-deep transition-colors hover:border-forest-deep/40 disabled:opacity-50"
        >
          {t.newUser.fullJoin}
        </button>
        {errorText && <p role="status" aria-live="polite" className="text-[12px] text-coral">{errorText}</p>}
        <p className="text-[12px] leading-relaxed text-text-light">{t.newUser.note}</p>
      </div>
    );
  }

  if (step === 'code') {
    return chrome(
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
        {errorText && <p role="status" aria-live="polite" className="text-[12px] text-coral">{errorText}</p>}
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

  return chrome(
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
      {errorText && <p role="status" aria-live="polite" className="text-[12px] text-coral">{errorText}</p>}
    </div>
  );
}
