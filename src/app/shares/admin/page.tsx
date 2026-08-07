import Link from 'next/link';
import Nav from '@/components/Nav';
import ShareAdminEditor from '@/components/ShareAdminEditor';
import { isAdminId } from '@/lib/admin';
import { getAuthenticatedMemberId } from '@/lib/session';
import { fetchShareContent } from '@/lib/shares';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '分享管理 · 附近森林',
  description: '编辑附近森林林间分享内容。',
};

export default async function ShareAdminPage() {
  const [content, memberId] = await Promise.all([
    fetchShareContent(),
    getAuthenticatedMemberId(),
  ]);
  const isAdmin = isAdminId(memberId);

  if (!isAdmin) {
    return (
      <>
        <Nav />
        <main className="min-h-screen bg-[#0f1411] px-8 pb-24 pt-32 text-white max-md:px-7">
          <div className="mx-auto max-w-[680px] rounded-lg border border-white/10 bg-white/[0.045] p-8">
            <div className="mb-4 text-[11px] font-medium tracking-[0.18em] text-coral-soft uppercase">
              Admin
            </div>
            <h1 className="text-2xl font-semibold">需要管理员权限</h1>
            <p className="mt-4 text-sm leading-relaxed text-white/52">
              登录管理员节点后，可以编辑林间分享，并上传视频、图片和海报。
            </p>
            <Link
              href="/login"
              className="mt-6 inline-flex rounded-full bg-white px-5 py-2 text-sm font-semibold text-[#111512] no-underline"
            >
              去登录
            </Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Nav />
      <main className="relative min-h-screen overflow-hidden bg-[#0f1411] px-8 pb-24 pt-32 text-white max-md:px-7">
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(160deg,rgba(255,255,255,0.055),transparent_44%,rgba(232,201,160,0.05))]" />
        <div className="relative mx-auto max-w-[1040px]">
          <div className="mb-10 flex items-center justify-between gap-4">
            <Link
              href="/shares"
              className="text-sm text-white/42 underline-offset-4 transition-colors hover:text-white"
            >
              回到分享页
            </Link>
            <Link
              href="/#experience"
              className="rounded-full border border-white/14 bg-white/[0.055] px-4 py-2 text-sm font-medium text-white/62 no-underline transition-colors hover:bg-white/10 hover:text-white"
            >
              查看首页
            </Link>
          </div>

          <header className="mb-10 max-w-[720px]">
            <div className="mb-6 h-px w-20 bg-coral-soft/70" />
            <div className="mb-4 text-[11px] font-medium tracking-[3px] text-coral-soft uppercase">
              Share Admin
            </div>
            <h1
              className="text-[clamp(2rem,4vw,3.4rem)] font-semibold leading-tight"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              编辑林间分享
            </h1>
            <p className="mt-5 text-[15px] leading-[2] text-white/52">
              首页展示一段真实分享，更多页承接其他超级个体的作品、产品、活动和体验。
            </p>
          </header>

          <ShareAdminEditor initialContent={content} />
        </div>
      </main>
    </>
  );
}
