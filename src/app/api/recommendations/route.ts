import { createClient } from '@supabase/supabase-js';
import { getLocale } from '@/lib/locale';
import { NextRequest, NextResponse } from 'next/server';
import { matchNodesAI } from '@/lib/match';
import { isAdminId } from '@/lib/admin';
import { getAuthenticatedMemberId } from '@/lib/session';
import { toRecommendationSnapshot } from '../join/route';
import type { NodeCard } from '@/lib/supabase';

export const runtime = 'nodejs';

/**
 * POST /api/recommendations
 * body: { nodeId: string }
 *
 * 让 AI 重新为指定节点生成推荐，并把结果（裁剪后）存进 ai_recommendations。
 * 仅本人或管理员可触发。
 */
export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'supabase-not-configured' }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad-json' }, { status: 400 });
  }
  const nodeId = (body as { nodeId?: unknown })?.nodeId;
  if (typeof nodeId !== 'string' || !nodeId.trim()) {
    return NextResponse.json({ error: 'missing-node-id' }, { status: 400 });
  }

  const memberId = await getAuthenticatedMemberId();
  const isOwner = !!memberId && memberId === nodeId;
  const isAdmin = isAdminId(memberId);
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const sb = createClient(supabaseUrl, serviceKey);
  const { data: meRow, error: meErr } = await sb
    .from('node_cards')
    .select('*')
    .eq('id', nodeId)
    .single();
  if (meErr || !meRow) {
    return NextResponse.json({ error: 'node-not-found' }, { status: 404 });
  }
  const me = meRow as NodeCard;

  const { data: allRows } = await sb.from('node_cards').select('*');
  const others = ((allRows || []) as NodeCard[]).filter(n => n.id !== nodeId);

  const matches = await matchNodesAI(me, others, 3, await getLocale());
  const snapshot = matches.map(toRecommendationSnapshot);
  const generatedAt = new Date().toISOString();

  const { error: updErr } = await sb
    .from('node_cards')
    .update({
      ai_recommendations: snapshot,
      ai_recommendations_at: generatedAt,
    })
    .eq('id', nodeId);
  if (updErr) {
    if (/ai_recommendations/i.test(updErr.message) && /column/i.test(updErr.message)) {
      return NextResponse.json({ error: 'column-missing' }, { status: 500 });
    }
    return NextResponse.json(
      { error: 'db-update-failed', detail: updErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    recommendations: snapshot,
    generatedAt,
    aiRanked: matches.some(m => m.aiRanked),
  });
}
