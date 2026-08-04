import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { isAdminId } from '@/lib/admin';
import { findLatestOrder } from '@/lib/programOrders';

export const runtime = 'nodejs';

const BUCKET = 'meditations';
const QR_PATH = '_pay/qr';
const TTL_SECONDS = 10 * 60;

/**
 * 收款码。只在「付款那一刻」给：必须登录，且这个营下确实有一条待确认的申请。
 *
 * 为什么不直接放 public/：那样即使页面不显示，知道地址的人照样能取，
 * 也就能把主理人的收款码贴到别处去。放进已经私有的桶里，
 * 每次现发一条十分钟的签名链接，取用范围就收住了。
 */
export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'not-configured' }, { status: 503 });
  }

  const cookieStore = await cookies();
  const memberId = cookieStore.get('nf_member')?.value || '';
  if (!memberId) return NextResponse.json({ error: 'not-logged-in' }, { status: 401 });

  const programId = new URL(request.url).searchParams.get('program')?.trim() || '';
  if (!programId) return NextResponse.json({ error: 'missing-program' }, { status: 400 });

  // 管理员要能在管理页核对这张图配对没配对
  if (!isAdminId(memberId)) {
    const order = await findLatestOrder(memberId, programId);
    if (!order || order.status !== 'pending') {
      return NextResponse.json({ error: 'no-pending-order' }, { status: 403 });
    }
  }

  const sb = createClient(supabaseUrl, serviceKey);
  // 后缀不固定（jpg / png / webp 都可能），挨个试一遍
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    const { data } = await sb.storage
      .from(BUCKET)
      .createSignedUrl(`${QR_PATH}.${ext}`, TTL_SECONDS);
    if (data?.signedUrl) {
      const head = await fetch(data.signedUrl, { method: 'HEAD' });
      if (head.ok) {
        return NextResponse.redirect(data.signedUrl, {
          status: 302,
          headers: { 'Cache-Control': 'private, no-store, max-age=0' },
        });
      }
    }
  }
  return NextResponse.json({ error: 'no-qr' }, { status: 404 });
}
