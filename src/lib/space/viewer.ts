import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { isAdminId } from '@/lib/admin';
import { canSeeContacts } from '@/lib/memberTrust';
import { getAuthenticatedMemberId } from '@/lib/session';
import { fetchMember } from './access';
import type { Audience, SpaceSettings, VisibilityKey } from './types';

/**
 * 谁在看这个人的空间。
 *
 * - 本人、管理员：什么都看得到（管理员是为了帮忙排查）
 * - 森林成员：和平台其他地方同一条规则（memberTrust.canSeeContacts：验证过邮箱，或迁移前的老成员）；
 *   只有会话、节点已经被删掉或还没验证的，不算
 * - 扫过名片的人：浏览器里有这个人名片二维码带来的口令 cookie
 * - 其余都是访客
 *
 * 本人预览时可以「假装」成某一种访客（?as=visitor|card|member），看自己的可见性设置对不对。
 */
export type Viewer = {
  viewerId: string;
  /** 登录者自己的名字（预填表单用）；没登录或查不到时为空 */
  viewerName: string;
  isOwner: boolean;
  isAdmin: boolean;
  isMember: boolean;
  hasCard: boolean;
};

export type AsRole = 'visitor' | 'card' | 'member';

export function cardCookieName(memberId: string): string {
  return `sp_card_${memberId.replace(/-/g, '')}`;
}

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

export async function resolveViewer(memberId: string, settings: SpaceSettings): Promise<Viewer> {
  const viewerId = await getAuthenticatedMemberId();
  const store = await cookies();
  const card = store.get(cardCookieName(memberId))?.value || '';
  let isMember = false;
  let viewerName = '';
  if (viewerId) {
    try {
      const me = await fetchMember(viewerId);
      isMember = canSeeContacts(me);
      viewerName = me?.name?.trim() || '';
    } catch {
      // 查不到就按访客算：宁可少给，不多给
      isMember = false;
    }
  }
  return {
    viewerId,
    viewerName,
    isOwner: !!viewerId && viewerId === memberId,
    isAdmin: isAdminId(viewerId),
    isMember,
    hasCard: sameToken(card, settings.cardToken),
  };
}

/** 本人或管理员「假装」成某种访客时，看到的权限 */
export function simulate(v: Viewer, as: AsRole): Viewer {
  return {
    viewerId: v.viewerId,
    viewerName: '',
    isOwner: false,
    isAdmin: false,
    isMember: as === 'member',
    hasCard: as === 'card',
  };
}

export function isHost(v: Viewer): boolean {
  return v.isOwner || v.isAdmin;
}

export function canSee(audience: Audience, v: Viewer): boolean {
  if (isHost(v)) return true;
  switch (audience) {
    case 'public': return true;
    case 'card': return v.isMember || v.hasCard;
    case 'members': return v.isMember;
    case 'self': return false;
  }
}

/** 逐项算出这位访客能看到什么 */
export function visibleFor(settings: SpaceSettings, v: Viewer): Record<VisibilityKey, boolean> {
  const out = {} as Record<VisibilityKey, boolean>;
  for (const [k, a] of Object.entries(settings.visibility) as [VisibilityKey, Audience][]) out[k] = canSee(a, v);
  return out;
}
