// 回填脚本：为已存在的 node_cards 记录调用 Kimi 生成并写入 keywords。
// 用法：node --env-file=.env.local scripts/backfill-keywords.mjs [--force]
//   --force  即使该行已有 keywords 也重新生成

import { createClient } from '@supabase/supabase-js';

async function generateKeywordsAI(node, count = 7) {
  const apiKey = process.env.MOONSHOT_API_KEY;
  if (!apiKey) throw new Error('MOONSHOT_API_KEY missing');
  const baseUrl = (process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1').replace(/\/+$/, '');
  const model = process.env.KIMI_MODEL || 'kimi-k2-turbo-preview';

  const profile = [
    node.name && `姓名：${node.name}`,
    node.city && `城市：${node.city}`,
    node.doing && `在做：${node.doing}`,
    node.product && `作品/项目：${node.product}`,
    node.experience && `经验/独特性：${node.experience}`,
    node.offer && `可以提供：${node.offer}`,
    node.seeking && `在寻找：${node.seeking}`,
    node.topics?.length ? `已有标签：${node.topics.join('、')}` : '',
  ].filter(Boolean).join('\n');

  const system = `你是社群目录的关键词提取专家。
任务：从一份创造者的节点信息里，提炼 6-8 个最能代表 TA 的关键词作为卡片 chip 标签。

【关键词应混合覆盖以下四类，缺哪类补哪类】
A. 身份/角色：如「Co-Active 教练」「独立开发者」「社区主理人」
B. 核心专长/方法论：如「正念冥想」「个人商业画布」「产品设计」
C. 具名项目/作品/产品：如「附近森林」「Focus-AI」「随机漫步的进化」（书名/播客名/社区名/产品名）
D. 主题方向/议题：如「教育创新」「AI+成长」「社区营造」

【硬性规则】
1. 文本中出现的"具名项目/作品/产品"（带书名号《》「」、带冒号、有明显产品名形态如英文+连字符）必须优先保留，至少抽 2 个（如果存在）
2. 已有用户标签（topics）保留并放在最前
3. 每个关键词 2-12 字（中英混合都算字符），干净的名词短语，不要"的/在/做/也/并"等虚词
4. 避免重叠（"教练" vs "Co-Active 教练" → 选具体的）
5. 仅输出 JSON，无解释`;

  const user = `${profile}

请提取 ${count} 个关键词。务必从【具名项目/作品/产品】类别至少抽 2 个（如果文本中存在）。
按重要度从高到低排序，以 JSON 返回：
{"keywords": ["关键词1", "关键词2", ...]}`;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Kimi ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  let parsed;
  try { parsed = JSON.parse(content); }
  catch {
    const m = content.match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : { keywords: [] };
  }
  return (parsed.keywords || [])
    .filter(k => typeof k === 'string')
    .map(k => k.trim())
    .filter(k => k.length >= 2 && k.length <= 12);
}

const force = process.argv.includes('--force');

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const probe = await sb.from('node_cards').select('id, keywords').limit(1);
if (probe.error && /column .* keywords .* does not exist/i.test(probe.error.message)) {
  console.error('❌ keywords 列不存在。请先在 Supabase SQL Editor 执行：');
  console.error("   alter table node_cards add column if not exists keywords text[] default '{}';");
  process.exit(1);
}

const { data, error } = await sb.from('node_cards').select('*');
if (error) throw error;
console.log(`Found ${data.length} rows`);

for (const row of data) {
  if (!force && Array.isArray(row.keywords) && row.keywords.length > 0) {
    console.log(`- skip ${row.name} (already has ${row.keywords.length} keywords)`);
    continue;
  }
  process.stdout.write(`- ${row.name}: generating... `);
  try {
    const t0 = Date.now();
    const kws = await generateKeywordsAI(row, 6);
    console.log(`${Date.now() - t0}ms  →  [${kws.join(', ')}]`);
    if (kws.length === 0) continue;
    const upd = await sb.from('node_cards').update({ keywords: kws }).eq('id', row.id);
    if (upd.error) console.error('  ! save failed:', upd.error.message);
  } catch (e) {
    console.error('  ! failed:', e.message);
  }
}
console.log('done');
