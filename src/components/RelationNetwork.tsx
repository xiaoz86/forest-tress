import Link from 'next/link';
import Avatar from './Avatar';
import type { RelationGraph } from '@/lib/network';
import { layoutGraph } from '@/lib/network';

type Props = {
  graph: RelationGraph;
  isMember?: boolean;
  /** 浅色文字 + 浅色边线，用于深色底（如首页第 4 屏） */
  darkBg?: boolean;
};

const W = 720;
const H = 520;

export default function RelationNetwork({
  graph,
  isMember = false,
  darkBg = false,
}: Props) {
  const positions = layoutGraph(graph, W, H);
  const posById = new Map(positions.map(p => [p.id, p]));

  const centerId = graph.center.id || '__center__';
  const centerPos = posById.get(centerId)!;

  const sizeOf = (s: 'strong' | 'medium' | 'weak'): number =>
    s === 'strong' ? 56 : s === 'medium' ? 48 : 40;

  // 深色底时边线用接近白的浅色（同时把基础透明度也调亮一档）
  const edgeStroke = darkBg ? '#f5f5f0' : '#1a2e1a';

  return (
    <div className="relative w-full" style={{ aspectRatio: `${W} / ${H}` }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 w-full h-full block"
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
      className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none"
      style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` }}
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
        className="mt-2 text-center pointer-events-none"
        style={{ maxWidth: Math.max(size + 32, 96) }}
      >
        <div className={`text-[12px] tracking-wide truncate ${nameCls}`}>
          {name}
        </div>
        {sublabel && (
          <div className={`text-[10.5px] truncate ${subCls}`}>{sublabel}</div>
        )}
      </div>
    </div>
  );
}
