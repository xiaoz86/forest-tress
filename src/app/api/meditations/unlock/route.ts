import { NextRequest, NextResponse } from 'next/server';
import { isAdminId } from '@/lib/admin';
import { ensureOrder, findLatestOrder, listOrders, setOrderStatus } from '@/lib/programOrders';
import { fetchMeditationContent } from '@/lib/meditations';
import { readMemberId } from '@/lib/session';

export const runtime = 'nodejs';

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

  // 用户点「我已完成付款」：必须带一张付款截图。
  //
  // 截图不是验证——伪造截图的工具满地都是，OCR 分辨不出真假。
  // 它挡的是「顺手点一下白嫖」：伪造付款凭证的心理成本远高于点个按钮。
  // 同时给主理人留下金额/时间/备注，核对时有东西可对。
  if (payload.action === 'claim') {
    return NextResponse.json({ error: 'proof-required' }, { status: 400 });
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
