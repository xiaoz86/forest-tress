import Link from 'next/link';
import Nav from '@/components/Nav';
import PhilCoachExperience from '@/components/PhilCoachExperience';
import { PHIL_ROLES } from '@/lib/philCoach';

export const metadata = {
  title: 'phil-coach · 附近森林',
  description:
    'phil-coach 是附近森林里一条回到自己的小径：当你想被听见、想把一团乱慢慢理清时，有一段温柔的对话陪你看见自己。',
};

export default function PhilCoachPage() {
  return (
    <>
      <Nav />
      <main className="relative min-h-screen overflow-hidden bg-[#0f1411] px-8 pb-24 pt-32 text-white max-md:px-5 max-md:pt-28">
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(160deg,rgba(255,255,255,0.055),transparent_44%,rgba(232,201,160,0.05))]" />

        <div className="relative mx-auto max-w-[1120px]">
          <div className="mb-12">
            <Link
              href="/"
              className="text-sm text-white/42 underline-offset-4 transition-colors hover:text-white"
            >
              回到首页
            </Link>
          </div>

          {/* Hero */}
          <section className="max-w-[720px]">
            <div className="mb-8 h-px w-20 bg-coral-soft/70" />
            <div className="mb-5 text-[11px] font-medium uppercase tracking-[3px] text-coral-soft">
              phil-coach · 一条回到自己的小径
            </div>
            <h1
              className="text-[clamp(2.35rem,5.2vw,4rem)] font-semibold leading-[1.18]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              有人陪你，慢慢回到自己
            </h1>
            <p className="mt-7 text-[15px] leading-[2] text-white/56">
              有些时候，我们不是缺一个答案，而是缺一段可以把话说完整的时间。把心里那团乱放下来，先有人听见，才会慢慢看清自己真正难过什么、在乎什么、想往哪里去。
              phil-coach 就是附近森林里这样一张小桌子：不替你做决定，也不急着把你修好。它只是陪你把自己找回来；需要的时候，再给一点经验、一点结构、一个可以先走的小步。
            </p>
            <div className="mt-8 flex items-center gap-4 text-[12px] text-white/36">
              <span className="h-px w-10 bg-white/20" />
              <span>这是附近森林「发现自我」的一条小径。和别人相遇之前，也先和自己坐一会儿。</span>
            </div>
          </section>

          {/* 四重身份 */}
          <section className="mt-16 border-y border-white/10 py-10">
            <div className="mb-8 flex items-end justify-between gap-6 max-md:block">
              <h2 className="text-2xl font-semibold">四种靠近你的方式</h2>
              <p className="max-w-[440px] text-sm leading-relaxed text-white/42 max-md:mt-3">
                你不需要先判断自己该被安慰、被提问，还是被建议。真实的对话里，这些本来就是流动的：先被接住，再看清，再做选择；有时也需要一个走过的人，把路照亮一点。
              </p>
            </div>
            <div className="grid grid-cols-4 gap-5 max-lg:grid-cols-2 max-md:grid-cols-1">
              {PHIL_ROLES.map(role => (
                <div
                  key={role.id}
                  className="rounded-lg border border-white/10 bg-white/[0.035] p-6 transition-colors hover:bg-white/[0.06]"
                >
                  <h3 className="text-lg font-semibold text-white">{role.name}</h3>
                  <p className="mt-4 text-[13px] leading-[1.95] text-white/62">{role.when}。</p>
                  <p className="mt-3 text-[13px] leading-[1.95] text-white/45">{role.how}。</p>
                </div>
              ))}
            </div>
          </section>

          {/* 引导式体验 */}
          <section className="mt-16">
            <div className="mb-8">
              <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.2em] text-white/32">
                现在就坐一会儿
              </div>
              <h2 className="text-2xl font-semibold">给自己十分钟</h2>
            </div>

            <PhilCoachExperience />
          </section>

          {/* 尾部 */}
          <section className="mt-20 rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center max-md:p-6">
            <h2
              className="text-[clamp(1.6rem,3.4vw,2.2rem)] font-semibold"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              每棵树，都值得被这样看见
            </h2>
            <p className="mx-auto mt-5 max-w-[520px] text-[14px] leading-[2] text-white/52">
              当你更能听见自己，也更容易在森林里遇见真正同频的人。你知道自己正在寻找什么，也知道自己可以把什么带给别人。phil-coach
              会在这条小径旁边，等你想回来坐一会儿的时候。
            </p>
            <div className="mt-8 flex justify-center gap-4 max-md:flex-col max-md:items-stretch">
              <Link
                href="/login"
                className="rounded-full bg-coral-soft px-7 py-3 text-[15px] font-medium text-[#20140f] no-underline transition-opacity hover:opacity-90"
              >
                成为森林里的一棵树
              </Link>
              <Link
                href="/meditations"
                className="rounded-full border border-white/16 bg-white/[0.05] px-7 py-3 text-[15px] text-white/78 no-underline transition-colors hover:bg-white/12 hover:text-white"
              >
                也去听听林间的声音
              </Link>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
