#!/usr/bin/env node
/**
 * 把「纯声音」分类写进库。
 *
 * 为什么需要它：DEFAULT_MEDITATION_CONTENT 只在库里没存过内容时才生效。
 * 库里已经有东西了，所以光在代码里加分类，前台是看不到的。
 *
 * 幂等：分类和曲目都只补缺，已存在的一律不覆盖——
 * 你在管理页改过的名字、描述不会被冲掉。
 *
 *   node --env-file=.env.local scripts/seed-ambient.mjs --dry
 *   node --env-file=.env.local scripts/seed-ambient.mjs
 */

import { createClient } from '@supabase/supabase-js';

const CONTENT_ID = 'forest-breath';
const DRY = process.argv.includes('--dry');

const CATEGORY = {
  id: 'ambient',
  label: '纯声音',
  kind: 'ambient',
  description: '手碟、颂钵、雨声。没有引导，放着就好。',
  heroTitle: '纯声音',
  heroSubtitle: '没有人说话，只有声音本身',
  mood: 'body',
};

// 名字是 Wendy 点过的三类。音频还没有，前台会显示「开放中」。
const TRACKS = [
  {
    id: 'ambient-handpan', title: '手碟', mood: 'body',
    intention: '金属的余韵一圈圈散开，适合什么都不做的时候',
  },
  {
    id: 'ambient-bowl', title: '颂钵', mood: 'healing',
    intention: '低频的振动，适合入睡时放着',
  },
  {
    id: 'ambient-rain', title: '雨声', mood: 'forest',
    intention: '没有旋律的雨，把注意力放在别处',
  },
].map(t => ({
  ...t, duration: '', stage: '纯声音', categoryId: CATEGORY.id, loopable: true,
}));

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
  console.log(`分类「${CATEGORY.label}」: 已存在，不动`);
} else {
  categories.push(CATEGORY);
  console.log(`分类「${CATEGORY.label}」: 新增`);
}

let added = 0, skipped = 0;
for (const t of TRACKS) {
  if (tracks.some(x => x.id === t.id)) { skipped += 1; continue; }
  tracks.push(t);
  added += 1;
}
console.log(`曲目: 新增 ${added} 段，跳过已存在 ${skipped} 段`);
console.log(`结果: ${categories.length} 个分类 / ${tracks.length} 段曲目`);

if (DRY) {
  console.log('\n--dry：没有写入。');
  process.exit(0);
}

const { error: upErr } = await sb.from('meditation_content').upsert({
  id: CONTENT_ID,
  payload: { ...payload, categories, tracks },
  updated_at: new Date().toISOString(),
});
if (upErr) {
  console.error('写入失败:', upErr.message);
  process.exit(1);
}
console.log('\n已写入。/meditations 上会多出「纯声音」一组。');
