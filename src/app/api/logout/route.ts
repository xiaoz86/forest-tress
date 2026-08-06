import { NextRequest, NextResponse } from 'next/server';
import { MEMBER_COOKIE, SESSION_COOKIE } from '@/lib/auth';

export const runtime = 'nodejs';

/** GET / POST /api/logout — 清掉 nf_member cookie 后跳回首页或来源页。 */
export async function POST(request: NextRequest) {
  const back = request.nextUrl.searchParams.get('back') || '/';
  // 只允许同源相对路径，避免 open-redirect
  const safe = back.startsWith('/') && !back.startsWith('//') ? back : '/';
  const res = NextResponse.redirect(new URL(safe, request.url));
  res.cookies.set(MEMBER_COOKIE, '', { path: '/', maxAge: 0 });
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}

export async function GET(request: NextRequest) {
  return POST(request);
}
