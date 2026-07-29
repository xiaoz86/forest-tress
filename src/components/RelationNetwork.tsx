'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import Avatar from './Avatar';
import type { RelationGraph } from '@/lib/network';
import { layoutGraph } from '@/lib/network';

type Props = {
  graph: RelationGraph;
  isMember?: boolean;
  /** 浅色文字 + 浅色边线，用于深色底（如首页第 4 屏） */
  darkBg?: boolean;
  /** 滚到眼前时让节点依次点亮、连线随后长出 */
  animate?: boolean;
};

const W = 720;
const H = 520;
const STEP_MS = 380;

// layoutGraph 只保证圆心落在画布内，没算头像半径和名字占的位置，
// 于是顶部节点会顶出容器压到上面的标题。这里把整张图收进内边距：
// 上留头像半径，下再多留一行名字加城市，左右留名字的一半宽度。
const PAD = { top: 52, bottom: 68, x: 58 };
const fitX = (x: number): number => PAD.x + (x / W) * (W - PAD.x * 2);
const fitY = (y: number): number => PAD.top + (y / H) * (H - PAD.top - PAD.bottom);

const STRENGTH_ORDER: Record<'strong' | 'medium' | 'weak', number> = {
  strong: 0,
  medium: 1,
  weak: 2,
};

export default function RelationNetwork({
  graph,
  isMember = false,
  darkBg = false,
  animate = false,
}: Props) {
  const positions = layoutGraph(graph, W, H).map(p => ({
    ...p,
    x: fitX(p.x),
    y: fitY(p.y),
  }));
  const posById = new Map(positions.map(p => [p.id, p]));

  const centerId = graph.center.id || '__center__';
  const centerPos = posById.get(centerId)!;

  // 点亮顺序：先中心，再按关系由强到弱一个个亮起来
  const revealOrder = useMemo(() => {
    const neighbors = [...graph.neighbors].sort(
      (a, b) => STRENGTH_ORDER[a.strength] - STRENGTH_ORDER[b.strength],
    );
    return [centerId, ...neighbors.map(n => n.id || '')];
  }, [graph.neighbors, centerId]);

  const rankById = useMemo(
    () => new Map(revealOrder.map((id, i) => [id, i])),
    [revealOrder],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  // 初值是「全亮」：SSR、没有 JS、或不需要动画时，图本来就该是完整的，
  // 绝不能让内容的可见性依赖动画跑起来。
  const [lit, setLit] = useState(revealOrder.length);

  useEffect(() => {
    if (!animate) return;
    const el = containerRef.current;
    if (!el) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    // 已经在视野里就不重演——那会先闪一下再亮，比不动还难看
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) return;

    // 下一帧就熄灭，而不是等观察器回调——回调可能晚一拍，
    // 那会让人先看到完整的图、再突然黑掉重播。此刻元素还在视野外，熄灭看不见。
    const raf = requestAnimationFrame(() => setLit(0));

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        setLit(n => {
          if (n >= revealOrder.length) {
            if (timer) clearInterval(timer);
            return n;
          }
          return n + 1;
        });
      }, STEP_MS);
    };

    const io = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          start();
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      if (timer) clearInterval(timer);
    };
  }, [animate, revealOrder.length]);

  const isLit = (id: string): boolean => (rankById.get(id) ?? 0) < lit;

  const sizeOf = (s: 'strong' | 'medium' | 'weak'): number =>
    s === 'strong' ? 56 : s === 'medium' ? 48 : 40;

  // 深色底时边线用接近白的浅色（同时把基础透明度也调亮一档）
  const edgeStroke = darkBg ? '#f5f5f0' : '#1a2e1a';

  return (
    <div ref={containerRef} className="relative w-full" style={{ aspectRatio: `${W} / ${H}` }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 block h-full w-full"
        role="img"
        aria-label="关系网"
      >
        <g fill="none" stroke={edgeStroke} strokeLinecap="round">
          {[...graph.edges]
            .sort((a, b) => a.weight - b.weight)
            .map((e, i) => {
              const a = posById.get(e.source);
              const b = posById.get(e.target);
              if (!a || !b) return null;
              // 深色底用更高的 opacity，否则线条会消失
              const opacity = darkBg
                ? e.strength === 'strong'
                  ? 0.45
                  : e.strength === 'medium'
                    ? 0.3
                    : 0.18
                : e.strength === 'strong'
                  ? 0.28
                  : e.strength === 'medium'
                    ? 0.16
                    : 0.09;
              const sw =
                e.strength === 'strong' ? 1.4 : e.strength === 'medium' ? 1.1 : 0.9;
              const dash = e.strength === 'weak' ? '3 5' : undefined;
              // 两端都亮了，这条连接才长出来
              const on = isLit(e.source) && isLit(e.target);
              return (
                <line
                  key={`e-${i}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  strokeWidth={sw}
                  strokeOpacity={opacity}
                  strokeDasharray={dash}
                  style={{
                    opacity: on ? 1 : 0,
                    transition: 'opacity 700ms ease 160ms',
                  }}
                />
              );
            })}
        </g>
      </svg>

      <NodeBubble
        x={centerPos.x}
        y={centerPos.y}
        size={64}
        name={graph.center.name}
        avatarUrl={graph.center.avatar_url}
        sublabel={graph.center.city || ''}
        emphasized
        darkBg={darkBg}
        lit={isLit(centerId)}
      />
      {graph.neighbors.map(n => {
        const p = posById.get(n.id!);
        if (!p) return null;
        const size = sizeOf(n.strength);
        const inner = (
          <NodeBubble
            x={p.x}
            y={p.y}
            size={size}
            name={n.name}
            avatarUrl={n.avatar_url}
            sublabel={n.city || ''}
            interactive={isMember}
            darkBg={darkBg}
            lit={isLit(n.id || '')}
          />
        );
        return isMember ? (
          <Link
            key={n.id}
            href={`/creators/${n.id}`}
            className="no-underline"
            aria-label={`查看 ${n.name} 的详情`}
          >
            {inner}
          </Link>
        ) : (
          <div key={n.id}>{inner}</div>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────

function NodeBubble({
  x,
  y,
  size,
  name,
  avatarUrl,
  sublabel,
  emphasized = false,
  interactive = false,
  darkBg = false,
  lit = true,
}: {
  x: number;
  y: number;
  size: number;
  name: string;
  avatarUrl?: string | null;
  sublabel?: string;
  emphasized?: boolean;
  interactive?: boolean;
  darkBg?: boolean;
  lit?: boolean;
}) {
  const nameCls = darkBg
    ? emphasized
      ? 'font-semibold text-white'
      : 'font-medium text-white/80'
    : emphasized
      ? 'font-semibold text-forest-deep'
      : 'font-medium text-text-secondary';
  const subCls = darkBg ? 'text-white/55' : 'text-text-light';
  return (
    <div
      className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
      style={{
        left: `${(x / W) * 100}%`,
        top: `${(y / H) * 100}%`,
        opacity: lit ? 1 : 0,
        // 从略小处浮现，像是刚长出来
        transform: `translate(-50%, -50%) scale(${lit ? 1 : 0.82})`,
        transition: 'opacity 520ms ease, transform 520ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      <div
        className={`pointer-events-auto transition-transform ${interactive ? 'hover:scale-[1.06]' : ''}`}
      >
        <Avatar
          name={name}
          url={avatarUrl}
          size={size}
          className={emphasized ? 'ring-2 ring-white' : ''}
        />
      </div>
      <div
        className="pointer-events-none mt-2 text-center"
        style={{ maxWidth: Math.max(size + 32, 96) }}
      >
        <div className={`truncate text-[12px] tracking-wide ${nameCls}`}>{name}</div>
        {sublabel && <div className={`truncate text-[10.5px] ${subCls}`}>{sublabel}</div>}
      </div>
    </div>
  );
}
