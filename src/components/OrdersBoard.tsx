'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdminOrder } from '@/lib/programOrders';

/**
 * 开通确认看板。
 *
 * 主理人真实的动作是：点开截图 → 对着收款记录看金额和时间 → 确认或驳回。
 * 所以待确认的那几条排在最上面，每条都带「看截图」，列表就是主路径。
 *
 * 搜索框留着按名字或短号找人（人多了要找特定一条，通知邮件也带短号过来）。
 * 时间显示到分钟：对账全靠这个和金额。
 */

const STATUS_LABEL: Record<string, string> = {
  pending: '未付款',
  paid: '已核对',
  rejected: '已驳回',
};

/**
 * 「待核对」和「未付款」是两回事：
 * 前者已经传了截图、权限也先开出去了，等的是你去收款记录里核一眼；
 * 后者只是点过解锁、还没付钱，不用你做任何事。
 */
function statusLabel(o: AdminOrder): string {
  if (o.status === 'pending') return o.claimedAt ? '待核对' : '未付款';
  return STATUS_LABEL[o.status] || o.status;
}


function when(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function OrdersBoard() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const searchRef = useRef<HTMLInputElement | null>(null);
  // 回车直接开通这个快捷键，只认主理人自己一个字一个字敲进去的口令。
  // 邮件预填的那次不算：手机上键盘一弹，一个「换行」就把单确认掉了，
  // 而这时人还没看过截图——原来手抄口令那一步本身就是「我确实看到款了」。
  const typedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/meditations/unlock?admin=1');
      if (!res.ok) {
        setError(res.status === 403 ? '没有权限。' : '读不到申请列表。');
        return;
      }
      const data = await res.json();
      setOrders(data.orders || []);
      setError('');
    } catch {
      setError('读不到申请列表。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // 通知邮件里的「打开确认」带着口令过来，直接填进搜索框：
    // 手机上再手输一遍那四个字，是这条路上最容易劝退人的一步。
    const fromEmail = new URLSearchParams(window.location.search).get('code');
    if (fromEmail) setQuery(fromEmail.trim().toUpperCase());
    searchRef.current?.focus();
  }, [load]);

  const act = useCallback(async (id: string, status: 'paid' | 'rejected') => {
    if (busyId) return;
    // 驳回要写原因——用户那边会看到这句话，空着等于让人一头雾水
    let note = '';
    if (status === 'rejected') {
      note = window.prompt('驳回原因（对方能看到）：', '没有找到对应的付款记录') || '';
      if (!note.trim()) return;
    }
    setBusyId(id);
    try {
      const res = await fetch('/api/meditations/unlock', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, note }),
      });
      if (!res.ok) { setError('操作没成功，再试一次。'); return; }
      await load();
    } finally {
      setBusyId('');
    }
  }, [busyId, load]);

  const q = query.trim().toUpperCase();
  const shown = useMemo(() => {
    if (!q) return orders;
    return orders.filter(o =>
      o.code.includes(q) || o.memberName.toUpperCase().includes(q),
    );
  }, [orders, q]);

  // 看板顶上那个数字要的是「等你核对的有几笔」，不是「有几笔还没付」
  const pendingCount = orders.filter(o => o.status === 'pending' && o.claimedAt).length;
  // 输满四位且只剩一条待核对时，回车直接确认——这是最常走的那条路。
  // 还没付款的那种不能这样确认：那笔钱根本还没来。
  const soleMatch =
    q.length >= 4 && shown.length === 1 && shown[0].status === 'pending' && shown[0].claimedAt
      ? shown[0]
      : null;

  return (
    <div>
      <div className="mb-8">
        <label htmlFor="order-search" className="mb-2 block text-[12px] font-medium text-white/50">
          搜名字或短号
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <input
            id="order-search"
            ref={searchRef}
            value={query}
            onChange={e => { typedRef.current = true; setQuery(e.target.value); }}
            onKeyDown={e => {
              if (e.key === 'Enter' && typedRef.current && soleMatch) void act(soleMatch.id, 'paid');
            }}
            placeholder="4K2M"
            autoComplete="off"
            spellCheck={false}
            className="w-[220px] rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-[22px] font-bold uppercase tracking-[0.2em] text-white placeholder:text-white/20 focus:border-white/40 focus:outline-none"
            style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
          />
          {soleMatch && typedRef.current && (
            <span className="text-[12.5px] text-leaf">
              回车即可开通 · {soleMatch.memberName}
            </span>
          )}
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); searchRef.current?.focus(); }}
              className="text-[12.5px] text-white/40 hover:text-white"
            >
              清空
            </button>
          )}
          <span className="ml-auto text-[12.5px] text-white/40">
            待核对 <b className="text-[14px] text-white tabular-nums">{pendingCount}</b>
          </span>
        </div>
      </div>

      {error && <p className="mb-4 text-[13px] text-coral-soft">{error}</p>}

      {loading ? (
        <p className="text-[13px] text-white/35">正在读…</p>
      ) : shown.length === 0 ? (
        <p className="text-[13px] text-white/35">
          {q ? `没有匹配「${q}」的申请。` : '还没有人申请开通。'}
        </p>
      ) : (
        <ul className="list-none divide-y divide-white/[0.07] border-y border-white/[0.07] p-0">
          {shown.map(o => (
            <li key={o.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 py-3.5">
              <span
                className={`w-[5.5rem] shrink-0 text-[17px] font-bold tracking-[0.14em] tabular-nums ${
                  o.status === 'pending' && o.claimedAt ? 'text-white' : 'text-white/35'
                }`}
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
              >
                {o.code}
              </span>

              {/* 截图点开看大图——核对时要看清金额和时间 */}
              {o.hasProof ? (
                <a
                  href={`/api/meditations/proof?order=${encodeURIComponent(o.id)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded-md border border-white/16 px-2 py-1 text-[11px] text-white/60 no-underline transition-colors hover:border-white/40 hover:text-white"
                >
                  看截图
                </a>
              ) : (
                <span className="shrink-0 text-[11px] text-white/25">无截图</span>
              )}

              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] text-white/80">{o.memberName}</span>
                <span className="block text-[11.5px] tabular-nums text-white/35">
                  {when(o.createdAt)} · ¥{(o.amountCents / 100).toFixed(0)}
                  {o.note && ` · ${o.note}`}
                </span>
              </span>

              {/* 珊瑚色只留给「等你核对」那一档，别让还没付款的也来抢注意力 */}
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                  o.status === 'pending' && o.claimedAt
                    ? 'bg-coral-soft/15 text-coral-soft'
                    : o.status === 'pending'
                      ? 'bg-white/10 text-white/50'
                      : o.status === 'paid'
                        ? 'bg-leaf/15 text-leaf'
                        : 'bg-white/10 text-white/45'
                }`}
              >
                {statusLabel(o)}
              </span>

              {o.status === 'pending' ? (
                <span className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => act(o.id, 'paid')}
                    disabled={busyId === o.id}
                    className="rounded-full bg-white px-4 py-1.5 text-[12.5px] font-semibold text-[#111512] disabled:opacity-40"
                  >
                    已收到款
                  </button>
                  <button
                    type="button"
                    onClick={() => act(o.id, 'rejected')}
                    disabled={busyId === o.id}
                    className="rounded-full border border-white/16 px-3.5 py-1.5 text-[12.5px] text-white/55 hover:text-white disabled:opacity-40"
                  >
                    驳回
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => act(o.id, o.status === 'paid' ? 'rejected' : 'paid')}
                  disabled={busyId === o.id}
                  className="shrink-0 text-[12px] text-white/32 hover:text-white/70 disabled:opacity-40"
                >
                  {o.status === 'paid' ? '撤销开通' : '改为已开通'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
