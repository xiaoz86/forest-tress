// [4] 加入后会获得什么 —— 把「连接怎么长出来」拆成四步，
// 让人知道种下节点之后会发生什么，而不是留在想象里。

const STEPS = [
  {
    n: '01',
    title: '种下节点',
    body: '写下你正在做的事、关心的议题、可以提供与正在寻找的内容。',
  },
  {
    n: '02',
    title: '被彼此看见',
    body: '森林根据议题、方向与互补能力，推荐值得认真认识的人。',
  },
  {
    n: '03',
    title: '开始对话',
    body: '从一个具体问题开始，不急着交换资源，也不需要表演自己。',
  },
  {
    n: '04',
    title: '长出事情',
    body: '一次支持、一场活动、一件作品，或一个可以共同推进的项目。',
  },
];

export default function PathSection() {
  return (
    <section
      id="paths"
      className="bg-gradient-to-br from-forest-deep via-[#1f3a1f] to-forest-mid px-8 py-24 max-md:px-5 max-md:py-16"
    >
      <div className="mx-auto max-w-[1080px]">
        <div className="mb-14 grid grid-cols-[1fr_0.85fr] items-end gap-10 max-md:grid-cols-1 max-md:gap-5">
          <div>
            <p className="mb-4 text-[11px] font-medium uppercase tracking-[3px] text-coral-soft">
              How Connection Grows
            </p>
            <h2
              className="text-[clamp(1.6rem,3.6vw,2.4rem)] font-semibold leading-[1.4] tracking-[-0.01em] text-white"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              连接不必被设计得很用力。
            </h2>
          </div>
          <p className="text-[14px] leading-[1.95] text-white/58">
            我们只把每个人真实的节点放在森林里，再通过推荐、对话与共同实践，让关系沿着适合自己的速度生长。
          </p>
        </div>

        <ol className="grid grid-cols-4 gap-8 max-lg:grid-cols-2 max-md:grid-cols-1 max-md:gap-7">
          {STEPS.map(s => (
            <li key={s.n} className="relative">
              <div className="mb-5 flex items-center gap-3">
                <span className="text-[13px] font-medium tracking-[0.14em] text-coral-soft/90">
                  {s.n}
                </span>
                <span aria-hidden="true" className="h-px flex-1 bg-white/12" />
              </div>
              <h3 className="text-[1.05rem] font-semibold text-white">{s.title}</h3>
              <p className="mt-3 text-[13px] leading-[1.85] text-white/55">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
