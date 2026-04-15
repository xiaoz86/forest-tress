import type { NodeCard } from './supabase';

export type MatchedNode = NodeCard & {
  score: number;
  reasons: string[];
  matchType: '同频' | '互补' | '同城';
};

/** 中文友好的简单分词：按空格、标点切分，过滤 ≥2 字 */
function tokenize(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .split(/[\s，,、。.；;：:!?！？()（）【】\[\]\-—·]+/)
    .map(w => w.trim())
    .filter(w => w.length >= 2);
}

/** 判断两个词是否有重叠关系（子串 / 相等） */
function wordsOverlap(a: string[], b: string[]): string[] {
  const hits: string[] = [];
  for (const x of a) {
    for (const y of b) {
      if (x === y || x.includes(y) || y.includes(x)) {
        if (!hits.includes(x)) hits.push(x);
        break;
      }
    }
  }
  return hits;
}

export function scoreMatch(
  me: NodeCard,
  other: NodeCard,
): { score: number; reasons: string[]; matchType: MatchedNode['matchType'] } {
  let score = 0;
  const reasons: string[] = [];

  // 1. 共同 topics（同频）
  const myTopics = me.topics || [];
  const otherTopics = other.topics || [];
  const sharedTopics = myTopics.filter(t => otherTopics.includes(t));
  if (sharedTopics.length > 0) {
    score += sharedTopics.length * 3;
    reasons.push(`共同关注：${sharedTopics.join('、')}`);
  }

  // 2. 同城
  const sameCity = me.city && other.city && me.city.trim() === other.city.trim();
  if (sameCity) {
    score += 2;
    reasons.push(`同在 ${me.city}`);
  }

  // 3. 互补 A：TA 的擅长 / 经验 ↔ 我在寻找 / 在做
  const otherOfferWords = [
    ...tokenize(other.offer),
    ...tokenize(other.experience),
  ];
  const mySeekingWords = [
    ...tokenize(me.seeking),
    ...tokenize(me.doing),
  ];
  const aToB = wordsOverlap(otherOfferWords, mySeekingWords);
  if (aToB.length > 0) {
    score += aToB.length;
    reasons.push(`TA 可以支持你：${aToB.slice(0, 3).join('、')}`);
  }

  // 4. 互补 B：我的擅长 / 经验 ↔ TA 在寻找 / 在做
  const myOfferWords = [
    ...tokenize(me.offer),
    ...tokenize(me.experience),
  ];
  const otherSeekingWords = [
    ...tokenize(other.seeking),
    ...tokenize(other.doing),
  ];
  const bToA = wordsOverlap(myOfferWords, otherSeekingWords);
  if (bToA.length > 0) {
    score += bToA.length;
    reasons.push(`你也许能帮到 TA：${bToA.slice(0, 3).join('、')}`);
  }

  // 判定主要 matchType
  let matchType: MatchedNode['matchType'] = '同频';
  if (sharedTopics.length > 0) matchType = '同频';
  else if (aToB.length > 0 || bToA.length > 0) matchType = '互补';
  else if (sameCity) matchType = '同城';

  return { score, reasons, matchType };
}

export function matchNodes(
  me: NodeCard,
  others: NodeCard[],
  topN = 3,
): MatchedNode[] {
  return others
    .filter(n => n.id !== me.id)
    .map(n => {
      const { score, reasons, matchType } = scoreMatch(me, n);
      return { ...n, score, reasons, matchType };
    })
    .filter(n => n.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

/**
 * AI 匹配占位点 — 后续接入 Claude API 时改这里
 * 目前退化为规则匹配，调用方式与 matchNodes 一致
 */
export async function matchNodesAI(
  me: NodeCard,
  others: NodeCard[],
  topN = 3,
): Promise<MatchedNode[]> {
  return matchNodes(me, others, topN);
}
