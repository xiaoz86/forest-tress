#!/usr/bin/env node
// 把本地 .space-cache/ 里的个人空间数据搬到 Supabase（先在 SQL Editor 里执行 supabase-space.sql 建好表和桶）。
//
// 用法：
//   node scripts/migrate-space-to-supabase.mjs              # 只看会搬什么，不写（默认）
//   node scripts/migrate-space-to-supabase.mjs --apply      # 真的写进去
// 选项：
//   --include-demo   连标着「[演示]」的活动 / 报名 / 预约 / 招呼一起搬（默认不搬：搬上去会出现在线上的社区广场）
//   --include-outbox 连开发环境的待发邮件一起搬（默认不搬，线上用不到）
//   --overwrite      线上已经有的同一条也用本地的覆盖掉（默认不覆盖，见下）
// 目标库默认读 .env.local 的 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY；
// 想搬到别的库（比如本地测试库），用 MIGRATE_SUPABASE_URL / MIGRATE_SUPABASE_KEY 覆盖。
//
// 默认只补「线上还没有的」：线上已经有的那一条一律不动——上线之后成员在网站上改过的东西（编辑、风格、
// 发布状态、短链）都在线上，本地那份是旧的，覆盖上去就把人家的改动冲掉了。所以重复执行是安全的。
// 确实要用本地覆盖线上（比如上线前反复试搬），加 --overwrite。不删除线上已有、本地没有的数据。
// 预览（不加 --apply）会去线上只读地数一下：哪些已经在了、会被跳过。

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const DEMO = args.has('--include-demo');
const OVERWRITE = args.has('--overwrite');
const OUTBOX = args.has('--include-outbox');

const ROOT = path.join(process.cwd(), '.space-cache');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILE_RE = /^[a-z]+\/[A-Za-z0-9_-]{8,80}\.(jpg|png|webp)$/;
const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const TABLES = ['settings', 'events', 'registrations', 'bookings', 'greetings', 'outbox'];

function envFile() {
  try {
    return Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
      .filter(l => /^[A-Z0-9_]+=/.test(l))
      .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]; }));
  } catch {
    return {};
  }
}
const env = { ...envFile(), ...process.env };
// 换目标库时地址和 key 要一起给：只给地址的话，会把主库的 service role key 发到那个地址去
if (!!env.MIGRATE_SUPABASE_URL !== !!env.MIGRATE_SUPABASE_KEY) {
  console.error('MIGRATE_SUPABASE_URL 和 MIGRATE_SUPABASE_KEY 要一起设置');
  process.exit(1);
}
const URL_ = env.MIGRATE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.MIGRATE_SUPABASE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error('缺少 Supabase 地址或 service role key（.env.local 或 MIGRATE_SUPABASE_URL / MIGRATE_SUPABASE_KEY）');
  process.exit(1);
}
if (!existsSync(ROOT)) {
  console.error('没有 .space-cache/，没什么可搬的');
  process.exit(1);
}

const readJson = f => JSON.parse(readFileSync(f, 'utf8'));
const isDemo = row => /^\[演示\]/.test(String(row.title ?? row.name ?? ''));

// ── 1. 每个人的空间记录 ──
const records = readdirSync(ROOT)
  .filter(f => f.endsWith('.json') && UUID.test(f.slice(0, -5)))
  .map(f => ({ member_id: f.slice(0, -5).toLowerCase(), data: readJson(path.join(ROOT, f)) }));

// ── 2. 六张表 ──
const rows = [];
const skipped = { demo: 0, outbox: 0 };
for (const tbl of TABLES) {
  const file = path.join(ROOT, 'tables', `${tbl}.json`);
  if (!existsSync(file)) continue;
  for (const r of readJson(file)) {
    if (tbl === 'outbox' && !OUTBOX) { skipped.outbox++; continue; }
    if (!DEMO && tbl !== 'settings' && tbl !== 'outbox' && isDemo(r)) { skipped.demo++; continue; }
    if (typeof r.id !== 'string' || !r.id) throw new Error(`${tbl}: 有一行没有 id`);
    rows.push({ tbl, id: r.id, data: r });
  }
}
// 报名、预约、招呼不能挂在一个没搬的活动 / 不存在的人身上：活动被跳过了，它的报名也跳过
const eventIds = new Set(rows.filter(r => r.tbl === 'events').map(r => r.id));
const orphan = rows.filter(r => r.tbl === 'registrations' && !eventIds.has(r.data.eventId));
for (const o of orphan) rows.splice(rows.indexOf(o), 1);

// ── 3. 还被引用着的私有图片：收款码、活动封面、付款截图 ──
const files = new Set();
for (const r of rows) {
  const d = r.data;
  for (const f of [d.payQr, d.coverImage, d.proofFile]) if (typeof f === 'string' && FILE_RE.test(f)) files.add(f);
}
const missing = [...files].filter(f => !existsSync(path.join(ROOT, 'uploads', f)));

// ── 计划 ──
const byTbl = Object.fromEntries(TABLES.map(t => [t, rows.filter(r => r.tbl === t).length]));
console.log(`目标：${URL_}`);
console.log(`空间记录（AI 起稿、编辑、风格）：${records.length} 人`);
console.log(`表：${TABLES.map(t => `${t} ${byTbl[t]}`).join('，')}`);
for (const r of rows.filter(r => r.tbl === 'settings')) {
  console.log(`  设置 ${r.id.slice(0, 8)}… ${r.data.published ? '已发布' : '未发布'}${r.data.slug ? ` @${r.data.slug}` : ''}`);
}
for (const r of rows.filter(r => r.tbl === 'events')) console.log(`  活动「${r.data.title}」${r.data.status}`);
console.log(`跳过：演示数据 ${skipped.demo} 行${DEMO ? '' : '（--include-demo 可以一起搬）'}，待发邮件 ${skipped.outbox} 封，没有活动的报名 ${orphan.length} 条`);
console.log(`图片：${files.size} 张${missing.length ? `（本地找不到 ${missing.length} 张：${missing.join('、')}）` : ''}`);

const sb = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// 只读地看一眼线上：表在不在、哪些已经有了（默认会跳过它们）
const existingRecords = new Set();
for (let i = 0; i < records.length; i += 100) {
  const ids = records.slice(i, i + 100).map(r => r.member_id);
  const { data, error } = await sb.from('space_records').select('member_id').in('member_id', ids);
  if (error) {
    console.error(`\n读不到线上的 space_records：${error.message}\n先在 Supabase SQL Editor 里执行 supabase-space.sql。`);
    process.exit(1);
  }
  for (const r of data ?? []) existingRecords.add(r.member_id);
}
const existingRows = new Set();
for (const tbl of TABLES) {
  const ids = rows.filter(r => r.tbl === tbl).map(r => r.id);
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await sb.from('space_rows').select('id').eq('tbl', tbl).in('id', ids.slice(i, i + 100));
    if (error) {
      console.error(`\n读不到线上的 space_rows：${error.message}\n先在 Supabase SQL Editor 里执行 supabase-space.sql。`);
      process.exit(1);
    }
    for (const r of data ?? []) existingRows.add(`${tbl}:${r.id}`);
  }
}
const { error: bucketError } = await sb.storage.getBucket('space-private');
if (bucketError) {
  console.error(`\n线上还没有 space-private 这个桶：${bucketError.message}\n先执行 supabase-space.sql。`);
  process.exit(1);
}
const recordsToWrite = OVERWRITE ? records : records.filter(r => !existingRecords.has(r.member_id));
const rowsToWrite = OVERWRITE ? rows : rows.filter(r => !existingRows.has(`${r.tbl}:${r.id}`));
console.log(`线上已经有：空间记录 ${existingRecords.size} 人，表 ${existingRows.size} 行——${OVERWRITE ? '会用本地的覆盖（--overwrite）' : '会跳过，不动线上那份'}`);
console.log(`要写：空间记录 ${recordsToWrite.length} 人，表 ${rowsToWrite.length} 行`);

if (!APPLY) {
  console.log('\n这是预览，什么都没写。确认无误后加 --apply 再执行一次。');
  process.exit(0);
}

const stamp = new Date().toISOString();

// 图片先传：表里一出现引用，图就得已经在桶里
let uploaded = 0;
for (const f of files) {
  const local = path.join(ROOT, 'uploads', f);
  if (!existsSync(local)) continue;
  const { error } = await sb.storage.from('space-private')
    .upload(f, readFileSync(local), { contentType: MIME[f.split('.').pop()], upsert: false });
  // 同名已经在桶里：文件名是随机的，同名就是同一张，跳过
  if (error && !/exist|duplicate/i.test(error.message)) throw new Error(`传图片 ${f} 失败：${error.message}`);
  if (!error) uploaded++;
}
console.log(`✓ 图片 ${uploaded}（已在桶里的 ${files.size - uploaded - missing.length} 张跳过）`);

for (let i = 0; i < recordsToWrite.length; i += 100) {
  const batch = recordsToWrite.slice(i, i + 100).map(r => ({ ...r, updated_at: stamp }));
  const { error } = await sb.from('space_records').upsert(batch, { onConflict: 'member_id', ignoreDuplicates: !OVERWRITE });
  if (error) throw new Error(`写空间记录失败：${error.message}`);
}
console.log(`✓ 空间记录 ${recordsToWrite.length}`);

for (let i = 0; i < rowsToWrite.length; i += 200) {
  const batch = rowsToWrite.slice(i, i + 200).map(r => ({ ...r, updated_at: stamp }));
  const { error } = await sb.from('space_rows').upsert(batch, { onConflict: 'tbl,id', ignoreDuplicates: !OVERWRITE });
  if (error) throw new Error(`写表失败：${error.message}`);
}
console.log(`✓ 表 ${rowsToWrite.length} 行`);
console.log('搬完了。');
