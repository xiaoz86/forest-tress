import 'server-only';
import { canOptimize } from './image';

/**
 * 首屏要不要用这张照片做背景：看它转正之后有多大。
 *
 * 只取文件头（前 128KB）读尺寸，不下载整张图——头像原图常常 1–2MB，Supabase 免费版又不缓存。
 * JPEG 要看 EXIF 方向：手机拍的竖图常常存成横的、带 Orientation=6（小Z 的头像就是这样），
 * 转正之后宽高对调，按存储的尺寸判断会判错。
 *
 * 头像文件名带上传时间戳，同一个地址内容不变，结果按地址缓存在进程里。
 * 读失败一律返回 null——调用方当作「可以用」处理，宁可用图，也不因为一次网络抖动丢掉照片。
 */

export type PhotoMeta = { w: number; h: number };

const cache = new Map<string, PhotoMeta | null>();
const HEAD_BYTES = 131072;

function jpegSize(b: Uint8Array): PhotoMeta | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let orientation = 1;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = (b[i + 2] << 8) | b[i + 3];
    // APP1 / Exif：找方向标签 0x0112
    if (marker === 0xe1 && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66) {
      const t = i + 10;
      const le = b[t] === 0x49;
      const u16 = (o: number) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
      const u32 = (o: number) => (le
        ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
        : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0);
      const ifd = t + u32(t + 4);
      const n = ifd + 2 <= b.length ? u16(ifd) : 0;
      for (let k = 0; k < n; k++) {
        const e = ifd + 2 + k * 12;
        if (e + 10 > b.length) break;
        if (u16(e) === 0x0112) { orientation = u16(e + 8); break; }
      }
    }
    // SOF0–SOF15（C4 DHT、C8 JPG、CC DAC 除外）里有高和宽
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const h = (b[i + 5] << 8) | b[i + 6];
      const w = (b[i + 7] << 8) | b[i + 8];
      return orientation >= 5 && orientation <= 8 ? { w: h, h: w } : { w, h };
    }
    i += 2 + len;
  }
  return null;
}

function pngSize(b: Uint8Array): PhotoMeta | null {
  if (b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { w: v.getUint32(16), h: v.getUint32(20) };
}

function webpSize(b: Uint8Array): PhotoMeta | null {
  const tag = (o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WEBP') return null;
  const chunk = tag(12);
  if (chunk === 'VP8X') {
    return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
  }
  if (chunk === 'VP8 ') return { w: (b[26] | (b[27] << 8)) & 0x3fff, h: (b[28] | (b[29] << 8)) & 0x3fff };
  if (chunk === 'VP8L') {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

export async function photoMeta(url: string): Promise<PhotoMeta | null> {
  // 服务端只去请求我们自己的 Supabase 公开桶：avatar_url 现在只能由头像上传接口写入，
  // 但这里不依赖那个前提——任何别的地址都不发请求，免得被拿来探内网
  if (!canOptimize(url)) return null;
  if (cache.has(url)) return cache.get(url)!;
  let meta: PhotoMeta | null = null;
  try {
    const res = await fetch(url, {
      headers: { Range: `bytes=0-${HEAD_BYTES - 1}` },
      signal: AbortSignal.timeout(4000),
      cache: 'no-store',
      // 只读自己桶里的地址；跳转到别处一律不跟
      redirect: 'error',
    });
    if (res.ok) {
      // 服务器不认 Range 时会回整张图：只读前 128KB 就停
      const reader = res.body?.getReader();
      const parts: Uint8Array[] = [];
      let got = 0;
      while (reader && got < HEAD_BYTES) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        parts.push(value);
        got += value.length;
      }
      await reader?.cancel().catch(() => {});
      const b = new Uint8Array(got);
      let o = 0;
      for (const p of parts) { b.set(p, o); o += p.length; }
      meta = jpegSize(b) ?? pngSize(b) ?? webpSize(b);
    }
  } catch {
    meta = null;
  }
  // 只缓存读成功的结果：失败可能只是网络抖了一下，下次再试
  if (meta) cache.set(url, meta);
  return meta;
}

/** 短边不到这么多像素，铺满首屏会糊：改成纸上的一张小相片 */
const MIN_SHORT_SIDE = 700;

export type CoverPhoto = 'photo' | 'stamp' | 'none';

export async function coverPhotoMode(url: string | null | undefined): Promise<CoverPhoto> {
  if (!url) return 'none';
  // HEIC/HEIF 浏览器大多不认、next/image 也缩不了
  if (/\.(heic|heif)(\?|$)/i.test(url)) return 'none';
  const meta = await photoMeta(url);
  if (meta && Math.min(meta.w, meta.h) < MIN_SHORT_SIDE) return 'stamp';
  return 'photo';
}
