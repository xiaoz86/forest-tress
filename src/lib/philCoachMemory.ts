// phil-coach 记忆：注册用户明示同意「留住」的对话片段，以及由注册资料导入的「关于我」种子。
// 表结构见 supabase-setup.sql 的 phil_coach_memories 段。
// 原则：明示同意才存；逐条可删；未登录访客永不落库；任何失败静默降级。

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PROFILE_PATH } from './philCoach';

export type PhilMemory = {
  id: string;
  content: string;
  takeaway: string;
  path_id: string;
  created_at: string;
};

export const MAX_MEMORIES_PER_NODE = 100;
export const MAX_MEMORY_CONTENT = 6000;

/** 轻登记访客的 cookie 名（值为 phil_coach_guests.id） */
export const GUEST_COOKIE = 'nf_guest';

/** 审核通过后的免费使用天数（3 个月）；到期需申请续期（邮件里再点一次通过即续） */
export const GUEST_FREE_DAYS = 90;

/** 免费期是否仍有效：approved 且 approved_at 在 90 天内 */
export function guestActive(status?: string | null, approvedAt?: string | null): boolean {
  if (status !== 'approved') return false;
  if (!approvedAt) return true; // 老数据无时间戳时宽松放行
  const t = new Date(approvedAt).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() - t < GUEST_FREE_DAYS * 24 * 60 * 60 * 1000;
}

export function memoryClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/** 从节点资料构造一段第一人称「关于我」，作为 phil-coach 的资料种子。 */
type ProfileNode = Record<string, unknown>;
export function buildProfileSummary(node: ProfileNode): { content: string; takeaway: string } | null {
  const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  const arr = (v: unknown): string =>
    Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean).join('、') : '';

  const name = s(node.name);
  const city = s(node.city);
  const parts: string[] = [];

  const head = [name && `我叫${name}`, city && `在${city}`].filter(Boolean).join('，');
  if (head) parts.push(head + '。');
  if (s(node.doing)) parts.push(`我正在做的：${s(node.doing)}`);
  if (s(node.experience)) parts.push(`我的经验与独特：${s(node.experience)}`);
  const cares = [arr(node.topics), s(node.interests)].filter(Boolean).join('、');
  if (cares) parts.push(`我关心的：${cares}`);
  if (s(node.offer)) parts.push(`我能提供：${s(node.offer)}`);
  if (s(node.seeking)) parts.push(`我在寻找：${s(node.seeking)}`);
  if (s(node.beauty)) parts.push(`我生命里的美：${s(node.beauty)}`);
  if (s(node.seed)) parts.push(`我心里的那颗种子：${s(node.seed)}`);

  if (parts.length === 0) return null; // 资料太空，不建种子

  let content = parts.join('\n');
  if (content.length > MAX_MEMORY_CONTENT) content = content.slice(0, MAX_MEMORY_CONTENT);

  const gist = s(node.seed) || s(node.doing) || cares || name;
  const takeaway = `关于我${name ? `（${name}）` : ''}：${gist}`.slice(0, 60);
  return { content, takeaway };
}

/**
 * 取该用户的记忆，拼成注入系统提示词的块；无记忆/失败 → 空字符串。
 * 资料种子（path_id=PROFILE_PATH）单独「钉住」，让 phil-coach 一开始就认识 ta；
 * 另附最近 maxItems 条对话记忆，供开场自然衔接。
 */
export async function fetchMemoryBlock(nodeId: string, maxItems = 3): Promise<string> {
  const sb = memoryClient();
  if (!sb) return '';
  try {
    // 1) 资料种子（至多一条）
    const { data: seedRows } = await sb
      .from('phil_coach_memories')
      .select('content')
      .eq('node_id', nodeId)
      .eq('path_id', PROFILE_PATH)
      .limit(1);
    const profile = seedRows?.[0]?.content?.trim() || '';

    // 2) 最近的对话记忆（排除资料种子）
    const { data: memRows } = await sb
      .from('phil_coach_memories')
      .select('takeaway, content, created_at')
      .eq('node_id', nodeId)
      .neq('path_id', PROFILE_PATH)
      .order('created_at', { ascending: false })
      .limit(maxItems);

    let block = '';
    if (profile) {
      block += `\n\n【关于 ta（ta 亲手从自己的资料里导入的）】ta 是森林里的一棵树。这是 ta 希望你了解的背景：\n${profile}\n重要：这些资料是背景，不是议程。它帮你更懂 ta，但不要用它给 ta 贴标签、也不要围着 ta 的身份/职业/角色提问。始终跟着 ta 此刻真实说的话走——和当下的这个人工作，而不是和这份简历工作。ta 是谁，会在对话里自己长出来，不需要你从资料里替 ta 认定。除非 ta 自己把话题引向某个身份，否则别主动提起这些标签。`;
    }
    if (memRows?.length) {
      const lines = memRows.map(row => {
        const d = new Date(row.created_at);
        const when = `${d.getMonth() + 1}月${d.getDate()}日`;
        const gist = (row.takeaway || row.content || '').slice(0, 80);
        return `- （${when}）${gist}`;
      });
      block += `\n\n【ta 之前留住的话】以下是 ta 在以前的对话里亲手选择留下的记录，从新到旧：\n${lines.join(
        '\n',
      )}\n使用方式：只在开场问候、或话题自然相关时，轻轻接上其中最相关的一条（比如「上次你说……后来呢？」）；一次最多提一条，无关时完全不提。`;
    }
    return block;
  } catch {
    return '';
  }
}
