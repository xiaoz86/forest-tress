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

const STRENGTH_ORDER: Record<'strong' | 'medium' | 'weak', number> = {
  strong: 0,
  medium: 1,
  weak: 2,
};

// 头像和名字是固定像素，容器却随视口缩放：手机上容器只有 375 宽、
// 头像还是 56，比例上就顶到一起了。所以按容器宽度缩一档，
// 再用「缩完之后的真实像素」反推内边距——这样任何宽度都不会重叠。
const MIN_SCALE = 0.62;
const LABEL_HALF_W = 48; // 名字块最宽 96，居中后各占一半

function nodeScale(containerWidth: number): number {
  if (!containerWidth) return 1;
  return Math.max(MIN_SCALE, Math.min(1, containerWidth / W));
}

/** 名字 + 城市两行的高度。字号有下限，不能按 scale 线性缩——照线性算会少留位置。 */
export function nameFontSize(scale: number): number {
  return Math.max(10, Math.round(12 * scale));
}
export function cityFontSize(scale: number): number {
  return Math.max(9, Math.round(10.5 * scale));
}
function labelHeight(scale: number): number {
  return 6 + (nameFontSize(scale) + cityFontSize(scale)) * 1.5;
}

export default function RelationNetwork({
  graph,
  isMember = false,
  darkBg = false,
  animate = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(W);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w) setBoxWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = nodeScale(boxWidth);
  const sizeOf = (s: 'strong' | 'medium' | 'weak'): number =>
    Math.round((s === 'strong' ? 56 : s === 'medium' ? 48 : 40) * scale);
  const centerSize = Math.round(64 * scale);

  // 容器 1 CSS px = 多少个 viewBox 单位。内边距按真实像素换算过来。
  // 坐标点就是头像圆心（名字挂在头像下面，不参与居中），
  // 所以上面只需留半个头像，下面要留半个头像加整块名字。
  const unitPerPx = boxWidth ? W / boxWidth : 1;
  const pad = {
    top: (centerSize / 2 + 10) * unitPerPx,
    bottom: (centerSize / 2 + labelHeight(scale) + 10) * unitPerPx,
    x: (LABEL_HALF_W * scale + 4) * unitPerPx,
  };
  // 等比缩放，不能 x/y 各压各的：上下留白远大于左右，分开压会把圆压成
  // 竖向扁的椭圆，顶部节点贴到中心去——「上海」就是这么盖到中心头像上的。
  const availW = W - pad.x * 2;
  const availH = H - pad.top - pad.bottom;
  const fitScale = Math.min(availW / W, availH / H);
  const offX = (W - W * fitScale) / 2;
  const offY = pad.top + (availH - H * fitScale) / 2;
  const fitX = (x: number): number => offX + x * fitScale;
  const fitY = (y: number): number => offY + y * fitScale;

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

  // 初值是「全亮」：SSR、没有 JS、或不需要动画时，图本来就该是完整的，
  // 绝不能让内容的可见性依赖动画跑起来。
  const [lit, setLit] = useState(revealOrder.length);

  useEffect(() => {
    if (!animate) return;
    const el = containerRef.current;
    if (!el) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    // 挂载时已经在视野里就不熄灭——那会先闪一下再亮，比不动还难看。
    // 但观察器照装：滚开再回来时还要重播。
    const rect = el.getBoundingClientRect();
    const visibleOnMount = rect.top < window.innerHeight && rect.bottom > 0;

    // 下一帧就熄灭，而不是等观察器回调——回调可能晚一拍，
    // 那会让人先看到完整的图、再突然黑掉重播。此刻元素还在视野外，熄灭看不见。
    const raf = visibleOnMount ? 0 : requestAnimationFrame(() => setLit(0));

    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        setLit(n => {
          if (n >= revealOrder.length) {
            stop();
            return n;
          }
          return n + 1;
        });
      }, STEP_MS);
    };

    // 完全滚出视野才归零，回来时重新长一遍；
    // 用 0 而不是 0.25 做归零阈值，免得在屏幕边缘就被清空。
    const io = new IntersectionObserver(
      entries => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        if (entry.intersectionRatio >= 0.25) {
          start();
        } else if (entry.intersectionRatio === 0) {
          stop();
          setLit(0);
        }
      },
      { threshold: [0, 0.25] },
    );
    io.observe(el);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      if (timer) clearInterval(timer);
    };
  }, [animate, revealOrder.length]);

  const isLit = (id: string): boolean => (rankById.get(id) ?? 0) < lit;

  // 深色底时边线用接近白的浅色（同时把基础透明度也调亮一档）
  const edgeStroke = darkBg ? '#f5f5f0' : '#1a2e1a';

  return (
    <div ref={containerRef} className="relative w-full" style={{ aspectRatio: `${W} / ${H}` }}>
      {/* 节点用百分比定位，SVG 必须拉满同一个盒子才对得上：
          meet 会在容器比例有亚像素误差时留边，线就和圆心差几像素。 */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
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
              // 两端都亮了，这条连接才长出来
              const on = isLit(e.source) && isLit(e.target);
              // 从先亮的那端伸向后亮的那端——线是「谁伸手去够谁」，
              // 而不是整条一起淡入，这样才有相遇的感觉
              const aFirst = (rankById.get(e.source) ?? 0) <= (rankById.get(e.target) ?? 0);
              const [from, to] = aFirst ? [a, b] : [b, a];
              return (
                <line
                  key={`e-${i}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  strokeWidth={sw}
                  strokeOpacity={opacity}
                  // pathLength=1 把长度归一，dasharray=1 就是「整条线一段虚线」，
                  // 再把 offset 从 1 收到 0，线就一点点长出来
                  pathLength={1}
                  strokeDasharray={1}
                  strokeDashoffset={on ? 0 : 1}
                  style={{
                    transition: on
                      ? 'stroke-dashoffset 780ms cubic-bezier(0.33, 1, 0.68, 1) 120ms'
                      : 'none',
                  }}
                />
              );
            })}
        </g>
      </svg>

      <NodeBubble
        x={centerPos.x}
        y={centerPos.y}
        size={centerSize}
        name={graph.center.name}
        avatarUrl={graph.center.avatar_url}
        sublabel={graph.center.city || ''}
        scale={scale}
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
            scale={scale}
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
  scale = 1,
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
  scale?: number;
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
    /*
      定位的是「头像圆心」，名字用绝对定位挂在头像下面、不参与居中。
      名字若参与居中，整块的中心会落在头像与名字之间的空隙上，
      连线接的就是那个空隙——看起来就是线没接到圆心。
    */
    <div
      // 位移只写在下面的 inline transform 里。Tailwind v4 的 -translate-x-1/2
      // 走的是 CSS translate 属性，和 transform 里的 translate 会叠加，
      // 节点就整整偏出半个头像——线看起来接不到圆心。
      className="pointer-events-none absolute"
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
        className={`pointer-events-auto relative transition-transform ${interactive ? 'hover:scale-[1.06]' : ''}`}
      >
        <Avatar
          name={name}
          url={avatarUrl}
          size={size}
          className={emphasized ? 'ring-2 ring-white' : ''}
        />
        <div
          className="pointer-events-none absolute left-1/2 top-full mt-1.5 -translate-x-1/2 text-center"
          // 按内容取宽，不是一律 96：短名字占死整块宽度时，
          // 很容易横着撞到隔壁节点的头像
          style={{ width: 'max-content', maxWidth: Math.round(96 * scale) }}
        >
          <div
            className={`truncate tracking-wide ${nameCls}`}
            style={{ fontSize: nameFontSize(scale) }}
          >
            {name}
          </div>
          {sublabel && (
            <div
              className={`truncate ${subCls}`}
              style={{ fontSize: cityFontSize(scale) }}
            >
              {sublabel}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
