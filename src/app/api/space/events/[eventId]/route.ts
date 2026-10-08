import { after, NextRequest, NextResponse } from 'next/server';
import { deleteUpload, get, now, remove, transact, update } from '@/lib/space/db';
import { ACTIVE, fail, getEvent, isPast, parseEventInput, readBody, settleWaitlist } from '@/lib/space/events';
import { gateHost, isFail } from '@/lib/space/gate';
import { planNotices, type NotifyItem } from '@/lib/space/registrantMail';
import type { Registration, SpaceEvent } from '@/lib/space/types';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

type Ctx = { params: Promise<{ eventId: string }> };

const paidOf = (r: Registration) => r.status === 'claimed' || (r.status === 'confirmed' && r.feeCents > 0);

/**
 * PATCH /api/space/events/{eventId} —— 主人改活动（只改带了的字段）
 *
 * - 取消活动不走这里（DELETE），表单里改状态只能在草稿 / 开放报名 / 截止之间换；已经取消的活动不能再打开
 * - 已经有人报名（进行中的）时，费用锁定：报过名的人按当时的价格报的，改价会让一部分人多付或白付。要改就取消、重新建一场
 * - 改了时间或地点：告诉已经报名的人（能发信的发信，其余的列进 notify，主人自己去说）
 * - 名额调大、重新开放：空出来的名额按先来后到给排队的人
 * 返回 { event, notify }
 */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { eventId } = await ctx.params;
  const event = await getEvent(eventId);
  if (!event) return fail(404, 'not-found', '这个活动不在了，刷新一下看看');
  const g = await gateHost(event.memberId);
  if (isFail(g)) return fail(g.status, g.error);

  const body = await readBody(request);
  if (!body) return fail(400, 'bad-body');

  // 整个改动放进 registrations 的临界区（取消、删除、报名都在这里面），并在里面重新读一次活动：
  // 不会把同一时刻刚被取消的活动改回「开放」，费用锁也按此刻真实的报名算
  type Out =
    | { kind: 'error'; status: number; code: string; message?: string }
    | { kind: 'ok'; before: SpaceEvent; next: SpaceEvent; regs: Registration[]; promoted: Registration[] };
  const res: Out = await transact('registrations', async rows => {
    const cur = await get('events', event.id);
    if (!cur) return { kind: 'error', status: 404, code: 'not-found', message: '这个活动不在了，刷新一下看看' };
    const parsed = parseEventInput(body, cur);
    if ('error' in parsed) return { kind: 'error', status: 400, code: 'invalid', message: parsed.error };
    const v = parsed.value;
    if (cur.status === 'cancelled' && v.status !== 'cancelled') {
      return { kind: 'error', status: 409, code: 'cancelled', message: '已经取消的活动不能再打开了。要办的话，重新建一场' };
    }
    if (cur.status !== 'cancelled' && v.status === 'cancelled') {
      return { kind: 'error', status: 400, code: 'use-cancel', message: '取消活动请用活动下面的「取消活动」按钮' };
    }
    const regs = rows.filter(r => r.eventId === cur.id && ACTIVE.has(r.status));
    if (v.feeCents !== cur.feeCents && regs.length) {
      return { kind: 'error', status: 409, code: 'fee-locked', message: `已经有 ${regs.length} 人报名了，费用不能再改——TA 们是按原来的价格报的。要改价的话，取消这一场、重新建一场。` };
    }
    if (v.feeCents > 0 && v.status === 'open' && !g.settings.payQr) {
      return { kind: 'error', status: 400, code: 'need-pay-qr', message: '收费活动开放报名之前，先在上面放一张收款码。' };
    }
    const next = await update('events', cur.id, { ...v, updatedAt: now() });
    if (!next) return { kind: 'error', status: 404, code: 'not-found', message: '这个活动不在了，刷新一下看看' };
    const before = regs.map(r => ({ ...r }));
    // 名额调大、从截止改回开放……空出来的名额先给排队的人（同一个临界区里）
    const promoted = regs.some(r => r.status === 'waitlist') ? settleWaitlist(next, rows) : [];
    return { kind: 'ok', before: cur, next, regs: before, promoted };
  });
  if (res.kind === 'error') return fail(res.status, res.code, res.message);
  const { next, regs, promoted } = res;

  const hostName = g.node.name || '';
  const notify: NotifyItem[] = [];
  const jobs: (() => Promise<void>)[] = [];

  const moved = timeOrPlaceChanged(res.before, next);
  if (moved) {
    const p = planNotices('event-changed', regs, next, hostName, `changed-${next.id}-${next.updatedAt}`);
    jobs.push(p.run);
    notify.push(...p.items);
  }
  if (promoted.length) {
    const p = planNotices('promoted', promoted, next, hostName, `promote-${next.id}-${next.updatedAt}`);
    jobs.push(p.run);
    notify.push(...p.items);
  }
  if (jobs.length) after(async () => { for (const j of jobs) await j(); });
  return NextResponse.json({ event: next, notify }, { headers: NO_STORE });
}

function timeOrPlaceChanged(a: SpaceEvent, b: SpaceEvent): boolean {
  return a.startsAt !== b.startsAt || (a.endsAt || null) !== (b.endsAt || null) || a.place.trim() !== b.place.trim() || a.mode !== b.mode;
}

/**
 * DELETE /api/space/events/{eventId}[?purge=1]
 * - 没人报过名：真删。
 * - 有人报过名：改成「已取消」——报名人手里的链接还要能打开，看到「活动取消了」，付过款的人也还查得到自己的记录。
 *   告诉已经报名的人（能发信的发信，其余的列进 notify；付过款的标出来，主人要退款）。
 * - purge=1：已经取消、而且没有进行中的报名（或者活动早就过去了）的，连同报名记录一起从列表里移走。
 *
 * 「有没有报名」和「真删」在 registrations 表的同一个临界区里：报名接口也在这个临界区里再读一次活动，
 * 两边不会交错出一条指向已删活动的孤儿报名。
 */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  const { eventId } = await ctx.params;
  const event = await getEvent(eventId);
  if (!event) return fail(404, 'not-found', '这个活动不在了，刷新一下看看');
  const g = await gateHost(event.memberId);
  if (isFail(g)) return fail(g.status, g.error);
  const purge = request.nextUrl.searchParams.get('purge') === '1';

  const res = await transact('registrations', async rows => {
    const mine = rows.filter(r => r.eventId === event.id);
    const active = mine.filter(r => ACTIVE.has(r.status));
    if (!mine.length) {
      await remove('events', event.id);
      return { kind: 'deleted' as const, files: [] as (string | null)[] };
    }
    if (purge) {
      const cur = await get('events', event.id);
      if (!cur || cur.status !== 'cancelled' || (active.length && !isPast(cur))) return { kind: 'not-purgeable' as const };
      const files = mine.map(r => r.proofFile);
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].eventId === event.id) rows.splice(i, 1);
      // 活动本身等报名记录真的删掉之后再删（见下面）：要是先删了活动、报名那一步又失败了，
      // 剩下的报名指向一个不存在的活动，再也清不掉。活动已经取消，这中间不会有新报名进来
      return { kind: 'purged' as const, files };
    }
    // 改成「已取消」也在这个临界区里做：之后进来的报名在临界区里读到的就是已取消，不会漏通知
    const cur = await get('events', event.id);
    if (!cur) return { kind: 'gone' as const };
    if (cur.status === 'cancelled') return { kind: 'cancel' as const, event: cur, active: [] as Registration[] };
    const next = await update('events', event.id, { status: 'cancelled', updatedAt: now() });
    if (!next) return { kind: 'gone' as const };
    return { kind: 'cancel' as const, event: next, active: active.map(r => ({ ...r })) };
  });

  if (res.kind === 'not-purgeable') {
    return fail(409, 'active', '还有进行中的报名，先别移走——报名人的链接还要能打开，看到「活动取消了」。活动过去以后再移走');
  }
  if (res.kind === 'purged') await remove('events', event.id);
  if (res.kind === 'deleted' || res.kind === 'purged') {
    await deleteUpload(event.coverImage);
    for (const f of res.files) await deleteUpload(f);
    return NextResponse.json({ deleted: true }, { headers: NO_STORE });
  }

  if (res.kind === 'gone') return fail(404, 'not-found', '这个活动不在了，刷新一下看看');
  const next = res.event;
  const p = planNotices('event-cancelled', res.active, next, g.node.name || '', `cancel-${next.id}`);
  after(p.run);
  const paid = new Set(res.active.filter(paidOf).map(r => r.id));
  const notify = p.items.map(i => (paid.has(i.id) ? { ...i, what: '活动取消了。TA 付过款，要退款', refund: true } : i));
  return NextResponse.json({ deleted: false, event: next, notify }, { headers: NO_STORE });
}
