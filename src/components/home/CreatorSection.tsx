import Link from 'next/link';
import CreatorShowcase, { type ShowcaseNode } from './CreatorShowcase';

// [3] 森林里已经有什么人 —— 真实节点，不是示意卡片。

export default function CreatorSection({ nodes }: { nodes: ShowcaseNode[] }) {
  if (nodes.length === 0) return null;

  return (
    <section id="forest" className="bg-[#f2f5ee] px-8 py-24 max-md:px-5 max-md:py-16">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-12 grid grid-cols-[1fr_0.85fr] items-end gap-10 max-md:grid-cols-1 max-md:gap-5">
          <div>
            <p className="mb-4 text-[11px] font-medium uppercase tracking-[3px] text-coral">
              Creator Forest
            </p>
            <h2
              className="text-[clamp(1.6rem,3.6vw,2.4rem)] font-semibold leading-[1.4] tracking-[-0.01em] text-forest-deep"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              森林里，已经有人
              <br />
              在做这些事。
            </h2>
          </div>
          <div>
            <p className="text-[14px] leading-[1.95] text-text-light">
              每一个节点都来自一个真实的人。你可以看见他们正在创造什么、能够提供什么，以及此刻希望遇见怎样的伙伴。
            </p>
            <Link
              href="/creators"
              className="mt-5 inline-block text-[13.5px] font-medium text-forest-mid underline-offset-4 transition-colors hover:text-forest-deep hover:underline"
            >
              进入创造者森林 →
            </Link>
          </div>
        </div>

        <CreatorShowcase nodes={nodes} />
      </div>
    </section>
  );
}
