#!/usr/bin/env node
/**
 * 把收款码传进私有的 meditations 桶。
 *
 * 不放 public/：那样即使页面不显示，知道地址的人照样能取，
 * 也就能把主理人的收款码贴到别处去。放进桶里之后，
 * 取用一律走 /api/meditations/pay-qr —— 那条路由会验「有没有待确认的申请」，
 * 所以只有真正走到付款那一步的人才拿得到。
 *
 *   node --env-file=.env.local scripts/upload-pay-qr.mjs <图片路径>
 */

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'meditations';
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

const src = process.argv[2];
if (!src) {
  console.error('用法: node --env-file=.env.local scripts/upload-pay-qr.mjs <图片路径>');
  process.exit(1);
}

const ext = path.extname(src).toLowerCase();
if (!MIME[ext]) {
  console.error(`不支持的格式 ${ext}，只收 jpg / png / webp`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('缺 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const sb = createClient(url, key);

const { size } = await stat(src);
const buf = await readFile(src);
// 后缀跟着源文件走，pay-qr 路由那边会挨个后缀试
const dest = `_pay/qr${ext === '.jpeg' ? '.jpg' : ext}`;

// meditations 原本只容许音频。收款码也放在这个私有桶里，
// 所以上传前把图片 MIME 补进白名单；已有的音频类型原样保留。
const { data: bucket, error: bucketError } = await sb.storage.getBucket(BUCKET);
if (bucketError || !bucket) {
  console.error('读取 meditations 桶失败:', bucketError?.message || '桶不存在');
  process.exit(1);
}
if (bucket.public) {
  console.error('meditations 桶不是私有桶，为避免暴露收款码，已停止上传');
  process.exit(1);
}
const imageMimes = [...new Set(Object.values(MIME))];
const allowed = Array.isArray(bucket.allowed_mime_types) ? bucket.allowed_mime_types : [];
if (imageMimes.some(type => !allowed.includes(type))) {
  const { error: updateError } = await sb.storage.updateBucket(BUCKET, {
    allowedMimeTypes: [...new Set([...allowed, ...imageMimes])],
  });
  if (updateError) {
    console.error('更新 meditations 桶格式白名单失败:', updateError.message);
    process.exit(1);
  }
}

const { error } = await sb.storage.from(BUCKET).upload(dest, buf, {
  contentType: MIME[ext],
  upsert: true,
});
if (error) {
  console.error('上传失败:', error.message);
  process.exit(1);
}

// 换过格式的话，把旧后缀那几份清掉，免得路由取到过期的那张
const stale = ['.jpg', '.png', '.webp'].filter(e => e !== (ext === '.jpeg' ? '.jpg' : ext));
await sb.storage.from(BUCKET).remove(stale.map(e => `_pay/qr${e}`));

console.log(`已上传 ${(size / 1024).toFixed(0)} KB → ${dest}`);
console.log('桶是私有的，取用走 /api/meditations/pay-qr（需要有待确认的申请）。');
