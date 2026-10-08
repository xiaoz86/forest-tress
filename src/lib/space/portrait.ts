import 'server-only';
import { splitBeauty } from '@/lib/beauty';
import { createChatCompletion, getLLMConfig } from '@/lib/llm';
import type { NodeCard } from '@/lib/supabase';
import { FIELD_LABEL, HUMAN_FIELDS, type SourceField } from './fields';
import { DIMENSIONS, type DimensionKey, type StyleVector } from './themes';

/**
 * 从一个人的注册资料形成画像，并顺带为个人空间起稿（一句话、身份标签、价值、服务拆分）。
 *
 * 纪律只有一条：**每一条推断都要附本人写过的原话，原话由程序逐字核对。**
 * 核对不上的就丢掉，并如实记下丢了几条——「为什么觉得这像你」要站得住，
 * 靠的是它能指回那个人自己写的某一句，而不是模型写得多好听。
 */

export type Quote = { text: string; field: SourceField };
export type { SourceField };

export type Portrait = {
  essence: string;
  traits: { name: string; why: string; quote: Quote }[];
  uniqueness: { text: string; quote: Quote } | null;
  /**
   * 每一维都要两头找证据：quote 是支持当前方向的原话，counter 是另一端的原话。
   * 两端都有原话时，倾向最多 ±1——一个人本来就可以既安静又爱跳舞。
   */
  aesthetic: Record<DimensionKey, { value: number; quote: Quote | null; counter: Quote | null }>;
  feelings: string[];
};

export type WorkKind = 'work' | 'service' | 'activity' | 'content';

export type SpaceDraft = {
  tagline: string;
  keywords: string[];
  roles: string[];
  values: { text: string; quote: Quote }[];
  services: { title: string; desc: string; format: string }[];
  worksSplit: Record<string, WorkKind>;
};

export type PortraitResult = {
  portrait: Portrait;
  draft: SpaceDraft;
  /** 核对不上原话、被丢掉的推断条数 */
  dropped: number;
  humanCount: number;
  sparse: boolean;
  model: string;
  generatedAt: string;
};

export function sourceTexts(node: NodeCard): Record<SourceField, string> {
  const { moment, create } = splitBeauty(node.beauty);
  const works = (node.works || [])
    .map(w => [w.title, w.desc].filter(Boolean).join('：'))
    .join('\n');
  return {
    doing: (node.doing || '').trim(),
    topics: (node.topics || []).join('、'),
    keywords: (node.keywords || []).join('、'),
    experience: (node.experience || '').trim(),
    offer: (node.offer || '').trim(),
    seeking: (node.seeking || '').trim(),
    product: (node.product || '').trim(),
    interests: (node.interests || '').trim(),
    moment,
    create,
    seed: (node.seed || '').trim(),
    works,
  };
}

export function humanCount(node: NodeCard): number {
  const t = sourceTexts(node);
  return HUMAN_FIELDS.filter(f => t[f].length > 0).length;
}

/** 本人写下的文字（不含勾选的议题和 AI 关键词）：人味四项之外的部分 */
const OTHER_FIELDS: SourceField[] = ['doing', 'experience', 'offer', 'product', 'seeking', 'works'];

/** 人味四项的字更能看出一个人，按 1.5 倍算 */
const HUMAN_WEIGHT = 1.5;
/** 加权后满这么多字，就够形成画像（按 2026-09-27 的 17 位在册成员：12 人够，5 人不够） */
const ENOUGH_SCORE = 100;

export type Richness = {
  humanCount: number;
  humanChars: number;
  otherChars: number;
  score: number;
  /** 资料够不够形成画像；不够的先看图选风格 */
  enough: boolean;
};

/**
 * 资料够不够，看「人味四项 + 其他资料」的总量，而不是只数人味四项填了几项——
 * 有人人味四项只填了一项，但「正在做」「可以提供」写了上千字，一样读得出这个人。
 */
export function richness(node: NodeCard): Richness {
  const t = sourceTexts(node);
  const len = (f: SourceField) => t[f].replace(/\s+/g, '').length;
  const humanChars = HUMAN_FIELDS.reduce((n, f) => n + len(f), 0);
  const otherChars = OTHER_FIELDS.reduce((n, f) => n + len(f), 0);
  const score = Math.round(humanChars * HUMAN_WEIGHT + otherChars);
  return { humanCount: humanCount(node), humanChars, otherChars, score, enough: score >= ENOUGH_SCORE };
}

/**
 * 可以被引用成「原话」的字段，按优先级排（反查时先落在本人写的字段上）。
 * 星轨关键词不在里面：它是 AI 生成的，不是本人写的话。
 */
const QUOTABLE: SourceField[] = ['doing', 'interests', 'moment', 'create', 'seed', 'experience', 'offer', 'seeking', 'product', 'topics', 'works'];

/**
 * 核对用的「段」：按行切开，作品按单件的标题、描述分开。
 * 不能用拼接后的整串去核对——那样上一行的结尾接下一行的开头，
 * 会拼出一句本人从没连着写过的「原话」。
 */
function segments(node: NodeCard): Record<SourceField, string[]> {
  const t = sourceTexts(node);
  const out = {} as Record<SourceField, string[]>;
  for (const f of Object.keys(t) as SourceField[]) {
    out[f] = f === 'works'
      ? (node.works || []).flatMap(w => [w.title, w.desc].filter((s): s is string => !!s))
      : t[f].split(/\n+/).map(s => s.trim()).filter(Boolean);
  }
  return out;
}

/** 行内空白和引号不计；换行不在这里处理，段本身已经按行切开 */
const SKIP = /[ \t　「」『』“”"'‘’]/;
function normMap(s: string): { n: string; map: number[] } {
  let n = '';
  const map: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (SKIP.test(s[i])) continue;
    n += s[i];
    map.push(i);
  }
  return { n, map };
}

/** 在一段里找原话，找到就返回**资料里的原文片段**（展示用），而不是模型转述的写法 */
function locate(quote: string, seg: string): string | null {
  const q = normMap(quote).n;
  const { n, map } = normMap(seg);
  const i = n.indexOf(q);
  return i < 0 ? null : seg.slice(map[i], map[i + q.length - 1] + 1);
}

function verifyQuote(q: unknown, segs: Record<SourceField, string[]>): Quote | null {
  if (!q) return null;
  // 模型有时直接给字符串而不是 {text, field}：照样核对，字段靠反查
  const text = String(typeof q === 'string' ? q : ((q as { text?: unknown }).text ?? '')).trim();
  const len = normMap(text).n.length;
  if (len < 6 || len > 40) return null;
  const claimed = typeof q === 'object' ? String((q as { field?: unknown }).field ?? '') : '';
  // 字段名只认白名单：模型给出 constructor、__proto__ 之类也不会碰到原型链
  const order = QUOTABLE.includes(claimed as SourceField)
    ? [claimed as SourceField, ...QUOTABLE.filter(f => f !== claimed)]
    : QUOTABLE;
  for (const f of order) {
    for (const seg of segs[f]) {
      const hit = locate(text, seg);
      if (hit) return { text: hit, field: f };
    }
  }
  return null;
}

/**
 * 这句原话现在还在不在本人的资料里。
 * 起稿是生成那一刻的快照：本人之后删掉的句子（也许正是觉得太私人），不能继续以「我写过」公开出现。
 */
export function stillQuoted(node: NodeCard, text: string): boolean {
  return !!verifyQuote(text, segments(node));
}

const FEELINGS = ['温暖', '有生命力', '自然', '松弛', '有趣', '活力', '安静', '专业', '人文', '创意', '艺术感', '清晰', '冒险', '丰富', '简洁', '高级感'];

function buildMessages(node: NodeCard) {
  const t = sourceTexts(node);
  const fields = QUOTABLE
    .filter(f => f !== 'works' && t[f])
    .map(f => `【${f}｜${FIELD_LABEL[f]}】\n${t[f]}`)
    .join('\n\n');
  const works = (node.works || []).map(w => `- id=${w.id}｜${w.title}${w.desc ? `：${w.desc}` : ''}`).join('\n');
  const keywords = t.keywords ? `\n\n【背景，不可引用】AI 生成的星轨关键词：${t.keywords}` : '';

  const system = `你是「附近森林」的风格顾问，要读懂一位创造者，为他的个人网站形成画像、并起一版草稿。

## 铁律
1. 只根据下面给出的资料。不编造经历、身份、数字、价格、城市，也不编造服务形式（资料里没写「线上」就不能说线上）。
2. 每一条推断都要附一句**原话**（quote.text）：必须从资料的**同一行**里**逐字**摘出，6–30 个字，一字不改；并写明它来自哪个字段（quote.field，用资料标题里的英文键，如 doing、moment、works）。摘不出原话的推断就不要写。「背景，不可引用」的内容不能当原话。
3. 画像要写出这个人**和别人不一样的地方**，避免「热爱生活、积极向上」这类放在谁身上都成立的话。
4. 语气平实、具体、温和。不吹捧，不下诊断，不替他概括人生轨迹（比如「从 A 走向 B」），除非他自己这么写。
5. **特质**写他做事的方式、在意的东西、气质，不要复述职业头衔或服务名。资料里有兴趣、美的时刻、想守护的东西时，至少一条特质来自这些生活面。
6. **只有他会这样写的地方**：抓一个具体的、少见的表达或意象（一个比喻、一个自创的词、一个画面），并如实说它是什么，不要引申。

## 审美四维怎么判（最容易出错，务必照做）
这四维判断的是**他希望自己被怎样呈现、他的生活节奏和气质**，不是某件作品写得长不长。
每一维都**两头找证据**：low 是支持低端的原话，high 是支持高端的原话，找不到就给 null。
原话本身要在**表达那一端的感受或状态**（如「平静」「纯粹」「丰富多元」）；只是一个活动名、服务名、课程名（如「正念练习陪伴」）不算证据。
- warmth（-2 清冷 … +2 温暖）：温暖 = 爱、慈悲、陪伴、温度、关系、家；清冷 = 冷静、克制、疏离、清爽、独立。**专业、技术、认证不算清冷**——专业感应该交给内容，不该决定色温。
- energy（-2 安静 … +2 明亮有活力）：安静 = 静修、止语、放下、平静、慢、独处、安顿、纯粹；活力 = 探索、冒险、跨界、即兴、舞蹈、跑步、尝试新事物。看**整份资料的基调**：一两个爱好词不足以抵消通篇的安静，反之亦然。
- texture（-2 利落现代 … +2 人文手作）：利落 = 效率、方法论、结构化、极简工具感；人文 = 自然、身体、手作、诗意、故事、生命、美。
- density（-2 疏朗留白 … +2 丰盈饱满）：疏朗 = 专注一两件事、少而深、简单、纯粹、留白；丰盈 = 同时做很多事、多重身份、多元、丰富。**课程大纲、服务清单写得长，不算丰盈的证据。**
value 的符号必须跟着证据更强的那一端；两端都有证据时 |value| ≤ 1；两端都没有给 0。**不要默认给正数**，四个维度彼此独立。

## 起稿
- tagline、roles、values **不能取材于 seed（心里的种子）**：种子有单独的一层，将来有自己的可见性设置。
- values 之间、values 与 tagline 之间不要重复同一句话，每条说一件不同的事。
- services 只从 offer（可以提供）和 product 里拆，**按 offer 里的原顺序全部列出**（本人一般把最核心的写在前面），意思相近的几项可以合成一张卡，最多 10 张；只有和作品清单里某一项说的是同一件服务时才跳过。不要只挑几项：没进服务单的服务，访客就找不到入口。
- services 的 desc 只写这项服务本身（对象、做什么），用资料里有的信息；不要把 tagline 或价值观的话塞进每一条描述。
- worksSplit：work = 作品或长期项目（社区、产品、书、网站）；service = 可以预约或报名的课程、训练、一对一服务；
  activity = 有时间地点的一次性活动（静修营、工作坊、聚会）；content = 外部内容渠道（公众号、播客、视频号、小红书）。

## 输出（只输出一个 JSON 对象）
{
  "portrait": {
    "essence": "用一句话说这个人是什么样的人（≤40 字，给本人看）",
    "traits": [ { "name": "4–8 字的特质", "why": "为什么这么说（≤40 字）", "quote": {"text": "原话", "field": "字段键"} } ],   // 3–4 条
    "uniqueness": { "text": "只有他会这样写的地方（≤50 字）", "quote": {"text": "原话", "field": "字段键"} },
    "aesthetic": {
      "warmth":  { "low": {"text": "原话", "field": "字段键"} 或 null, "high": {"text": "原话", "field": "字段键"} 或 null, "value": -2…2 },
      "energy":  { "low": …, "high": …, "value": … },
      "texture": { "low": …, "high": …, "value": … },
      "density": { "low": …, "high": …, "value": … }
    },
    "feelings": ["从下列词里选 3 个：${FEELINGS.join('、')}"]
  },
  "draft": {
    "tagline": "一句话介绍，≤24 字，用他自己的语气，不以「我是」开头",
    "keywords": ["3–5 个关键词，可替代一句话介绍"],
    "roles": ["2–4 个身份标签，每个 ≤10 字，取自资料"],
    "values": [ { "text": "他在意的一件事（≤20 字）", "quote": {"text": "原话", "field": "字段键"} } ],   // 2–3 条
    "services": [ { "title": "≤12 字", "desc": "≤40 字", "format": "线上 | 线下 | 线上线下 | 未说明" } ],   // offer 里有几项就列几项，最多 10 项
    "worksSplit": { "作品 id": "work | service | activity | content" }
  }
}`;

  const user = `## 这位创造者的资料\n称呼：${node.name}${node.city ? `｜城市：${node.city}` : ''}\n\n${fields}\n\n【works｜作品清单】\n${works || '（无）'}${keywords}`;
  return [{ role: 'system' as const, content: system }, { role: 'user' as const, content: user }];
}

/**
 * 模型返回的是任意 JSON，结构不可信。这里放宽成 any 只为了取字段方便，
 * 下面每一个字段都单独校验、截断、核对原话后才会被使用。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

function clampDim(v: unknown): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(-2, Math.min(2, n)) : 0;
}

/** 服务形式必须有资料依据：资料里一次都没出现「线上」，就不能写线上 */
function evidencedFormat(format: string, corpus: string): string {
  const online = format.includes('线上') && corpus.includes('线上');
  const offline = format.includes('线下') && corpus.includes('线下');
  return online && offline ? '线上线下' : online ? '线上' : offline ? '线下' : '未说明';
}

function sanitize(raw: unknown, node: NodeCard): { portrait: Portrait; draft: SpaceDraft; dropped: number } {
  const segs = segments(node);
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, Loose>;
  const p = (r.portrait ?? {}) as Record<string, Loose>;
  const d = (r.draft ?? {}) as Record<string, Loose>;
  let dropped = 0;

  const traits: Portrait['traits'] = [];
  for (const x of Array.isArray(p.traits) ? p.traits.slice(0, 5) : []) {
    const quote = verifyQuote(x?.quote, segs);
    if (!quote) { dropped++; continue; }
    traits.push({ name: str(x.name, 12), why: str(x.why, 60), quote });
  }

  let uniqueness: Portrait['uniqueness'] = null;
  if (p.uniqueness) {
    const quote = verifyQuote(p.uniqueness.quote, segs);
    if (quote) uniqueness = { text: str(p.uniqueness.text, 80), quote };
    else dropped++;
  }

  const aesthetic = {} as Portrait['aesthetic'];
  for (const dim of DIMENSIONS) {
    const a = p.aesthetic?.[dim.key];
    const low = a?.low ? verifyQuote(a.low, segs) : null;
    const high = a?.high ? verifyQuote(a.high, segs) : null;
    const lostLow = !!a?.low && !low;
    const lostHigh = !!a?.high && !high;
    if (lostLow) dropped++;
    if (lostHigh) dropped++;
    const v = clampDim(a?.value);
    // 方向由证据定，不由模型给的数字定：
    //   只有一端有原话 → 朝那一端，至少 ±1；两端都有 → 最多 ±1、按模型给的符号；都没有 → 0
    // 例外：模型本来偏向的那一端恰好没核对上，只剩另一端——这时不能把方向翻过来，退回中性
    let value = 0;
    if (high && !low) value = lostLow && v < 0 ? 0 : Math.max(1, v);
    else if (low && !high) value = lostHigh && v > 0 ? 0 : Math.min(-1, v);
    else if (low && high) value = Math.max(-1, Math.min(1, v));
    // 两端都有、又判成中性时，两句都留着给本人看：「这一维你两边都有」本身就是信息
    const quote = value > 0 ? high : value < 0 ? low : (low && high ? high : null);
    const counter = value > 0 ? low : value < 0 ? high : (low && high ? low : null);
    aesthetic[dim.key] = { value, quote, counter };
  }

  const feelings = (Array.isArray(p.feelings) ? p.feelings : [])
    .map((f: unknown) => String(f).trim())
    .filter((f: string) => FEELINGS.includes(f))
    .slice(0, 3);

  const values: SpaceDraft['values'] = [];
  for (const x of Array.isArray(d.values) ? d.values.slice(0, 4) : []) {
    const quote = verifyQuote(x?.quote, segs);
    // 起稿不取材于种子：种子层将来有自己的可见性，不能被改写后放进认识层绕过去
    if (!quote || quote.field === 'seed') { dropped++; continue; }
    if (values.some(v => v.text === str(x.text, 30))) continue;
    values.push({ text: str(x.text, 30), quote });
  }

  const corpus = QUOTABLE.map(f => segs[f].join('\n')).join('\n');
  const workTitles = (node.works || []).map(w => w.title);
  const services = (Array.isArray(d.services) ? d.services : []).slice(0, 10).map((s: Loose) => ({
    title: str(s?.title, 16),
    desc: str(s?.desc, 60),
    format: evidencedFormat(String(s?.format ?? ''), corpus),
  }))
    // 和作品清单里的条目重名的不要：那些已经作为作品卡片出现，再列一次就重复了
    .filter((s: { title: string }) => s.title && !workTitles.some(w => w.includes(s.title) || s.title.includes(w)));

  const KINDS: WorkKind[] = ['work', 'service', 'activity', 'content'];
  const workIds = new Set((node.works || []).map(w => w.id));
  const worksSplit: Record<string, WorkKind> = {};
  for (const [id, kind] of Object.entries(d.worksSplit ?? {})) {
    if (workIds.has(id) && KINDS.includes(kind as WorkKind)) worksSplit[id] = kind as WorkKind;
  }

  return {
    portrait: { essence: str(p.essence, 60), traits, uniqueness, aesthetic, feelings },
    draft: {
      tagline: str(d.tagline, 30),
      keywords: (Array.isArray(d.keywords) ? d.keywords : []).map((k: unknown) => str(k, 12)).filter(Boolean).slice(0, 5),
      roles: (Array.isArray(d.roles) ? d.roles : []).map((k: unknown) => str(k, 12)).filter(Boolean).slice(0, 4),
      values,
      services,
      worksSplit,
    },
    dropped,
  };
}

export function portraitVector(p: Portrait): StyleVector {
  return {
    warmth: p.aesthetic.warmth.value,
    energy: p.aesthetic.energy.value,
    texture: p.aesthetic.texture.value,
    density: p.aesthetic.density.value,
  };
}

export async function generatePortrait(node: NodeCard): Promise<PortraitResult | { error: string }> {
  const config = getLLMConfig();
  if (!config) return { error: 'llm-not-configured' };
  const messages = buildMessages(node);

  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await createChatCompletion({
      messages,
      temperature: 0.3,
      maxTokens: 3200,
      responseFormat: { type: 'json_object' },
      timeoutMs: 90000,
    });
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      try { parsed = m ? JSON.parse(m[0]) : null; } catch { parsed = null; }
    }
    if (!parsed) continue;
    const { portrait, draft, dropped } = sanitize(parsed, node);
    const r = richness(node);
    return {
      portrait, draft, dropped,
      humanCount: r.humanCount,
      sparse: !r.enough,
      model: `${config.provider}:${config.model}`,
      generatedAt: new Date().toISOString(),
    };
  }
  return { error: 'llm-failed' };
}
