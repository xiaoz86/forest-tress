#!/usr/bin/env node
/**
 * 把本地一整个目录的陪伴营音频批量传进 meditations 桶。
 *
 * 和在 Supabase 控制台里拖是一回事——都用 service role key 直连存储，
 * 不经过 Vercel。区别只是它会按文件名里的 D 编号自动放进
 * sleep-dNN/ 这个路径，省掉之后再对一遍的功夫。
 *
 * 上传后不写内容 JSON，那一步交给 link-sleep-audio.mjs，
 * 那边还会顺带用 ffprobe 读时长。
 *
 *   node --env-file=.env.local scripts/upload-sleep-audio.mjs "<目录>" --dry
 *   node --env-file=.env.local scripts/upload-sleep-audio.mjs "<目录>"
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'meditations';
const DRY = process.argv.includes('--dry');
const dir = process.argv.slice(2).find(a => !a.startsWith('--'));

if (!dir) {
  console.error('用法: node --env-file=.env.local scripts/upload-sleep-audio.mjs "<目录>" [--dry]');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('缺 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const sb = createClient(url, key);

const MIME = {
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav',
  '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.flac': 'audio/flac',
};

/** 从 `D01 觉察呼吸.mp3` / `D19-湖畔…` 里抠出 1..21 */
function dayOf(name) {
  const m = name.match(/(?:^|[^0-9a-z])d\s*_?-?(\d{1,2})(?![0-9])/i) || name.match(/^(\d{1,2})(?![0-9])/);
  if (!m) return 0;
  const n = Number(m[1]);
  return n >= 1 && n <= 21 ? n : 0;
}

const entries = (await readdir(dir))
  .filter(n => MIME[path.extname(n).toLowerCase()])
  .sort();

const jobs = [];
const skipped = [];
for (const name of entries) {
  const day = dayOf(name);
  if (!day) { skipped.push(name); continue; }
  const full = path.join(dir, name);
  const { size } = await stat(full);
  jobs.push({ day, name, full, size, ext: path.extname(name).toLowerCase() });
}
jobs.sort((a, b) => a.day - b.day);

const total = jobs.reduce((n, j) => n + j.size, 0);
console.log(`找到 ${jobs.length} 个可上传文件，共 ${(total / 1048576).toFixed(0)} MB`);
if (skipped.length) {
  console.log(`认不出 D 编号、跳过 ${skipped.length} 个：`);
  skipped.forEach(n => console.log('  ' + n));
}

const dupes = jobs.map(j => j.day).filter((d, i, a) => a.indexOf(d) !== i);
if (dupes.length) {
  console.error(`\n编号重复: D${[...new Set(dupes)].join(', D')} —— 先处理掉再传，否则会互相覆盖。`);
  process.exit(1);
}

if (DRY) {
  console.log('\n将要上传：');
  jobs.forEach(j => console.log(
    `  D${String(j.day).padStart(2, '0')}  ${(j.size / 1048576).toFixed(1).padStart(5)}MB  →  sleep-d${String(j.day).padStart(2, '0')}/`,
  ));
  console.log('\n--dry：没有上传。');
  process.exit(0);
}

let ok = 0;
let failed = 0;
const stamp = Date.now();

for (const j of jobs) {
  const id = `sleep-d${String(j.day).padStart(2, '0')}`;
  // 沿用管理页的命名习惯：<trackId>/<时间戳><扩展名>
  const dest = `${id}/${stamp + j.day}${j.ext}`;
  const label = `D${String(j.day).padStart(2, '0')} ${(j.size / 1048576).toFixed(1)}MB`;
  process.stdout.write(`  ${label} → ${dest} … `);
  try {
    const buf = await readFile(j.full);
    const { error } = await sb.storage.from(BUCKET).upload(dest, buf, {
      contentType: MIME[j.ext] || 'audio/mpeg',
      upsert: true,
    });
    if (error) throw new Error(error.message);
    console.log('OK');
    ok += 1;
  } catch (err) {
    console.log('失败: ' + err.message);
    failed += 1;
  }
}

console.log(`\n上传完成：成功 ${ok}，失败 ${failed}`);
if (ok > 0) {
  console.log('接着跑这个把文件和曲目对上（顺带读时长）：');
  console.log('  node --env-file=.env.local scripts/link-sleep-audio.mjs --dry');
}
