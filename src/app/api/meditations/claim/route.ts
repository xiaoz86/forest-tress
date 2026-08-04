import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getSiteOrigin, notifyUnlockClaim } from '@/lib/notify';
import { claimOrder, findLatestOrder } from '@/lib/programOrders';
import { fetchMeditationContent } from '@/lib/meditations';
import { readMemberId } from '@/lib/session';

export const runtime = 'nodejs';

const BUCKET = 'meditations';
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

/**
 * POST /api/meditations/claim —— 上传付款截图并解锁。
 *
 * 说清楚这一步是什么：截图**不构成验证**。伪造支付宝/微信付款截图的
 * 工具随处可得，OCR 也分辨不出生成图和真实截图。所以这里不做任何
 * 「识别金额是否正确」的判断——那只会给出一种验过了的错觉。
 *
 * 它真正的作用有两个：
 *   1. 威慑——点一个按钮几乎没有心理成本，上传一张伪造的付款凭证不一样
 *   2. 证据——主理人手里有金额、时间、备注，可以和收款记录对照
 *
 * 真正的把关仍然在主理人那一步：对不上就驳回，权限当场收回。
 */
export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'not-configured' }, { status: 503 });
  }

  const memberId = await readMemberId();
  if (!memberId) return NextResponse.json({ error: 'not-logged-in' }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'bad-form' }, { status: 400 });
  }

  const programId = (form.get('program') as string | null)?.trim() || '';
  const file = form.get('proof');
  if (!programId) return NextResponse.json({ error: 'missing-program' }, { status: 400 });
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'proof-required' }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: 'bad-file-type' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'file-too-large' }, { status: 400 });
  }

  // 必须已经有一条自己的待付款单——否则口令从何而来
  const existing = await findLatestOrder(memberId, programId);
  if (!existing || existing.status !== 'pending') {
    return NextResponse.json({ error: 'no-pending-order' }, { status: 409 });
  }

  const ext = file.type === 'image/png' ? 'png'
    : file.type === 'image/webp' ? 'webp'
    : file.type.includes('hei') ? 'heic'
    : 'jpg';
  // 私有桶里单独一个前缀，取用只对主理人开放
  const path = `_pay/proof/${existing.id}.${ext}`;

  const sb = createClient(supabaseUrl, serviceKey);
  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: true });
  if (upErr) {
    console.error('[claim] upload failed', upErr.message);
    return NextResponse.json({ error: 'upload-failed' }, { status: 500 });
  }

  const order = await claimOrder(memberId, programId, path);
  if (!order) return NextResponse.json({ error: 'no-pending-order' }, { status: 409 });

  const content = await fetchMeditationContent();
  const category = content.categories.find(c => c.id === programId);
  const { data: card } = await sb
    .from('node_cards').select('name').eq('id', memberId).maybeSingle();

  // 邮件发不出去也不该挡住用户——权限已经给了，通知是主理人那边的事
  const origin = getSiteOrigin();
  void notifyUnlockClaim({
    memberName: String(card?.name || '一位森林里的朋友'),
    code: order.code,
    programLabel: category?.label || programId,
    amountYuan: Math.round(order.amountCents / 100),
    boardUrl: `${origin}/meditations/orders`,
    // 直链省掉「先开看板再找那一条」；点开时那条路由仍要求管理员身份
    proofUrl: `${origin}/api/meditations/proof?order=${encodeURIComponent(order.id)}`,
  }).catch(err => console.error('[claim] notify failed', err));

  return NextResponse.json({ order });
}
