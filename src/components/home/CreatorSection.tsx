import Link from 'next/link';
import type { Dictionary } from '@/i18n';
import CreatorShowcase, { type ShowcaseNode } from './CreatorShowcase';

// [3] 森林里已经有什么人 —— 真实节点，不是示意卡片。
// 节点上的名字、城市、正在做什么都来自库里，翻不了；这里只管框架文案。

type Props = {
  nodes: ShowcaseNode[];
  t: Dictionary['home']['creators'];
};

export default function CreatorSection({ nodes, t }: Props) {
  if (nodes.length === 0) return null;

  return (
    <section id="forest" className="bg-[#eef1e8] px-8 py-24 max-md:px-7 max-md:py-16">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-10 flex items-end justify-between gap-10 max-md:flex-col max-md:items-start max-md:gap-5">
          <div>
            <p className="mb-4 text-[12px] font-bold uppercase tracking-[0.2em] text-forest">
              Creator Platform
            </p>
            <h2
              className="max-w-[800px] text-[clamp(1.25rem,2.4vw,1.75rem)] font-normal leading-[1.65] text-ink"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              {t.heading}
            </h2>
          </div>
          <Link
            href="/creators"
            className="inline-block shrink-0 text-[13.5px] font-medium text-forest-mid underline-offset-4 transition-colors hover:text-forest-deep hover:underline"
          >
            {t.link} →
          </Link>
        </div>

        <CreatorShowcase nodes={nodes} t={t.showcase} />
      </div>
    </section>
  );
}
