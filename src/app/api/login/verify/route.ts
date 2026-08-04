import { NextRequest, NextResponse } from 'next/server';
import { verifyLoginToken } from '@/lib/auth';
import { sessionCookies } from '@/lib/session';

export const runtime = 'nodejs';

/**
 * GET /api/login/verify?token=...
 * 校验签名 → 写登录 cookie（签过名的）→ 跳转到个人页。
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
  // 签名的那条鉴权用，明文那条只给导航判断显示状态
  for (const c of sessionCookies(verdict.memberId)) {
    res.cookies.set(c.name, c.value, c.options);
  }
  return res;
}
