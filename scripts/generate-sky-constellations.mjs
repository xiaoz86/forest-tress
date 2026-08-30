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

先理解什么不算星座：
「正念冥想」「AI 应用」「教练」——这些是**类目**，不是星座。
把所有做正念的人圈在一起，等于什么都没说：他们本来就在同一个标签下。

星座是更具体的东西。它可能是：
- **一段共同的处境**：都在从某个行业转身，都在把练习带进一个不接纳它的场域；
- **一种能互相接住的组合**：A「可以提供」的，正好是 B「在寻找」的；
- **同一件事的不同侧面**：一个做团体引导、一个做一对一、一个在做空间。

优先找**互补**，其次找共同处境，最后才是共同话题。
纯话题相似的组，除非特别紧密，否则宁可不给。

规则：
1. 给出 3~6 个星座，每个 **3~5 人**。超过 5 人几乎一定是类目，请拆开或缩小。
2. 一个人可以属于多个星座——人本来就不只有一面。
3. 星座名 4~10 个字，落在**那件具体的事**上，不是领域名。
   反例：「正念冥想」「AI 探索」「教练成长」（都是类目）
   正例：「把练习带回职场的人」「从大厂转身之后」「一对一之外的可能」
   不要用「小组」「联盟」「圈」这类组织词，不要用「顶级」「核心」这类分级词。
4. note 一句话 25~45 字，必须**引用至少两个人资料里的具体内容**
   （具体的经历、能提供的东西、在找的东西），不能只写抽象的共同点。
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
    `${SUPABASE_URL}/rest/v1/node_cards?select=id,name,city,keywords,topics,doing,experience,offer,seeking,status`,
    { headers },
  );
  const rows = (await res.json()).filter(
    n => (n.status ?? 'listed') === 'listed' && n.name && !/^_*test/i.test(n.name),
  );
  console.log(`森林里 ${rows.length} 人`);

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
