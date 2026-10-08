import 'server-only';

/**
 * 给 next/og（ImageResponse）用的中文字体。
 *
 * ImageResponse 自带的字体没有中文字形；整套思源宋体/黑体十几 MB，不能打包进来。
 * 做法：按这张图实际用到的字，向 Google Fonts CSS2 接口要一份子集（几 KB 到几十 KB）。
 * 不带浏览器 User-Agent 请求时，它给的是 truetype——Satori 只认 ttf/otf/woff，不认 woff2。
 *
 * 按（字体、字重、文字）缓存在进程内存里；加载失败时返回空数组，调用方照样出图（中文会退成默认字形或方框，但不 500）。
 */

export type OgFamily = 'Noto Serif SC' | 'Noto Sans SC';

export type OgFont = { name: string; data: ArrayBuffer; weight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900; style: 'normal' };

type Weight = OgFont['weight'];

const TIMEOUT_MS = 6_000;
/** 失败的结果也记一会儿：Google 连不上时，别让每张图都等满超时 */
const FAIL_TTL_MS = 60_000;
const MAX_ENTRIES = 300;

type Entry = { at: number; data: Promise<ArrayBuffer | null> };
const cache = new Map<string, Entry>();

/** 去重、排序：同样的字集合，不管出现顺序，都命中同一份缓存 */
function charset(text: string): string {
  const set = new Set<string>();
  for (const ch of text) if (!/\s/.test(ch)) set.add(ch);
  return [...set].sort().join('');
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}

async function download(family: OgFamily, weight: Weight, chars: string): Promise<ArrayBuffer | null> {
  const api = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@${weight}&text=${encodeURIComponent(chars)}`;
  try {
    const css = await fetchWithTimeout(api);
    if (!css.ok) return null;
    const text = await css.text();
    const m = /src:\s*url\(([^)]+)\)\s*format\(['"]?(truetype|opentype|woff)['"]?\)/.exec(text);
    if (!m) return null;
    const font = await fetchWithTimeout(m[1].replace(/^['"]|['"]$/g, ''));
    if (!font.ok) return null;
    return await font.arrayBuffer();
  } catch (err) {
    console.warn('[space] og font load failed', family, weight, (err as Error).message);
    return null;
  }
}

function load(family: OgFamily, weight: Weight, chars: string): Promise<ArrayBuffer | null> {
  const key = `${family}|${weight}|${chars}`;
  const hit = cache.get(key);
  if (hit) {
    // 成功的一直留着；失败的过了 FAIL_TTL_MS 再试
    const stale = Date.now() - hit.at > FAIL_TTL_MS;
    if (!stale) return hit.data;
    return hit.data.then(d => (d ? d : refresh()));
  }
  return refresh();

  function refresh(): Promise<ArrayBuffer | null> {
    const data = download(family, weight, chars);
    cache.set(key, { at: Date.now(), data });
    if (cache.size > MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    return data;
  }
}

export type FontRequest = { family: OgFamily; weight: number; text: string };

function toWeight(w: number): Weight {
  const r = Math.round(Math.min(900, Math.max(100, w)) / 100) * 100;
  return r as Weight;
}

/**
 * 一次取好这张图要的几份字体。同一（字体、字重）的多段文字会合并成一份子集。
 * 返回值可以直接给 ImageResponse 的 fonts；font-family 用 family 本身的名字。
 */
export async function loadOgFonts(reqs: FontRequest[]): Promise<OgFont[]> {
  const merged = new Map<string, { family: OgFamily; weight: Weight; text: string }>();
  for (const r of reqs) {
    const weight = toWeight(r.weight);
    const k = `${r.family}|${weight}`;
    const cur = merged.get(k);
    merged.set(k, { family: r.family, weight, text: (cur?.text ?? '') + r.text });
  }
  const out = await Promise.all([...merged.values()].map(async (m): Promise<OgFont | null> => {
    const chars = charset(m.text);
    if (!chars) return null;
    const data = await load(m.family, m.weight, chars);
    return data ? { name: m.family, data, weight: m.weight, style: 'normal' } : null;
  }));
  return out.filter((f): f is OgFont => !!f);
}

/** 主题的字体栈里有衬线字就用思源宋体，否则思源黑体 */
export function familyFor(stack: string): OgFamily {
  return /serif/i.test(stack) && !/sans-serif/i.test(stack) ? 'Noto Serif SC' : 'Noto Sans SC';
}
