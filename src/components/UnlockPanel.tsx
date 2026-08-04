'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ProgramOrder } from '@/lib/programOrders';

type Props = {
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
 * 不接商户号，钱走收款码。关键是那个四位口令——它把
 * 「发截图给我，我去翻聊天记录对是谁」变成「扫一眼备注就能配上」。
 * 没有它，人工开通很快会变成负担。
 */
export default function UnlockPanel({
  programId, priceCents, lockedCount, loggedIn,
}: Props) {
  const [order, setOrder] = useState<ProgramOrder | null>(null);
  const [loading, setLoading] = useState(loggedIn);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [qrFailed, setQrFailed] = useState(false);

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
        setError(data.error === 'not-logged-in' ? '需要先登录。' : '没能创建申请，过一会再试。');
        return;
      }
      setOrder(data.order);
    } catch {
      setError('没能创建申请，过一会再试。');
    } finally {
      setBusy(false);
    }
  }, [programId, busy]);

  const shell = 'scroll-mt-24 border-t border-coral-soft/25 bg-[linear-gradient(160deg,rgba(232,168,142,0.13),rgba(30,42,68,0.22))] px-5 py-6';

  if (!loggedIn) {
    return (
      <div id="unlock" className={shell}>
        <Head lockedCount={lockedCount} />
        <p className="mt-1 text-[12.5px] leading-[1.75] text-white/52">
          三周的声音就都在这里了。一次付清，之后随时回来听。
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <a href="/login" className="rounded-full bg-white px-5 py-2 text-[13px] font-semibold text-[#111512] no-underline">
            注册并解锁
          </a>
          <span className="text-[13px] font-bold tabular-nums text-white">¥{price}</span>
          <a href="/login" className="text-[12px] text-white/45 no-underline hover:text-white/70">
            已注册？登录
          </a>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div id="unlock" className={shell}>
        <p className="text-[12.5px] text-white/40">正在读…</p>
      </div>
    );
  }

  // 已申请、等主理人确认
  if (order && order.status === 'pending') {
    return (
      <div id="unlock" className={shell}>
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-coral-soft">
          等待确认
        </div>
        <h3 className="text-[15px] font-semibold text-white">付款时，把这四个字写进备注</h3>

        <div className="mt-4 flex flex-wrap items-start gap-6">
          <div>
            <div
              className="rounded-xl border border-white/20 bg-white/[0.08] px-5 py-3 text-[26px] font-bold tracking-[0.22em] text-white tabular-nums"
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
            >
              {order.code}
            </div>
            <p className="mt-2 text-[11.5px] text-white/40">金额 ¥{(order.amountCents / 100).toFixed(0)}</p>
          </div>

          {/*
            走 API 而不是直接指向图片文件：那条路由会验有没有待确认的申请，
            所以收款码只在「付款那一刻」取得到。没配图时 404，
            onError 把这块收起来，退到下面「加微信」那条路。
          */}
          {!qrFailed && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={`/api/meditations/pay-qr?program=${encodeURIComponent(programId)}`}
              alt="收款码"
              onError={() => setQrFailed(true)}
              className="h-[144px] w-[144px] rounded-xl border border-white/12 bg-white p-2"
            />
          )}
        </div>

        {!qrFailed ? (
          <ol className="mt-5 flex list-none flex-col gap-1.5 p-0 text-[12.5px] leading-[1.7] text-white/52">
            <li>1. 扫码付 ¥{(order.amountCents / 100).toFixed(0)}，<b className="text-white">备注填 {order.code}</b></li>
            <li>2. 主理人对上账后开通，通常当天</li>
            <li>3. 开通后这一页会直接变成可听的样子</li>
          </ol>
        ) : (
          <p className="mt-4 text-[12.5px] leading-[1.8] text-white/48">
            收款码还没配好。可以先到{' '}
            <a href="/about#community" className="text-coral-soft no-underline hover:underline">生态社区</a>
            {' '}页加主理人微信，把口令 <b className="text-white">{order.code}</b> 一起发过去。
          </p>
        )}
      </div>
    );
  }

  // 被驳回
  if (order && order.status === 'rejected') {
    return (
      <div id="unlock" className={shell}>
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-coral-soft">
          未通过
        </div>
        <h3 className="text-[15px] font-semibold text-white">这次申请没有通过</h3>
        {order.note && <p className="mt-1.5 text-[12.5px] text-white/52">{order.note}</p>}
        <button
          type="button"
          onClick={request}
          disabled={busy}
          className="mt-4 rounded-full bg-white px-5 py-2 text-[13px] font-semibold text-[#111512] disabled:opacity-40"
        >
          {busy ? '处理中' : '重新申请'}
        </button>
      </div>
    );
  }

  // 还没申请过
  return (
    <div id="unlock" className={shell}>
      <Head lockedCount={lockedCount} />
      <p className="mt-1 text-[12.5px] leading-[1.75] text-white/52">
        三周的声音就都在这里了。一次付清，之后随时回来听。
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={request}
          disabled={busy}
          className="rounded-full bg-white px-5 py-2 text-[13px] font-semibold text-[#111512] disabled:opacity-40"
        >
          {busy ? '处理中' : '我要解锁'}
        </button>
        <span className="text-[13px] font-bold tabular-nums text-white">¥{price}</span>
      </div>
      {error && <p className="mt-2 text-[12px] text-coral-soft">{error}</p>}
    </div>
  );
}

function Head({ lockedCount }: { lockedCount: number }) {
  return (
    <>
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-coral-soft">
        还有 {lockedCount} 段
      </div>
      <h3 className="text-[15px] font-semibold text-white">注册附近森林，解锁完整旅程</h3>
    </>
  );
}
