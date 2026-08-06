import { NextResponse } from 'next/server';
import { getAuthenticatedMemberId } from '@/lib/session';
import { PROFILE_PATH, normalizePhilProfileName } from '@/lib/philCoach';
import { buildProfileSummary, memoryClient } from '@/lib/philCoachMemory';

export const runtime = 'nodejs';

/**
 * POST /api/phil-coach/memory/import-profile
 * 把登录用户的节点资料导入为「资料种子」记忆（默认导入 / 重新导入 共用）。
 * 已有种子原位刷新，没有时新增。仅本人。
 */
export async function POST() {
  const memberId = await getAuthenticatedMemberId();
  if (!memberId) {
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

  const profileName = normalizePhilProfileName(node.name);
  const summary = buildProfileSummary(node);
  if (!summary) {
    // 资料太空，没什么可导入；温柔地返回，不视为错误
    return NextResponse.json({ skipped: 'empty-profile', profileName });
  }

  // 已有种子就原位刷新，写入失败时仍保留旧种子；没有时才新增。
  const { data: existing, error: existingError } = await sb
    .from('phil_coach_memories')
    .select('id')
    .eq('node_id', memberId)
    .eq('path_id', PROFILE_PATH)
    .limit(1)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: 'query-failed' }, { status: 500 });

  const values = {
    content: summary.content,
    takeaway: summary.takeaway,
    path_id: PROFILE_PATH,
    created_at: new Date().toISOString(),
  };
  const write = existing
    ? sb
        .from('phil_coach_memories')
        .update(values)
        .eq('id', existing.id)
        .eq('node_id', memberId)
        .select('id, content, takeaway, path_id, created_at')
        .single()
    : sb
        .from('phil_coach_memories')
        .insert({
          node_id: memberId,
          ...values,
        })
        .select('id, content, takeaway, path_id, created_at')
        .single();

  const { data, error } = await write;
  if (error) return NextResponse.json({ error: 'write-failed' }, { status: 500 });

  return NextResponse.json({ memory: data, profileName });
}
