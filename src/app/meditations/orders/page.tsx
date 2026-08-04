import Link from 'next/link';
import { redirect } from 'next/navigation';
import Nav from '@/components/Nav';
import OrdersBoard from '@/components/OrdersBoard';
import { isAdminId } from '@/lib/admin';
import { readMemberId } from '@/lib/session';

export const metadata = {
  title: '开通确认 · 附近森林',
};

export default async function OrdersPage() {
  const memberId = await readMemberId();
  // 这页能看到谁买了什么，不是管理员就别进来
  if (!isAdminId(memberId)) redirect('/meditations');

  return (
    <>
      <Nav />
      <main className="relative min-h-screen bg-[#0f1411] px-8 pb-24 pt-32 text-white max-md:px-5 max-md:pt-28">
        <div className="mx-auto max-w-[880px]">
          <div className="mb-10 flex items-center justify-between gap-4">
            <Link
              href="/meditations?category=sleep"
              className="text-sm text-white/42 underline-offset-4 transition-colors hover:text-white"
            >
              ← 回到陪伴营
            </Link>
            <Link
              href="/meditations/admin"
              className="rounded-full border border-white/14 bg-white/[0.055] px-4 py-2 text-sm font-medium text-white/62 no-underline transition-colors hover:bg-white/10 hover:text-white"
            >
              管理冥想
            </Link>
          </div>

          <header className="mb-10">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-coral-soft">
              Unlock Requests
            </p>
            <h1
              className="text-[clamp(1.7rem,3.4vw,2.4rem)] font-medium leading-[1.25] tracking-[-0.02em]"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              开通确认
            </h1>
            <p className="mt-4 max-w-[560px] text-[14px] leading-[1.9] text-white/48">
              对着支付宝的收款记录，把备注里那四个字输进来，确认收到款就开通。
            </p>
          </header>

          <OrdersBoard />
        </div>
      </main>
    </>
  );
}
