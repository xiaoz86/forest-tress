import Link from 'next/link';
import Nav from '@/components/Nav';
import OrdersBoard from '@/components/OrdersBoard';
import { isAdminId } from '@/lib/admin';
import { getAuthenticatedMemberId } from '@/lib/session';

export const metadata = {
  title: '开通确认 · 附近森林',
};

export default async function OrdersPage() {
  const memberId = await getAuthenticatedMemberId();
  // 这页能看到谁买了什么，不是管理员就别进来。
  //
  // 不 redirect：这一页最常见的入口是付款通知邮件里的「打开确认」，
  // 而手机邮件客户端的内置浏览器和 Safari 不共享登录态，第一次点几乎必然没有。
  // 一跳走，?code 也丢了，人看到的就是「链接坏了」。停在这里把话说清楚。
  if (!isAdminId(memberId)) {
    return (
      <>
        <Nav />
        <main className="min-h-screen bg-[#0f1411] px-8 pb-24 pt-32 text-white max-md:px-7">
          <div className="mx-auto max-w-[680px] rounded-lg border border-white/10 bg-white/[0.045] p-8">
            <div className="mb-4 text-[11px] font-medium uppercase tracking-[0.18em] text-coral-soft">
              Unlock Requests
            </div>
            {/*
              「没登录」和「登录了但不是主理人」要分开说：
              对后者再喊一句「去登录」是死循环——他刚登录完。
            */}
            <h1 className="text-2xl font-medium">
              {memberId ? '这一页只有主理人能看' : '需要先登录'}
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-white/52">
              {memberId
                ? '当前登录的账号没有开通确认的权限。换主理人账号登录后，再点一次邮件里的「打开确认」。'
                : '这台设备还没登录。用注册邮箱登录之后，回到那封通知邮件再点一次「打开确认」，就会直接落到对应的那一条。'}
            </p>
            <Link
              href={memberId ? '/meditations' : '/login'}
              className="mt-6 inline-flex rounded-full bg-white px-5 py-2 text-sm font-medium text-[#111512] no-underline"
            >
              {memberId ? '回到声音林' : '去登录'}
            </Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Nav />
      <main className="relative min-h-screen bg-[#0f1411] px-8 pb-24 pt-32 text-white max-md:px-7 max-md:pt-28">
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
              className="text-[clamp(1.7rem,3.4vw,2.4rem)] font-normal leading-[1.25] tracking-[-0.02em]"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              开通确认
            </h1>
            <p className="mt-4 max-w-[560px] text-[14px] leading-[1.9] text-white/48">
              点开截图，对着支付宝的收款记录核一眼金额和时间。对上就点「已收到款」，
              找不到这笔就点「驳回」，权限会立刻收回。
            </p>
          </header>

          <OrdersBoard />
        </div>
      </main>
    </>
  );
}
