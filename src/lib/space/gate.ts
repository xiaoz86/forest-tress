import 'server-only';
import type { NodeCard } from '@/lib/supabase';
import { fetchMember } from './access';
import { getSettings, spaceMode } from './settings';
import { isMemberId } from './store';
import type { SpaceSettings } from './types';
import { isHost, resolveViewer, type Viewer } from './viewer';

/**
 * 所有「个人空间」接口的第一道关：这个人存在吗、空间发布了吗、来的是谁。
 *
 * - 访客接口（打招呼、报名、预约）：空间要发布了（本人确认过）才对访客开着；
 *   没发布的、或者已经不在森林里的，对访客「不存在」。本人和管理员例外（可以自己试一遍流程）
 * - 主人接口（管理页用的）：必须是本人或管理员，用 gateHost。发布只有本人能做（见 settings 接口）
 *
 * 失败时给出可以直接 return 的 status 和 error，调用方不必各写一遍。
 */
export type Gate = {
  memberId: string;
  node: NodeCard;
  settings: SpaceSettings;
  viewer: Viewer;
  host: boolean;
};

export type GateFail = { error: string; status: number };

export async function gateSpace(rawId: string | null | undefined): Promise<Gate | GateFail> {
  const memberId = (rawId || '').trim().toLowerCase();
  if (!isMemberId(memberId)) return { error: 'invalid-id', status: 400 };
  let node: NodeCard | null;
  try {
    node = await fetchMember(memberId);
  } catch {
    return { error: 'database-unavailable', status: 503 };
  }
  if (!node) return { error: 'not-found', status: 404 };
  const settings = await getSettings(memberId);
  const viewer = await resolveViewer(memberId, settings);
  const host = isHost(viewer);
  // 不给看的空间对访客来说「不存在」：不暴露这个人有没有在做个人空间
  if (!host && spaceMode(settings, node) === 'none') return { error: 'not-found', status: 404 };
  return { memberId, node, settings, viewer, host };
}

export async function gateHost(rawId: string | null | undefined): Promise<Gate | GateFail> {
  const g = await gateSpace(rawId);
  if ('error' in g) {
    // 没发布时 gateSpace 对非主人给 404；主人接口统一回 403，不区分「不存在」和「没权限」
    return g.status === 404 ? { error: 'forbidden', status: 403 } : g;
  }
  if (!g.host) return { error: 'forbidden', status: 403 };
  return g;
}

export function isFail(g: Gate | GateFail): g is GateFail {
  return 'error' in g;
}
