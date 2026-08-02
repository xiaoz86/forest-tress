#!/usr/bin/env node
/**
 * 把「改善睡眠 · 21 天睡眠陪伴营」写进 meditation_content。
 *
 * 为什么需要这个脚本：DEFAULT_MEDITATION_CONTENT 只在库里没存过内容时才生效，
 * 一旦主理人在管理页保存过，读到的就是存储的那份——新加的分类不会自己冒出来。
 *
 * 幂等：已经存在的分类和曲目不会被覆盖，只补缺的。可以反复跑。
 *
 *   node --env-file=.env.local scripts/seed-sleep-program.mjs
 *   node --env-file=.env.local scripts/seed-sleep-program.mjs --dry
 */

import { createClient } from '@supabase/supabase-js';

const CONTENT_ID = 'forest-breath';
const CATEGORY_ID = 'sleep';
const DRY = process.argv.includes('--dry');

// 和 src/lib/meditations.ts 里的 DEFAULT 保持一致。改标题请两边一起改。
const TITLES = [
  '觉察呼吸',
  '聆听身体',
  '身体扫描',
  '深呼吸 + 身体放松',
  '深度放松练习 · 腹式呼吸，缓解焦虑紧张',
  '深度放松练习 · 渐进式肌肉放松，快速缓解焦虑紧张',
  '正念行走',
  '接受一切',
  '应对焦虑的正念静坐冥想',
  '日常身心放松与获得平静的静观冥想',
  '活在当下，喜悦醒来',
  '花草静观冥想，打开五感，看见自己，看见世界',
  '无选择的自我觉知练习',
  '积极自我肯定，创造自信美好的一天',
  '全然自我接纳',
  '让自己放下，与失去和平共处',
  '告别过去',
  '创造现实',
  '湖畔意象松弛法冥想',
  '正念自我关爱冥想',
  '感恩冥想，带着喜悦心醒来',
];

const CATEGORY = {
  id: CATEGORY_ID,
  label: '改善睡眠',
  kind: 'program',
  description: '21 天，从呼吸与放松开始，慢慢走到接纳与自我关爱。',
  heroTitle: '21 天睡眠陪伴营',
  subtitle: '以睡眠修心，活出生命好状态',
  highlight: '失眠要解决的不是睡的问题，而是醒的生命状态',
  mood: 'sleep',
  teacherName: 'Wendy',
  teacherCredential: 'GGSC 认证 MMTCP 正念冥想教师 · 师从 Jack Kornfield · 12 年践行',
  freeCount: 3,
  priceCents: 6800,
  phases: [
    { id: 'sleep-w1', label: '第一周 · 呼吸与身心放松', order: 1, unlockAfter: 0, mood: 'sleep' },
    { id: 'sleep-w2', label: '第二周 · 回归内心平静', order: 2, unlockAfter: 5, mood: 'healing' },
    { id: 'sleep-w3', label: '第三周 · 接纳与自我关爱', order: 3, unlockAfter: 5, mood: 'care' },
  ],
};

const TRACKS = TITLES.map((title, i) => {
  const seq = i + 1;
  const week = seq <= 7 ? 1 : seq <= 14 ? 2 : 3;
  return {
    id: `sleep-d${String(seq).padStart(2, '0')}`,
    title,
    intention: '',
    duration: '',
    stage: `第${['一', '二', '三'][week - 1]}周`,
    categoryId: CATEGORY_ID,
    mood: 'sleep',
    seq,
    phaseId: `sleep-w${week}`,
  };
});

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('缺 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  console.error('用 node --env-file=.env.local scripts/seed-sleep-program.mjs 跑');
  process.exit(1);
}

const sb = createClient(url, key);

const { data, error } = await sb
  .from('meditation_content')
  .select('payload')
  .eq('id', CONTENT_ID)
  .maybeSingle();

if (error) {
  console.error('读取失败:', error.message);
  process.exit(1);
}
if (!data?.payload) {
  console.error('库里还没有内容记录。先在管理页保存一次，再跑这个脚本。');
  process.exit(1);
}

const payload = data.payload;
const categories = Array.isArray(payload.categories) ? [...payload.categories] : [];
const tracks = Array.isArray(payload.tracks) ? [...payload.tracks] : [];

const hadCategory = categories.some(c => c?.id === CATEGORY_ID);
if (!hadCategory) categories.push(CATEGORY);

const existing = new Set(tracks.map(t => t?.id));
const added = TRACKS.filter(t => !existing.has(t.id));
tracks.push(...added);

console.log(`分类「改善睡眠」: ${hadCategory ? '已存在，跳过' : '新增'}`);
console.log(`曲目: 新增 ${added.length} 段，跳过已存在 ${TRACKS.length - added.length} 段`);
console.log(`结果: ${categories.length} 个分类 / ${tracks.length} 段曲目`);

if (!hadCategory || added.length) {
  const hasAudio = tracks.filter(t => t?.audioUrl).length;
  console.log(`其中已挂音频 ${hasAudio} 段`);
}

if (DRY) {
  console.log('\n--dry：没有写入。');
  process.exit(0);
}
if (hadCategory && added.length === 0) {
  console.log('\n没有需要写入的变化。');
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
console.log('\n已写入。打开 /meditations?category=sleep 看看。');
