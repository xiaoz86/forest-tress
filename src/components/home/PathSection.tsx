import PathSteps, { type Step } from './PathSteps';
// [4] 加入后会获得什么 —— 把「连接怎么长出来」拆成四步，
// 让人知道种下节点之后会发生什么，而不是留在想象里。

const STEPS: Step[] = [
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
      className="bg-gradient-to-br from-forest-deep via-[#1f3a1f] to-forest-mid px-8 py-24 max-md:px-5 max-md:py-12"
    >
      <div className="mx-auto max-w-[1080px]">
        {/*
          手机上标题和四折是同一条纸带：标题是最上面那一折（始终摊平），
          底边一道细线就是第一道折痕，四折从这里接着往下折。
          所以标题块在窄屏才有底色和圆角，桌面维持原样。
        */}
        <div className="mb-14 max-w-[860px] max-md:mb-0 max-md:rounded-t-2xl max-md:border-b max-md:border-white/[0.16] max-md:bg-gradient-to-b max-md:from-white/[0.075] max-md:to-white/[0.025] max-md:px-5 max-md:pb-7 max-md:pt-7">
          <p className="mb-4 text-[12px] font-bold uppercase tracking-[0.2em] text-[rgba(238,242,235,0.62)]">
            How Connection Grows
          </p>
          <h2
            className="text-[clamp(2rem,4.2vw,3.2rem)] font-medium leading-[1.25] tracking-[-0.03em] text-white"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            连接不必用力，
            <br />
            让关系沿着适合自己的速度生长。
          </h2>
        </div>

        <PathSteps steps={STEPS} />
      </div>
    </section>
  );
}
