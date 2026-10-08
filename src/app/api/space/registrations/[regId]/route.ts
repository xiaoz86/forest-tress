import { after, NextRequest, NextResponse } from 'next/server';
import { deleteUpload, get, now, transact } from '@/lib/space/db';
import { ACTIVE, applyPromotion, fail, isId, readBody, settleWaitlist, toHostRegistration, freshEvent } from '@/lib/space/events';
import { gateHost, isFail } from '@/lib/space/gate';
import { clean, contactKey } from '@/lib/space/guard';
import { planNotices, type Change, type NotifyItem } from '@/lib/space/registrantMail';
import { saveSettings } from '@/lib/space/settings';
import { LIMITS, type Registration, type RegistrationStatus } from '@/lib/space/types';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

type Ctx = { params: Promise<{ regId: string }> };
type Action = 'confirm' | 'reject' | 'promote' | 'cancel' | 'block' | 'unblock';

/** 每个操作能从哪些状态出发（block / unblock 任何状态都行） */
const FROM: Record<Action, RegistrationStatus[] | null> = {
  // 核对过付款；或者主人改了主意，把驳回的重新确认
  confirm: ['pending', 'claimed', 'rejected'],
  reject: ['pending', 'claimed', 'waitlist', 'confirmed'],
  promote: ['waitlist'],
  cancel: ['confirmed', 'pending', 'claimed', 'waitlist'],
  block: null,
  unblock: null,
};

/** 这个操作之后，报名人要知道什么 */
const CHANGE: Partial<Record<Action, Change>> = {
  confirm: 'confirmed',
  reject: 'rejected',
  promote: 'promoted',
  cancel: 'host-cancelled',
};

async function load(regId: string) {
  if (!isId(regId)) return null;
  const reg = await get('registrations', regId);
  if (!reg) return null;
  const g = await gateHost(reg.memberId);
  return { reg, g };
}

/**
 * PATCH /api/space/registrations/{regId}  body: { action, hostNote?, cancel? }
 * - confirm：确认（收费活动核对过付款）
 * - reject：驳回，hostNote 是驳回原因——报名人在自己的报名页能看到
 * - promote：从排队转正。按活动现在的费用：免费直接确认；收费转成等付款、分一个口令，名额从这一刻起保留
 * - cancel：替报名人取消
 * - block：屏蔽这个人（联系方式 + 提交来源）；cancel: true 时顺手取消这条报名、把名额放出来。不通知对方
 * - unblock：解除屏蔽
 * 主人的操作不受名额限制（转正超出名额是主人自己的决定），名单上会看到人数。
 * 取消、驳回空出来的名额，按先来后到自动给排队的人。
 *
 * 返回 { registration, notify }：notify 是这次要告诉的报名人（被操作的这位、被自动转正的人）。
 * 联系方式是邮箱的已经发了信；其他的由主人在界面上「去通知 TA」。
 */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { regId } = await ctx.params;
  const found = await load(regId);
  if (!found) return fail(404, 'not-found', '这条报名不在了，刷新一下看看');
  if (isFail(found.g)) return fail(found.g.status, found.g.error);
  const g = found.g;
  const body = await readBody(request);
  const action = body?.action as Action;
  if (!body || typeof action !== 'string' || !Object.hasOwn(FROM, action)) return fail(400, 'bad-action');
  const hostNote = clean(body.hostNote, LIMITS.note);
  const eventBefore = await get('events', found.reg.eventId);
  if (!eventBefore) return fail(404, 'not-found', '这个活动不在了，刷新一下看看');

  if (action === 'block' || action === 'unblock') {
    const keys = [contactKey(found.reg.contact)];
    if (found.reg.sourceKey) keys.push(found.reg.sourceKey);
    const saved = await saveSettings(g.memberId, action === 'block' ? { blockAdd: keys } : { blockRemove: keys });
    if ('error' in saved) return fail(400, 'too-many-blocked', saved.error);
  }
  const cancelToo = action === 'block' && body.cancel === true && ACTIVE.has(found.reg.status);

  const res = await transact('registrations', async rows => {
    const r = rows.find(x => x.id === found.reg.id);
    if (!r) return { error: 'gone' as const };
    // 活动在临界区里重读一次：外面那份可能已经被取消或改了名额
    const event = await freshEvent(eventBefore);
    const from = FROM[action];
    if (from && !from.includes(r.status)) return { error: 'state' as const };
    const t = now();
    let promoted: Registration[] = [];
    if (action === 'confirm') {
      r.status = 'confirmed';
      r.hostNote = '';
      r.updatedAt = t;
    } else if (action === 'reject') {
      r.status = 'rejected';
      r.hostNote = hostNote;
      r.updatedAt = t;
    } else if (action === 'cancel' || (cancelToo && ACTIVE.has(r.status))) {
      r.status = 'cancelled';
      r.updatedAt = t;
    } else if (action === 'promote') {
      applyPromotion(r, event, rows, t);
    }
    if (action === 'reject' || action === 'cancel' || cancelToo) promoted = settleWaitlist(event, rows);
    return { row: { ...r } as Registration, promoted, event };
  });
  if ('error' in res) {
    return res.error === 'gone'
      ? fail(404, 'not-found', '这条报名不在了，刷新一下看看')
      : fail(409, 'state', '这条报名的状态已经变了，刷新一下再操作');
  }

  const hostName = g.node.name || '';
  const notify: NotifyItem[] = [];
  const jobs: (() => Promise<void>)[] = [];
  const change = CHANGE[action];
  if (change) {
    const p = planNotices(change, [res.row], res.event, hostName, `${action}-${res.row.id}-${res.row.updatedAt}`);
    jobs.push(p.run);
    // 确认只发信，不再列「去通知 TA」：TA 的报名页上已经写着「报上了」
    if (action !== 'confirm') notify.push(...p.items);
  }
  if (res.promoted.length) {
    const p = planNotices('promoted', res.promoted, res.event, hostName, `promote-${res.promoted.map(r => r.id).join('-').slice(0, 120)}-${res.row.updatedAt}`);
    jobs.push(p.run);
    notify.push(...p.items);
  }
  if (jobs.length) after(async () => { for (const j of jobs) await j(); });

  const saved = found.g.settings;
  const blocked = new Set(saved.blocked);
  if (action === 'block') {
    blocked.add(contactKey(res.row.contact));
    if (res.row.sourceKey) blocked.add(res.row.sourceKey);
  } else if (action === 'unblock') {
    blocked.delete(contactKey(res.row.contact));
    if (res.row.sourceKey) blocked.delete(res.row.sourceKey);
  }
  return NextResponse.json({ registration: toHostRegistration(res.row, blocked), notify }, { headers: NO_STORE });
}

/**
 * DELETE /api/space/registrations/{regId} —— 主人删掉一条报名（比如自己预览时报的测试报名）。
 * 还在进行中的（已确认、等付款、已传截图、排队）先取消再删，免得误删一个付过款的人。
 */
export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const { regId } = await ctx.params;
  const found = await load(regId);
  if (!found) return fail(404, 'not-found', '这条报名不在了，刷新一下看看');
  if (isFail(found.g)) return fail(found.g.status, found.g.error);
  const res = await transact('registrations', rows => {
    const i = rows.findIndex(x => x.id === found.reg.id);
    if (i < 0) return { error: 'gone' as const };
    if (ACTIVE.has(rows[i].status)) return { error: 'active' as const };
    const [r] = rows.splice(i, 1);
    return { proof: r.proofFile };
  });
  if ('error' in res) {
    return res.error === 'gone'
      ? fail(404, 'not-found', '这条报名不在了，刷新一下看看')
      : fail(409, 'active', '这条报名还在进行中，先点「取消」再删');
  }
  await deleteUpload(res.proof);
  return NextResponse.json({ deleted: true });
}
