import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { fetchMember } from '@/lib/space/access';
import { findBySlugOrPrevious, getSettings, spaceMode } from '@/lib/space/settings';
import { isMemberId } from '@/lib/space/store';
import { SLUG_RE, type SpaceSettings } from '@/lib/space/types';
import { cardCookieName } from '@/lib/space/viewer';

export const runtime = 'nodejs';

const YEAR = 60 * 60 * 24 * 365;

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return '';
  }
}

/** 相对地址的 302：不依赖请求里的 Host（经过 rewrite / 反向代理时它不一定是对外的域名） */
function go(path: string): NextResponse {
  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: path,
      'Cache-Control': 'private, no-store',
      // 口令在这次请求的地址里：不要通过 Referer 带到下一个页面引用的任何资源上
      'Referrer-Policy': 'no-referrer',
    },
  });
}

/** 这个人现在的地址：有短链去短链，没有去 /space/<id> */
function currentPath(s: SpaceSettings): string {
  return s.slug ? `/@${s.slug}` : `/space/${s.id}`;
}

/**
 * 扫名片。认三种写法：
 * - /c/<成员 id>/<口令>（现在的名片二维码；next.config rewrite 到这里）
 * - /@<短链>/k/<口令>（老名片；短链改过也认，旧短链会记在 previousSlugs 里）
 * - /api/space/card-scan?id=…&k=… 或 ?slug=…&k=…
 *
 * 经 rewrite 进来时，路由拿到的 request.nextUrl 仍是原地址（实测 Next 16.2），查询参数里没有 id、slug、k：从路径里取。
 *
 * 口令对：记下「扫过我名片」（cookie，一年），再跳到这个人现在的地址；地址栏里不留口令，免得被二次转发。
 * 口令不对（比如本人换过口令，旧名片还在别人手里）：不报错、不设 cookie，照样跳过去——看到的就是公开的那一版。
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const path = request.nextUrl.pathname;
  const byId = /^\/c\/([^/]+)\/([^/]+)\/?$/.exec(path);
  const bySlug = /^\/@([^/]+)\/k\/([^/]+)\/?$/.exec(path);
  const k = (q.get('k') || (byId ? decode(byId[2]) : bySlug ? decode(bySlug[2]) : '')).trim();
  const rawSlug = (q.get('slug') || (bySlug ? decode(bySlug[1]) : '')).trim().toLowerCase();
  const rawId = (q.get('id') || (byId ? decode(byId[1]) : '')).trim().toLowerCase();

  let settings: SpaceSettings | null = null;
  let fallback = '/';
  if (rawId) {
    if (!isMemberId(rawId)) return go('/');
    fallback = `/space/${rawId}`;
    settings = await getSettings(rawId);
  } else if (rawSlug) {
    if (!SLUG_RE.test(rawSlug)) return go('/');
    fallback = `/@${rawSlug}`;
    settings = (await findBySlugOrPrevious(rawSlug))?.settings ?? null;
  }
  if (!settings) return go(fallback);

  // 对访客开着（发布了、人还在森林里）：跳到这个人现在的地址——没有短链时发出去的名片、短链改过之后的老名片，扫码都落在现在的地址上。
  // 否则按扫到的地址原样走（访客那边是 404），不透出新短链或成员 id；本人扫到旧短链，/s/[slug] 会再把 TA 带到现在的地址
  let open = false;
  if (settings.published) {
    try {
      const node = await fetchMember(settings.id);
      open = !!node && spaceMode(settings, node) === 'full';
    } catch {
      // 读不到成员资料：按没开着处理，宁可落到 404 也不透出新地址
    }
  }
  const res = go(open ? currentPath(settings) : fallback);
  if (k && same(k, settings.cardToken)) {
    res.cookies.set(cardCookieName(settings.id), settings.cardToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: YEAR,
    });
  }
  return res;
}
