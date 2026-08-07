import { NextRequest, NextResponse } from 'next/server';
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, getLocaleDetail, normalizeLocale } from '@/lib/locale';

export const runtime = 'nodejs';

/**
 * GET  /api/locale        当前语言 + 判断依据（也用来确认线上真的拿得到国家头）
 * POST /api/locale {lang} 手动切换，写一年期的 cookie
 *
 * cookie 不设 httpOnly：这不是凭证，只是一个偏好；伪造它最多让自己看到另一种语言。
 */
export async function GET() {
  return NextResponse.json(await getLocaleDetail(), {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export async function POST(request: NextRequest) {
  let lang: string | null = null;
  try {
    const body = (await request.json()) as { lang?: unknown };
    lang = typeof body.lang === 'string' ? body.lang : null;
  } catch {
    return NextResponse.json({ error: 'bad-json' }, { status: 400 });
  }

  const locale = normalizeLocale(lang);
  if (!locale) return NextResponse.json({ error: 'bad-lang' }, { status: 400 });

  const res = NextResponse.json({ locale });
  res.cookies.set(LOCALE_COOKIE, locale, {
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: LOCALE_COOKIE_MAX_AGE,
  });
  return res;
}
