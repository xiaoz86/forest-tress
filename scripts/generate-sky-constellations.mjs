/**
 * 重算「正在形成的星座」。
 *
 *   # 只看结果，不写库
 *   node --env-file=.env.local scripts/generate-sky-constellations.mjs --dry
 *
 *   # 算完写进 sky_constellations
 *   node --env-file=.env.local scripts/generate-sky-constellations.mjs
 *
 * 什么时候该跑：有新成员加入、有人大改了资料、或者你觉得现在的分组不对。
 * 页面本身只读缓存——不会自己重算，所以不跑这个脚本星座就不会变。
 * 这是有意的：规格要求「刷新不跳动」，而模型每次输出不完全一致。
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY = process.argv.includes('--dry');

const ID = 'sky-constellations';

const SYSTEM = `你在为一个叫「附近森林」的创造者社区，从成员资料里看出**正在形成的星座**。

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

function llmConfig() {
  const ds = process.env.DEEPSEEK_API_KEY?.trim();
  if (ds) {
    return {
      key: ds,
      base: (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, ''),
      model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
    };
  }
  const ms = process.env.MOONSHOT_API_KEY?.trim();
  if (ms) {
    return {
      key: ms,
      base: (process.env.KIMI_BASE_URL || 'https://api.moonshot.cn').replace(/\/+$/, ''),
      model: process.env.KIMI_MODEL || 'kimi-k2-turbo-preview',
    };
  }
  return null;
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('缺少 Supabase 配置');
  const cfg = llmConfig();
  if (!cfg) throw new Error('没有配置 DEEPSEEK_API_KEY 或 MOONSHOT_API_KEY');

  const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/node_cards?select=id,name,city,keywords,topics,doing,experience,offer,seeking,status,in_sky`,
    { headers },
  );
  const all = await res.json();
  const rows = all.filter(
    n =>
      (n.status ?? 'listed') === 'listed' &&
      // ⚠️ 关掉「进入星空」的人**一个字都不能喂给模型**。
      // 星座会把模型的结论连人名一起发布，漏在这里 = 他明确拒绝过的那件事照做了。
      // 缺失当 true：迁移前的老行没有这个值。
      (n.in_sky ?? true) !== false &&
      n.name &&
      !/^_*test/i.test(n.name),
  );
  const optedOut = all.filter(n => (n.status ?? 'listed') === 'listed' && n.in_sky === false).length;
  console.log(`森林里 ${rows.length} 人进入星空${optedOut ? `（另有 ${optedOut} 人选择不进入，已排除）` : ''}`);

  // 喂完整资料。原来只给 keywords + 40 字 doing——而 keywords 本身
  // 已经是「把一个人压缩成 6 个话题词」的结果，拿它去聚只能聚出类目。
  // experience 那一栏字面就叫「经验、优势与独特性」，是最该用的材料。
  const clip = (v, n) => (v || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const roster = rows.map(n => ({
    id: n.id,
    name: n.name,
    city: n.city || '',
    doing: clip(n.doing, 60),
    优势与独特性: clip(n.experience, 150),
    可以提供: clip(n.offer, 150),
    在寻找: clip(n.seeking, 120),
    keywords: (n.keywords?.length ? n.keywords : n.topics) || [],
  }));
  const chars = JSON.stringify(roster).length;
  console.log(`喂给模型 ${chars} 字符（原来只有 keywords，约 ${Math.round(chars / 4)} 字符）`);

  console.log(`调用 ${cfg.model} 聚类…`);
  const r = await fetch(`${cfg.base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: JSON.stringify(roster) },
      ],
    }),
  });
  if (!r.ok) throw new Error(`模型返回 ${r.status}: ${(await r.text()).slice(0, 200)}`);

  const body = await r.json();
  const parsed = JSON.parse(body.choices?.[0]?.message?.content || '{}');
  const byId = new Map(rows.map(n => [n.id, n.name]));

  const constellations = (parsed.constellations || [])
    .map((c, i) => ({
      id: `ai-${i}`,
      name: String(c.name || '').trim(),
      note: String(c.note || '').trim(),
      // 模型可能编 id，只留真实存在的
      memberIds: [...new Set((c.memberIds || []).filter(x => byId.has(x)))],
    }))
    // 超过 6 人的几乎一定是类目，模型没听话就丢掉
    .filter(c => c.name && c.memberIds.length >= 3 && c.memberIds.length <= 6);

  if (!constellations.length) throw new Error('模型没给出任何有效星座');

  console.log('');
  for (const c of constellations) {
    console.log(`「${c.name}」${c.memberIds.length} 人`);
    console.log(`  ${c.note}`);
    console.log(`  ${c.memberIds.map(id => byId.get(id)).join('、')}`);
    console.log('');
  }
  console.log(`页面只显示前 3 个：${constellations.slice(0, 3).map(c => c.name).join('、')}`);

  if (DRY) {
    console.log('\n--dry，没有写库');
    return;
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    memberCount: rows.length,
    constellations,
    // 生成时喂给模型的全部人。**服务端专用，不下发**。
    // 存名字是为了将来能删掉它：note 是模型写的自由文本、里面会点名，
    // 而它点到的人不一定在 memberIds 里（memberIds 会滤掉模型编造的 id，
    // note 不会）。有名册才能判断某句 note 是否提到了已经退出星空的人。
    // 见 src/lib/skyConstellations.ts 的 refilterConstellations。
    roster: rows.map(n => ({ id: n.id, name: n.name })),
  };
  const up = await fetch(`${SUPABASE_URL}/rest/v1/sky_constellations`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ id: ID, payload, updated_at: new Date().toISOString() }),
  });
  if (!up.ok) throw new Error(`写库失败 ${up.status}: ${(await up.text()).slice(0, 200)}`);
  console.log('\n✓ 已写入 sky_constellations');
}

main().catch(e => {
  console.error('✗', e.message);
  process.exit(1);
});
