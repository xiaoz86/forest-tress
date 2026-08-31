import { createClient } from '@supabase/supabase-js';
import { createChatCompletion, getLLMConfig } from '@/lib/llm';
import type { SkyStar } from '@/lib/sky';
import { isInSky, isListed } from '@/lib/nodeVisibility';
import type { NodeCard } from '@/lib/supabase';

/**
 * 「正在形成的星座」的聚类。
 *
 * 为什么不能在页面里现算：
 *   一、大模型调用有延迟和成本，星空页每次打开都算一次不现实；
 *   二、规格要求「刷新不跳动」，而模型每次输出不完全一致。
 * 所以结果**存下来**，页面只读缓存。重算由脚本触发（见
 * scripts/generate-sky-constellations.mjs），或成员数变化时手动跑一次。
 *
 * 拿不到缓存、没配大模型、或缓存里的人已经不在森林里了——
 * 一律静默退回按关键词做的规则聚类，星空不会因此空掉。
 */

export const SKY_CONSTELLATION_ID = 'sky-constellations';
const TABLE = 'sky_constellations';

export type Constellation = {
  /** 稳定 id，用于连线动画的分组 */
  id: string;
  /** 星座名。2~6 字，模型生成或规则退回时用关键词本身 */
  name: string;
  /** 一句话：什么在把这些人拉近。没有就不显示，绝不编 */
  note: string;
  memberIds: string[];
};

type CachedPayload = {
  generatedAt: string;
  /** 生成时森林里有多少人。人数变化明显时提示该重算了 */
  memberCount: number;
  constellations: Constellation[];
  /**
   * 生成这批星座时，喂给模型的全部人的 id 与名字。**只在服务端用，不下发。**
   *
   * 存名字是为了能**删掉**它：note 是模型写的自由文本，里面会点名，而它点到的
   * 人不一定在 memberIds 里——生成时 memberIds 会被过滤掉模型编造的 id，
   * note 不会。所以「这一组少了人」检测不到那种情况。
   * 有了名册，就能精确判断某句 note 是否提到了现在已经不在星空里的人。
   *
   * 老缓存没有这个字段，退回只按人数缩水判断。
   */
  roster?: { id: string; name: string }[];
};

/** 把关键词收敛成可比较的形态：去分隔符、去空白、转小写 */
function normalizeKeyword(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\s/、,，·|]+/g, '')
    .trim();
}

/**
 * 规则聚类（退路，不用大模型）。
 *
 * keywords 是自由文本，「正念冥想导师」和「正念 / 冥想」语义相同、字符串不同，
 * 精确匹配聚不起来。这里做一层子串归并：把归一化后互相包含的词当成同一个。
 * 比精确匹配好，但仍然做不到语义——那是 AI 那条路的活。
 */
export function buildFallbackConstellations(stars: SkyStar[]): Constellation[] {
  const buckets = new Map<string, { label: string; ids: Set<string> }>();

  for (const s of stars) {
    const pool = s.keywords.length ? s.keywords : s.topics;
    for (const raw of pool) {
      const key = normalizeKeyword(raw);
      if (key.length < 2) continue;

      // 找一个已存在的、和它互为子串的桶
      let hit: string | undefined;
      for (const existing of buckets.keys()) {
        if (existing.includes(key) || key.includes(existing)) {
          hit = existing;
          break;
        }
      }
      if (hit) {
        buckets.get(hit)!.ids.add(s.id);
      } else {
        buckets.set(key, { label: raw.trim(), ids: new Set([s.id]) });
      }
    }
  }

  return [...buckets.entries()]
    .map(([key, v]) => ({ id: `kw-${key}`, name: v.label, note: '', memberIds: [...v.ids] }))
    .filter(c => c.memberIds.length >= 3)
    .sort((a, b) => b.memberIds.length - a.memberIds.length)
    .slice(0, 3);
}

const AI_SYSTEM = `你在为一个叫「附近森林」的创造者社区，从成员资料里看出**正在形成的星座**。

星座回答的不是「这些人是谁」，而是：
**「他们凑在一起，可以做出什么？」**

所以每一个星座都必须指向**一件可以一起做出来的具体的事**。

先理解三种不合格的名字：
- 「正念冥想」「AI 应用」——这是**类目**，把同标签的人圈起来等于什么都没说；
- 「跨界转身做陪伴者」「带着过往职业做教练」——这是**描述处境**，
  说的是他们各自是谁，不是他们能一起做什么；
- 「教练成长小组」「AI 联盟」——这是**组织名**，星座不是社团。

## 命名公式：名词 + 动作

名词 = 那个要被做出来的东西（一门课、一场工作坊、一档播客、一个空间、一套工具…）
动作 = 共创 / 共做 / 共建 / 联办 / 合录 / 落地 / 带进 / 摆渡…

4~12 个字，读完就知道「哦，这几个人可以一起搞这个」。

正例：
  「AI 工具带进线下空间」
  「正念课程共建」
  「身心整合工作坊联办」
  「转型故事合录成播客」

## 怎么挑人：互补优先

优先级：**互补 > 同频 > 共同话题**

- **互补**：A 的「可以提供」正好是 B 的「在寻找」——一方有场地、一方有工具、
  一方有渠道，这种组合最值得被看见；
- **同频**：在同一件事上有相近的判断和做法，能接得住彼此；
- 纯话题相似（都写了「正念」）**不足以成为一个星座**，除非他们的能力明显能拼起来。

## 规则

1. 给出 3~6 个星座，每个 **3~5 人**。超过 5 人几乎一定是类目。
2. 一个人可以属于多个星座——人本来就不只有一面。
3. name 按上面的公式，指向可以一起做出来的那件事。
   不要用「顶级」「核心」「资深」这类分级词。
4. note 一句话 30~50 字，结构是：**谁有什么 + 谁在找什么 → 可以一起做什么**。
   必须引用至少两个人资料里的具体内容，不能只写抽象共同点。
5. 只用给你的资料判断，**不要脑补没写出来的信息**。
6. 不要断言关系——不说「你们很匹配」「天生一对」「一定合得来」。
7. 宁可少给一个星座，也不要把关系不明显的人硬凑成一组。

只返回 JSON，不要任何解释：
{"constellations":[{"name":"…","note":"…","memberIds":["id1","id2","id3"]}]}`;

/**
 * 用大模型聚类。**只在服务端调用**——参数收的是原始节点卡，
 * 里面有 experience 这类不下发给浏览器的字段。
 * 失败一律返回 null，调用方退回规则聚类，星空不该因为模型不可用而空掉一个镜头。
 *
 * ⚠️ 目前**没有任何调用方**。线上真正跑的是
 * scripts/generate-sky-constellations.mjs（那里有自己的一份提示词和过滤）。
 * 这里留着是为了将来可能的服务端重算路径——但别以为它是「第二道闸」：
 * 它没被调用，就什么也没挡住。两份提示词也存在漂移的风险。
 */
export async function generateConstellationsAI(
  raw: NodeCard[],
): Promise<Constellation[] | null> {
  // ⚠️ 纵深防守。调用方**应该**已经传进来筛过的人，但这一步会把
  // 「优势与独特性 / 可以提供 / 在寻找」原文发给第三方模型，
  // 并把结论连人名一起公开——漏一个人的代价是他明确拒绝过的那件事照做了。
  // 所以这里不信任入参，自己再筛一遍。
  const nodes = raw.filter(n => isListed(n) && isInSky(n));
  if (!getLLMConfig() || nodes.length < 6) return null;

  // 和脚本喂一样的材料。只给 keywords 的话，模型只能聚出类目——
  // keywords 本身已经是「把一个人压缩成 6 个话题词」的结果。
  const clip = (v: string, n: number) => v.replace(/\s+/g, ' ').trim().slice(0, n);
  const roster = nodes.map(n => ({
    id: n.id || '',
    name: n.name || '',
    city: n.city || '',
    doing: clip(n.doing || '', 60),
    优势与独特性: clip(n.experience || '', 150),
    可以提供: clip(n.offer || '', 150),
    在寻找: clip(n.seeking || '', 120),
    keywords: (n.keywords?.length ? n.keywords : n.topics) || [],
  }));

  try {
    const raw = await createChatCompletion({
      messages: [
        { role: 'system', content: AI_SYSTEM },
        { role: 'user', content: JSON.stringify(roster) },
      ],
      temperature: 0.4,
      responseFormat: { type: 'json_object' },
      timeoutMs: 40_000,
    });
    if (!raw) return null;

    const parsed = JSON.parse(raw) as {
      constellations?: { name?: unknown; note?: unknown; memberIds?: unknown }[];
    };
    const valid = new Set(nodes.map(n => n.id).filter(Boolean));

    const out = (parsed.constellations || [])
      .map((c, i) => ({
        id: `ai-${i}`,
        name: typeof c.name === 'string' ? c.name.trim() : '',
        note: typeof c.note === 'string' ? c.note.trim() : '',
        // 模型可能编 id，只保留真实存在的
        memberIds: Array.isArray(c.memberIds)
          ? [...new Set(c.memberIds.filter((x): x is string => typeof x === 'string' && valid.has(x)))]
          : [],
      }))
      // 超过 6 人几乎一定是类目，模型没听话就丢掉
      .filter(c => c.name && c.memberIds.length >= 3 && c.memberIds.length <= 6);

    return out.length ? out : null;
  } catch {
    return null;
  }
}

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/** 读缓存。表不存在、没有行、或解析失败，都静默返回 null。 */
export async function fetchCachedConstellations(): Promise<CachedPayload | null> {
  const sb = client();
  if (!sb) return null;
  const { data, error } = await sb
    .from(TABLE)
    .select('payload')
    .eq('id', SKY_CONSTELLATION_ID)
    .maybeSingle();
  if (error || !data?.payload) return null;

  const p = data.payload as CachedPayload;
  if (!Array.isArray(p?.constellations)) return null;
  return p;
}

export async function saveConstellations(
  constellations: Constellation[],
  memberCount: number,
  roster?: { id: string; name: string }[],
): Promise<boolean> {
  const sb = client();
  if (!sb) return false;
  const payload: CachedPayload = {
    generatedAt: new Date().toISOString(),
    memberCount,
    constellations,
    roster,
  };
  const { error } = await sb
    .from(TABLE)
    .upsert({ id: SKY_CONSTELLATION_ID, payload }, { onConflict: 'id' });
  if (error) {
    console.error('[sky] constellation cache save failed', error.message);
    return false;
  }
  return true;
}

/**
 * 把缓存里的星座对齐到「现在还在星空里的人」。
 *
 * 抽成纯函数是因为它有一条**不显然但要紧**的规则，值得单独有个名字、单独被测：
 *
 * 只把 memberIds 筛掉是不够的。note 是模型写的一句话，里面**会点名**
 * （「A 有场地、B 正在找场地 → 可以一起做 X」）。有人关掉「进入星空」、
 * 转成 hidden 或 archived 之后，他的 id 从 memberIds 里消失了，
 * 但那句话仍然挂在页面上说着他的事——而那正是他关掉开关想避免的。
 *
 * 所以只要这一组少了人，就把 note 一并清空：这句话描述的已经不是现在这组人了，
 * 留着既不准确也不该留。星座名是抽象的（「正念课程共建」），不点名，可以保留。
 *
 * @param valid 当前还在星空里的成员 id
 */
export function refilterConstellations(
  cached: Constellation[],
  valid: Set<string>,
  roster?: { id: string; name: string }[],
): Constellation[] {
  /**
   * 现在已经不在星空里的人的名字。note 里出现其中任何一个，这句话就得清掉。
   *
   * 为什么不能只看「这一组少了人」：note 点到的名字**不一定在 memberIds 里**。
   * 生成时 memberIds 会被 `byId.has(x)` 滤掉模型编造的 id，note 是自由文本、
   * 不过滤。于是完全可能出现「note 写着张三，memberIds 里没有张三」——
   * 那时这一组人数没变，shrank 是 false，而「张三」三个字会继续挂在页面上。
   * 那正是这个开关要防的事。
   */
  const goneNames = (roster || [])
    .filter(r => !valid.has(r.id))
    .map(r => r.name.trim())
    // 一两个字的名字做子串匹配会误伤（「小」「李」几乎必然出现在任何句子里）。
    // 宁可漏判一个极短的名字，也不要把所有 note 全清空。
    .filter(n => n.length >= 2);

  return cached
    .map(c => {
      const kept = c.memberIds.filter(id => valid.has(id));
      const shrank = kept.length !== c.memberIds.length;
      const names = goneNames.some(n => c.note.includes(n));
      // 显式挑字段，不用 {...c}：缓存是一行 JSON，将来谁往里塞了调试用的
      // members:[{id,name}]，展开就会原封不动下发到浏览器。
      return {
        id: c.id,
        name: c.name,
        note: shrank || names ? '' : c.note,
        memberIds: kept,
      };
    })
    .filter(c => c.memberIds.length >= 3)
    // 3~5 人的组比原来的 11 人组小得多，显示三个仍留得住「其余退暗」那层意思
    .slice(0, 3);
}

/**
 * 页面用的入口。永远返回可渲染的结果，永远不抛。
 *
 * 缓存里的成员会随时间失效（有人 hidden、archived、或改了资料），
 * 所以每次读出来都按当前的星重新过滤一遍；过滤后不足 3 人的星座直接丢掉。
 * 全部失效时退回规则聚类，而不是显示一个空镜头。
 */
export async function resolveConstellations(stars: SkyStar[]): Promise<Constellation[]> {
  const cached = await fetchCachedConstellations();
  const valid = new Set(stars.map(s => s.id));

  if (cached) {
    const usable = refilterConstellations(cached.constellations, valid, cached.roster);
    if (usable.length) return usable;
  }
  return buildFallbackConstellations(stars);
}
