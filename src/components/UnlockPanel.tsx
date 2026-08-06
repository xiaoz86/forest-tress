'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
 * 不接商户号，钱走收款码。原来靠一个四位口令让人抄进付款备注，
 * 现在换成付完回来传一张截图：截图是在自己账号下传的，「是谁付的」
 * 自动就带上了，主理人只需要核金额和时间。少一步手抄，
 * 就少一批抄错、抄漏、配不上账的人。
 */
export default function UnlockPanel({
  programId, priceCents, lockedCount, loggedIn,
}: Props) {
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
          data.error === 'bad-file-type' ? '这张图传不了，用手机截图再试一次。'
            : data.error === 'file-too-large' ? '图太大了，8MB 以内。'
              : data.error === 'too-soon' ? '刚传过一张，等一分钟再换。'
                // 钱已经付出去了，这里不能只说「再试」就没了下文
                : '没能传上去。再试一次；还是不行就到「生态社区」页加主理人微信，把截图直接发过去。',
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
      setError('没能传上去，过一会再试。');
      if (fileRef.current) fileRef.current.value = '';
      setUploading(false);
    }
  }, [programId, uploading]);

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

  // 已申请、等主理人确认。传过截图的（claimedAt）权限已经先开出去了——
  // 但被驳回过又重新申请的人不算（judgedBefore），那一档要等人确认。
  if (order && order.status === 'pending') {
    const claimed = Boolean(order.claimedAt);
    const openedNow = claimed && !order.judgedBefore;
    return (
      <div id="unlock" className={shell}>
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-coral-soft">
          {openedNow ? '已开通 · 等核对' : claimed ? '已收到截图' : '等待确认'}
        </div>
        <h3 className="text-[15px] font-semibold text-white">
          {openedNow
            ? '三周的声音已经开好了'
            : claimed
              ? '截图收到了，等主理人确认'
              : `扫码付 ¥${(order.amountCents / 100).toFixed(0)}，然后传张截图`}
        </h3>

        {/*
          走 API 而不是直接指向图片文件：那条路由会验有没有待确认的申请，
          所以收款码只在「付款那一刻」取得到。没配图时 404，
          onError 把这块收起来，退到下面「加微信」那条路。
          已经说过付款的人不用再看收款码，收起来省得又扫一次。
        */}
        {!claimed && !qrFailed && (
          <div className="mt-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/meditations/pay-qr?program=${encodeURIComponent(programId)}`}
              alt="收款码"
              onError={() => setQrFailed(true)}
              className="h-[144px] w-[144px] rounded-xl border border-white/12 bg-white p-2"
            />
          </div>
        )}

        {claimed ? (
          <p className="mt-5 text-[12.5px] leading-[1.8] text-white/52">
            {openedNow
              ? '截图已经发给主理人了。对着收款记录核一眼就转正，通常当天；万一对不上会驳回，原因会写在这里。'
              : '上一次的申请被驳回过，所以这次要等主理人对完账再开，通常当天。'}
          </p>
        ) : !qrFailed ? (
          <ol className="mt-5 flex list-none flex-col gap-1.5 p-0 text-[12.5px] leading-[1.7] text-white/52">
            <li>1. 扫码付 ¥{(order.amountCents / 100).toFixed(0)}</li>
            <li>2. 回来传一张付款截图，<b className="text-white">当场就能听</b></li>
            <li>3. 主理人对完收款记录，这一单就转正</li>
          </ol>
        ) : (
          <p className="mt-4 text-[12.5px] leading-[1.8] text-white/48">
            收款码还没配好。可以先到{' '}
            <a href="/about#community" className="text-coral-soft no-underline hover:underline">生态社区</a>
            {' '}页加主理人微信，把付款截图发过去。
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
            {uploading ? '收到了，正在打开…' : claimed ? '换一张截图' : '付好了，传张截图'}
          </button>
          {!claimed && <span className="text-[11.5px] text-white/38">传完当场就能听</span>}
        </div>

        {error && <p className="mt-2 text-[12px] text-coral-soft">{error}</p>}
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
