import 'server-only';
import { cookies } from 'next/headers';
import type { NodeCard } from '@/lib/supabase';
import { get, list } from './db';
import { getSettings, withDefaults } from './settings';
import type { SpaceSettings } from './types';
import { canSee, cardCookieName, type Viewer } from './viewer';
import type { VisibilityKey } from './types';

/**
 * 个人空间的逐项可见性，也要管到平台原有的公开资料页（/creators/<id>）。
 *
 * 否则本人在空间里把「心里的种子」设成「仅自己」，访客点一下页脚的「在附近森林生长」，
 * 在资料页上照样看得到——空间里的开关就成了假的。
 *
 * 规则：只有本人动过空间设置（有存下来的设置）时才生效，从没碰过个人空间的成员，资料页完全照旧；
 * 生效时「更严的那边」算数：资料页本来就只给成员看的联系方式，空间设成「所有人」也不会因此公开。
 * 读不到空间设置（数据库一时出错、超时）时不报错、照常出页面，但按最保守的来：心里的种子、美的时刻、
 * 微信和邮箱先不给别人看——本人可能把它们设成了「仅自己」，出错的这一会儿不能漏出去。
 */
function trimStrict(node: NodeCard): NodeCard {
  return { ...node, seed: '', beauty: '', wechat: '', email: '' };
}

function trim(node: NodeCard, settings: SpaceSettings, v: Viewer): NodeCard {
  const ok = (k: VisibilityKey) => canSee(settings.visibility[k], v);
  const out: NodeCard = { ...node };
  if (!ok('knowing')) {
    out.interests = '';
    out.beauty = '';
  }
  if (!ok('path')) {
    out.experience = '';
    out.works = [];
  }
  if (!ok('offer')) {
    out.offer = '';
    out.product = '';
  }
  if (!ok('seed')) out.seed = '';
  if (!ok('wechat')) out.wechat = '';
  if (!ok('email')) out.email = '';
  return out;
}

export async function applySpaceVisibility(
  node: NodeCard,
  viewer: { viewerId: string; isMember: boolean; isOwner: boolean; isAdmin: boolean },
): Promise<NodeCard> {
  if (!node.id || viewer.isOwner || viewer.isAdmin) return node;
  try {
    if (!(await get('settings', node.id))) return node;
    const settings = await getSettings(node.id);
    const card = (await cookies()).get(cardCookieName(node.id))?.value || '';
    const v: Viewer = {
      viewerId: viewer.viewerId,
      viewerName: '',
      isOwner: false,
      isAdmin: false,
      isMember: viewer.isMember,
      hasCard: !!card && card === settings.cardToken,
    };
    return trim(node, settings, v);
  } catch (err) {
    console.error('[space] platform visibility unavailable', err);
    return trimStrict(node);
  }
}

/**
 * 一次处理一批人（星空这类列表页）：设置只读一次。每个人按自己的空间设置裁，没动过空间设置的人原样返回。
 * viewer 是当前登录的人（没登录时 viewerId 为空、isMember 为 false）。
 */
export async function applySpaceVisibilityMany(
  nodes: NodeCard[],
  viewer: { viewerId: string; isMember: boolean; isAdmin: boolean },
): Promise<NodeCard[]> {
  if (viewer.isAdmin || !nodes.length) return nodes;
  try {
    const rows = await list('settings');
    if (!rows.length) return nodes;
    const byId = new Map(rows.map(r => [r.id, r]));
    const jar = await cookies();
    return nodes.map(node => {
      if (!node.id || node.id === viewer.viewerId || !byId.has(node.id)) return node;
      // 设置上面已经整张读过了，补上默认值就好，不用每个人再查一次
      const settings = withDefaults(node.id, byId.get(node.id));
      const card = jar.get(cardCookieName(node.id))?.value || '';
      return trim(node, settings, {
        viewerId: viewer.viewerId, viewerName: '', isOwner: false, isAdmin: false,
        isMember: viewer.isMember, hasCard: !!card && card === settings.cardToken,
      });
    });
  } catch (err) {
    console.error('[space] platform visibility unavailable', err);
    return nodes.map(n => (n.id && n.id === viewer.viewerId ? n : trimStrict(n)));
  }
}
