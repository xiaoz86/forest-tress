// 把 src/i18n/zh/<切片>.ts 翻成 src/i18n/en/<切片>.ts（调 DeepSeek）。
//
//   node --env-file=.env.local scripts/translate-i18n.mjs nav
//   node --env-file=.env.local scripts/translate-i18n.mjs --all
//   node --env-file=.env.local scripts/translate-i18n.mjs home --dry   # 只打印，不写文件
//
// 做法是「整个文件进、整个文件出」：不解析 TS，让模型照着中文文件的结构
// 原样生成英文文件。结构错了 tsc 会立刻报出来——所以跑完必须再跑一次
//   npx tsc --noEmit
//
// 这个脚本只负责把量做出来。品牌调性最重的那些句子（hero、slogan）
// 翻完要人工过一遍：机器能把意思译对，译不出「有人陪你，慢慢回到自己」那种呼吸感。

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const ZH_DIR = 'src/i18n/zh';
const EN_DIR = 'src/i18n/en';

const key = process.env.DEEPSEEK_API_KEY;
if (!key) {
  console.error('缺少 DEEPSEEK_API_KEY —— 用 node --env-file=.env.local 跑');
  process.exit(1);
}
const baseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
const model = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';

// 整站统一的译法。加新词就往这里加，别让同一个词在不同页面变成三种英文。
const GLOSSARY = `
附近森林 → Nearby Forest
林间探索 → Listen
回到自己 → Companion
个体创造 → Creations
遇见附近 → People
生态社区 → About
种下一棵树 → Plant a tree
小径 → path
声音 / 一段声音 → sound / a sound（不要用 track 或 audio）
陪伴营 → companion program
主理人 → host
正念 → mindfulness
觉察 → awareness
看见 → notice
在场 → presence
phil-coach → phil-coach（不翻）
`.trim();

const SYSTEM = `你把一个中文网站的文案文件翻成英文。

产品是「附近森林」——一个中文的正念与陪伴社区。它的中文写得很讲究：
短句、留白、具体、不说教（「有人陪你，慢慢回到自己」「一个会回应的树洞」）。
直译会把它变成一个平庸的冥想 App 文案，那是失败的翻译。

英文要求：
- 短。中文一句话常常要拆成两句英文才自然。
- 具体。不要堆 gently / slowly / softly / inner peace 这类词。
- 有呼吸感，但不要抒情腔。宁可意译也不要字对字。
- 不出现中文标点，不出现 ta 这种指代。
- 界面上的按钮和标签要像按钮：短、动词开头、别写成句子。

术语表（必须照此翻，整站一致）：
${GLOSSARY}

输出要求（严格）：
- 只输出一个 TypeScript 文件的完整内容，不要任何解释、不要 markdown 代码围栏。
- 结构、键名、嵌套、导出名全部和输入文件一模一样，只把中文字符串换成英文。
- 保留输入文件里的 import 行和类型标注写法，把 export 改成带类型标注的形式：
  export const <名字>: typeof zh<首字母大写的名字> = { ... }
  并在文件顶部 import 中文切片的类型。照着这个样子写：
    import type { nav as zhNav } from '@/i18n/zh/nav';
    export const nav: typeof zhNav = { ... };
- 中文注释原样保留（注释不用翻），但如果注释讲的是中文措辞的取舍，
  可以补一句说明英文这边为什么这么处理。
- 绝对不要加 as const。`;

async function translate(slice) {
  const zhPath = join(ZH_DIR, `${slice}.ts`);
  if (!existsSync(zhPath)) {
    console.error(`× 找不到 ${zhPath}`);
    return null;
  }
  const source = readFileSync(zhPath, 'utf8');
  const zhChars = (source.match(/[一-龥]/g) || []).length;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `切片名：${slice}\n\n${source}` },
      ],
      temperature: 0.3,
      stream: false,
      thinking: { type: 'disabled' },
    }),
    signal: AbortSignal.timeout(180_000),
  });

  if (!res.ok) {
    console.error(`× ${slice} 上游 ${res.status}`, (await res.text().catch(() => '')).slice(0, 300));
    return null;
  }
  const json = await res.json();
  let out = json?.choices?.[0]?.message?.content?.trim() || '';
  // 模型偶尔会套一层 ```ts 围栏，去掉
  out = out.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
  if (!out) {
    console.error(`× ${slice} 返回空`);
    return null;
  }
  const usage = json?.usage || {};
  console.log(
    `✓ ${slice}：中文 ${zhChars} 字 → 英文 ${out.length} 字符` +
      (usage.total_tokens ? `（用了 ${usage.total_tokens} tokens）` : ''),
  );
  return out;
}

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const slices = args.includes('--all')
  ? readdirSync(ZH_DIR).filter(f => f.endsWith('.ts') && f !== 'index.ts').map(f => f.replace(/\.ts$/, ''))
  : args.filter(a => !a.startsWith('--'));

if (slices.length === 0) {
  console.error('用法: node --env-file=.env.local scripts/translate-i18n.mjs <切片名|--all> [--dry]');
  process.exit(1);
}

console.log(`模型 ${model} · 要翻 ${slices.length} 个切片：${slices.join(', ')}\n`);

for (const slice of slices) {
  const out = await translate(slice);
  if (!out) continue;
  const enPath = join(EN_DIR, `${slice}.ts`);
  if (dry) {
    console.log(`\n----- ${enPath}（--dry，没有写入）-----\n${out}\n`);
  } else {
    writeFileSync(enPath, out.endsWith('\n') ? out : `${out}\n`);
    console.log(`  已写入 ${enPath}`);
  }
}

console.log('\n翻完了。现在必须跑一次：npx tsc --noEmit');
console.log('然后人工过一遍 hero 和 slogan 那几句——机器译得对，但译不出呼吸感。');
