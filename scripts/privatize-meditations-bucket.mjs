#!/usr/bin/env node
/**
 * 把 meditations 桶从公开转私有，并把老数据里的完整 URL 换成对象路径。
 *
 * 为什么要这么做：公开桶存的是 getPublicUrl() 拿到的永久链接——不会过期、
 * 谁拿到谁能听、转发进微信群就漏了。对一个收 68 元的产品这是必须堵上的。
 * 转私有之后，取用一律走 /api/meditations/stream，那条路由校验资格后
 * 现发一条一小时有效的签名链接。
 *
 * 顺序很重要：先迁数据，再翻桶。反过来的话，中间那段时间线上音频全 404。
 *
 *   node --env-file=.env.local scripts/privatize-meditations-bucket.mjs --dry
 *   node --env-file=.env.local scripts/privatize-meditations-bucket.mjs
 */

import { createClient } from '@supabase/supabase-js';

const CONTENT_ID = 'forest-breath';
const BUCKET = 'meditations';
const DRY = process.argv.includes('--dry');

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

// ---- 1. 迁移 payload 里的 audioUrl → audioPath ----
const { data, error } = await sb
  .from('meditation_content')
  .select('payload')
  .eq('id', CONTENT_ID)
  .maybeSingle();
if (error || !data?.payload) {
  console.error('读取内容失败:', error?.message || '没有记录');
  process.exit(1);
}

const payload = data.payload;
const tracks = (payload.tracks || []).map(t => ({ ...t }));
let migrated = 0;
let failed = [];

for (const t of tracks) {
  if (t.audioPath || !t.audioUrl) continue;
  const path = toPath(t.audioUrl);
  if (!path) {
    failed.push(`${t.id} (${t.audioUrl})`);
    continue;
  }
  t.audioPath = path;
  delete t.audioUrl;
  migrated += 1;
  console.log(`  ${t.id}  →  ${path}`);
}

console.log(`\n迁移: ${migrated} 段 audioUrl → audioPath`);
if (failed.length) {
  console.log('解析不出路径的（保持原样，需要手工看）:');
  failed.forEach(f => console.log('  ' + f));
}

const withPath = tracks.filter(t => t.audioPath).length;
console.log(`结果: ${tracks.length} 段曲目，其中 ${withPath} 段有音频`);

// ---- 2. 确认签名链接真的能用，再翻桶 ----
const probe = tracks.find(t => t.audioPath);
if (probe) {
  const { data: signed, error: signErr } = await sb.storage
    .from(BUCKET)
    .createSignedUrl(probe.audioPath, 60);
  if (signErr || !signed?.signedUrl) {
    console.error(`\n签名失败，中止：${signErr?.message}`);
    console.error('（没验证通过就翻桶的话，线上音频会全部 404）');
    process.exit(1);
  }
  const res = await fetch(signed.signedUrl, { method: 'HEAD' });
  console.log(`\n签名链接自检 (${probe.id}): HTTP ${res.status}`);
  if (!res.ok) {
    console.error('签名链接取不到内容，中止。');
    process.exit(1);
  }
}

if (DRY) {
  console.log('\n--dry：没有写入，桶也没动。');
  process.exit(0);
}

// ---- 3. 写回内容 ----
if (migrated > 0) {
  const { error: upErr } = await sb.from('meditation_content').upsert({
    id: CONTENT_ID,
    payload: { ...payload, tracks },
    updated_at: new Date().toISOString(),
  });
  if (upErr) {
    console.error('写回内容失败，桶保持公开:', upErr.message);
    process.exit(1);
  }
  console.log('\n内容已写回。');
}

// ---- 4. 最后才翻桶 ----
const { error: bErr } = await sb.storage.updateBucket(BUCKET, { public: false });
if (bErr) {
  console.error('翻桶失败:', bErr.message);
  process.exit(1);
}

const { data: buckets } = await sb.storage.listBuckets();
const b = (buckets || []).find(x => x.name === BUCKET);
console.log(`桶 ${BUCKET}: public = ${b?.public}`);
console.log('\n完成。音频现在只能通过 /api/meditations/stream 取。');
