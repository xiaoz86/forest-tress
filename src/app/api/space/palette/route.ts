import { NextRequest, NextResponse } from 'next/server';
import { gateHost, isFail } from '@/lib/space/gate';
import { canOptimize } from '@/lib/space/image';
import { colorName, fromHsl, hsl, toHex, usableAccent } from '@/lib/space/tune';

export const runtime = 'nodejs';
export const maxDuration = 30;

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const MAX_BYTES = 12 * 1024 * 1024;

type Swatch = { hex: string; name: string; from: string };

/** 头像、作品图的文件名带上传时间戳，同一个地址内容不变：按地址缓存在进程里 */
const cache = new Map<string, string[]>();

async function download(url: string): Promise<Buffer | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: 'no-store', redirect: 'error' });
  if (!res.ok || !res.body) return null;
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_BYTES) return null;
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    got += value.length;
    if (got > MAX_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
  return Buffer.concat(parts);
}

/**
 * 从一张照片里取几种能当强调色的颜色。
 * 按色相分桶累加：离画面中心越远权重越高（人像照片中间多半是脸，周围的景才是这个人选的颜色），
 * 越鲜的像素权重越高；几乎黑、几乎白、几乎灰的不算。最后挑色相彼此差得开的几桶。
 */
async function colorsOf(url: string): Promise<string[]> {
  if (cache.has(url)) return cache.get(url)!;
  const buf = await download(url);
  if (!buf) return [];
  const sharp = (await import('sharp')).default;
  // 像素上限：挡住「文件很小、解开巨大」的图
  const { data, info } = await sharp(buf, { failOn: 'none', limitInputPixels: 60_000_000 })
    .rotate().resize(72, 72, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });

  const BUCKETS = 24;
  const acc = Array.from({ length: BUCKETS }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  const cx = info.width / 2;
  const cy = info.height / 2;
  const maxD = Math.hypot(cx, cy);
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const [h, s, l] = hsl(toHex([r, g, b]));
      if (l < 0.1 || l > 0.92 || s < 0.14) continue;
      const w = (0.4 + Math.hypot(x - cx, y - cy) / maxD) * (0.3 + s);
      const k = Math.floor(h / (360 / BUCKETS)) % BUCKETS;
      acc[k].w += w;
      acc[k].r += r * w;
      acc[k].g += g * w;
      acc[k].b += b * w;
    }
  }
  const total = acc.reduce((s, a) => s + a.w, 0);
  const picked: string[] = [];
  const hues: number[] = [];
  for (const a of [...acc].sort((x, y) => y.w - x.w)) {
    if (!a.w || a.w < total * 0.04 || picked.length >= 4) break;
    const avg = toHex([a.r / a.w, a.g / a.w, a.b / a.w]);
    const [h, s, l] = hsl(avg);
    if (hues.some(x => Math.min(Math.abs(x - h), 360 - Math.abs(x - h)) < 30)) continue;
    // 照片里的颜色往往偏浅偏灰：收进强调色范围之前先压深一点、提一点饱和
    const hex = usableAccent(fromHsl(h, Math.max(s, 0.3), Math.min(l, 0.42)));
    if (!hex) continue;
    picked.push(hex);
    hues.push(h);
  }
  cache.set(url, picked);
  return picked;
}

/**
 * GET /api/space/palette?id=… —— 本人或管理员：从头像和作品图里取强调色候选。
 * 只读我们自己 Supabase 公开桶里的图（canOptimize），别的地址一律不去请求。
 */
export async function GET(request: NextRequest) {
  const g = await gateHost(request.nextUrl.searchParams.get('id'));
  if (isFail(g)) return NextResponse.json({ error: g.error }, { status: g.status });

  const sources: { url: string; from: string }[] = [];
  if (g.node.avatar_url && canOptimize(g.node.avatar_url)) sources.push({ url: g.node.avatar_url, from: '照片' });
  for (const w of g.node.works || []) {
    if (sources.length >= 4) break;
    if (w.image_url && canOptimize(w.image_url)) sources.push({ url: w.image_url, from: `「${w.title}」` });
  }
  if (!sources.length) {
    return NextResponse.json({ swatches: [], message: '还没有上传照片或作品图，先用现成的颜色吧。' }, { headers: NO_STORE });
  }

  const swatches: Swatch[] = [];
  const results = await Promise.allSettled(sources.map(s => colorsOf(s.url)));
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    for (const hex of r.value) {
      // 和已经取到的颜色太像就不要了
      const [h, , l] = hsl(hex);
      const close = swatches.some(x => {
        const [h2, , l2] = hsl(x.hex);
        const dh = Math.min(Math.abs(h - h2), 360 - Math.abs(h - h2));
        return dh < 20 && Math.abs(l - l2) < 0.1;
      });
      if (!close) swatches.push({ hex, name: colorName(hex), from: sources[i].from });
    }
  });
  if (results.every(r => r.status === 'rejected')) {
    return NextResponse.json({ swatches: [], message: '照片暂时读不到，过一会再试。' }, { headers: NO_STORE });
  }
  return NextResponse.json({ swatches: swatches.slice(0, 6) }, { headers: NO_STORE });
}
