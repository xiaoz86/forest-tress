// phil-coach 记忆：注册用户明示同意「留住」的对话片段。
// 表结构见 supabase-setup.sql 的 phil_coach_memories 段。
// 原则：明示同意才存；逐条可删；未登录访客永不落库；任何失败静默降级。

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type PhilMemory = {
  id: string;
  content: string;
  takeaway: string;
  path_id: string;
  created_at: string;
};

export const MAX_MEMORIES_PER_NODE = 100;
export const MAX_MEMORY_CONTENT = 6000;

export function memoryClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/** 取该用户最近留住的记忆，拼成注入系统提示词的块；无记忆/失败 → 空字符串 */
export async function fetchMemoryBlock(nodeId: string, maxItems = 3): Promise<string> {
  const sb = memoryClient();
  if (!sb) return '';
  try {
    const { data, error } = await sb
      .from('phil_coach_memories')
      .select('takeaway, content, created_at')
      .eq('node_id', nodeId)
      .order('created_at', { ascending: false })
      .limit(maxItems);
    if (error || !data?.length) return '';

    const lines = data.map(row => {
      const d = new Date(row.created_at);
      const when = `${d.getMonth() + 1}月${d.getDate()}日`;
      const gist = (row.takeaway || row.content || '').slice(0, 80);
      return `- （${when}）${gist}`;
    });

    return `\n\n【ta 之前留住的话】ta 是森林里的一棵树（注册用户）。下面是 ta 在以前的对话里亲手选择留下的记录，从新到旧：\n${lines.join(
      '\n',
    )}\n使用方式：只在开场问候、或话题自然相关的时刻，轻轻接上其中最相关的一条（比如「上次你说……后来呢？」）；一次最多提一条，不要生硬罗列，无关时完全不提。`;
  } catch {
    return '';
  }
}
