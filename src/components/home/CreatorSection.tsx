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
        <div className="mb-12 grid grid-cols-[1fr_0.85fr] items-end gap-10 max-md:grid-cols-1 max-md:gap-5">
          <div>
            <p className="mb-4 text-[12px] font-bold uppercase tracking-[0.2em] text-forest">
              Creator Forest
            </p>
            <h2
              className="text-[clamp(2rem,4.2vw,3.2rem)] font-normal leading-[1.2] tracking-[-0.03em] text-ink"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              {t.headingTop}
              <br />
              {t.headingBottom}
            </h2>
          </div>
          <div>
            <p className="text-[14px] leading-[1.95] text-ink-soft">{t.lede}</p>
            <Link
              href="/creators"
              className="mt-5 inline-block text-[13.5px] font-medium text-forest-mid underline-offset-4 transition-colors hover:text-forest-deep hover:underline"
            >
              {t.link} →
            </Link>
          </div>
        </div>

        <CreatorShowcase nodes={nodes} t={t.showcase} />
      </div>
    </section>
  );
}
