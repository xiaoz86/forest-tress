import type { NodeCard } from '@/lib/supabase';

/**
 * 「遇见星空」的数据层。
 *
 * 一条铁律：这里产出的 SkyStar **不含任何联系方式**。
 * 星空把所有人的名字、城市、正在做的事聚合到一屏，
 * 聚合本身就改变了暴露程度——即使每条信息原本都公开。
 * 所以下发的字段是白名单，不是「NodeCard 减去几个」。
 *
 * 规格见 遇见星空-V6.1-设计与实现规格.md §2 数据契约。
 */

/** 下发给浏览器的一颗星。字段全部来自注册表，没有一个是新造的。 */
export type SkyStar = {
  id: string;
  name: string;
  city: string;
  /** 第 1 步「用一句话介绍自己」 */
  doing: string;
  /** 第 2 步关注议题 */
  topics: string[];
  /** 注册后 AI 抽的 5~8 个，用作星轨 */
  keywords: string[];
  /** 第 3 步「可以为别人提供什么」 */
  offer: string;
  /** 第 3 步「正在寻找什么样的连接」 */
  seeking: string;
  /** 第 4 步「一个美的时刻」 */
  moment: string;
  /** 第 4 步「想创造或守护的美」 */
  create: string;
  /** 第 5 步「心里的那颗种子」 */
  seed: string;
  /** 横向位置，百分比。由 id + 序号稳定生成，刷新不跳动 */
  x: number;
  /**
   * 纵向位置，**0~1 的比例**，不是百分比。
   *
   * 为什么不用百分比：导航栏是固定高度的像素条，而百分比在矮屏上会缩水——
   * 8% 在 900px 高时是 72px，刚好压在导航底下点不到。
   * 改成比例之后，客户端用 `calc(安全区 + (100% - 上下安全区) * ratio)` 换算，
   * 无论视口多高，星都不会落进导航那条带。
   */
  y: number;
  /** 近 30 天更新过。只用来让呼吸略快一点，不进入任何排序 */
  recent: boolean;
  /** 加入天数，用于「新升起的星」 */
  age: number;
};

/**
 * FNV-1a。**必须先转字符串**——传数字进来时 `str.length` 是 undefined，
 * 循环一次都不跑，所有调用返回同一个常数，而且不报错。
 * 这个坑在 demo 阶段让三层山林全部生成了相同的重复段。
 */
export function skyHash(str: string | number, salt: number): number {
  const s = String(str);
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/** Halton 低差异序列。纯随机在几十颗星时就会聚簇，铺不开。 */
function halton(index: number, base: number): number {
  let f = 1;
  let r = 0;
  let n = index + 1;
  while (n > 0) {
    f /= base;
    r += f * (n % base);
    n = Math.floor(n / base);
  }
  return r;
}

/**
 * `beauty` 一列里存着两段带前缀的文本，前缀是提交时拼上去的。
 * 按前缀拆开就是两块内容，不需要改库结构。任一段缺失只渲染另一段。
 */
export function splitBeauty(beauty: string | undefined): { moment: string; create: string } {
  const raw = (beauty || '').trim();
  if (!raw) return { moment: '', create: '' };

  const momentMatch = raw.match(/「时刻」([\s\S]*?)(?=「想创造或守护」|$)/);
  const createMatch = raw.match(/「想创造或守护」([\s\S]*)$/);
  const moment = momentMatch ? momentMatch[1].trim() : '';
  const create = createMatch ? createMatch[1].trim() : '';

  // 两个前缀都没有：整段当作「时刻」，别把内容丢掉
  if (!moment && !create) return { moment: raw, create: '' };
  return { moment, create };
}

const DAY = 86_400_000;

/**
 * 把节点卡变成星。
 *
 * 顺序很重要：`nodes` 必须按 created_at 稳定排序后传进来，
 * 因为位置里用了序号做 Halton 铺开。新成员只在末尾追加，
 * 已有的星就不会移动。
 */
export function toSkyStars(nodes: NodeCard[], now: number = Date.now()): SkyStar[] {
  return nodes.map((node, i) => {
    const id = node.id || `anon-${i}`;
    const { moment, create } = splitBeauty(node.beauty);
    const updated = node.updated_at ? Date.parse(node.updated_at) : NaN;
    const created = node.created_at ? Date.parse(node.created_at) : NaN;

    return {
      id,
      name: (node.name || '').trim(),
      city: (node.city || '').trim(),
      doing: (node.doing || '').trim(),
      topics: (node.topics || []).filter(Boolean).slice(0, 4),
      keywords: (node.keywords || []).filter(Boolean).slice(0, 7),
      offer: (node.offer || '').trim(),
      seeking: (node.seeking || '').trim(),
      moment,
      create,
      seed: (node.seed || '').trim(),
      // Halton 铺开 + id 抖动：既均匀又自然，且刷新不变
      x: 6 + halton(i, 2) * 86 + (skyHash(id, 3) - 0.5) * 7,
      y: Math.min(0.98, Math.max(0.02, halton(i, 3) * 0.92 + (skyHash(id, 5) - 0.5) * 0.07)),
      recent: Number.isFinite(updated) ? now - updated <= 30 * DAY : false,
      age: Number.isFinite(created) ? Math.floor((now - created) / DAY) : 9999,
    };
  });
}

/**
 * 「正在形成的星座」：按共同议题分组。
 *
 * 只回 ≤2 组——三组以上会让大半的星同时亮起，
 * 「其他星退暗但不消失」那层意思就读不出来了。
 * 连线的几何（最小生成树 + 距离上限 + 空间聚类）在客户端做，
 * 因为它依赖视口尺寸。
 */
export function buildConstellations(stars: SkyStar[]): { label: string; ids: string[] }[] {
  const byTopic = new Map<string, string[]>();
  for (const s of stars) {
    for (const t of s.topics) {
      const key = t.trim();
      if (!key) continue;
      const list = byTopic.get(key) || [];
      list.push(s.id);
      byTopic.set(key, list);
    }
  }
  return [...byTopic.entries()]
    .filter(([, ids]) => ids.length >= 3)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 2)
    .map(([label, ids]) => ({ label, ids }));
}

/**
 * 「今夜与你靠近」的排序分。
 *
 * 替换了原设计里那套——它权重最高的两条（creatingNow 与 lookingFor 互补 +4、
 * 双方 openToConnect +2）建立在产品里不存在的字段上。
 * 这一版只用真实字段，分数**只用于排序，不向用户展示**。
 */
export function scoreAffinity(me: SkyStar | null, other: SkyStar): number {
  if (!me || me.id === other.id) return -1;
  let score = 0;

  const shared = other.topics.filter(t => me.topics.includes(t));
  score += Math.min(shared.length * 3, 9);

  // offer 与 seeking 互补：一方能给的，正是另一方在找的
  const words = (s: string) => s.toLowerCase().replace(/[\s，。、；：,.;:]/g, '');
  if (me.seeking && other.offer && words(me.seeking).length > 3) {
    const hit = other.topics.some(t => me.seeking.includes(t.split(' / ')[0]));
    if (hit) score += 4;
  }

  if (me.city && other.city && me.city === other.city) score += 1;
  if (other.recent) score += 1;

  const kw = other.keywords.filter(k => me.keywords.includes(k));
  score += Math.min(kw.length, 3);

  return score;
}

/** 今夜与你靠近的 3~6 颗。没有「我」时按共同议题最多的挑，保证首次访问也有内容。 */
export function pickNearby(stars: SkyStar[], me: SkyStar | null, count = 4): string[] {
  const pool = stars.filter(s => s.id !== me?.id);
  if (me) {
    return pool
      .map(s => ({ s, score: scoreAffinity(me, s) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, count)
      .map(x => x.s.id);
  }
  // 未登录：挑议题重叠度最高的一簇，而不是随机
  const topicCount = new Map<string, number>();
  pool.forEach(s => s.topics.forEach(t => topicCount.set(t, (topicCount.get(t) || 0) + 1)));
  const hottest = [...topicCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return pool
    .filter(s => (hottest ? s.topics.includes(hottest) : true))
    .slice(0, count)
    .map(s => s.id);
}

/** 新升起的星：近 25 天加入的。一个都没有时退回最近 3 位，保证这个镜头不空。 */
export function pickRising(stars: SkyStar[], days = 25, min = 3): string[] {
  const fresh = stars.filter(s => s.age <= days).map(s => s.id);
  if (fresh.length >= 1) return fresh;
  return [...stars].sort((a, b) => a.age - b.age).slice(0, min).map(s => s.id);
}
