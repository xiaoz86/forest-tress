import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { MEMBER_COOKIE } from '@/lib/auth';
import { getAuthenticatedMemberId } from '@/lib/session';

export const runtime = 'nodejs';

/**
 * GET /api/session — 「服务器认不认我」。
 *
 * 前端唯一该用来判断登录态的地方。原来是各处自己读 nf_member cookie，
 * 那个 cookie 前端可写，界面会跟着一个伪造值说「已登录」，
 * 而服务端所有接口都当你没登录——用户看到的是自相矛盾，且无从解释。
 */
export async function GET() {
  const memberId = await getAuthenticatedMemberId();
  // 只有旧的 nf_member、没有有效会话 = 换签名 cookie 之前登录过的人。
  // 这个值前端可写，绝不拿它换身份；只用来把导航上那个按钮
  // 从「种下一棵树」改成「登录」——注册过的人不该被推去再注册一遍。
  const legacy = !memberId && Boolean((await cookies()).get(MEMBER_COOKIE)?.value);
  return NextResponse.json(
    { memberId: memberId || null, legacy },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
