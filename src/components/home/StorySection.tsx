import type { ReactNode } from 'react';

// [5] 真实发生过什么连接 —— 编辑式排布：一则占大块，另两则叠在右侧。
// 文案沿用线上原有的三段连接故事，不另写。

const STORIES: {
  type: string;
  quote: string;
  footer: string;
}[] = [
  {
    type: 'AI MATCH · 共创伙伴',
    quote:
      '我们因为都关注社区营造被 AI 推荐认识。第一次线上聊了两个小时，发现彼此在做的事情竟然可以互补。后来一起发起了一个城市空间改造项目。这种不是刻意社交、而是自然生长出来的合作，特别珍贵。',
    footer: '林小溪 × 张远山 · 从共同关心社区营造开始',
  },
  {
    type: 'SMALL TABLE · 彼此支持',
    quote:
      '在一次「此刻你在重新思考什么」的小桌子对话里，我说出了自己正在转型的迷茫。没想到对面的人也经历过类似的阶段。她没有给建议，只是认真地听完，然后说「我理解」。那三个字比任何方法论都温暖。',
    footer: '陈思源 × 王晓晴 · 一次关于转型的小桌子对话',
  },
  {
    type: 'READING GROUP · 共读共学',
    quote:
      '我们在共读小组里一起读了一个月的书。每周三晚上的讨论，从书里聊到生活，从观点聊到经历。读完那本书的时候，我发现自己不知不觉多了几个真正可以聊天的朋友。这就是附近吧。',
    footer: '李明朗 × 赵一舟 等 5 人 · 每周三晚上的共读',
  },
];

export default function StorySection({ children }: { children?: ReactNode }) {
  const [lead, ...rest] = STORIES;

  return (
    <section id="stories" className="px-8 py-24 max-md:px-5 max-md:py-16">
      <div className="mx-auto max-w-[1080px]">
        <div className="mb-12 grid grid-cols-[1fr_0.85fr] items-end gap-10 max-md:grid-cols-1 max-md:gap-5">
          <div>
            <p className="mb-4 text-[12px] font-bold uppercase tracking-[0.2em] text-forest">
              Stories in the Forest
            </p>
            <h2
              className="text-[clamp(2rem,4.2vw,3.2rem)] font-medium leading-[1.2] tracking-[-0.03em] text-ink"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              有些连接，已经开始发生。
            </h2>
          </div>
          <p className="text-[14px] leading-[1.95] text-ink-soft">
            不是每次相遇都要变成合作。被认真听见、找到可以交流的人，本身也是附近重新出现的方式。
          </p>
        </div>

        <div className="grid grid-cols-[1.05fr_0.95fr] gap-5 max-lg:grid-cols-1">
          <article className="flex flex-col justify-between rounded-[30px] bg-white p-10 shadow-[0_14px_44px_rgba(42,59,47,0.06)] max-md:p-7">
            <div>
              <span className="text-[10.5px] font-medium tracking-[0.2em] text-coral">
                {lead.type}
              </span>
              <blockquote
                className="mt-6 text-[clamp(1.05rem,2.1vw,1.3rem)] font-normal leading-[1.85] text-forest-deep"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                「{lead.quote}」
              </blockquote>
            </div>
            <footer className="mt-8 text-[12.5px] text-ink-soft">{lead.footer}</footer>
          </article>

          <div className="grid grid-rows-2 gap-5">
            {rest.map(s => (
              <article
                key={s.type}
                className="flex flex-col justify-between rounded-[30px] border border-forest-deep/[0.08] bg-white/60 p-8 max-md:p-7"
              >
                <div>
                  <span className="text-[10.5px] font-medium tracking-[0.2em] text-moss/80">
                    {s.type}
                  </span>
                  <blockquote className="mt-5 text-[14px] leading-[1.9] text-ink-soft">
                    「{s.quote}」
                  </blockquote>
                </div>
                <footer className="mt-6 text-[12px] text-ink-soft">{s.footer}</footer>
              </article>
            ))}
          </div>
        </div>

        {children}
      </div>
    </section>
  );
}
