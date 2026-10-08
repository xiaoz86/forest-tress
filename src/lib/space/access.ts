import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { isAdminId } from '@/lib/admin';
import { getAuthenticatedMemberId } from '@/lib/session';
import type { NodeCard } from '@/lib/supabase';
import { isMemberId } from './store';

/**
 * v1 只给本人和管理员看。
 *
 * 画像是 AI 对一个人的推断，「为什么像你」还引用了他的原话——这些都不该对外。
 * 等个人空间正式上线，公开的是网站本身（按逐项可见性），画像和风格工作室永远只给本人。
 */

/**
 * 取一个人的资料。**查不到**返回 null（页面据此 404）；**查询失败**先重试一次，仍失败就抛错。
 *
 * 两者必须分开：数据库偶尔慢一下（本地实测有超过 10 秒的请求），
 * 如果把失败也当成「查无此人」，用户会看到「页面不存在」，而且无从知道只是网络抖了。
 */
export async function fetchMember(id: string): Promise<NodeCard | null> {
  if (!isMemberId(id)) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('supabase-not-configured');
  const sb = createClient(url, key);
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    // 每次最多等 8 秒：连接偶尔会挂住不回（本地实测挂过 8 分多钟），不设上限整页就一直转圈
    const { data, error } = await sb.from('node_cards').select('*').eq('id', id).abortSignal(AbortSignal.timeout(8000)).maybeSingle();
    if (!error) return (data as NodeCard | null) ?? null;
    lastError = error;
  }
  console.error('[space] fetchMember failed', lastError);
  throw new Error('member-fetch-failed');
}

export type Access = { viewerId: string; isOwner: boolean; isAdmin: boolean };

export async function previewAccess(id: string): Promise<Access | null> {
  const viewerId = await getAuthenticatedMemberId();
  if (!viewerId) return null;
  const isOwner = viewerId === id;
  const isAdmin = isAdminId(viewerId);
  return isOwner || isAdmin ? { viewerId, isOwner, isAdmin } : null;
}
