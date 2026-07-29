'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import Avatar from '@/components/Avatar';

// 森林里已经有什么人。
// 从「后台产品卡片」改成编辑式：一位重点创造者占大图，右侧两位不同方向的人，
// 每个人都先说清「正在做什么」和「正在寻找什么」。AI 推荐收进底部那条深绿提示里，
// 不再做成功能组件——让真实的人当视觉中心。

export type ShowcaseNode = {
  id: string;
  name: string;
  city: string;
  doing: string;
  seeking: string;
  topics: string[];
  avatarUrl?: string;
};

const ROTATE_MS = 6500;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** 取第 offset 位（环形），人少时也不会取空 */
function pick(nodes: ShowcaseNode[], index: number): ShowcaseNode {
  return nodes[((index % nodes.length) + nodes.length) % nodes.length];
}

export default function CreatorShowcase({ nodes }: { nodes: ShowcaseNode[] }) {
  const [cursor, setCursor] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 每轮换 3 个人（大图 1 + 右侧 2），所以一共这么多轮
  const rounds = Math.max(1, Math.ceil(nodes.length / 3));

  const advance = useCallback(() => setCursor(c => (c + 1) % rounds), [rounds]);

  useEffect(() => {
    if (paused || rounds < 2 || prefersReducedMotion()) return;
    timerRef.current = setInterval(advance, ROTATE_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [paused, rounds, advance]);

  if (nodes.length === 0) return null;

  const base = cursor * 3;
  const featured = pick(nodes, base);
  const side = [pick(nodes, base + 1), pick(nodes, base + 2)];
  // 人不够 3 位时右侧会重复大图那位，索性只显示还没出现过的
  const sideNodes = side.filter((n, i) => n.id !== featured.id && side.findIndex(s => s.id === n.id) === i);

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="grid grid-cols-[1.12fr_0.88fr] items-stretch gap-5 max-lg:grid-cols-1">
        {/* 左：重点创造者 */}
        <Link
          href={`/creators/${featured.id}`}
          key={featured.id}
          className="group relative min-h-[520px] animate-swap-in overflow-hidden rounded-[34px] p-9 text-cream no-underline max-md:min-h-[440px] max-md:p-7"
          style={{
            background:
              'linear-gradient(180deg, rgba(26,46,34,.03) 0%, rgba(20,38,28,.92) 82%), radial-gradient(circle at 72% 24%, rgba(206,221,201,.36), transparent 22%), linear-gradient(145deg, #899c88 0%, #526b59 48%, #253f2e 100%)',
          }}
        >
          {/* 背景里的两片叶形，纯装饰 */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-[86px] -top-[92px] h-[360px] w-[360px] rotate-[18deg] rounded-[46%_54%_42%_58%] border border-white/15 shadow-[0_0_0_70px_rgba(255,255,255,0.025)]"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-[95px] top-[88px] h-[250px] w-[160px] -rotate-[22deg] rounded-[70%_30%_62%_38%] bg-[rgba(232,239,226,0.13)] max-md:hidden"
          />

          <div className="relative z-[2] flex h-full flex-col">
            <div className="flex items-start justify-between gap-5 text-[11px] tracking-[0.10em] text-white/60">
              <span>森林里正在生长</span>
              <span className="text-right">{featured.city || '附近'}</span>
            </div>

            <div className="absolute right-2 top-[150px] max-md:static max-md:mt-8">
              <Avatar
                name={featured.name}
                url={featured.avatarUrl}
                size={112}
                className="ring-white/25"
              />
            </div>

            <div className="mt-auto pt-16">
              <p className="text-[12.5px] tracking-[0.08em] text-white/62">
                {featured.topics.slice(0, 2).join(' · ') || '创造者'}
              </p>
              <h3
                className="mt-2 text-[clamp(1.7rem,3.4vw,2.3rem)] font-medium leading-[1.3] text-white"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {featured.name}
              </h3>
              {featured.doing && (
                <p className="mt-4 max-w-[440px] text-[14.5px] leading-[1.9] text-white/78">
                  {featured.doing}
                </p>
              )}

              {featured.topics.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {featured.topics.slice(0, 3).map(t => (
                    <span
                      key={t}
                      className="rounded-full border border-white/18 bg-white/[0.08] px-3 py-1 text-[11.5px] text-white/80"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}

              {featured.seeking && (
                <div className="mt-6 flex items-center justify-between gap-5 border-t border-white/15 pt-5 text-[12px] text-white/60 max-md:flex-col max-md:items-start max-md:gap-2">
                  <span className="shrink-0">正在寻找</span>
                  <strong className="text-right text-[14px] font-medium text-white max-md:text-left">
                    {featured.seeking}
                  </strong>
                </div>
              )}
            </div>
          </div>
        </Link>

        {/* 右：另外两位不同方向的人 + AI 推荐提示 */}
        <div className="grid grid-rows-[1fr_1fr_auto] gap-4">
          {sideNodes.map(node => (
            <Link
              key={node.id}
              href={`/creators/${node.id}`}
              className="group grid animate-swap-in grid-cols-[auto_1fr_auto] items-start gap-5 rounded-[26px] border border-forest-deep/[0.11] bg-[rgba(250,248,242,0.7)] p-7 no-underline transition-all hover:-translate-y-1 hover:bg-[rgba(250,248,242,0.95)] hover:shadow-[0_18px_44px_rgba(42,59,47,0.08)] max-md:p-6"
            >
              <Avatar name={node.name} url={node.avatarUrl} size={52} />
              <div className="min-w-0">
                <h3
                  className="text-[clamp(1.25rem,2.4vw,1.6rem)] font-medium leading-tight text-forest-deep"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {node.name}
                </h3>
                <p className="mt-1 text-[12.5px] text-text-light">
                  {[node.topics[0], node.city].filter(Boolean).join(' · ')}
                </p>
                {node.doing && (
                  <p className="mt-3 line-clamp-3 text-[13.5px] leading-[1.8] text-text-secondary">
                    {node.doing}
                  </p>
                )}
                {node.seeking && (
                  <p className="mt-2.5 line-clamp-1 text-[12.5px] text-moss">
                    正在寻找 · {node.seeking}
                  </p>
                )}
              </div>
              <span
                aria-hidden="true"
                className="text-[15px] text-forest-deep/30 transition-transform group-hover:-translate-y-0.5 group-hover:text-forest-deep/60"
              >
                ↗
              </span>
            </Link>
          ))}

          {/* AI 推荐：收成一条轻提示，不做成功能面板 */}
          {sideNodes.length > 0 && (
            <div className="grid grid-cols-[auto_1fr] items-center gap-3.5 rounded-[22px] bg-forest-mid/[0.92] px-5 py-4 text-cream">
              <span
                aria-hidden="true"
                className="grid h-10 w-10 place-items-center rounded-full border border-white/18 bg-white/[0.08] text-white"
              >
                ✦
              </span>
              <div className="min-w-0">
                <b className="block text-[13px] font-semibold">一次可能值得开始的相遇</b>
                <p className="mt-1 text-[11.5px] leading-[1.6] text-white/62">
                  {featured.name} 与 {sideNodes[0].name} 都在
                  {featured.topics[0] ? `关注「${featured.topics[0]}」` : '做真实的事'}
                  ，森林会把这样的两个人放到彼此附近。
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 轮播指示：人多才出现 */}
      {rounds > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2.5">
          {Array.from({ length: rounds }, (_, i) => (
            <button
              key={i}
              onClick={() => setCursor(i)}
              type="button"
              aria-label={`看第 ${i + 1} 组创造者`}
              aria-current={i === cursor}
              className={`h-1.5 rounded-full transition-all ${
                i === cursor ? 'w-7 bg-forest-mid' : 'w-1.5 bg-forest-deep/20 hover:bg-forest-deep/40'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
