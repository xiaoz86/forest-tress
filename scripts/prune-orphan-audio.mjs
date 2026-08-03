#!/usr/bin/env node
/**
 * 清理 meditations 桶里没有任何曲目引用的音频文件。
 *
 * 孤儿是怎么来的：管理页每次重传都写一个新的时间戳文件名，旧的那份留在桶里；
 * 曲目被删掉之后，它名下的文件也没人清。日积月累就攒下一堆。
 *
 * 判定标准只有一条：这个路径有没有被某个曲目的 audioPath 引用
 * （老数据的 audioUrl 也会被还原成路径一起比对）。
 *
 * 默认只看不删。删除是不可逆的，加 --force 才真的动手。
 *
 *   node --env-file=.env.local scripts/prune-orphan-audio.mjs
 *   node --env-file=.env.local scripts/prune-orphan-audio.mjs --force
 */

import { createClient } from '@supabase/supabase-js';

const CONTENT_ID = 'forest-breath';
const BUCKET = 'meditations';
const FORCE = process.argv.includes('--force');
const TRASH = process.argv.includes('--trash');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('缺 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const sb = createClient(url, key);

function toPath(audioUrl) {
  const m = String(audioUrl).match(
    /\/storage\/v1\/object\/(?:public|sign)\/meditations\/(.+?)(?:\?|$)/,
  );
  return m ? decodeURIComponent(m[1]) : '';
}

async function walk(prefix = '', depth = 0) {
  if (depth > 3) return [];
  const { data } = await sb.storage.from(BUCKET).list(prefix, { limit: 1000 });
  const out = [];
  for (const e of data || []) {
    const full = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.id) out.push({ path: full, size: e.metadata?.size ?? 0, at: e.created_at || '' });
    else out.push(...await walk(full, depth + 1));
  }
  return out;
}

const { data: row, error } = await sb
  .from('meditation_content').select('payload').eq('id', CONTENT_ID).maybeSingle();
if (error || !row?.payload) {
  console.error('读取内容失败:', error?.message || '没有记录');
  process.exit(1);
}

// 在用的路径集合。宁可多留也不能错删，所以两种字段都算进来。
const inUse = new Set();
for (const t of row.payload.tracks || []) {
  if (t.audioPath) inUse.add(String(t.audioPath));
  if (t.audioUrl) {
    const p = toPath(t.audioUrl);
    if (p) inUse.add(p);
  }
}

const files = await walk();
// _trash/ 是本脚本自己的回收站，别把它当成新的孤儿再搬一次
const live = files.filter(f => !f.path.startsWith('_trash/'));
const trashed = files.filter(f => f.path.startsWith('_trash/'));
const orphans = live.filter(f => !inUse.has(f.path));
const kept = live.filter(f => inUse.has(f.path));
const mb = n => (n / 1048576).toFixed(1).padStart(6);

console.log(`桶内共 ${live.length} 个在用文件；曲目引用了 ${inUse.size} 个路径`);
if (trashed.length) {
  const size = trashed.reduce((n, f) => n + f.size, 0);
  console.log(`回收站 _trash/ 里另有 ${trashed.length} 个（${(size / 1048576).toFixed(1)} MB）`);
}
console.log('');

console.log(`保留 ${kept.length} 个（有曲目引用）:`);
kept.forEach(f => console.log(`  ${mb(f.size)}MB  ${f.path}`));

console.log(`\n孤儿 ${orphans.length} 个（没有任何曲目引用）:`);
orphans.forEach(f => console.log(`  ${mb(f.size)}MB  ${(f.at || '').slice(0, 16).replace('T', ' ')}  ${f.path}`));

const freed = orphans.reduce((n, f) => n + f.size, 0);
console.log(`\n可释放 ${(freed / 1048576).toFixed(1)} MB`);

if (orphans.length === 0) {
  console.log('\n没有需要清理的。');
  process.exit(0);
}

if (!TRASH && !FORCE) {
  console.log('\n只看不动。二选一：');
  console.log('  --trash   移到 _trash/ 前缀（工作区变干净，随时能捞回来）');
  console.log('  --force   永久删除（不可逆）');
  process.exit(0);
}

if (TRASH) {
  // 移而不删：这些多半是曲目被删时被带走的录音，不是主动弃用的。
  // 存储费可以忽略，但录不回来的东西删掉就是删掉了。
  let moved = 0;
  for (const f of orphans) {
    const to = `_trash/${f.path}`;
    const { error: mvErr } = await sb.storage.from(BUCKET).move(f.path, to);
    if (mvErr) {
      console.error(`  移动失败 ${f.path}: ${mvErr.message}`);
      continue;
    }
    moved += 1;
  }
  console.log(`\n已移动 ${moved} 个文件到 _trash/。`);
  console.log('确认真的不要了，再跑一次带 --force 就能清空。');
  process.exit(0);
}

const { data: removed, error: rmErr } = await sb.storage
  .from(BUCKET).remove(orphans.map(f => f.path));
if (rmErr) {
  console.error('\n删除失败:', rmErr.message);
  process.exit(1);
}
console.log(`\n已删除 ${(removed || []).length} 个文件，释放 ${(freed / 1048576).toFixed(1)} MB。`);
