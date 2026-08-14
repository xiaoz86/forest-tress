'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { dict } from '@/i18n';
import type { Locale } from '@/lib/locale';

/**
 * 卡片里除表单本身以外的那几段字。两步说的话不一样：
 *
 *   email  标题「登录到你的节点」+ 导语 + 页脚两段（想登录的人需要这些）
 *   code   导语撤掉——「输入注册时填写的邮箱」他已经填完了，
 *          表单里那句「验证码发到了 xxx」才是当下有用的话
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
  step: 'email' | 'code';
  linkError?: string | null;
  children: ReactNode;
}) {
  return (
    <>
      <div className="text-[11px] font-semibold tracking-[0.18em] text-moss uppercase mb-2">
        {t.eyebrow}
      </div>
      <h1
        className="text-[26px] font-light tracking-[-0.01em] text-forest-deep mb-3"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {t.title}
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
      <p className="mt-6 text-[12px] text-text-light leading-relaxed">{t.benefits}</p>
      <p className="mt-2 text-[12px] text-text-light leading-relaxed">
        {t.noAccount.before}
        <Link href="/#join" className="text-forest-deep underline underline-offset-2 ml-1">
          {t.noAccount.link}
        </Link>
      </p>
    </>
  );
}

/**
 * 两步登录：填邮箱 → 收验证码 → 填回来。填对之后服务端才分辨这个邮箱
 * 有没有注册：已注册直接进；还没有节点的，直接送去首页那张七步节点卡。
 *
 * 这里**不给**「轻登记还是完整注册」那个选择——那块屏只留在 phil-coach 的浮层里。
 * 两处看着一样，语境是相反的：浮层拦的是一个正说到一半的人，把他推去填七步长表
 * 等于把话打断；而会走到登录页的人本来就是奔着「进去」来的，多一屏选择只是拦路，
 * 何况轻登记那条路在这里通向一张空节点卡，是条死路。
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
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  /** redirecting 是「码对了、但这个邮箱还没有节点，正在送去注册向导」那一段 */
  const [status, setStatus] = useState<'idle' | 'sending' | 'verifying' | 'redirecting'>('idle');
  const [errorText, setErrorText] = useState('');
  /** 服务端对同一个人有 60 秒冷却，界面上倒计时，别让人反复点了没反应 */
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);
  /**
   * 用 ref 而不是 status 挡重入。setStatus 是异步的，快速双击的第二下在重渲染
   * 之前就发生了，两次都读到 status 还是 'idle'——于是并发打两次 /api/login/code：
   * 两边各吃掉一次尝试机会（claimAttempt 是 CAS，会真的各记一次），
   * 其中一个把码核销掉，另一个拿到 'gone'，于是页面一边跳转一边弹「验证码不对」。
   * JoinForm 和 phil-coach 浮层早就是 ref 挡的，这里是三处并行实现里最后一处。
   */
  const verifyingRef = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  /**
   * 验证成功之后 status 会永久停在 'verifying'（已注册，跳自己的节点页）或
   * 'redirecting'（没节点，跳注册向导）——那两条路都是整页跳走，本来不该再回来。
   *
   * 可是人按了浏览器后退键就会回来。这一页没有 unload 监听，Safari 会把它连同
   * 整个 React 内存快照原样还原，status 仍是那个终态，而代码里
   * 没有任何一处会把它写回 idle——这一屏上三颗按钮全部按 status !== 'idle' 变灰，
   * 于是人回来看到的是一张彻底点不动的表单，只有手动刷新才能救。
   *
   * （Chrome 和 Firefox 因为这一页带 no-store 不会进 bfcache，主要是 Safari 和 iOS。）
   *
   * persisted 为真就是从 bfcache 里捞回来的，把状态复位。顺手清掉验证码：
   * 那串码在跳走之前已经被服务端核销了，留着只会让人再提交一次然后被告知不对。
   */
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      setStatus('idle');
      setErrorText('');
      setCode('');
      verifyingRef.current = false;
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  /** 进到填码那步就把光标放进去，省一次点击 */
  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
  }, [step]);

  const sendCode = async () => {
    const e = email.trim();
    if (!/^.+@.+\..+$/.test(e)) {
      setErrorText(t.formError);
      return;
    }
    if (status !== 'idle' || cooldown > 0) return;
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

  /**
   * 送去首页那张七步节点卡。邮箱刚验过，顺手把它塞进 sessionStorage——
   * 向导挂载时会填进第七步，人不用再打一遍。
   *
   * 真正的凭据不在这里，在 HttpOnly 的 nf_verified_email cookie 里；
   * 服务端认那张 cookie，所以他在向导最后一步不会再被要一次验证码。
   * 这里存的只是回显用的字符串，被改了也换不到任何权限。
   */
  const goToJoin = () => {
    try {
      window.sessionStorage.setItem('nf_verified_join_email', email.trim());
    } catch {
      /* 无痕模式下仍可手动填写刚刚验证过的邮箱 */
    }
    window.location.href = '/#join';
  };

  const verify = async () => {
    const c = code.replace(/\s+/g, '');
    if (c.length !== 6 || status !== 'idle' || verifyingRef.current) return;
    verifyingRef.current = true;
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
        // 这个邮箱还没有节点。不再问「轻登记还是完整注册」，直接送进注册向导。
        // status 停在 redirecting 不回 idle：整页跳转要一会儿，这期间按钮
        // 得继续锁着，也得说实话——他不是在登录，是要去填卡了。
        setStatus('redirecting');
        goToJoin();
        return;
      }
      setErrorText(res.status === 429 ? t.code.error.tooMany : t.code.error.invalid);
      setStatus('idle');
      verifyingRef.current = false;
    } catch {
      setErrorText(t.code.error.network);
      setStatus('idle');
      verifyingRef.current = false;
    }
    // 成功的两条路都整页跳走了，故意不释放这把锁——跳转有延迟，
    // 这期间再让人打一次接口只会白吃一次尝试机会。
  };

  const chrome = (children: ReactNode) => (
    <Chrome t={t} step={step} linkError={linkError}>
      {children}
    </Chrome>
  );

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
          disabled={code.replace(/\s+/g, '').length !== 6 || status !== 'idle'}
          className="w-full rounded-full bg-forest-deep py-3 text-[14px] font-medium text-white transition-colors hover:bg-forest-mid disabled:opacity-50"
        >
          {/* 码对了、但这个邮箱还没有节点：接下来是去填卡，不是登录，别说成「登录中」 */}
          {status === 'redirecting'
            ? t.code.toJoin
            : status === 'verifying'
              ? t.code.verifying
              : t.code.submit}
        </button>
        {errorText && <p role="status" aria-live="polite" className="text-[12px] text-coral">{errorText}</p>}
        <div className="flex items-center justify-between pt-1 text-[12px]">
          <button
            type="button"
            /**
             * 验码在飞、或者已经在跳转的那几秒里必须锁上。
             * 不锁的话：点它会切回第一屏，可 status 不是 idle，那颗「发送验证码」
             * 看着亮、按下去在守卫处静默 return；更糟的是如果 verify 这时才返回，
             * 人会被从「重填邮箱」这一屏一把拽去 /#join，完全不知道发生了什么。
             */
            disabled={status !== 'idle'}
            onClick={() => {
              setStep('email');
              setCode('');
              setErrorText('');
              /**
               * 冷却也要一起清。服务端那 60 秒是按邮箱算的，换个邮箱不受它管；
               * 留着的话回到第一步「发送验证码」看着能点，sendCode 里
               * cooldown > 0 直接 return——按下去什么都不发生，也不给任何提示。
               */
              setCooldown(0);
            }}
            className="text-text-light underline-offset-2 hover:text-forest-deep hover:underline disabled:no-underline disabled:hover:text-text-light"
          >
            {t.code.changeEmail}
          </button>
          <button
            type="button"
            onClick={sendCode}
            // 守卫是 status !== 'idle'，disabled 也得跟着，否则又是一颗按下去没反应的按钮
            disabled={cooldown > 0 || status !== 'idle'}
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
        // 同上：sendCode 的守卫认的是 idle，这里只判 sending 会留下一颗哑巴按钮
        disabled={status !== 'idle'}
        className="w-full rounded-full bg-forest-deep py-3 text-[14px] font-medium text-white transition-colors hover:bg-forest-mid disabled:opacity-60"
      >
        {status === 'sending' ? t.sending : t.submit}
      </button>
      {errorText && <p role="status" aria-live="polite" className="text-[12px] text-coral">{errorText}</p>}
    </div>
  );
}
