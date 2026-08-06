import Link from 'next/link';
import Nav from '@/components/Nav';
import MeditationAdminEditor from '@/components/MeditationAdminEditor';
import { isAdminId } from '@/lib/admin';
import { fetchMeditationContent } from '@/lib/meditations';
import { getAuthenticatedMemberId } from '@/lib/session';

export const metadata = {
  title: '冥想管理 · 附近森林',
  description: '编辑附近森林首页冥想区和声音内容。',
};

export default async function MeditationAdminPage() {
  const [content, memberId] = await Promise.all([
    fetchMeditationContent(),
    getAuthenticatedMemberId(),
  ]);
  const isAdmin = isAdminId(memberId);

  if (!isAdmin) {
    return (
      <>
        <Nav />
        <main className="min-h-screen bg-[#0f1411] px-8 pb-24 pt-32 text-white max-md:px-5">
          <div className="mx-auto max-w-[680px] rounded-lg border border-white/10 bg-white/[0.045] p-8">
            <div className="mb-4 text-[11px] font-medium tracking-[0.18em] text-coral-soft uppercase">
              Admin
            </div>
            <h1 className="text-2xl font-semibold">需要管理员权限</h1>
            <p className="mt-4 text-sm leading-relaxed text-white/52">
              登录管理员节点后，可以编辑首页冥想区、分类菜单，并上传具体音频。
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
      <main className="relative min-h-screen overflow-hidden bg-[#0f1411] px-8 pb-24 pt-32 text-white max-md:px-5">
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(160deg,rgba(255,255,255,0.055),transparent_44%,rgba(232,201,160,0.05))]" />
        <div className="relative mx-auto max-w-[1040px]">
          <div className="mb-10 flex items-center justify-between gap-4">
            <Link
              href="/meditations"
              className="text-sm text-white/42 underline-offset-4 transition-colors hover:text-white"
            >
              回到冥想页
            </Link>
            <Link
              href="/#meditations"
              className="rounded-full border border-white/14 bg-white/[0.055] px-4 py-2 text-sm font-medium text-white/62 no-underline transition-colors hover:bg-white/10 hover:text-white"
            >
              查看首页
            </Link>
          </div>

          <header className="mb-10 max-w-[680px]">
            <div className="mb-6 h-px w-20 bg-coral-soft/70" />
            <div className="mb-4 text-[11px] font-medium tracking-[3px] text-coral-soft uppercase">
              Meditation Admin
            </div>
            <h1
              className="text-[clamp(2rem,4vw,3.4rem)] font-semibold leading-tight"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              编辑林间呼吸
            </h1>
            <p className="mt-5 text-[15px] leading-[2] text-white/52">
              首页文案、分类胶囊和具体音频会一起更新，保持用户看到的是同一片安静的森林。
            </p>
          </header>

          <MeditationAdminEditor initialContent={content} />
        </div>
      </main>
    </>
  );
}
