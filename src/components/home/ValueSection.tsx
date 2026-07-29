// [1] 这是什么 —— 紧跟 Hero，先把「来这里会发生什么」讲清楚，
// 再让访客自己去找入口。

const VALUES = [
  {
    index: '01 · BE SEEN',
    symbol: '见',
    title: '被看见',
    body: '让别人看见的不只是你的身份，而是你正在投入的事情、积累的能力与真实的需要。',
  },
  {
    index: '02 · MEET NEARBY',
    symbol: '遇',
    title: '遇见同频',
    body: '从共同关心的议题出发，找到能够理解你，也可能与你形成互补的人。',
  },
  {
    index: '03 · GROW TOGETHER',
    symbol: '生',
    title: '共同生长',
    body: '一次对话、一个小组或一场共创，都可以让一颗种子真正向前生长一步。',
  },
];

export default function ValueSection() {
  return (
    <section className="px-8 py-24 max-md:px-5 max-md:py-16">
      <div className="mx-auto max-w-[1080px]">
        <div className="mb-14 text-center">
          <p className="mb-4 text-[12px] font-bold uppercase tracking-[0.2em] text-forest">
            What Happens Here
          </p>
          <h2
            className="mx-auto max-w-[680px] text-[clamp(2rem,4.2vw,3.2rem)] font-medium leading-[1.2] tracking-[-0.03em] text-ink"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            不是再认识更多人，
            <br />
            而是遇见真正与你有关的人。
          </h2>
          <p className="mx-auto mt-6 max-w-[620px] text-[14px] leading-[1.95] text-ink-soft">
            每个人都可以带着一件正在发生的事来到这里。不必先包装成一个完整答案，只需要真实地说出：我正在做什么，我关心什么，我此刻需要什么。
          </p>
        </div>

        <div className="grid grid-cols-3 gap-5 max-md:grid-cols-1 max-md:gap-4">
          {VALUES.map(v => (
            <article key={v.title} className="px-2 py-4 max-md:px-0">
              <span className="text-[10.5px] font-medium tracking-[0.2em] text-moss/70">
                {v.index}
              </span>
              <div
                className="mt-5 text-[1.6rem] text-forest-mid"
                style={{ fontFamily: 'var(--font-serif)' }}
                aria-hidden="true"
              >
                {v.symbol}
              </div>
              <h3 className="mt-4 text-[1.15rem] font-semibold text-forest-deep">{v.title}</h3>
              <p className="mt-3 text-[13.5px] leading-[1.85] text-ink-soft">{v.body}</p>
            </article>
          ))}
        </div>

        <p className="mt-14 text-center text-[13.5px] italic text-ink-soft">
          一段真实的自我介绍，比一张精致的名片更容易让关系开始。
        </p>
      </div>
    </section>
  );
}
