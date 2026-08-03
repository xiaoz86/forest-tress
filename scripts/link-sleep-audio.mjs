#!/usr/bin/env node
/**
 * 把已经传进 meditations 桶的音频，和 21 天陪伴营的曲目对上。
 *
 * 为什么需要它：管理页那条上传路径走 Vercel 函数，请求体上限约 4.5MB，
 * 而这批文件 15–33MB，必然失败。绕开的办法是在 Supabase 控制台直接把
 * 文件拖进桶里（不经过 Vercel），然后跑这个脚本把 audioPath 写进内容 JSON。
 *
 * 匹配靠文件名里的 D 编号：`D01 觉察呼吸.mp3` → sleep-d01。
 * 大小写、有没有空格、用不用连字符都认。
 *
 * 时长用 ffprobe 从签名链接上直接读，不下载整个文件。
 *
 *   node --env-file=.env.local scripts/link-sleep-audio.mjs --dry
 *   node --env-file=.env.local scripts/link-sleep-audio.mjs
 *   node --env-file=.env.local scripts/link-sleep-audio.mjs --prefix sleep-21
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createClient } from '@supabase/supabase-js';

const run = promisify(execFile);
const CONTENT_ID = 'forest-breath';
const BUCKET = 'meditations';
const DRY = process.argv.includes('--dry');
const prefixArg = process.argv.indexOf('--prefix');
const PREFIX = prefixArg > -1 ? (process.argv[prefixArg + 1] || '') : '';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('缺 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const sb = createClient(url, key);

/** 从 `D01 觉察呼吸.mp3` / `d1-xxx.mp3` / `01.mp3` 里抠出 1..21 */
function dayOf(name) {
  const base = name.split('/').pop() || '';
  const m = base.match(/(?:^|[^0-9a-z])d\s*_?-?(\d{1,2})(?![0-9])/i)
    || base.match(/^(\d{1,2})(?![0-9])/);
  if (!m) return 0;
  const n = Number(m[1]);
  return n >= 1 && n <= 21 ? n : 0;
}

/** 递归列桶里的对象（Supabase 的 list 不递归，得自己下钻） */
async function listAll(prefix = '', depth = 0) {
  if (depth > 3) return [];
  const { data, error } = await sb.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error || !data) return [];
  const out = [];
  for (const entry of data) {
    const full = prefix ? `${prefix}/${entry.name}` : entry.name;
    // 有 id 的是文件，没有的是「目录」
    if (entry.id) out.push({ path: full, size: entry.metadata?.size ?? 0 });
    else out.push(...await listAll(full, depth + 1));
  }
  return out;
}

async function probeDuration(path) {
  try {
    const { data } = await sb.storage.from(BUCKET).createSignedUrl(path, 300);
    if (!data?.signedUrl) return '';
    const { stdout } = await run('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', data.signedUrl,
    ], { timeout: 30_000 });
    const secs = Number(String(stdout).trim());
    if (!Number.isFinite(secs) || secs <= 0) return '';
    return `${Math.round(secs / 60)} 分钟`;
  } catch {
    return '';
  }
}

const files = (await listAll(PREFIX)).filter(f => /\.(mp3|m4a|wav|aac|ogg|webm|mp4|flac)$/i.test(f.path));
console.log(`桶里扫到 ${files.length} 个音频文件${PREFIX ? `（前缀 ${PREFIX}）` : ''}\n`);

const { data: row, error } = await sb
  .from('meditation_content').select('payload').eq('id', CONTENT_ID).maybeSingle();
if (error || !row?.payload) {
  console.error('读取内容失败:', error?.message || '没有记录');
  process.exit(1);
}

const payload = row.payload;
const tracks = (payload.tracks || []).map(t => ({ ...t }));

// 同一个 D 编号有多份时取最新（文件名里通常带时间戳）
const byDay = new Map();
for (const f of files) {
  const d = dayOf(f.path);
  if (!d) continue;
  const prev = byDay.get(d);
  if (!prev || f.path > prev.path) byDay.set(d, f);
}

let linked = 0;
const unmatched = files.filter(f => !dayOf(f.path));

for (let d = 1; d <= 21; d += 1) {
  const id = `sleep-d${String(d).padStart(2, '0')}`;
  const track = tracks.find(t => t.id === id);
  if (!track) continue;
  const file = byDay.get(d);
  if (!file) {
    console.log(`  ${id}  —  还没有文件   ${track.title}`);
    continue;
  }
  if (track.audioPath === file.path) {
    console.log(`  ${id}  =  已是最新     ${track.title}`);
    continue;
  }
  const duration = await probeDuration(file.path);
  track.audioPath = file.path;
  delete track.audioUrl;
  if (duration) track.duration = duration;
  linked += 1;
  console.log(`  ${id}  →  ${file.path}${duration ? `  (${duration})` : ''}`);
}

if (unmatched.length) {
  console.log('\n认不出 D 编号、没有匹配的文件：');
  unmatched.forEach(f => console.log('  ' + f.path));
  console.log('（把文件名改成 D01、D02… 开头再跑一次即可）');
}

console.log(`\n本次关联 ${linked} 段；专题共 ${tracks.filter(t => t.id.startsWith('sleep-d') && t.audioPath).length} / 21 段已有音频`);

if (DRY) {
  console.log('\n--dry：没有写入。');
  process.exit(0);
}
if (linked === 0) {
  console.log('\n没有需要写入的变化。');
  process.exit(0);
}

const { error: upErr } = await sb.from('meditation_content').upsert({
  id: CONTENT_ID,
  payload: { ...payload, tracks },
  updated_at: new Date().toISOString(),
});
if (upErr) {
  console.error('写入失败:', upErr.message);
  process.exit(1);
}
console.log('\n已写入。刷新 /meditations?category=sleep 就能听了。');
