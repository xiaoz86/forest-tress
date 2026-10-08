import { after, NextRequest, NextResponse } from 'next/server';
import { fetchMember } from '@/lib/space/access';
import { get, now, transact } from '@/lib/space/db';
import { ACTIVE, fail, findRegistration, isStarted, loadRegistrationView, readBody, renewHold, settleWaitlist, freshEvent } from '@/lib/space/events';
import { honeypot } from '@/lib/space/guard';
import { managePath, tellHost } from '@/lib/space/mail';
import { announcePromotions } from '@/lib/space/registrantMail';
import type { Registration } from '@/lib/space/types';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' };

/**
 * 报名人凭链接里的 token 查看、取消自己的报名。
 *
 * 这两个接口不要求空间「已发布」：token 本身就证明 TA 报过名；主人事后把空间撤下，
 * 报过名（甚至付过款）的人仍然要能看到自己的记录和「活动取消了」这类消息。
 * 返回的只有 TA 自己这一条，看不到别人任何信息。
 *
 * 等付款的保留期过了、但还有空位时，打开就先把名额续上（付款前先占住，免得付了钱名额却被别人拿走）。
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t')?.trim() || '';
  const reg = await findRegistration(token);
  if (!reg) return fail(404, 'not-found', '这个报名链接不对，或者报名已经被删掉了');
  let fresh: Registration | null = reg;
  if (reg.status === 'pending') {
    const event = await get('events', reg.eventId);
    if (event) {
      const renewed = await renewHold(reg.id, event);
      fresh = renewed.reg;
      if (renewed.promoted.length) after(() => announcePromotions(event, renewed.promoted));
    }
  }
  const view = await loadRegistrationView(token, fresh);
  if (!view) return fail(404, 'not-found', '这个报名链接不对，或者报名已经被删掉了');
  return NextResponse.json(view, { headers: NO_STORE });
}

/** POST /api/space/registration?t=… body: { action: 'cancel' } */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t')?.trim() || '';
  const reg = await findRegistration(token);
  if (!reg) return fail(404, 'not-found', '这个报名链接不对，或者报名已经被删掉了');
  const body = await readBody(request);
  if (!body || body.action !== 'cancel') return fail(400, 'bad-action');
  if (honeypot(body)) return fail(400, 'rejected', '没有成功，刷新页面再试一次');

  const event = await get('events', reg.eventId);
  if (!event) return fail(404, 'not-found', '这个活动已经不在了');
  if (event.status === 'cancelled') return fail(409, 'event-cancelled', '活动已经取消了，不用再取消报名');
  if (isStarted(event)) return fail(409, 'started', '活动已经开始了，取消不了了。有事直接联系主人');

  // 取消只动 TA 自己这一条，token 就是凭证，不需要防刷计数（重复点只会得到「已经取消了」）
  let before: Registration | null = null;
  let promoted: Registration[] = [];
  const next = await transact('registrations', async rows => {
    const r = rows.find(x => x.id === reg.id);
    if (!r || !ACTIVE.has(r.status)) return null;
    before = { ...r };
    r.status = 'cancelled';
    r.updatedAt = now();
    // 空出来的名额按先来后到给排队的人（活动在临界区里重读一次：刚被取消的活动不再补位）
    promoted = settleWaitlist(await freshEvent(event), rows);
    return { ...r };
  });
  if (!next) return fail(409, 'not-active', '这条报名已经取消或者被处理过了，刷新一下看看');

  const prev = before as Registration | null;
  const paid = !!prev && (prev.status === 'claimed' || (prev.status === 'confirmed' && prev.feeCents > 0));
  const moved = promoted;
  after(async () => {
    await announcePromotions(event, moved);
    let hostEmail = '';
    try {
      hostEmail = (await fetchMember(event.memberId))?.email || '';
    } catch {
      return;
    }
    await tellHost({
      memberId: event.memberId,
      hostEmail,
      subject: `有人取消了「${event.title}」的报名`,
      lines: [
        `${reg.name} 取消了「${event.title}」的报名。`,
        ...(paid ? ['TA 之前付过款（或传过付款截图），退款的事需要你直接和 TA 联系。'] : []),
        ...(moved.length ? [`空出来的名额已经按先来后到给了排队的 ${moved.map(r => r.name).join('、')}。`] : []),
      ],
      path: managePath(event.memberId, 'events'),
      linkLabel: '去管理页看报名',
      key: `reg-cancel-${reg.id}`,
    });
  });

  return NextResponse.json({ status: next.status }, { headers: NO_STORE });
}
