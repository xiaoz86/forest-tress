// 给「主理人自己编辑的内容」生成英文对照表（调 DeepSeek）。
//
//   node --env-file=.env.local scripts/translate-content.mjs          # 增量：只翻新出现的
//   node --env-file=.env.local scripts/translate-content.mjs --dry    # 只看要翻什么，不调接口
//   node --env-file=.env.local scripts/translate-content.mjs --force  # 全部重翻
//
// 覆盖的来源：
//   - Supabase meditation_content：分类名、简介、金句、导师、阶段、音频标题与简介
//   - Supabase share_content：首页林间分享的文案
//   - content/*.md：/about 那几屏的正文（跳过 ## 标题——页面靠它们分段，不能翻）
//
// **不翻**：成员自己写的资料（node_cards）和听后感悟（meditation_notes）——
// 那是本人的话，替他翻成英文是越界。
//
// 结果写进 src/i18n/generated/content-en.json（原文 → 英文），提交进仓库。
// 运行时只查表，零延迟零成本；查不到就照旧显示中文。
// 主理人在后台改完内容记得重跑一次。

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const OUT = 'src/i18n/generated/content-en.json';
const CONTENT_DIR = 'content';

const key = process.env.DEEPSEEK_API_KEY;
if (!key) {
  console.error('缺少 DEEPSEEK_API_KEY —— 用 node --env-file=.env.local 跑');
  process.exit(1);
}
const baseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
const model = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const force = args.includes('--force');

const hasChinese = s => typeof s === 'string' && /[一-龥]/.test(s);
// 页面解析 md 时会剥掉值两端的引号（见 about/page.tsx 的 parseItems），
// 这里不剥的话，表里的键带着引号，渲染时拿不带引号的原文去查就永远对不上。
const clean = s =>
  typeof s === 'string' ? s.trim().replace(/^["']|["']$/g, '').trim() : '';

// ── 收集要翻的原文 ────────────────────────────────────────────────
const sources = new Map(); // 原文 → 来自哪里（只用于打印）

function collect(value, where) {
  const text = clean(value);
  if (!text || !hasChinese(text)) return;
  if (text.length > 600) return; // 过长的多半是拼接出来的，跳过
  if (!sources.has(text)) sources.set(text, where);
}

/**
 * 页面自己写死的几句（不在 md 也不在库里）。
 * 这些本该走 src/i18n 的字典，但 /about 那一页的正文是 markdown 驱动的，
 * 让它同时吃两套机制反而更难维护——统一走这张表。
 */
const UI_EXTRAS = [
  '回首页',
  '来处',
  '附近森林的来处',
  '关于这片森林从哪里来，往哪里去。',
  '生态理念',
  '社群联结',
  '织一张网',
  '联系我们',
  '让光继续传递',
  '让独立的个体彼此连接、流动、共创',
  '也想把自己这棵树，放进森林？',
  '也期待听到大家使用 PhilCoach 等社区作品时，任何体验上的反馈。',
  '人也一样。每个人的路不同，但都需要被理解，也需要和信任的人一起做些什么。',
  '从一棵树，',
  '从一次真实的招呼开始',
  '到一片森林',
  '在一个容易让人各自待着的世界里，重新把一些人连在一起。',
  '在这片森林里，',
  '它是很多人一起在做的一件事。',
  '想进一步了解、加入社群，或分享使用中的感受，可以添加两位创始人的微信。',
  '慢慢地，让更多人找到彼此。也让这片森林，一点一点地长出来。',
  '我们希望科技，尤其是人工智能，帮助人更深地理解自己、靠近他人，而不是取代人与人之间真实的相遇。',
  '我们希望这里既是大家走近附近、交流联结的地方，也是可以自在共享想法💡的地方。',
  '我能做的其实很少：把自己经历过的、学到的东西分享出来。如果刚好对谁有一点用，那就是最好的事了。',
  '每一棵树都是独一无二的。它按自己的节奏、用自己的方式生长；但没有哪一棵树真正独自长成。看不见的地下，根系悄然相连，彼此支撑，也彼此滋养。',
  '每一棵树，',
  '种下一棵树',
  '这片森林相信的六件事',
  '连接正在发生',
  '都以自己的方式生长',
  '附近森林不是一个人能做成的事。',
  '附近森林就是在试着做这件事——让人慢下来，遇到同频的人，一起把想法变成真实的事。',
  '附近森林生态社区生长社群',
  '附近森林生态社区生长社群，是给注册和使用附近森林、愿意陪伴社区最新作品一起成长的超级创造者们，一个相聚、走近彼此的附近社群。',
];

async function fromSupabase() {
  if (!supabaseUrl || !serviceKey) {
    console.warn('! 没有 Supabase 配置，跳过库里的内容');
    return;
  }
  const h = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const get = async path =>
    (await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers: h })).json();

  const [mc] = await get('meditation_content?id=eq.forest-breath&select=payload');
  const p = mc?.payload || {};
  collect(p.eyebrow, '冥想·眉题');
  collect(p.title, '冥想·标题');
  collect(p.description, '冥想·描述');
  for (const c of p.categories || []) {
    for (const f of ['label', 'description', 'heroTitle', 'heroSubtitle', 'subtitle',
                     'highlight', 'sourceNote', 'featureNote', 'teacherCredential']) {
      collect(c[f], `分类 ${c.id}·${f}`);
    }
    for (const b of c.benefits || []) collect(b, `分类 ${c.id}·收获`);
    for (const ph of c.phases || []) {
      collect(ph.label, `分类 ${c.id}·阶段`);
      collect(ph.description, `分类 ${c.id}·阶段说明`);
    }
  }
  for (const t of p.tracks || []) {
    collect(t.title, '音频·标题');
    collect(t.intention, '音频·简介');
    collect(t.stage, '音频·阶段');
    collect(t.duration, '音频·时长');
  }

  const [sc] = await get('share_content?select=payload&limit=1');
  const sp = sc?.payload || {};
  collect(sp.eyebrow, '分享·眉题');
  collect(sp.title, '分享·标题');
  collect(sp.description, '分享·描述');
  for (const s of sp.shares || []) {
    // author 也要收：卡片下面那行「联合创始人团队 · 首次分享」是它和 authorLabel 拼的。
    // 漏掉它，英文版那行就只翻出后半截。
    for (const f of ['title', 'kicker', 'question', 'summary', 'note', 'author', 'authorLabel', 'badgeLabel']) {
      collect(s[f], `分享 ${s.id}·${f}`);
    }
    for (const tag of s.tags || []) collect(tag, `分享 ${s.id}·标签`);
  }
}

function fromMarkdown() {
  for (const file of readdirSync(CONTENT_DIR).filter(f => f.endsWith('.md'))) {
    const raw = readFileSync(join(CONTENT_DIR, file), 'utf8');
    for (const line of raw.split('\n')) {
      const l = line.trim();
      if (!l || l === '---') continue;
      // ## 小标题是页面用来分段的键（「引言」「核心信念」），翻了就找不到了
      if (l.startsWith('#')) continue;
      // front matter 和列表项都是 `key: value`，只收 value——
      // 把 key 一起收进去的话，页面渲染的是 value，查表永远对不上。
      const kv = l.match(/^-?\s*([a-zA-Z][a-zA-Z0-9_]*):\s*(.+)$/);
      if (kv) {
        const [, k, v] = kv;
        // 头像是单个汉字当首字母用的，名字是真人姓名，都不能翻
        if (['avatar', 'avatars', 'name', 'names'].includes(k)) continue;
        // [a, b, c] 这种数组要逐项收，整串翻回来没法用
        const arr = v.match(/^\[(.+)\]$/);
        if (arr) {
          arr[1].split(/[,，]/).forEach(item => collect(item, `${file}·${k}`));
        } else {
          collect(v, `${file}·${k}`);
        }
        continue;
      }
      collect(l.replace(/^-\s*/, ''), file);
    }
  }
}

// ── 翻译 ─────────────────────────────────────────────────────────
const GLOSSARY = `
附近森林 → Nearby Forest · 林间呼吸 → Breathing in the forest
小径 → path · 声音/一段声音 → sound（不用 track/audio）· 陪伴营 → companion program
主理人 → host · 正念 → mindfulness · 觉察 → awareness · 看见 → notice · 在场 → presence
phil-coach → phil-coach（不翻）
`.trim();

const SYSTEM = `你把一个中文正念社区网站的内容翻成英文。

产品叫「附近森林」，中文写得克制、具体、有留白，不说教。直译会毁掉它的调性。
英文要求：短句；不堆 gently/slowly/softly/inner peace；宁可意译不要字对字；
不出现中文标点；界面标签要像标签（短、别写成句子）。

术语表：
${GLOSSARY}

输入是一个 JSON 数组，每项是一句中文。
输出必须是同样长度、同样顺序的 JSON 数组，每项是对应的英文。
只输出 JSON 数组本身，不要解释、不要 markdown 围栏。
保留原文里的 **加粗** 标记和 {占位符}。`;

async function translateChunk(list) {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: JSON.stringify(list, null, 0) },
      ],
      temperature: 0.3,
      stream: false,
      thinking: { type: 'disabled' },
    }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) {
    console.error('  × 上游', res.status, (await res.text().catch(() => '')).slice(0, 200));
    return null;
  }
  const json = await res.json();
  let out = json?.choices?.[0]?.message?.content?.trim() || '';
  out = out.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
  try {
    const arr = JSON.parse(out);
    if (!Array.isArray(arr) || arr.length !== list.length) {
      console.error(`  × 返回条数对不上：要 ${list.length}，回 ${Array.isArray(arr) ? arr.length : '非数组'}`);
      return null;
    }
    return { arr, tokens: json?.usage?.total_tokens || 0 };
  } catch {
    console.error('  × 返回不是合法 JSON：', out.slice(0, 200));
    return null;
  }
}

// ── 主流程 ───────────────────────────────────────────────────────
await fromSupabase();
fromMarkdown();
UI_EXTRAS.forEach(s => collect(s, '页面写死的'));

const existing = force ? {} : JSON.parse(readFileSync(OUT, 'utf8'));
const all = [...sources.keys()];
const todo = all.filter(s => !existing[s]);

console.log(`收集到 ${all.length} 条原文，其中 ${todo.length} 条还没有译文`);
if (todo.length === 0) {
  console.log('没有新内容要翻。');
  process.exit(0);
}
if (dry) {
  todo.slice(0, 30).forEach(s => console.log(`  [${sources.get(s)}] ${s.slice(0, 60)}`));
  if (todo.length > 30) console.log(`  …还有 ${todo.length - 30} 条`);
  process.exit(0);
}

const CHUNK = 30;
let tokens = 0;
const result = { ...existing };
for (let i = 0; i < todo.length; i += CHUNK) {
  const chunk = todo.slice(i, i + CHUNK);
  process.stdout.write(`翻第 ${i + 1}-${i + chunk.length} 条… `);
  const r = await translateChunk(chunk);
  if (!r) { console.log('这一批失败，跳过'); continue; }
  chunk.forEach((zh, j) => { if (r.arr[j]) result[zh] = String(r.arr[j]); });
  tokens += r.tokens;
  console.log(`好（${r.tokens} tokens）`);
}

const sorted = Object.fromEntries(Object.keys(result).sort().map(k => [k, result[k]]));
writeFileSync(OUT, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`\n写入 ${OUT}：共 ${Object.keys(sorted).length} 条，本次用了 ${tokens} tokens`);
console.log('记得人工扫一眼分类名和金句那几条——机器译得对，但调性要你把关。');
