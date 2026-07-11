import Link from 'next/link';
import Nav from '@/components/Nav';
import PhilCoachExperience from '@/components/PhilCoachExperience';
import { PHIL_ROLES } from '@/lib/philCoach';

export const metadata = {
  title: 'phil-coach · 附近森林',
  description:
    'phil-coach 是附近森林里一个会回应的树洞：当你想被听见、想把一团乱慢慢理清时，有一段温柔的对话陪你回到自己。',
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
              phil-coach · 一个会回应的树洞
            </div>
            <h1
              className="text-[clamp(2.35rem,5.2vw,4rem)] font-semibold leading-[1.18]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              有人陪你，慢慢回到自己
            </h1>
            <p className="mt-7 text-[15px] leading-[2] text-white/56">
              有些时候，我们不是缺一个答案，而是缺一段可以把话说完整的时间。把心里那团乱放下来，先有人听见，才会慢慢看清自己真正难过什么、在乎什么、想往哪里去。
              phil-coach 就是附近森林里这样一张小桌子：不替你做决定，也不急着把你修好。它只是陪你把自己找回来；需要的时候，才递给你一点走过的人的经验，或一个小得不能再小的下一步。
            </p>
            <div className="mt-8 flex items-center gap-4 text-[12px] text-white/36">
              <span className="h-px w-10 bg-white/20" />
              <span>这是附近森林「发现自我」的一条小径。和别人相遇之前，也先和自己坐一会儿。</span>
            </div>
          </section>

          {/* 初次见面：它是什么、怎么用 */}
          <section className="mt-16">
            <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.2em] text-white/32">
              初次见面
            </div>
            <h2 className="text-2xl font-semibold">phil-coach 是什么？</h2>
            <div className="mt-7 grid grid-cols-2 gap-10 max-md:grid-cols-1">
              <div className="text-[14px] leading-[2.05] text-white/56">
                <p>
                  它是附近森林种下的一位 AI
                  同行者。名字里的「phil」，取自希腊语 Philia——朋友之间那种平等、不占有的爱。
                </p>
                <p className="mt-4">
                  你可以把它当作一个会回应的树洞：开心的、难过的、说不出口的，都可以放进来。它读过许多教练与心理学的书，但它最被认真教过的一件事，是<span className="text-white/80">先听你说完，而不是急着给答案</span>。它不评判你，也不替你做决定——它相信答案在你身上，它只是陪你把答案找出来。
                </p>
              </div>
              <div className="text-[14px] leading-[2.05] text-white/56">
                <p>
                  用它没有任何门槛：在下面挑一条此刻最像你的小径，然后像对一个可信的人说话那样，想到什么说什么——不用组织语言，错别字也没关系。它一次只问一个问题；<span className="text-white/80">不用急着答得「对」，答得真就好</span>。想停就随时停，这段对话不会被保存，说完就散。
                </p>
                <p className="mt-4 text-[13px] text-white/40">
                  一件要说在前面的事：它不是心理咨询，也不是医疗服务。如果你正走在很深的低谷里，请同时找身边可信的人或专业支持——你值得被更结实地接住。
                </p>
              </div>
            </div>
          </section>

          {/* 四重身份 */}
          <section className="mt-16 border-y border-white/10 py-10">
            <div className="mb-8 flex items-end justify-between gap-6 max-md:block">
              <h2 className="text-2xl font-semibold">四种靠近你的方式</h2>
              <p className="max-w-[440px] text-sm leading-relaxed text-white/42 max-md:mt-3">
                你不用先想清楚自己需要哪一种。话说到哪儿，它就成为哪一面——而更多的时候，它只是在认真听。
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
