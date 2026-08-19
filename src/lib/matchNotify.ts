import { signViewLink, verifyViewLink } from '@/lib/auth';
import { getSiteOrigin } from '@/lib/notify';

/**
 * 撮合通知的退订链接。
 *
 * 和付款截图那条免登录查看链接是同一套 HMAC，只是换了 scope：
 * 收件人在邮箱里点一下就能关掉，不必先登录——而这封信本来就是发给
 * 「可能已经很久没回来过」的人的，逼人先登录等于没有退订。
 *
 * 有效期两年，不是常规的几小时：退订链接过期是一种很糟的失败——
 * 人点进来发现「链接已失效」，只会觉得这个站在耍赖。
 */
const UNSUBSCRIBE_SCOPE = 'match-notify';
const UNSUBSCRIBE_TTL_SECONDS = 60 * 60 * 24 * 730;

export function signUnsubscribeToken(memberId: string): string | null {
  return signViewLink(UNSUBSCRIBE_SCOPE, memberId, UNSUBSCRIBE_TTL_SECONDS);
}

export function verifyUnsubscribeToken(memberId: string, token: string) {
  return verifyViewLink(UNSUBSCRIBE_SCOPE, memberId, token);
}

/**
 * 拼出完整退订地址。AUTH_SECRET 没配时签不出来，返回空字符串——
 * 调用方据此整块不渲染，而不是放一条点了会报错的死链。
 */
export function buildUnsubscribeUrl(memberId: string): string {
  const token = signUnsubscribeToken(memberId);
  if (!token) return '';
  const q = new URLSearchParams({ m: memberId, t: token });
  return `${getSiteOrigin()}/api/notify/unsubscribe?${q.toString()}`;
}
