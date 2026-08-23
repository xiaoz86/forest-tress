#!/usr/bin/env node
/**
 * 把「看见 · 四时身心」这个影像专题写进库。
 *
 * 为什么需要它：DEFAULT_MEDITATION_CONTENT 只在库里没存过内容时才生效。
 * 库里已经有东西了，所以光在代码里加分类，前台是看不到的。
 * （和 seed-ambient.mjs 是同一个道理，也是同一套写法。）
 *
 * 幂等：分类和曲目都只补缺，已存在的一律不覆盖——
 * 你在管理页改过的名字、说明不会被冲掉。
 *
 * 影片本身不在这里传，那一步交给 upload-film.mjs：
 * 这里只把「专题的形状」立起来，第一支影片传上去之前，
 * 前台会显示「影像开放中」。
 *
 *   node --env-file=.env.local scripts/seed-seasons.mjs --dry
 *   node --env-file=.env.local scripts/seed-seasons.mjs
 */

import { createClient } from '@supabase/supabase-js';

const CONTENT_ID = 'forest-breath';
const DRY = process.argv.includes('--dry');

// 和 src/lib/solarTerms.ts 的 SOLAR_TERMS_CATEGORY_ID 对上。
// 前台的节气条认的就是这个 id，改了它那条路线就不出现了。
const CATEGORY = {
  id: 'solar-terms',
  label: '四时身心',
  kind: 'film',
  description: '一年有二十四次转身。跟着节气，把身与心慢下来一些——该收的时候收，该藏的时候藏。',
  heroTitle: '四时身心',
  heroSubtitle: '顺着时令走，一年有二十四次慢下来的机会',
  mood: 'body',
  sourceNote:
    '静心体会自身己心，感受天地四季变化，花鸟鱼虫浮沉，意气神体互感，远取诸物，近取诸身。答案在这里。\n——《经典中医启蒙》',
  benefits: ['顺应时节', '身心慢下来', '收敛与储藏', '身体感知', '与自然同步'],
};

/*
  seq 是节气序号（立春 1 … 处暑 14 … 大寒 24），不是「第几支影片」。
  这样以后补做立秋、白露，直接按各自的号插进来就行，不用重排已有的。
*/
const TRACKS = [
  {
    id: 'solar-chushu',
    title: '处暑｜慢下来，开始收藏能量',
    intention: '顺应时节，处暑过后附近森林陪伴大家有意识地让身与心慢下来一些，开始进入能量储藏状态。',
    duration: '16 分钟',
    stage: '秋',
    mood: 'body',
    seq: 14,
  },
].map(t => ({ ...t, categoryId: CATEGORY.id }));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('缺 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const sb = createClient(url, key);

const { data, error } = await sb
  .from('meditation_content').select('payload').eq('id', CONTENT_ID).maybeSingle();
if (error || !data?.payload) {
  console.error('读取内容失败:', error?.message || '没有记录');
  process.exit(1);
}

const payload = data.payload;
const categories = [...(payload.categories || [])];
const tracks = [...(payload.tracks || [])];

if (categories.some(c => c.id === CATEGORY.id)) {
  console.log(`专题「${CATEGORY.label}」: 已存在，不动`);
} else {
  categories.push(CATEGORY);
  console.log(`专题「${CATEGORY.label}」: 新增`);
}

let added = 0, skipped = 0;
for (const t of TRACKS) {
  if (tracks.some(x => x.id === t.id)) { skipped += 1; continue; }
  tracks.push(t);
  added += 1;
}
console.log(`影片条目: 新增 ${added} 条，跳过已存在 ${skipped} 条`);

if (DRY) {
  console.log('\n--dry：没有写库。');
  console.log(`写进去之后是 ${categories.length} 个专题 / ${tracks.length} 条内容。`);
  process.exit(0);
}

const { error: upErr } = await sb.from('meditation_content').upsert({
  id: CONTENT_ID,
  payload: { ...payload, categories, tracks },
  updated_at: new Date().toISOString(),
});
if (upErr) {
  console.error('写库失败:', upErr.message);
  process.exit(1);
}

console.log('\n已写入。接着把影片传上去：');
console.log('  node --env-file=.env.local scripts/upload-film.mjs --track solar-chushu --video <文件> --poster <封面> --dry');
