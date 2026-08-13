import { NextRequest, NextResponse } from 'next/server';
import { isProfileComplete } from '@/lib/memberTrust';
import type { NodeCard } from '@/lib/supabase';
import { getAuthenticatedMemberId } from '@/lib/session';
import { createChatCompletion } from '@/lib/llm';
import { PROFILE_PATH, normalizePhilProfileName } from '@/lib/philCoach';
import {
  MAX_MEMORIES_PER_NODE,
  MAX_MEMORY_CONTENT,
  memoryClient,
} from '@/lib/philCoachMemory';

export const runtime = 'nodejs';

async function requireMember(): Promise<string | null> {
  const id = await getAuthenticatedMemberId();
  return id ? id : null;
}

/** GET /api/phil-coach/memory —— 列出自己留住的记忆；登录态单独由 /api/session 判断。 */
export async function GET() {
  const memberId = await requireMember();
  if (!memberId) return NextResponse.json({ error: 'not-logged-in' }, { status: 401 });
  const sb = memoryClient();
  if (!sb) return NextResponse.json({ error: 'not-configured' }, { status: 500 });

  const [{ data, error }, { data: node }] = await Promise.all([
    sb
      .from('phil_coach_memories')
      .select('id, content, takeaway, path_id, created_at')
      .eq('node_id', memberId)
      .order('created_at', { ascending: false })
      .limit(MAX_MEMORIES_PER_NODE),
    sb.from('node_cards').select('name, doing, topics, email').eq('id', memberId).maybeSingle(),
  ]);
  if (error) return NextResponse.json({ error: 'query-failed' }, { status: 500 });
  const hasProfile = (data ?? []).some(memory => memory.path_id === PROFILE_PATH);
  const profileName = hasProfile ? normalizePhilProfileName(node?.name) : '';
  // 卡片填完了没有：轻两步建出来的卡只有称呼和邮箱，对话界面据此决定
  // 要不要在收尾处出那句「把节点卡填完」的邀请
  return NextResponse.json({
    memories: data ?? [],
    profileName,
    memberId,
    profileComplete: isProfileComplete(node as NodeCard | null),
  });
}

type SaveBody = {
  pathId?: unknown;
  messages?: unknown;
};

/** POST /api/phil-coach/memory —— 用户点「留住这一段」：存对话原文 + 生成一句话 takeaway */
export async function POST(request: NextRequest) {
  const memberId = await requireMember();
  if (!memberId) return NextResponse.json({ error: 'not-logged-in' }, { status: 401 });
  const sb = memoryClient();
  if (!sb) return NextResponse.json({ error: 'not-configured' }, { status: 500 });

  let body: SaveBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad-json' }, { status: 400 });
  }

  const pathId = typeof body.pathId === 'string' ? body.pathId.slice(0, 40) : '';
  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  const turns = rawMessages
    .filter(
      (m): m is { role: string; content: string } =>
        !!m &&
        typeof (m as { role?: unknown }).role === 'string' &&
        typeof (m as { content?: unknown }).content === 'string' &&
        !!(m as { content: string }).content.trim(),
    )
    .map(m => ({ role: m.role === 'user' ? '我' : 'phil-coach', content: m.content.trim() }));

  if (!turns.some(t => t.role === '我')) {
    return NextResponse.json({ error: 'nothing-to-keep' }, { status: 400 });
  }

  // 数量上限：温柔拒绝而不是悄悄丢弃
  const { count } = await sb
    .from('phil_coach_memories')
    .select('id', { count: 'exact', head: true })
    .eq('node_id', memberId);
  if ((count ?? 0) >= MAX_MEMORIES_PER_NODE) {
    return NextResponse.json({ error: 'memory-full' }, { status: 409 });
  }

  // 对话原文（超长时保尾部——越靠后的越接近觉察）
  let content = turns.map(t => `${t.role}：${t.content}`).join('\n\n');
  if (content.length > MAX_MEMORY_CONTENT) {
    content = `…（前文略）\n${content.slice(-MAX_MEMORY_CONTENT)}`;
  }

  // 生成一句话 takeaway（失败时回落到最后一条用户消息）
  const lastUser = [...turns].reverse().find(t => t.role === '我')?.content ?? '';
  let takeaway = lastUser.slice(0, 40);
  try {
    const generated = await createChatCompletion({
      messages: [
        {
          role: 'system',
          content:
            '你会看到一段教练对话。请用一句话（不超过40字）记下这位用户想带走的东西——一个觉察或一个行动打算，尽量用 ta 自己的原话措辞，以 ta 的第一人称写。只输出这一句，不要引号和解释。',
        },
        { role: 'user', content },
      ],
      temperature: 0.3,
      maxTokens: 80,
      timeoutMs: 15000,
    });
    if (generated && generated.trim()) takeaway = generated.trim().slice(0, 60);
  } catch {
    /* 回落已就位 */
  }

  const { data, error } = await sb
    .from('phil_coach_memories')
    .insert({ node_id: memberId, content, takeaway, path_id: pathId })
    .select('id, takeaway, path_id, created_at')
    .single();
  if (error) return NextResponse.json({ error: 'insert-failed' }, { status: 500 });
  return NextResponse.json({ memory: data });
}

/** DELETE /api/phil-coach/memory?id=… —— 删除自己的一条记忆 */
export async function DELETE(request: NextRequest) {
  const memberId = await requireMember();
  if (!memberId) return NextResponse.json({ error: 'not-logged-in' }, { status: 401 });
  const sb = memoryClient();
  if (!sb) return NextResponse.json({ error: 'not-configured' }, { status: 500 });

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'missing-id' }, { status: 400 });

  const { error } = await sb
    .from('phil_coach_memories')
    .delete()
    .eq('id', id)
    .eq('node_id', memberId); // 只能删自己的
  if (error) return NextResponse.json({ error: 'delete-failed' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
