import Link from 'next/link';

// [2] 我能做什么 —— 首页不再完整展开每个产品，只给每类需要一个清晰入口。
// 名字沿用导航里的正式叫法，别在这里另发明一套。

const ENTRANCES = [
  {
    icon: '息',
    title: '林间探索',
    body: '从正念声音、身心放松与自我关怀开始，把注意力重新带回此刻。',
    href: '/meditations',
    cta: '进入「林间探索」',
  },
  {
    icon: '伴',
    title: '回到自己',
    body: '一个会记得你的虚拟陪伴教练 phil-coach，支持你整理感受、看见选择，并找到下一步。',
    href: '/phil-coach',
    cta: '开始一次对话',
  },
  {
    icon: '见',
    title: '遇见附近',
    body: '浏览创造者节点，通过同频推荐、小桌子对话和主题活动认识彼此。',
    href: '/creators',
    cta: '看看创造者森林',
  },
  {
    icon: '创',
    title: '个体创造',
    body: '让你的课程、内容、活动、作品或项目被看见，并找到可以支持它的人。',
    href: '/shares',
    cta: '看看正在生长的事',
  },
];

export default function EntranceSection() {
  return (
    <section id="entrances" className="bg-paper-soft/60 px-8 py-24 max-md:px-5 max-md:py-16">
      <div className="mx-auto max-w-[1080px]">
        <div className="mb-12 max-w-[860px]">
          <p className="mb-4 text-[12px] font-bold uppercase tracking-[0.2em] text-forest">
            Four Ways In
          </p>
          <h2
            className="text-[clamp(2rem,4.2vw,3.2rem)] font-medium leading-[1.2] tracking-[-0.03em] text-ink"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            从适合你的那条小径进入。
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-5 max-md:grid-cols-1 max-md:gap-4">
          {ENTRANCES.map(e => (
            <Link
              key={e.href}
              href={e.href}
              className="group flex flex-col justify-between rounded-[26px] border border-forest-deep/[0.10] bg-paper-soft p-9 no-underline transition-all hover:-translate-y-1 hover:border-forest-deep/20 hover:shadow-[0_18px_44px_rgba(42,59,47,0.07)] max-md:p-7"
            >
              <div>
                <div
                  className="text-[1.5rem] text-forest-mid"
                  style={{ fontFamily: 'var(--font-serif)' }}
                  aria-hidden="true"
                >
                  {e.icon}
                </div>
                <h3 className="mt-4 text-[1.2rem] font-semibold text-forest-deep">{e.title}</h3>
                <p className="mt-3 text-[13.5px] leading-[1.85] text-ink-soft">{e.body}</p>
              </div>
              <span className="mt-8 inline-flex items-center gap-1.5 text-[13px] font-medium text-forest-mid">
                {e.cta}
                <span
                  aria-hidden="true"
                  className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                >
                  ↗
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
