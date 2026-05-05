import type { NodeCard } from './supabase';
import { scoreMatch } from './match';

export type EdgeStrength = 'strong' | 'medium' | 'weak';

export type RelationEdge = {
  source: string; // node id
  target: string; // node id
  weight: number; // 0..n
  strength: EdgeStrength;
};

export type RelationNode = NodeCard & {
  /** 与中心节点的连接权重；中心节点自身为 +∞ */
  weightToCenter: number;
  /** 与中心的关系强度档位 */
  strength: EdgeStrength;
};

export type RelationGraph = {
  center: NodeCard;
  /** 不含中心节点；最多 8 个；按 weightToCenter 从高到低 */
  neighbors: RelationNode[];
  /** 节点之间所有"足够强"的连边（含 center↔neighbor 与 neighbor↔neighbor） */
  edges: RelationEdge[];
};

/** 把数值权重映射到三档强度，纯展示用 */
function classifyStrength(weight: number): EdgeStrength {
  if (weight >= 6) return 'strong';
  if (weight >= 3) return 'medium';
  return 'weak';
}

function pairWeight(a: NodeCard, b: NodeCard): number {
  // scoreMatch 是不对称的（offer/seeking 分方向），取双向最大值更稳
  const ab = scoreMatch(a, b).score;
  const ba = scoreMatch(b, a).score;
  return Math.max(ab, ba);
}

/**
 * 围绕 center 构建动态关系网。
 *
 * - 不论社群规模多少，邻居最多 8 个 → 含中心总共 ≤ 9
 * - 邻居按"与中心的权重"从高到低排
 * - 当邻居不足 8 时，会把弱关系（weight=0 的人）也按"与已选邻居的关联度"补上，
 *   保证总能展示一张网
 * - 边：中心 ↔ 每个邻居 始终绘制；邻居之间只在 weight ≥ 1 时绘制
 */
export function buildRelationGraph(
  center: NodeCard,
  pool: NodeCard[],
  maxNeighbors = 8,
): RelationGraph {
  const others = pool.filter(n => n.id && n.id !== center.id);

  // 1) 与中心的权重
  const scored = others.map(n => ({
    node: n,
    w: pairWeight(center, n),
  }));

  // 2) 强关系优先
  const strong = scored.filter(s => s.w > 0).sort((a, b) => b.w - a.w);
  const weak = scored.filter(s => s.w === 0);

  const picked: { node: NodeCard; w: number }[] = strong.slice(0, maxNeighbors);

  // 3) 不够用弱关系补：弱关系按"与已选邻居的关联度"排序，
  //    让网络看起来仍然有结构而不是孤立点
  if (picked.length < maxNeighbors && weak.length > 0) {
    const need = maxNeighbors - picked.length;
    const weakRanked = weak
      .map(w => {
        const bridging = picked.reduce(
          (acc, p) => acc + pairWeight(w.node, p.node),
          0,
        );
        return { ...w, bridging };
      })
      .sort((a, b) => b.bridging - a.bridging)
      .slice(0, need);
    for (const w of weakRanked) picked.push({ node: w.node, w: 0 });
  }

  const neighbors: RelationNode[] = picked.map(p => ({
    ...p.node,
    weightToCenter: p.w,
    strength: classifyStrength(p.w),
  }));

  // 4) 计算所有边
  const edges: RelationEdge[] = [];
  const centerId = center.id || '__center__';

  for (const n of neighbors) {
    edges.push({
      source: centerId,
      target: n.id!,
      weight: n.weightToCenter,
      strength: n.strength,
    });
  }
  // 邻居之间的连边：只画 weight ≥ 1 的（弱关系不连）
  for (let i = 0; i < neighbors.length; i++) {
    for (let j = i + 1; j < neighbors.length; j++) {
      const w = pairWeight(neighbors[i], neighbors[j]);
      if (w >= 1) {
        edges.push({
          source: neighbors[i].id!,
          target: neighbors[j].id!,
          weight: w,
          strength: classifyStrength(w),
        });
      }
    }
  }

  return { center, neighbors, edges };
}

/**
 * 依据节点 id 在画布内做稳定的伪随机布局。
 * - 中心固定在画布中心
 * - 邻居按权重排在内圈/外圈，用极坐标分散开
 *
 * 注：不强行做物理力导向，纯几何 + 一点抖动，足够看上去是网状。
 */
export type LayoutPos = { id: string; x: number; y: number; isCenter: boolean };

export function layoutGraph(
  graph: RelationGraph,
  width: number,
  height: number,
): LayoutPos[] {
  const cx = width / 2;
  const cy = height / 2;

  const out: LayoutPos[] = [];
  out.push({
    id: graph.center.id || '__center__',
    x: cx,
    y: cy,
    isCenter: true,
  });

  const total = graph.neighbors.length;
  if (total === 0) return out;

  // 半径：强关系靠近，弱关系远离
  // 取画布短边的 35% 作为内圈，60% 作为外圈
  const short = Math.min(width, height);
  const innerR = short * 0.32;
  const outerR = short * 0.46;

  // 用 id hash 做角度抖动，避免节点共线
  const hash = (s: string) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  };

  graph.neighbors.forEach((n, i) => {
    const baseAngle = (i / total) * Math.PI * 2 - Math.PI / 2; // 从顶部开始
    const jitter = ((hash(n.id || '') % 1000) / 1000 - 0.5) * 0.25; // ±0.125 rad
    const angle = baseAngle + jitter;
    const r = n.strength === 'strong'
      ? innerR
      : n.strength === 'medium'
        ? (innerR + outerR) / 2
        : outerR;
    out.push({
      id: n.id!,
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      isCenter: false,
    });
  });

  return out;
}
