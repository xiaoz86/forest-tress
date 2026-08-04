import { NextRequest, NextResponse } from 'next/server';
import { CLEARED_SESSION_COOKIES } from '@/lib/session';

export const runtime = 'nodejs';

/** GET / POST /api/logout — 清掉登录 cookie 后跳回首页或来源页。 */
export async function POST(request: NextRequest) {
  const back = request.nextUrl.searchParams.get('back') || '/';
  // 只允许同源相对路径，避免 open-redirect
  const safe = back.startsWith('/') && !back.startsWith('//') ? back : '/';
  const res = NextResponse.redirect(new URL(safe, request.url));
  // 签名那条和给导航看的明文那条都要清
  for (const name of CLEARED_SESSION_COOKIES) {
    res.cookies.set(name, '', { path: '/', maxAge: 0 });
  }
  return res;
}

export async function GET(request: NextRequest) {
  return POST(request);
}
