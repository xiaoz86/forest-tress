import { after, NextRequest, NextResponse } from 'next/server';
import { transact } from '@/lib/space/db';
import { fail, listHostEvents, settleWaitlist, toHostRegistration } from '@/lib/space/events';
import { gateHost, isFail } from '@/lib/space/gate';
import { announcePromotions } from '@/lib/space/registrantMail';
import type { Registration, SpaceEvent } from '@/lib/space/types';

export const runtime = 'nodejs';

/**
 * GET /api/space/registrations?id=…
 * 主人：自己所有活动的报名，按活动分组（活动按开始时间倒序，报名按时间先后）。
 *
 * 打开名单时顺手按先来后到结算一次排队：等付款的保留期过了、空出来的名额，先给排队的人（并提醒 TA 们）。
 */
export async function GET(request: NextRequest) {
  const g = await gateHost(request.nextUrl.searchParams.get('id'));
  if (isFail(g)) return fail(g.status, g.error);
  const t = Date.now();
  const before = await listHostEvents(g.memberId);
  const { regs, promoted } = await transact('registrations', async rows => {
    // 活动在临界区里重新列一次：外面那份可能已经过时（同一时刻被取消了，就不该再给它补位）
    const current = await listHostEvents(g.memberId);
    const moved: { event: SpaceEvent; rows: Registration[] }[] = [];
    for (const e of current) {
      const p = settleWaitlist(e, rows, t);
      if (p.length) moved.push({ event: e, rows: p });
    }
    return { regs: rows.filter(r => r.memberId === g.memberId).map(r => ({ ...r })), promoted: moved };
  });
  for (const m of promoted) after(() => announcePromotions(m.event, m.rows));
  const events = promoted.length ? await listHostEvents(g.memberId) : before;

  const blocked = new Set(g.settings.blocked);
  const groups = events.map(event => {
    const rows = regs
      .filter(r => r.eventId === event.id)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
      .map(r => toHostRegistration(r, blocked, t));
    const count = (s: Registration['status']) => rows.filter(r => r.status === s).length;
    return {
      event,
      registrations: rows,
      counts: {
        confirmed: count('confirmed'),
        claimed: count('claimed'),
        pending: count('pending'),
        waitlist: count('waitlist'),
        cancelled: count('cancelled'),
        rejected: count('rejected'),
      },
    };
  });
  return NextResponse.json({ groups }, { headers: { 'Cache-Control': 'private, no-store' } });
}
