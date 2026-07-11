import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { MEMBER_COOKIE } from '@/lib/auth';
import { PROFILE_PATH } from '@/lib/philCoach';
import { buildProfileSummary, memoryClient } from '@/lib/philCoachMemory';

export const runtime = 'nodejs';

/**
 * POST /api/phil-coach/memory/import-profile
 * 把登录用户的节点资料导入为「资料种子」记忆（默认导入 / 重新导入 共用）。
 * 每人至多一条：先删旧种子，再写新的。仅本人。
 */
export async function POST() {
  const store = await cookies();
  const memberId = store.get(MEMBER_COOKIE)?.value;
  if (!memberId || !memberId.trim()) {
    return NextResponse.json({ error: 'not-logged-in' }, { status: 401 });
  }

  const sb = memoryClient();
  if (!sb) return NextResponse.json({ error: 'not-configured' }, { status: 500 });

  const { data: node, error: nodeErr } = await sb
    .from('node_cards')
    .select('*')
    .eq('id', memberId)
    .single();
  if (nodeErr || !node) {
    return NextResponse.json({ error: 'node-not-found' }, { status: 404 });
  }

  const summary = buildProfileSummary(node);
  if (!summary) {
    // 资料太空，没什么可导入；温柔地返回，不视为错误
    return NextResponse.json({ skipped: 'empty-profile' });
  }

  // 先删旧的资料种子，保证至多一条
  await sb
    .from('phil_coach_memories')
    .delete()
    .eq('node_id', memberId)
    .eq('path_id', PROFILE_PATH);

  const { data, error } = await sb
    .from('phil_coach_memories')
    .insert({
      node_id: memberId,
      content: summary.content,
      takeaway: summary.takeaway,
      path_id: PROFILE_PATH,
    })
    .select('id, content, takeaway, path_id, created_at')
    .single();
  if (error) return NextResponse.json({ error: 'insert-failed' }, { status: 500 });

  return NextResponse.json({ memory: data });
}
