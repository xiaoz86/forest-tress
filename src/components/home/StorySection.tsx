import type { ReactNode } from 'react';
import type { Dictionary } from '@/i18n';

// [5] 真实发生过什么连接 —— 编辑式排布：一则占大块，另两则叠在右侧。
// 文案沿用线上原有的三段连接故事，不另写。
//
// 引号来自字典：中文用「」，英文用弯引号——「」套在英文句子外面很难看。

type Props = {
  t: Dictionary['home']['stories'];
  children?: ReactNode;
};

export default function StorySection({ t, children }: Props) {
  const [lead, ...rest] = t.items;

  return (
    <section id="stories" className="px-8 py-24 max-md:px-7 max-md:py-16">
      <div className="mx-auto max-w-[1080px]">
        <div className="mb-12 grid grid-cols-[1fr_0.85fr] items-end gap-10 max-md:grid-cols-1 max-md:gap-5">
          <div>
            <p className="mb-4 text-[12px] font-bold uppercase tracking-[0.2em] text-forest">
              Stories in the Forest
            </p>
            <h2
              className="text-[clamp(2rem,4.2vw,3.2rem)] font-normal leading-[1.2] tracking-[-0.03em] text-ink"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              {t.heading}
            </h2>
          </div>
          <p className="text-[14px] leading-[1.95] text-ink-soft">{t.lede}</p>
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
                {t.quoteOpen}
                {lead.quote}
                {t.quoteClose}
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
                    {t.quoteOpen}
                    {s.quote}
                    {t.quoteClose}
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
