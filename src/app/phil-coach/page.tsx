import Link from 'next/link';
import Nav from '@/components/Nav';
import PhilCoachExperience from '@/components/PhilCoachExperience';
import { PHIL_ROLES } from '@/lib/philCoach';

export const metadata = {
  title: 'phil-coach · 附近森林',
  description:
    'phil-coach 是附近森林里的 AI 自我探索与教练式对话工具：陪你把话说完整、看清此刻真正重要的，找到愿意迈出的下一小步。',
};

const FAQ_ITEMS = [
  {
    question: '谁会处理我的对话？',
    answer:
      '对话不会出现在公开页面，也不会提供给其他森林用户。为了生成回复，你输入的内容和这次对话的近期上下文，会经附近森林服务器发送给第三方 AI 模型服务处理。',
  },
  {
    question: '数据会留下吗？它下次还记得我吗？',
    answer:
      '当前版本不会把对话正文写入附近森林数据库，也不会关联到你的森林资料；刷新或关闭后，本页无法恢复，下次打开它也不会接着记得。但模型服务商可能按其规则缓存或留存数据，因此这里不能承诺全链路“零留存”。请不要输入身份证号、完整联系方式、住址、财务或医疗资料、单位机密，以及他人的隐私。',
  },
  {
    question: '它和心理咨询有什么不同？',
    answer:
      '心理咨询与治疗由受过专业训练的人，在稳定关系和专业伦理中评估、理解并处理心理困扰。phil-coach 不做诊断、治疗或危机干预，只适合一般性的自我梳理与行动探索。若痛苦持续影响睡眠、工作或日常生活，或你有伤害自己、他人的念头，请联系当地急救、专业心理或医疗支持，以及身边可信任的人。',
  },
  {
    question: '什么时候更适合找真人生命教练？',
    answer:
      '当一个议题反复出现、关系到重要的人生转折，或你希望有人长期陪伴、反馈和问责时，真人教练更合适。真人能在共同现场里听见语气与沉默，看见表情与姿态，使用关系本身工作，并为专业关系承担伦理责任；这些都不是纯文字 AI 能做到的。真人生命教练也不等于心理咨询师，除非对方另有相应的专业资质。',
  },
];

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
              phil-coach · AI 自我探索与教练式对话
            </div>
            <h1
              className="text-[clamp(2.35rem,5.2vw,4rem)] font-semibold leading-[1.18]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              有人陪你，慢慢回到自己
            </h1>
            <p className="mt-7 text-[15px] leading-[2] text-white/56">
              当心里很乱、卡在一个选择里，或只是想把话说完整，phil-coach
              会尽量先听，再问一个从你话里长出来的问题。它不替你决定，只陪你看清此刻真正重要的，找到愿意迈出的下一小步。
            </p>
            <div className="mt-8 flex items-center gap-4 text-[12px] text-white/52">
              <span className="h-px w-10 bg-white/20" />
              <span>适合日常自我梳理 · 不是心理咨询或医疗服务</span>
            </div>
          </section>

          {/* 公众品类介绍：能做什么、不能做什么 */}
          <section className="mt-16 border-y border-white/10 py-10">
            <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.2em] text-white/32">
              先了解，再开始
            </div>
            <h2 className="text-2xl font-semibold">一段 AI 对话，能陪到哪里？</h2>
            <p className="mt-5 max-w-[760px] text-[14px] leading-[2] text-white/52">
              它是一款面向日常自我探索的文字工具。你可以用它把情绪说完整、理清选择、看见自己在乎的事；它会根据你主动写下的内容回应和提问，但答案与决定始终属于你。
            </p>

            <div className="mt-8 grid grid-cols-2 gap-5 max-md:grid-cols-1">
              <div className="rounded-xl border border-white/10 bg-white/[0.035] p-6">
                <h3 className="text-base font-semibold text-white">它比较擅长的</h3>
                <ul className="mt-4 space-y-3 text-[13px] leading-[1.8] text-white/56">
                  <li className="flex gap-3">
                    <span aria-hidden="true" className="text-coral-soft">·</span>
                    <span>跟住文字里的关键词、情绪与前后变化</span>
                  </li>
                  <li className="flex gap-3">
                    <span aria-hidden="true" className="text-coral-soft">·</span>
                    <span>提出基本、干净的问题，一次只往前一步</span>
                  </li>
                  <li className="flex gap-3">
                    <span aria-hidden="true" className="text-coral-soft">·</span>
                    <span>邀请你从分析回到身体感受与真正重视的事</span>
                  </li>
                  <li className="flex gap-3">
                    <span aria-hidden="true" className="text-coral-soft">·</span>
                    <span>需要时提供结构、选项和小而可逆的下一步</span>
                  </li>
                </ul>
              </div>
              <div className="rounded-xl border border-coral-soft/20 bg-coral-soft/[0.045] p-6">
                <h3 className="text-base font-semibold text-white">它明确做不到的</h3>
                <ul className="mt-4 space-y-3 text-[13px] leading-[1.8] text-white/56">
                  <li className="flex gap-3">
                    <span aria-hidden="true" className="text-coral-soft">·</span>
                    <span>听见声线、沉默和呼吸，或看见表情与姿态</span>
                  </li>
                  <li className="flex gap-3">
                    <span aria-hidden="true" className="text-coral-soft">·</span>
                    <span>感受现场关系、环境，以及没有被写下来的部分</span>
                  </li>
                  <li className="flex gap-3">
                    <span aria-hidden="true" className="text-coral-soft">·</span>
                    <span>用真人的生命经验、直觉与伦理责任和你共创</span>
                  </li>
                  <li className="flex gap-3">
                    <span aria-hidden="true" className="text-coral-soft">·</span>
                    <span>诊断、治疗、可靠评估危机，或代替专业支持</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-white/8 bg-black/10 px-6 py-5 text-[13px] leading-[1.9] text-white/56">
              <p>
                <span className="font-medium text-white/72">与真人教练的分界：</span>
                教练的功夫里有「三层聆听」的说法——第一层，人一边听、一边想着自己要说什么；第二层，全部注意力都在对方身上；第三层，还能听见语言之外的一切：语调的颤、句子间的停顿、身体的姿态、现场流动的能量。phil-coach
                在文字里能做到接近第二层的专注；第三层，以及用真实关系与生命经验和你共创，仍然属于真人。
              </p>
              <p className="mt-3">
                当你想被一个真实的人完整地听见，这片森林里就有正在生长的同行者——去
                <Link
                  href="/creators"
                  className="mx-1 text-coral-soft underline decoration-coral-soft/40 underline-offset-4 transition-colors hover:text-white"
                >
                  遇见附近
                </Link>
                看看。
              </p>
            </div>
          </section>

          {/* 四种回应方式 */}
          <section className="mt-16">
            <div className="mb-8 flex items-end justify-between gap-6 max-md:block">
              <h2 className="text-2xl font-semibold">它会怎样回应你</h2>
              <p className="max-w-[440px] text-sm leading-relaxed text-white/42 max-md:mt-3">
                你不用先想清楚需要哪一种。它会沿着你写下来的内容调整回应——而更多的时候，只是先听你把话说完整。
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

          {/* FAQ */}
          <section id="faq" className="mt-16 border-y border-white/10 py-10 scroll-mt-24">
            <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.2em] text-white/32">
              你可能会问
            </div>
            <div className="flex items-end justify-between gap-8 max-md:block">
              <h2 className="text-2xl font-semibold">开始前，把重要的事说清楚</h2>
              <p className="max-w-[420px] text-[13px] leading-[1.8] text-white/52 max-md:mt-3">
                关于隐私、数据与专业边界，你应该在开口之前就知道。
              </p>
            </div>
            <div className="mt-7 divide-y divide-white/10 border-y border-white/10">
              {FAQ_ITEMS.map(item => (
                <details key={item.question} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[15px] font-medium text-white/82 transition-colors hover:text-white focus:outline-none focus-visible:rounded-sm focus-visible:ring-1 focus-visible:ring-coral-soft/70 focus-visible:ring-offset-4 focus-visible:ring-offset-[#0f1411]">
                    <span>{item.question}</span>
                    <span
                      aria-hidden="true"
                      className="text-xl font-light text-coral-soft transition-transform duration-200 group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="max-w-[860px] pb-6 pr-12 text-[13px] leading-[1.95] text-white/52 max-md:pr-4">
                    {item.answer}
                  </p>
                </details>
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
