import { after, NextRequest, NextResponse } from 'next/server';
import { get, list, newId, newToken, transact } from '@/lib/space/db';
import {
  ACTIVE, fail, getEvent, holdUntil, isRegistrationOpen, isStarted, isToken, MAX_ACTIVE_PER_SOURCE, newPayCode, readBody,
  seatsLeft, settleWaitlist,
} from '@/lib/space/events';
import { formatFee } from '@/lib/space/eventTime';
import { gateSpace, isFail } from '@/lib/space/gate';
import { admit, clean, cleanLine, contactKey, honeypot, isBlocked, sourceKey } from '@/lib/space/guard';
import { managePath, tellHost } from '@/lib/space/mail';
import { announcePromotions } from '@/lib/space/registrantMail';
import { LIMITS, type Registration, type SpaceEvent } from '@/lib/space/types';
import { canSee } from '@/lib/space/viewer';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

type Ctx = { params: Promise<{ eventId: string }> };

const CONTACT_TAKEN = '这个联系方式已经报过这场活动了。打开当时的报名链接就能看到；找不到链接的话，直接联系主人，TA 可以把链接再发给你。';
const SOURCE_FULL = '同一个网络下已经有两个人报了这场活动。还要替别人报名的话，登录附近森林再报，或者直接联系主人。';

type Plan =
  | { kind: 'new'; row: Registration }
  | { kind: 'again'; row: Registration }
  | { kind: 'error'; error: 'contact-taken' | 'source-full' | 'closed' };

/** 再报一次的人是不是本人：同一个登录成员，或者手里拿着那条报名的链接口令。名字和联系方式别人也可能知道，不算 */
function isSameRegistrant(r: Registration, viewerId: string, token: string): boolean {
  if (viewerId && r.visitorMemberId === viewerId) return true;
  return !!token && r.token === token;
}

/**
 * 在 registrations 的临界区里决定这次报名怎么落：查重、同一来源的上限、先来后到、名额、口令。
 * 顺带把空出来的名额按先来后到给排队的人（promoted），调用方负责提醒。
 */
function plan(rows: Registration[], event: SpaceEvent, input: {
  name: string; contact: string; note: string; ck: string; source: string; viewerId: string; token: string;
}, t: number): { plan: Plan; promoted: Registration[] } {
  const promoted = settleWaitlist(event, rows, t);
  const dup = rows.find(r => r.eventId === event.id && r.status !== 'cancelled' && contactKey(r.contact) === input.ck)
    // 同一个登录成员换了个联系方式再报，也认成同一条
    ?? (input.viewerId ? rows.find(r => r.eventId === event.id && ACTIVE.has(r.status) && r.visitorMemberId === input.viewerId) : undefined);
  if (dup) {
    return {
      plan: isSameRegistrant(dup, input.viewerId, input.token) ? { kind: 'again', row: { ...dup } } : { kind: 'error', error: 'contact-taken' },
      promoted,
    };
  }
  if (!input.viewerId) {
    const fromSource = rows.filter(r => r.eventId === event.id && ACTIVE.has(r.status) && !r.visitorMemberId && r.sourceKey === input.source).length;
    if (fromSource >= MAX_ACTIVE_PER_SOURCE) return { plan: { kind: 'error', error: 'source-full' }, promoted };
  }
  // settleWaitlist 之后还有人排队，说明名额已经满了；没人排队时才看剩余名额
  const queued = rows.some(r => r.eventId === event.id && r.status === 'waitlist');
  const left = seatsLeft(event, rows, undefined, t);
  const hasSeat = !queued && (left === null || left > 0);
  const fee = event.feeCents;
  const status: Registration['status'] = !hasSeat ? 'waitlist' : fee > 0 ? 'pending' : 'confirmed';
  const iso = new Date(t).toISOString();
  const row: Registration = {
    id: newId(),
    eventId: event.id,
    memberId: event.memberId,
    name: input.name,
    contact: input.contact,
    note: input.note,
    visitorMemberId: input.viewerId || null,
    status,
    payCode: status === 'pending' ? newPayCode(rows, event.memberId) : null,
    feeCents: fee,
    proofFile: null,
    claimedAt: null,
    hostNote: '',
    token: newToken(),
    sourceKey: input.source,
    createdAt: iso,
    updatedAt: iso,
  };
  return { plan: { kind: 'new', row }, promoted };
}

/**
 * POST /api/space/events/{eventId}/register
 * body: { name, contact, note, token?(这台设备上之前报名拿到的口令), website(蜜罐) }
 *
 * - 活动开始之后不能报名（开始前都可以）
 * - 免费活动：有名额就 confirmed，满了排队
 * - 收费活动：有名额就 pending 并分一个四位口令（名额留 60 分钟，等付款截图），满了排队（不分口令）
 * - 先来后到：有人在排队时，新报名一律排在后面
 * - 同一个联系方式再报一次：只有同一个登录成员、或者带着之前那条报名的口令，才把原来那条还给 TA；
 *   否则 409——光凭名字和联系方式就交出链接，别人就能看到、甚至取消 TA 的报名
 * - 同一个来源（没登录的）对同一场活动最多两条进行中的报名
 * - 被主人屏蔽的：看起来和「名额满了，排上队了」一样，但不入库、不提醒主人
 *
 * 名额的判断和插入在 registrations 表的同一个临界区里：两个人同时抢最后一个名额只会成功一个。
 * 返回 { token, status, payCode, feeCents, holdUntil, again }。token 是报名人以后查看自己报名的唯一凭证。
 */
export async function POST(request: NextRequest, ctx: Ctx) {
  const { eventId } = await ctx.params;
  const event = await getEvent(eventId);
  if (!event) return fail(404, 'not-found', '这个活动找不到了，可能已经被主人撤下');
  const g = await gateSpace(event.memberId);
  if (isFail(g)) return fail(g.status, g.error);
  // 「一起做点什么」这一章对 TA 不可见，活动也就不存在
  if (!g.host && !canSee(g.settings.visibility.offer, g.viewer)) return fail(404, 'not-found');
  if (!isRegistrationOpen(event)) return closed(event);

  const body = await readBody(request);
  if (!body) return fail(400, 'bad-body', '提交的内容不完整，刷新页面再试一次');
  if (honeypot(body)) return fail(400, 'rejected', '没有提交成功，刷新页面再试一次');

  const name = cleanLine(body.name, LIMITS.name);
  const contact = cleanLine(body.contact, LIMITS.contact);
  const note = clean(body.note, LIMITS.note);
  const token = typeof body.token === 'string' && isToken(body.token.trim()) ? body.token.trim() : '';
  if (!name) return fail(400, 'missing-name', '留个名字吧，主人好认出你');
  if (!contact) return fail(400, 'missing-contact', '留一个联系方式（微信号、手机或邮箱），主人才能找到你');

  const source = sourceKey(request);
  const ck = contactKey(contact);
  const viewerId = g.viewer.viewerId;

  // 被主人屏蔽的：和其他两处（打招呼、预约）一样，给一个看起来正常的结果，不入库、不提醒主人
  if (!g.host && isBlocked(g.settings.blocked, contact, source)) {
    return NextResponse.json({
      token: newToken(), status: 'waitlist', payCode: null, feeCents: event.feeCents, holdUntil: null, again: false,
    }, { headers: NO_STORE });
  }

  // 先在临界区外预判一次：重复报名（还给本人）和明显的拒绝不用计数，也不占防刷的额度
  const pre = plan(
    structuredClone(await list('registrations', r => r.eventId === event.id)), event,
    { name, contact, note, ck, source, viewerId, token }, Date.now(),
  ).plan;
  if (pre.kind === 'again') return respond(pre.row, true);
  if (pre.kind === 'error' && pre.error !== 'contact-taken') return planError(pre.error, event);

  // 真要写入（或者试探一个别人已经用过的联系方式）才计数
  const gate = admit(request, { action: 'register', memberId: g.memberId, contact });
  if (!gate.ok) return fail(gate.status, gate.error, gate.message);
  if (pre.kind === 'error') return planError(pre.error, event);

  let promoted: Registration[] = [];
  let planned: Registration | null = null;
  let res: Plan;
  try {
    res = await transact('registrations', async rows => {
      // 活动在同一个临界区里再读一次：删活动也是在这个临界区里查「有没有报名」再删的，这样不会留下孤儿报名
      const cur = await get('events', event.id);
      if (!cur || !isRegistrationOpen(cur)) return { kind: 'error', error: 'closed' } as Plan;
      const out = plan(rows, cur, { name, contact, note, ck, source, viewerId, token }, Date.now());
      promoted = out.promoted;
      if (out.plan.kind === 'new') {
        rows.push(out.plan.row);
        planned = out.plan.row;
      }
      return out.plan;
    });
  } catch (err) {
    // 写库报错（比如超时）不一定是没写上：数据库那边可能已经存好了。查一下那一条在不在——
    // 在的话照常把口令交给 TA，不然 TA 拿不到链接，再报一次又被当成「这个联系方式报过了」
    const mine = planned as Registration | null;
    const landed = mine ? await get('registrations', mine.id).catch(() => null) : null;
    if (!landed || landed.token !== mine?.token) {
      console.error('[space] register failed', err);
      return fail(503, 'storage-unavailable', '报名没有提交上，过一会再试一次');
    }
    res = { kind: 'new', row: landed };
  }

  if (promoted.length) {
    const moved = promoted;
    after(() => announcePromotions(event, moved));
  }
  if (res.kind === 'error') {
    if (res.error === 'closed') return closed((await getEvent(event.id)) ?? event);
    return planError(res.error, event);
  }
  if (res.kind === 'again') return respond(res.row, true);

  const got = res.row;
  const hostEmail = g.node.email;
  const title = event.title;
  after(() => tellHost({
    memberId: g.memberId,
    hostEmail,
    subject: `「${title}」有新报名`,
    lines: [
      `${got.name} 报名了「${title}」。`,
      got.status === 'confirmed'
        ? '免费活动，已经自动确认。'
        : got.status === 'pending'
          ? `收费活动（${formatFee(got.feeCents)}），TA 的付款口令是 ${got.payCode}。等 TA 付完款、传了截图，我再提醒你。`
          : '名额已经满了，TA 在排队。有人退出时，排在最前面的会自动转正。',
      '联系方式在管理页里看。',
    ],
    path: managePath(g.memberId, 'events'),
    linkLabel: '去管理页看报名',
    key: `reg-${got.id}`,
  }));
  return respond(got, false);
}

function respond(r: Registration, again: boolean): NextResponse {
  return NextResponse.json({
    token: r.token,
    status: r.status,
    payCode: r.status === 'pending' || r.status === 'claimed' ? r.payCode : null,
    feeCents: r.feeCents,
    holdUntil: holdUntil(r),
    again,
  }, { headers: NO_STORE });
}

function closed(event: SpaceEvent): NextResponse {
  if (event.status === 'cancelled') return fail(409, 'closed', '这场活动取消了');
  if (event.status === 'open' && isStarted(event)) return fail(409, 'started', '活动已经开始了，这次不能报名了');
  return fail(409, 'closed', '这场活动已经不收报名了');
}

function planError(error: 'contact-taken' | 'source-full' | 'closed', event: SpaceEvent): NextResponse {
  if (error === 'contact-taken') return fail(409, 'contact-taken', CONTACT_TAKEN);
  if (error === 'source-full') return fail(409, 'source-full', SOURCE_FULL);
  return closed(event);
}
