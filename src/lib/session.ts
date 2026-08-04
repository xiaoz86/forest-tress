import { cookies } from 'next/headers';
import { MEMBER_COOKIE, signSessionValue, verifySessionValue } from '@/lib/auth';

/**
 * 登录态的唯一读取入口。
 *
 * 之前 nf_member 里存的是明文成员 id，而成员 id 在 /creators/<id> 这类
 * 公开链接里到处都是——任何人抄一个 id 设进自己的 cookie 就变成了那个人，
 * 包括 isAdminId() 认的管理员。所以现在 cookie 里放的是签过名的值，
 * 服务端一律经这里读，不再直接碰 cookies().get('nf_member')。
 */

export const SESSION_COOKIE = MEMBER_COOKIE;
/** 给导航判断「登录没登录」用的明文副本。它可以被伪造，所以只用来决定显示什么，绝不用于鉴权。 */
export const DISPLAY_COOKIE = 'nf_uid';

export const SESSION_MAX_AGE = 60 * 60 * 24 * 365;

/** 服务端读当前登录的成员 id；没登录或签名不对都返回空串 */
export async function readMemberId(): Promise<string> {
  const store = await cookies();
  return verifySessionValue(store.get(SESSION_COOKIE)?.value || '');
}

/** 登录成功后写 cookie。两条：签名的那条鉴权用，明文那条只给导航看。 */
export function sessionCookies(memberId: string) {
  return [
    {
      name: SESSION_COOKIE,
      value: signSessionValue(memberId),
      options: {
        // 鉴权凭证不给浏览器脚本碰——签名挡住了伪造，httpOnly 挡住 XSS 顺走
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: SESSION_MAX_AGE,
      },
    },
    {
      name: DISPLAY_COOKIE,
      value: memberId,
      options: {
        httpOnly: false,
        sameSite: 'lax' as const,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: SESSION_MAX_AGE,
      },
    },
  ];
}

export const CLEARED_SESSION_COOKIES = [SESSION_COOKIE, DISPLAY_COOKIE];
