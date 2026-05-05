import type { NodeCard } from './supabase';

export type MatchedNode = NodeCard & {
  score: number;
  reasons: string[];
  matchType: '同频' | '互补' | '同城';
  /** AI 生成的「为何匹配」摘要（可选，规则匹配下为空） */
  aiSummary?: string;
  /** AI 生成的「可能共创什么」摘要（可选，规则匹配下为空） */
  aiCoCreate?: string;
  /** 该匹配是否经由 AI 重排 */
  aiRanked?: boolean;
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
 * AI 匹配：先用规则筛 top K 候选，再交给 Kimi 重排并补充
 * 「为何匹配 / 可能共创什么」的自然语言描述。
 *
 * 没配置 MOONSHOT_API_KEY 时静默退化为规则匹配。
 */
export async function matchNodesAI(
  me: NodeCard,
  others: NodeCard[],
  topN = 3,
): Promise<MatchedNode[]> {
  const apiKey = process.env.MOONSHOT_API_KEY;
  if (!apiKey) return matchNodes(me, others, topN);

  // 先用规则筛出 ≤8 个候选给 AI，避免上下文过长 + 帮 AI 聚焦
  const ruleRanked = others
    .filter(n => n.id !== me.id)
    .map(n => {
      const { score, reasons, matchType } = scoreMatch(me, n);
      return { ...n, score, reasons, matchType };
    })
    .sort((a, b) => b.score - a.score);

  // 若规则一个有分的候选都没有，仍然把所有人当作弱候选给 AI（保留 reasons:[]）
  const candidates: (NodeCard & {
    score: number;
    reasons: string[];
    matchType: MatchedNode['matchType'];
  })[] = (ruleRanked.length
    ? ruleRanked
    : others
        .filter(n => n.id !== me.id)
        .map(n => ({ ...n, score: 0, reasons: [] as string[], matchType: '同频' as const }))
  ).slice(0, 8);

  if (candidates.length === 0) return [];

  try {
    const ai = await callKimiMatch(me, candidates, topN);
    if (!ai || ai.length === 0) {
      return matchNodes(me, others, topN);
    }

    // 把 AI 结果合并回 NodeCard：按 id 找回原始节点信息 + reasons
    const byId = new Map(candidates.map(c => [c.id || '', c] as const));
    const merged: MatchedNode[] = [];
    for (const a of ai) {
      const base = byId.get(a.id);
      if (!base) continue;
      merged.push({
        ...base,
        aiSummary: a.summary,
        aiCoCreate: a.coCreate,
        aiRanked: true,
        // AI 给的 reasons 优先；若没有就保留规则 reasons
        reasons: a.reasons && a.reasons.length ? a.reasons : base.reasons,
        matchType: a.matchType || base.matchType,
        score: base.score + 100, // 标记 AI 选中（仅排序用）
      });
    }
    return merged.length ? merged.slice(0, topN) : matchNodes(me, others, topN);
  } catch (err) {
    console.error('[match] AI match failed, falling back to rules', err);
    return matchNodes(me, others, topN);
  }
}

type AIMatchItem = {
  id: string;
  reasons: string[];
  summary: string;
  coCreate: string;
  matchType?: MatchedNode['matchType'];
};

async function callKimiMatch(
  me: NodeCard,
  candidates: (NodeCard & { reasons: string[] })[],
  topN: number,
): Promise<AIMatchItem[] | null> {
  const baseUrl = (process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1').replace(/\/+$/, '');
  const model = process.env.KIMI_MODEL || 'kimi-k2-thinking-turbo';
  const apiKey = process.env.MOONSHOT_API_KEY!;

  const candidateLines = candidates.map((c, i) => {
    return [
      `候选 ${i + 1} (id=${c.id})`,
      `  姓名: ${c.name}`,
      c.city ? `  城市: ${c.city}` : '',
      c.doing ? `  在做: ${c.doing}` : '',
      c.product ? `  作品: ${c.product}` : '',
      c.experience ? `  擅长/经验: ${c.experience}` : '',
      c.offer ? `  可以提供: ${c.offer}` : '',
      c.seeking ? `  在寻找: ${c.seeking}` : '',
      c.topics?.length ? `  关注议题: ${c.topics.join('、')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }).join('\n\n');

  const meBlock = [
    `姓名: ${me.name}`,
    me.city ? `城市: ${me.city}` : '',
    me.doing ? `在做: ${me.doing}` : '',
    me.product ? `作品: ${me.product}` : '',
    me.experience ? `擅长/经验: ${me.experience}` : '',
    me.offer ? `可以提供: ${me.offer}` : '',
    me.seeking ? `在寻找: ${me.seeking}` : '',
    me.topics?.length ? `关注议题: ${me.topics.join('、')}` : '',
  ].filter(Boolean).join('\n');

  const system = `你是「附近森林」社群的撮合 AI。社群以独立创造者为主，强调真实、流动、共创。
你要从候选成员中，为新加入者挑出最值得连接的 1～${topN} 位，并明确告诉双方：
1) 为何匹配（结合具体细节，不要套话）
2) 可能共创什么（具体到一两个方向、产品形态、活动形式等）
风格：温暖、具体、克制；不夸张、不奉承；不要解释你是 AI；中文输出。`;

  const user = `【新加入者】
${meBlock}

【候选成员】
${candidateLines}

请挑选 1 到 ${topN} 位最值得连接的候选，并以 JSON 返回，结构如下：
{
  "matches": [
    {
      "id": "候选的 id 字段值（务必照抄，不要伪造）",
      "matchType": "同频" 或 "互补" 或 "同城"（任选其一最贴切的），
      "reasons": ["3 条以内的简短理由，每条 8-20 字"],
      "summary": "为何匹配，一句话 30-60 字",
      "coCreate": "可能共创什么，一句话 30-80 字，落到具体方向"
    }
  ]
}
仅返回 JSON，不要任何额外文字。`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[match] Kimi non-200', res.status, text.slice(0, 300));
    return null;
  }

  const json = await res.json();
  const content: string | undefined = json?.choices?.[0]?.message?.content;
  if (!content) return null;

  let parsed: { matches?: AIMatchItem[] };
  try {
    parsed = JSON.parse(content);
  } catch {
    // 兜底：尝试从 content 中抽 JSON 段
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      return null;
    }
  }

  const arr = Array.isArray(parsed?.matches) ? parsed.matches : [];
  return arr
    .filter(x => x && typeof x.id === 'string')
    .map(x => ({
      id: x.id,
      reasons: Array.isArray(x.reasons) ? x.reasons.filter(r => typeof r === 'string') : [],
      summary: typeof x.summary === 'string' ? x.summary : '',
      coCreate: typeof x.coCreate === 'string' ? x.coCreate : '',
      matchType: x.matchType,
    }));
}
