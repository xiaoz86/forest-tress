'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { dict } from '@/i18n';
import type { Locale } from '@/lib/locale';
import type { ProgramOrder } from '@/lib/programOrders';

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
  programId: string;
  priceCents: number;
  lockedCount: number;
  loggedIn: boolean;
  /** 收款码图片。没配的话退回「联系主理人」那条路。 */
  payQrUrl?: string;
};

/**
 * 解锁面板。
 *
 * 不接商户号，钱走收款码。原来靠一个四位口令让人抄进付款备注，
 * 现在换成付完回来传一张截图：截图是在自己账号下传的，「是谁付的」
 * 自动就带上了，主理人只需要核金额和时间。少一步手抄，
 * 就少一批抄错、抄漏、配不上账的人。
 */
export default function UnlockPanel({programId, priceCents, lockedCount, loggedIn, locale}: Props) {
  const _d = dict(locale).meditations;
  const t = _d.unlock;
  const [order, setOrder] = useState<ProgramOrder | null>(null);
  const [loading, setLoading] = useState(loggedIn);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [qrFailed, setQrFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const price = (priceCents / 100).toFixed(0);

  useEffect(() => {
    if (!loggedIn) return;
    let alive = true;
    fetch(`/api/meditations/unlock?program=${encodeURIComponent(programId)}`)
      .then(r => (r.ok ? r.json() : { order: null }))
      .then(d => { if (alive) setOrder(d.order); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [programId, loggedIn]);

  const request = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/meditations/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ program: programId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error === 'not-logged-in' ? t.error.notLoggedIn : t.error.createFailed);
        return;
      }
      setOrder(data.order);
    } catch {
      setError(t.error.createFailed);
    } finally {
      setBusy(false);
    }
  }, [programId, busy, t]);

  /**
   * 传付款截图 = 说一句「我付好了」。
   *
   * 传完权限当场就开（先开后审），所以成功之后整页重来一次——
   * 那些还锁着的段落要立刻变成能点的样子，人才知道钱花对了。
   */
  const upload = useCallback(async (file: File) => {
    if (uploading) return;
    setUploading(true);
    setError('');
    try {
      const body = new FormData();
      body.append('program', programId);
      body.append('file', file);
      const res = await fetch('/api/meditations/proof', { method: 'POST', body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.error === 'bad-file-type' ? t.error.badFileType
            : data.error === 'file-too-large' ? t.error.fileTooLarge
              : data.error === 'too-soon' ? t.error.tooSoon
                // 钱已经付出去了，这里不能只说「再试」就没了下文
                : t.error.uploadFailed,
        );
        if (fileRef.current) fileRef.current.value = '';
        setUploading(false);
        return;
      }
      // 成功了就不要把按钮放回去：reload 只是排了一次导航，慢网下这几秒里
      // 按钮还能点，人会以为没传成又选一张图——而这时页面正要被销毁。
      setOrder(data.order);
      window.location.reload();
    } catch {
      setError(t.error.uploadNetwork);
      if (fileRef.current) fileRef.current.value = '';
      setUploading(false);
    }
  }, [programId, uploading, t]);

  const shell = 'scroll-mt-24 border-t border-coral-soft/25 bg-[linear-gradient(160deg,rgba(232,168,142,0.13),rgba(30,42,68,0.22))] px-5 py-6';

  if (!loggedIn) {
    return (
      <div id="unlock" className={shell}>
        <Head lockedCount={lockedCount} t={t} />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <a href="/login" className="rounded-full bg-white px-5 py-2 text-[13px] font-medium text-[#111512] no-underline">
            {t.signUpCta}
          </a>
          <span className="text-[13px] font-bold tabular-nums text-white">¥{price}</span>
          <a href="/login" className="text-[12px] text-white/45 no-underline hover:text-white/70">
            {t.haveAccount}
          </a>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div id="unlock" className={shell}>
        <p className="text-[12.5px] text-white/40">{t.loading}</p>
      </div>
    );
  }

  // 已申请、等主理人确认。传过截图的（claimedAt）权限已经先开出去了——
  // 但被驳回过又重新申请的人不算（judgedBefore），那一档要等人确认。
  if (order && order.status === 'pending') {
    const claimed = Boolean(order.claimedAt);
    const openedNow = claimed && !order.judgedBefore;
    return (
      <div id="unlock" className={shell}>
        {/* 已经开好的那档用绿色：它是「成了」，不该和还没付款的珊瑚色警示同色 */}
        <div
          className={`mb-1 text-[10px] font-bold uppercase tracking-[0.18em] ${
            openedNow ? 'text-leaf' : 'text-coral-soft'
          }`}
        >
          {openedNow ? t.badge.openedNow : claimed ? t.badge.proofReceived : t.badge.waiting}
        </div>
        <h3 className="text-[16px] font-medium text-white">
          {openedNow
            ? t.title.openedNow
            : claimed
              ? t.title.proofReceived
              : t.title.toPay((order.amountCents / 100).toFixed(0))}
        </h3>

        {/*
          走 API 而不是直接指向图片文件：那条路由会验有没有待确认的申请，
          所以收款码只在「付款那一刻」取得到。没配图时 404，
          onError 把这块收起来，退到下面「加微信」那条路。
          已经说过付款的人不用再看收款码，收起来省得又扫一次。
        */}
        {!claimed && !qrFailed && (
          <div className="mt-4 w-[144px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/meditations/pay-qr?program=${encodeURIComponent(programId)}`}
              alt={t.qrAlt}
              onError={() => setQrFailed(true)}
              className="h-[144px] w-[144px] rounded-xl border border-white/12 bg-white p-2"
            />
            {/* 码是支付宝的，不写清楚会有人拿微信扫然后扫不出来 */}
            <p className="mt-2 text-center text-[11.5px] text-white/45">{t.qrCaption}</p>
          </div>
        )}

        {claimed ? (
          <p className="mt-5 text-[12.5px] leading-[1.8] text-white/52">
            {openedNow ? t.body.openedNow : t.body.judgedBefore}
          </p>
        ) : !qrFailed ? (
          <ol className="mt-5 flex list-none flex-col gap-1.5 p-0 text-[12.5px] leading-[1.7] text-white/52">
            <li>{t.steps.pay((order.amountCents / 100).toFixed(0))}</li>
            <li>{t.steps.upload}</li>
            <li>{t.steps.confirm}</li>
          </ol>
        ) : (
          <p className="mt-4 text-[12.5px] leading-[1.8] text-white/48">
            {t.noQr.before}{' '}
            <a href="/about#community" className="text-coral-soft no-underline hover:underline">{t.noQr.link}</a>
            {' '}{t.noQr.after}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={e => {
              const picked = e.target.files?.[0];
              // 清空 value：同一张图选第二次也要能触发 change
              e.target.value = '';
              if (picked) void upload(picked);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className={
              claimed
                ? 'rounded-full border border-white/16 px-4 py-2 text-[12.5px] text-white/55 hover:text-white disabled:opacity-40'
                : 'rounded-full bg-white px-5 py-2 text-[13px] font-semibold text-[#111512] disabled:opacity-40'
            }
          >
            {uploading ? t.uploading : claimed ? t.uploadAgain : t.uploadCta}
          </button>
          {!claimed && <span className="text-[11.5px] text-white/38">{t.uploadHint}</span>}
        </div>
        <p className="mt-2.5 text-[11.5px] leading-[1.7] text-white/38">
          {t.proofPrivacy}
        </p>

        {error && <p className="mt-2 text-[12px] text-coral-soft">{error}</p>}
      </div>
    );
  }

  // 被驳回
  if (order && order.status === 'rejected') {
    return (
      <div id="unlock" className={shell}>
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-coral-soft">
          {t.rejected.badge}
        </div>
        <h3 className="text-[16px] font-medium text-white">{t.rejected.title}</h3>
        {order.note && <p className="mt-1.5 text-[12.5px] text-white/52">{order.note}</p>}
        <button
          type="button"
          onClick={request}
          disabled={busy}
          className="mt-4 rounded-full bg-white px-5 py-2 text-[13px] font-medium text-[#111512] disabled:opacity-40"
        >
          {busy ? t.busy : t.rejected.retry}
        </button>
      </div>
    );
  }

  // 还没申请过
  return (
    <div id="unlock" className={shell}>
      <Head lockedCount={lockedCount} t={t} />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={request}
          disabled={busy}
          className="rounded-full bg-white px-5 py-2 text-[13px] font-medium text-[#111512] disabled:opacity-40"
        >
          {busy ? t.busy : t.requestCta}
        </button>
        <span className="text-[13px] font-bold tabular-nums text-white">¥{price}</span>
      </div>
      {error && <p className="mt-2 text-[12px] text-coral-soft">{error}</p>}
    </div>
  );
}

function Head({ lockedCount, t }: { lockedCount: number; t: ReturnType<typeof dict>['meditations']['unlock'] }) {
  return (
    <>
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-coral-soft">
        {t.lockedCount(lockedCount)}
      </div>
      <h3 className="text-[16px] font-medium text-white">{t.headline}</h3>
    </>
  );
}
