import 'server-only';
import { getSiteOrigin } from '@/lib/notify';
import type { SpaceTheme } from './themes';

/**
 * 名片图和分享图共用的小工具：配色、头像。
 */

export type Palette = {
  bg: string;
  ink: string;
  soft: string;
  meta: string;
  accent: string;
  line: string;
  /** 没有头像时的色块和首字 */
  blockBg: string;
  blockInk: string;
};

/**
 * 深色纸幅的主题（林间米白、陶土手作）用首屏纸幅的颜色，浅色的用网站底色——
 * 名片拿在手里，第一眼要和打开网站看到的首屏是同一种气质。
 */
export function paletteOf(theme: SpaceTheme): Palette {
  const t = theme.tokens;
  if (t.cover === 'dark') {
    return {
      bg: t.sheet, ink: t.sheetInk, soft: t.sheetSoft, meta: t.sheetSoft, accent: t.sheetInk,
      line: t.sheetSoft, blockBg: t.coverBase, blockInk: t.sheetInk,
    };
  }
  return {
    bg: t.bg, ink: t.ink, soft: t.inkSoft, meta: t.meta, accent: t.accentText,
    line: t.line, blockBg: t.accentSoft, blockInk: t.accentText,
  };
}

const TIMEOUT_MS = 6_000;
const MAX_BYTES = 6_000_000;
const OK_TYPES = /^image\/(png|jpe?g|gif)\b/i;

async function grab(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: 'no-store',
      redirect: 'error',
      // Satori 不认 webp/avif：跟图片优化器要 jpeg/png
      headers: { Accept: 'image/png,image/jpeg;q=0.9,image/gif;q=0.5' },
    });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || '';
    if (!OK_TYPES.test(type)) return null;
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) return null;
    return `data:${type.split(';')[0]};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 头像转成 data URL 交给 ImageResponse（它自己去拉的话，拉失败整张图 500）。
 *
 * 先走站内的 /_next/image 缩到 640 宽：Supabase 对公开对象不缓存、每次整拉原图（动辄几 MB），
 * 优化器会缓存缩好的副本。优化器拒绝（不是放行的桶）或失败时再直接拉原图。
 * 都失败就返回 null，调用方画主题色块 + 名字首字。
 */
export async function avatarDataUrl(avatarUrl: string | null, requestOrigin: string): Promise<string | null> {
  if (!avatarUrl || !/^https:\/\//i.test(avatarUrl)) return null;
  // 生产环境用站点地址，不信请求头里的 Host
  const self = process.env.NODE_ENV === 'production' ? getSiteOrigin() : requestOrigin;
  const optimized = `${self}/_next/image?url=${encodeURIComponent(avatarUrl)}&w=640&q=75`;
  return (await grab(optimized)) ?? (fromSupabase(avatarUrl) ? await grab(avatarUrl) : null);
}

/** 直接拉原图只限自家的 Supabase 存储，不替任意地址发请求 */
function fromSupabase(url: string): boolean {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return false;
  try {
    return new URL(url).host === new URL(base).host;
  } catch {
    return false;
  }
}
