'use client';

import { dict } from '@/i18n';
import type { Locale } from '@/lib/locale';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import Avatar from './Avatar';
import { layoutGraph } from '@/lib/network';
import type { PublicGraph } from '@/lib/publicNode';

type Props = {
  /**
   * **只收白名单过的图**，不收 RelationGraph。
   * 这个 props 是服务端到客户端的边界：类型写成 RelationGraph 就等于允许
   * 整张 NodeCard 被序列化进 RSC payload——ai_recommendations 那次就是
   * 这么漏出去的。见 lib/publicNode.ts。
   */
  graph: PublicGraph;
  isMember?: boolean;
  /** 浅色文字 + 浅色边线，用于深色底（如首页第 4 屏） */
  darkBg?: boolean;
  /** 滚到眼前时让节点依次点亮、连线随后长出 */
  animate?: boolean;
  /** 字典里有函数，跨不过序列化边界，所以只收 locale */
  locale: Locale;
};

const W = 720;
const H = 520;
const STEP_MS = 620;   // 一个节点亮一次的间隔，慢下来才像「长出来」而不是「刷出来」

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

/**
 * 坐标进 DOM 之前先量化到 0.01px。
 *
 * 这些点是一路浮点算下来的，服务端和客户端会在最后一两位上分家
 * （y1 服务端 200.7712323428285、客户端 200.77123234282848）。
 * React 比的是属性字符串，于是每次加载都报一次
 * 「hydrated but some attributes didn't match」，并且明确说
 * 「This won't be patched up」——首屏那批连线用的一直是服务端的值。
 *
 * 差异在 1e-13 量级，量化到 0.01px 足够把它抹平，
 * 而 0.01px 远在亚像素以下，画面上看不出任何区别。
 */
function snap(n: number): number {
  return Math.round(n * 100) / 100;
}

export default function RelationNetwork({
  graph,
  isMember = false,
  darkBg = false,
  animate = false,
  locale,
}: Props) {
  const t = useMemo(() => dict(locale).creatorDetail, [locale]);
  const containerRef = useRef<HTMLDivElement>(null);
  // 全程在「容器的真实像素」里算。之前布局用 viewBox 单位、内边距用像素，
  // 两套坐标来回换算，既容易算错，也没法在窄屏改容器比例。
  const [box, setBox] = useState({ w: W, h: H });

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect;
      if (r?.width && r?.height) setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = nodeScale(box.w);
  const sizeOf = (s: 'strong' | 'medium' | 'weak'): number =>
    Math.round((s === 'strong' ? 56 : s === 'medium' ? 48 : 40) * scale);
  const centerSize = Math.round(64 * scale);

  // 坐标点就是头像圆心（名字挂在头像下面，不参与居中），
  // 所以上面只需留半个头像，下面要留半个头像加整块名字。
  const pad = {
    top: centerSize / 2 + 10,
    bottom: centerSize / 2 + labelHeight(scale) + 10,
    x: LABEL_HALF_W * scale + 4,
  };
  const availW = Math.max(40, box.w - pad.x * 2);
  const availH = Math.max(40, box.h - pad.top - pad.bottom);
  const cx = box.w / 2;
  const cy = pad.top + availH / 2;

  // layoutGraph 把节点摆在以短边算半径的圆上——盒子一宽，两侧就空着一大片。
  // 这里取它的角度和相对半径，重新铺成一个填满可用区域的椭圆。
  const R = 0.46 * Math.min(W, H); // layoutGraph 的最外圈半径
  const positions = layoutGraph(graph, W, H).map(p => ({
    ...p,
    x: snap(cx + ((p.x - W / 2) / R) * (availW / 2)),
    y: snap(cy + ((p.y - H / 2) / R) * (availH / 2)),
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
    <div
      ref={containerRef}
      className="relative w-full aspect-[720/520] max-md:aspect-[5/6]"
    >
      {/* viewBox 直接用容器像素尺寸：1 单位 = 1 像素，
          节点的 left/top 也是像素，两者天然对齐，不留换算误差。 */}
      <svg
        viewBox={`0 0 ${box.w} ${box.h}`}
        preserveAspectRatio="none"
        className="absolute inset-0 block h-full w-full"
        role="img"
        aria-label={t.network.aria}
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
                      ? 'stroke-dashoffset 1150ms cubic-bezier(0.33, 1, 0.68, 1) 220ms'
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
            aria-label={t.network.nodeAria(n.name)}
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
        left: `${x}px`,
        top: `${y}px`,
        opacity: lit ? 1 : 0,
        // 从略小处浮现，像是刚长出来
        transform: `translate(-50%, -50%) scale(${lit ? 1 : 0.82})`,
        transition: 'opacity 660ms ease, transform 660ms cubic-bezier(0.22, 1, 0.36, 1)',
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
