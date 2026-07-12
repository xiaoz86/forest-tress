import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { MEMBER_COOKIE } from '@/lib/auth';
import { notifyPhilFeedback } from '@/lib/notify';
import { memoryClient } from '@/lib/philCoachMemory';

export const runtime = 'nodejs';

// 轻限流：每 IP 10 分钟内最多 5 条，防刷
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const buckets = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (buckets.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (arr.length >= MAX_PER_WINDOW) {
    buckets.set(ip, arr);
    return true;
  }
  arr.push(now);
  buckets.set(ip, arr);
  return false;
}

type Body = { kind?: unknown; message?: unknown; contact?: unknown };

/**
 * POST /api/phil-coach/feedback
 * 体验后的模块反馈（kind=feedback）或真人教练咨询留言（kind=coach-inquiry）。
 * 未登录也可提交；登录用户自动带上节点身份。落库为准，邮件通知尽力而为。
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json({ error: 'too-many' }, { status: 429 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad-json' }, { status: 400 });
  }

  const kind = body.kind === 'coach-inquiry' ? 'coach-inquiry' : 'feedback';
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 2000) : '';
  const contact = typeof body.contact === 'string' ? body.contact.trim().slice(0, 200) : '';
  if (!message) {
    return NextResponse.json({ error: 'empty-message' }, { status: 400 });
  }

  const sb = memoryClient();
  if (!sb) return NextResponse.json({ error: 'not-configured' }, { status: 500 });

  // 登录用户带上节点身份（可选）
  const store = await cookies();
  const memberId = store.get(MEMBER_COOKIE)?.value?.trim() || null;

  let nodeName: string | undefined;
  let nodeId: string | null = null;
  if (memberId) {
    const { data } = await sb.from('node_cards').select('id, name').eq('id', memberId).single();
    if (data?.id) {
      nodeId = data.id;
      nodeName = data.name || undefined;
    }
  }

  const { error } = await sb.from('phil_coach_feedback').insert({
    node_id: nodeId,
    kind,
    message,
    contact,
  });
  if (error) {
    console.error('[phil-feedback] insert failed', error.message);
    return NextResponse.json({ error: 'save-failed' }, { status: 500 });
  }

  // 邮件通知主理人（尽力而为，不影响返回）
  notifyPhilFeedback({ kind, message, contact, nodeName }).catch(err => {
    console.error('[phil-feedback] notify failed', err);
  });

  return NextResponse.json({ ok: true });
}
