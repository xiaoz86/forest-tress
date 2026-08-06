import { signViewLink } from '@/lib/auth';
import { getSiteOrigin } from '@/lib/notify';

/**
 * 付款截图的存放与取用约定。
 *
 * 图放在已经私有的 meditations 桶里（`_proof/<单号>/<时间戳>.<后缀>`），
 * 唯一的出口是 /api/meditations/proof——那里要么认签名，要么认管理员登录态。
 */
export const PROOF_BUCKET = 'meditations';
export const PROOF_PREFIX = '_proof';

/** 换掉这个字符串，等于把之前签出去的看图链接全部作废。 */
export const PROOF_VIEW_SCOPE = 'pay-proof';

/**
 * 邮件里那条「看截图」的地址：凭证挂在链接上，手机上没登录过也点得开。
 * 和登录魔法链接同一把 secret、同一套 HMAC，区别是换到手的只有这一张图。
 * 没配 AUTH_SECRET 时签不出来，返回 null，邮件里就不放这个按钮。
 */
export function buildProofUrl(orderId: string): string | null {
  const token = signViewLink(PROOF_VIEW_SCOPE, orderId);
  if (!token) return null;
  return `${getSiteOrigin()}/api/meditations/proof?order=${encodeURIComponent(orderId)}&t=${token}`;
}
