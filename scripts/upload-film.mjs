#!/usr/bin/env node
/**
 * 把一支影片和它的封面传进 films 桶，再写回对应的曲目。
 *
 * 为什么不做成管理页里的一个上传框：影片是几十兆的东西，走 /api 就得先
 * 整个塞进一次 Vercel 函数调用，超时和内存都在跟你作对。这里用 service key
 * 直连存储，和在 Supabase 控制台里拖是一回事——upload-sleep-audio.mjs
 * 当初也是为了同一个原因写的。管理页留的是「粘贴地址」那条路。
 *
 * films 是公开桶，和音频的私有桶不一样：影像免费公开，没有资格要校验，
 * 套一层签名链接只会多一次跳转，还让 CDN 缓存不住。
 *
 * 传之前先转码。原片一般是 1GB 起的母带，直接传上去每个访客都要替你付流量：
 *
 *   ffmpeg -i 原片.mp4 -vf scale=1920:-2 -c:v libx264 -preset slow -crf 23 \
 *     -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart 影片.mp4
 *
 *   # 画面整片不动（配旁白的一张图）时，用这一版，能小上十倍：
 *   ffmpeg -ss 2 -i 原片.mp4 -frames:v 1 -vf scale=1920:-2 静帧.png
 *   ffmpeg -loop 1 -framerate 25 -i 静帧.png -i 原片.mp4 -map 0:v -map 1:a \
 *     -c:v libx264 -preset medium -crf 22 -g 1250 -keyint_min 1250 -sc_threshold 0 \
 *     -pix_fmt yuv420p -c:a copy -shortest -movflags +faststart 影片.mp4
 *
 * 时长用 ffprobe 从本地文件读，格式和 link-sleep-audio.mjs 保持一致。
 *
 *   node --env-file=.env.local scripts/upload-film.mjs \
 *     --track solar-chushu --video ./处暑.mp4 --poster ./处暑.jpg --dry
 */

import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { createClient } from '@supabase/supabase-js';

const run = promisify(execFile);

const BUCKET = 'films';
const CONTENT_ID = 'forest-breath';
// 桶级上限。项目本身还有一道全局上限（免费版默认 50MB），
// 建桶时要是被它顶回来，下面会退成「不指定上限」，跟着项目走。
const MAX_BYTES = 200 * 1024 * 1024;

const VIDEO_MIME = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime' };
const IMAGE_MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : '';
}

const DRY = process.argv.includes('--dry');
const trackId = arg('track').trim();
const videoPath = arg('video').trim();
const posterPath = arg('poster').trim();

if (!trackId || !videoPath) {
  console.error('用法: node --env-file=.env.local scripts/upload-film.mjs --track <曲目 id> --video <文件> [--poster <封面>] [--dry]');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('缺 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const sb = createClient(url, key);

/** 时长读出来是「16 分钟」这种样子，和睡眠那边一致 */
async function probeDuration(file) {
  try {
    const { stdout } = await run('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', file,
    ], { timeout: 30_000 });
    const secs = Number(String(stdout).trim());
    if (!Number.isFinite(secs) || secs <= 0) return '';
    return `${Math.round(secs / 60)} 分钟`;
  } catch {
    // 没装 ffmpeg 也能传，只是时长得自己去管理页填
    return '';
  }
}

const videoExt = path.extname(videoPath).toLowerCase();
if (!VIDEO_MIME[videoExt]) {
  console.error(`认不出的影片格式: ${videoExt}（支持 ${Object.keys(VIDEO_MIME).join(' / ')}）`);
  process.exit(1);
}
const posterExt = posterPath ? path.extname(posterPath).toLowerCase() : '';
if (posterPath && !IMAGE_MIME[posterExt]) {
  console.error(`认不出的封面格式: ${posterExt}（支持 ${Object.keys(IMAGE_MIME).join(' / ')}）`);
  process.exit(1);
}

const { size } = await stat(videoPath);
const duration = await probeDuration(videoPath);

// 先确认曲目真的在，别传完了才发现 id 敲错——那会在桶里留下一个没人认领的文件
const { data: row, error: readErr } = await sb
  .from('meditation_content').select('payload').eq('id', CONTENT_ID).maybeSingle();
if (readErr || !row?.payload) {
  console.error('读取内容失败:', readErr?.message || '没有记录');
  process.exit(1);
}
const payload = row.payload;
const idx = (payload.tracks || []).findIndex(t => t.id === trackId);
if (idx < 0) {
  console.error(`库里没有 id 为「${trackId}」的条目。先跑 seed-seasons.mjs，或去管理页加一条。`);
  process.exit(1);
}

const stamp = Date.now();
const videoDest = `${trackId}/${stamp}${videoExt}`;
const posterDest = posterPath ? `${trackId}/${stamp}-poster${posterExt}` : '';

console.log(`曲目   ${trackId}  「${payload.tracks[idx].title}」`);
console.log(`影片   ${(size / 1048576).toFixed(1)} MB  →  ${BUCKET}/${videoDest}`);
if (posterDest) {
  const poster = await stat(posterPath);
  console.log(`封面   ${(poster.size / 1024).toFixed(0)} KB  →  ${BUCKET}/${posterDest}`);
}
if (duration) console.log(`时长   ${duration}`);

if (size > MAX_BYTES) {
  console.error(`\n影片超过 ${MAX_BYTES / 1048576} MB，先转码压一下再传。`);
  process.exit(1);
}

if (DRY) {
  console.log('\n--dry：没有上传。');
  process.exit(0);
}

// 建桶。公开、只收影片和图片。
try {
  const list = await sb.storage.listBuckets();
  if (list.data && !list.data.some(b => b.name === BUCKET)) {
    const allowed = [...Object.values(VIDEO_MIME), ...Object.values(IMAGE_MIME)];
    let { error } = await sb.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_BYTES,
      allowedMimeTypes: allowed,
    });
    if (error) {
      // 多半是撞上了项目的全局上传上限。退成不指定，跟着项目默认走。
      console.log(`建桶时带上限被拒（${error.message}），改成跟随项目默认上限再试`);
      ({ error } = await sb.storage.createBucket(BUCKET, {
        public: true,
        allowedMimeTypes: allowed,
      }));
      if (error) throw new Error(error.message);
    }
    console.log(`已新建公开桶 ${BUCKET}`);
  }
} catch (err) {
  console.error('建桶失败:', err.message);
  process.exit(1);
}

async function put(dest, file, contentType) {
  process.stdout.write(`  传 ${dest} … `);
  const buf = await readFile(file);
  const { error } = await sb.storage.from(BUCKET).upload(dest, buf, {
    contentType,
    upsert: true,
    // 路径里带时间戳，同一个地址的内容永远不会变，所以放心让 CDN 长期留着。
    // 不设的话默认发的是 no-cache——每看一次就从源站整个拉一遍，
    // 一支三十兆的影片，流量账单会很快让人后悔。
    cacheControl: '31536000',
  });
  if (error) {
    console.log('失败');
    throw new Error(error.message);
  }
  console.log('OK');
  return sb.storage.from(BUCKET).getPublicUrl(dest).data.publicUrl;
}

let videoUrl = '';
let posterUrl = '';
try {
  videoUrl = await put(videoDest, videoPath, VIDEO_MIME[videoExt]);
  if (posterDest) posterUrl = await put(posterDest, posterPath, IMAGE_MIME[posterExt]);
} catch (err) {
  console.error('上传失败:', err.message);
  process.exit(1);
}

const next = { ...payload.tracks[idx], videoUrl };
if (posterUrl) next.posterUrl = posterUrl;
// 时长只在原来空着的时候补，别把主理人手写的「16 分钟左右」冲掉
if (duration && !next.duration) next.duration = duration;
const tracks = [...payload.tracks];
tracks[idx] = next;

const { error: updErr } = await sb.from('meditation_content').upsert({
  id: CONTENT_ID,
  payload: { ...payload, tracks },
  updated_at: new Date().toISOString(),
});
if (updErr) {
  console.error('写库失败:', updErr.message);
  console.error('文件已经在桶里了，地址是：', videoUrl);
  console.error('可以到管理页把它粘进「影片地址」。');
  process.exit(1);
}

console.log('\n完成。');
console.log('影片地址:', videoUrl);
if (posterUrl) console.log('封面地址:', posterUrl);
