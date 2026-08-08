import type { NodeCard } from './supabase';
import type { Locale } from './locale';
import { createChatCompletion, getLLMConfig } from './llm';

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
 * AI 匹配：先用规则筛 top K 候选，再交给大模型重排并补充
 * 「为何匹配 / 可能共创什么」的自然语言描述。
 *
 * 没配置大模型 API 时静默退化为规则匹配。
 */
/**
 * 英文界面的人来了怎么办。
 *
 * 上面那套撮合要求是用中文写的，也只该用中文写——照抄成英文再喂给模型，
 * 那些拿捏分寸的话（「不夸张、不奉承」）会先垮一层。所以底层一个字不动，
 * 只在 system 最末尾追加一条：换输出语言，别的照旧。
 * 必须放在最后——前面写着「中文输出」，靠位置压过去比回头改那句安全。
 *
 * matchType 不在此列：那三个值（同频/互补/同城）是数据里的固定取值，
 * 前端按语言查表显示，模型仍然只能回这三个中文词。
 */
const ENGLISH_OUTPUT_RULE = `
【输出语言】这位用户在用英文界面：reasons、summary、coCreate 三个字段
请全部用英文写，其余要求照旧。matchType 仍然只能是「同频」「互补」「同城」
三者之一（那是系统的固定取值，不要翻译，也不要换写法）。
字数改按英文计：reasons 每条 4-10 个词，summary 一句 15-30 个词，
coCreate 一句 15-40 个词。不要中英夹杂。`;

export async function matchNodesAI(
  me: NodeCard,
  others: NodeCard[],
  topN = 3,
  /** 英文界面的人拿到的理由和共创方向要是英文的 */
  locale: Locale = 'zh',
): Promise<MatchedNode[]> {
  if (!getLLMConfig()) return matchNodes(me, others, topN);

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
    const ai = await callLLMMatch(me, candidates, topN, locale);
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

async function callLLMMatch(
  me: NodeCard,
  candidates: (NodeCard & { reasons: string[] })[],
  topN: number,
  locale: Locale,
): Promise<AIMatchItem[] | null> {
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
风格：温暖、具体、克制；不夸张、不奉承；不要解释你是 AI；中文输出。${
    locale === 'en' ? ENGLISH_OUTPUT_RULE : ''
  }`;

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

  const content = await createChatCompletion({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.3,
    responseFormat: { type: 'json_object' },
    timeoutMs: 45000,
  });
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
