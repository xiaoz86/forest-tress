import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { isAdminId } from '@/lib/admin';
import { findProofPath } from '@/lib/programOrders';
import { readMemberId } from '@/lib/session';

export const runtime = 'nodejs';

const BUCKET = 'meditations';
const TTL_SECONDS = 10 * 60;

/**
 * 付款截图，只给主理人看。
 *
 * 里面是别人的支付宝账单片段——姓名、金额、时间都在上面，
 * 属于用户的支付信息，不该有第二个人看得到。所以这条路由既不
 * 下发路径，也不接受路径参数，只认订单 id，且必须是管理员。
 */
export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'not-configured' }, { status: 503 });
  }

  const memberId = await readMemberId();
  if (!isAdminId(memberId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const orderId = request.nextUrl.searchParams.get('order')?.trim();
  if (!orderId) return NextResponse.json({ error: 'missing-order' }, { status: 400 });

  const path = await findProofPath(orderId);
  if (!path) return NextResponse.json({ error: 'no-proof' }, { status: 404 });

  const sb = createClient(supabaseUrl, serviceKey);
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, TTL_SECONDS);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'sign-failed' }, { status: 502 });
  }
  return NextResponse.redirect(data.signedUrl, {
    status: 302,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}
