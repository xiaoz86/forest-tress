import { NextRequest, NextResponse } from 'next/server';
import { insert, newId, now } from '@/lib/space/db';
import { fail, listHostEvents, listPublicEvents, parseEventInput, readBody } from '@/lib/space/events';
import { gateHost, gateSpace, isFail } from '@/lib/space/gate';
import { canSee } from '@/lib/space/viewer';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

/**
 * GET /api/space/events?id=…
 * 主人（本人、管理员）：全部活动，含草稿，附已占名额；再告诉一声收款码放了没有、空间的地址和发布了没有。
 * 访客：只有开放报名、还算近期的活动（开始了的标 started，不能报名），不含任何报名人信息；「一起做点什么」这一章对 TA 不可见时给空列表。
 */
export async function GET(request: NextRequest) {
  const g = await gateSpace(request.nextUrl.searchParams.get('id'));
  if (isFail(g)) return fail(g.status, g.error);
  if (g.host) {
    return NextResponse.json({
      events: await listHostEvents(g.memberId),
      payQr: !!g.settings.payQr,
      // 「复制报名链接」用：有短链用短链，后面接活动的锚点
      spaceUrl: g.settings.slug ? `/@${g.settings.slug}` : `/space/${g.memberId}`,
      published: g.settings.published,
    }, { headers: NO_STORE });
  }
  if (!canSee(g.settings.visibility.offer, g.viewer)) return NextResponse.json({ events: [] }, { headers: NO_STORE });
  return NextResponse.json({ events: await listPublicEvents(g.memberId) }, { headers: NO_STORE });
}

/** POST /api/space/events?id=… —— 主人建一个活动 */
export async function POST(request: NextRequest) {
  const g = await gateHost(request.nextUrl.searchParams.get('id'));
  if (isFail(g)) return fail(g.status, g.error);
  const body = await readBody(request);
  if (!body) return fail(400, 'bad-body');
  const parsed = parseEventInput(body, null);
  if ('error' in parsed) return fail(400, 'invalid', parsed.error);
  const v = parsed.value;
  if (v.status === 'cancelled') return fail(400, 'invalid', '新建的活动不能是「已取消」');
  // 收款码是收费活动的前提：报了名却没地方付款，报名人只能干等
  if (v.feeCents > 0 && v.status === 'open' && !g.settings.payQr) {
    return fail(400, 'need-pay-qr', '收费活动开放报名之前，先在上面放一张收款码。也可以先存成草稿。');
  }
  const t = now();
  const event = await insert('events', { id: newId(), memberId: g.memberId, ...v, createdAt: t, updatedAt: t });
  return NextResponse.json({ event }, { headers: NO_STORE });
}
