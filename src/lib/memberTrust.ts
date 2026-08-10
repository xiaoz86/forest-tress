import type { NodeCard } from '@/lib/supabase';

/**
 * 「这个账号可以看别人的联系方式吗」
 *
 * 为什么需要这个判断：/api/join 建号时不验证邮箱，插入成功就当场发会话
 * cookie。而节点详情页原来只看「有没有会话」就把成员的微信号和邮箱明文
 * 打出来——等于任何人敲一个称呼加一个随手编的邮箱，几秒后就能抄走整份
 * 通讯录。这个洞在改 phil-coach 闸门之前就存在，不是闸门带来的。
 *
 * 现在的凭据是 email_verified_at：走验证码登录过一次就会盖上，
 * 而验证码能收到本身就证明这个邮箱是本人的。
 *
 * 老成员一律按已验证对待——2026-08-09 之前建的那批都是真人（主理人确认过），
 * 不能因为换了规则就让他们突然看不见联系方式。新账号一律要过验证。
 */
const GRANDFATHER_BEFORE = Date.parse('2026-08-09T00:00:00Z');

export function canSeeContacts(viewer: NodeCard | null | undefined): boolean {
  if (!viewer) return false;
  if (viewer.email_verified_at) return true;
  const created = viewer.created_at ? Date.parse(viewer.created_at) : NaN;
  return Number.isFinite(created) && created < GRANDFATHER_BEFORE;
}

/**
 * 节点卡填完了没有。
 *
 * 判据取自七步向导里真正必填的那几项：称呼 + 正在做（第 1 步）、
 * 至少一个关注议题（第 2 步）、邮箱（第 7 步）。改向导的必填项时，
 * 这里要跟着改，否则会出现「向导过得了、这里判不过」的死循环。
 *
 * phil-coach 的闸门分两道：
 *   8 轮   → 要求「是成员」（轻两步：称呼 + 邮箱 + 验证码）
 *   40 轮  → 要求「卡片填完了」
 * 轻两步建出来的卡只有称呼和邮箱，走到 40 轮就会撞上第二道。
 */
export function isProfileComplete(node: NodeCard | null | undefined): boolean {
  if (!node) return false;
  return Boolean(
    node.name?.trim() &&
      node.doing?.trim() &&
      (node.topics?.length ?? 0) > 0 &&
      node.email?.trim(),
  );
}
