import { NextRequest, NextResponse } from 'next/server';
import { verifyLoginToken, MEMBER_COOKIE, MEMBER_COOKIE_MAX_AGE } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * GET /api/login/verify?token=...
 * 校验签名 → 设置 nf_member cookie → 跳转到个人页。
 * 失败时跳到 /login 并带上错误码。
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') || '';
  const verdict = verifyLoginToken(token);

  if (!verdict.ok) {
    const url = new URL('/login', request.url);
    url.searchParams.set('err', verdict.reason);
    return NextResponse.redirect(url);
  }

  const url = new URL(`/creators/${verdict.memberId}`, request.url);
  const res = NextResponse.redirect(url);
  res.cookies.set(MEMBER_COOKIE, verdict.memberId, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: MEMBER_COOKIE_MAX_AGE,
  });
  return res;
}
