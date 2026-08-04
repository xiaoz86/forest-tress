import { NextRequest, NextResponse } from 'next/server';
import { isAdminId } from '@/lib/admin';
import { claimOrder, ensureOrder, findLatestOrder, listOrders, setOrderStatus } from '@/lib/programOrders';
import { notifyUnlockClaim, getSiteOrigin } from '@/lib/notify';
import { createClient } from '@supabase/supabase-js';
import { fetchMeditationContent } from '@/lib/meditations';
import { readMemberId } from '@/lib/session';

export const runtime = 'nodejs';

/** 只为取个昵称发通知，取不到也不影响开通 */
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key) : null;
}

const viewer = readMemberId;

/**
 * GET  ?program=sleep        取自己当前的申请状态
 * GET  ?admin=1              主理人看板：全部申请
 * POST { program }           发起申请，拿口令（已有 pending 就返回原来那个）
 * PATCH { id, status, note } 主理人确认收款 / 驳回
 */
export async function GET(request: NextRequest) {
  const memberId = await viewer();
  if (!memberId) return NextResponse.json({ error: 'not-logged-in' }, { status: 401 });

  if (request.nextUrl.searchParams.get('admin') === '1') {
    if (!isAdminId(memberId)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    return NextResponse.json(
      { orders: await listOrders() },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  const programId = request.nextUrl.searchParams.get('program')?.trim();
  if (!programId) return NextResponse.json({ error: 'missing-program' }, { status: 400 });

  return NextResponse.json(
    { order: await findLatestOrder(memberId, programId) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export async function POST(request: NextRequest) {
  const memberId = await viewer();
  if (!memberId) return NextResponse.json({ error: 'not-logged-in' }, { status: 401 });

  let payload: { program?: unknown; action?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad-json' }, { status: 400 });
  }
  const programId = typeof payload.program === 'string' ? payload.program.trim() : '';
  if (!programId) return NextResponse.json({ error: 'missing-program' }, { status: 400 });

  // 价格以服务端的内容配置为准，不接受前端传进来的数字
  const content = await fetchMeditationContent();
  const category = content.categories.find(c => c.id === programId);
  if (!category || category.kind !== 'program') {
    return NextResponse.json({ error: 'not-a-program' }, { status: 400 });
  }

  // 用户点「我已完成付款」：立刻放行，同时把口令发给主理人去核对
  if (payload.action === 'claim') {
    const order = await claimOrder(memberId, programId);
    if (!order) {
      return NextResponse.json({ error: 'no-pending-order' }, { status: 409 });
    }
    const { data: card } = await adminClient()
      ?.from('node_cards').select('name').eq('id', memberId).maybeSingle() ?? { data: null };
    // 邮件发不出去也不能挡住用户——权限已经给了，通知只是主理人那边的事
    void notifyUnlockClaim({
      memberName: String(card?.name || '一位森林里的朋友'),
      code: order.code,
      programLabel: category.label,
      amountYuan: Math.round(order.amountCents / 100),
      boardUrl: `${getSiteOrigin()}/meditations/orders`,
    }).catch(err => console.error('[unlock] claim notify failed', err));
    return NextResponse.json({ order });
  }

  const result = await ensureOrder(memberId, programId, category.priceCents ?? 0);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === 'not-configured' ? 503 : 500 },
    );
  }
  return NextResponse.json({ order: result.order, created: result.created });
}

export async function PATCH(request: NextRequest) {
  const memberId = await viewer();
  if (!isAdminId(memberId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let payload: { id?: unknown; status?: unknown; note?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad-json' }, { status: 400 });
  }

  const id = typeof payload.id === 'string' ? payload.id.trim() : '';
  const status = payload.status === 'paid' ? 'paid' : payload.status === 'rejected' ? 'rejected' : null;
  if (!id || !status) return NextResponse.json({ error: 'bad-request' }, { status: 400 });

  const note = typeof payload.note === 'string' ? payload.note.slice(0, 200) : '';
  const ok = await setOrderStatus(id, status, memberId, note);
  if (!ok) return NextResponse.json({ error: 'failed' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
