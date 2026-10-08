import 'server-only';
import { randomInt } from 'node:crypto';
import { NextResponse } from 'next/server';
import { fetchMember } from './access';
import { get, list, transact } from './db';
import { clean, contactKey } from './guard';
import { getSettings } from './settings';
import {
  LIMITS,
  type EventMode,
  type EventStatus,
  type PublicEvent,
  type Registration,
  type RegistrationStatus,
  type SpaceEvent,
} from './types';

/**
 * 活动与报名的业务规则。
 *
 * 收费活动沿用冥想营的「先开后审」：报名 → 分到一个四位口令 → 扫主人的收款码付款、备注写口令
 * → 传一张付款截图 → 名额先占上 → 主人对着收款记录确认或驳回。
 * 截图不是验证（伪造工具满地都是），它的作用是威慑和证据；把关在主人核对那一步。
 */

/**
 * 收费活动报名后、还没传截图时，名额保留多久。
 * 不能太长：一条匿名请求就能占住一个名额；打开付款页时如果还有空位会自动续上（见 renewHold）。
 */
export const HOLD_MS = 60 * 60_000;
/** 活动结束后多久还算「近期」（结束时间没填时按开始时间算）——只管展示，不管能不能报名 */
const GRACE_MS = 24 * 3600_000;
/** 去掉了 0/O、1/I/L：手输备注时最容易错的就是这几个 */
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const MODES = new Set<EventMode>(['online', 'offline', 'both']);
const STATUSES = new Set<EventStatus>(['draft', 'open', 'closed', 'cancelled']);
const ID_RE = /^[0-9a-f-]{36}$/i;
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

export const MAX_CAPACITY = 10000;
export const MAX_FEE_CENTS = 10_000_000;
/** 同一个来源（没登录的）对同一场活动最多有几条进行中的报名：挡住一个人用一堆假联系方式占名额 */
export const MAX_ACTIVE_PER_SOURCE = 2;

/** 还算「活着」的报名（取消和驳回之外的） */
export const ACTIVE: ReadonlySet<RegistrationStatus> = new Set(['confirmed', 'pending', 'claimed', 'waitlist']);

export function isId(v: string): boolean {
  return ID_RE.test(v);
}

export function isToken(v: string): boolean {
  return TOKEN_RE.test(v);
}

/** 活动已经过去了：结束时间（没有就用开始时间）早于 24 小时前。只用来决定还挂不挂在「近期活动」里 */
export function isPast(e: Pick<SpaceEvent, 'startsAt' | 'endsAt'>, t: number = Date.now()): boolean {
  const end = Date.parse(e.endsAt || e.startsAt);
  return !Number.isFinite(end) || end < t - GRACE_MS;
}

/** 活动已经开始了：不能再报名、不能再付款 */
export function isStarted(e: Pick<SpaceEvent, 'startsAt'>, t: number = Date.now()): boolean {
  const s = Date.parse(e.startsAt);
  return !Number.isFinite(s) || s <= t;
}

/** 还能不能报名：开放报名，而且还没开始 */
export function isRegistrationOpen(e: Pick<SpaceEvent, 'status' | 'startsAt'>, t: number = Date.now()): boolean {
  return e.status === 'open' && !isStarted(e, t);
}

/**
 * 这条报名占不占名额：已确认、已传截图的占；等付款的只在保留期内占。
 *
 * pending 的起点用 updatedAt：新报名时它等于 createdAt；从排队转正成 pending、或者续期时是那一刻——
 * 用 createdAt 的话，排了三天队刚转正的人，名额一分钟都留不住。pending 状态下只有转正和续期会改 updatedAt。
 */
export function holdsSeat(r: Registration, t: number = Date.now()): boolean {
  if (r.status === 'confirmed' || r.status === 'claimed') return true;
  if (r.status === 'pending') return Date.parse(r.updatedAt || r.createdAt) > t - HOLD_MS;
  return false;
}

/** 等付款的名额保留到什么时候（ISO）；不是 pending 时为 null */
export function holdUntil(r: Registration): string | null {
  if (r.status !== 'pending') return null;
  const base = Date.parse(r.updatedAt || r.createdAt);
  return Number.isFinite(base) ? new Date(base + HOLD_MS).toISOString() : null;
}

/** 这条 pending 的名额保留是不是已经过期了 */
export function holdExpired(r: Registration, t: number = Date.now()): boolean {
  return r.status === 'pending' && !holdsSeat(r, t);
}

export function seatsTaken(rows: Registration[], eventId: string, excludeId?: string, t: number = Date.now()): number {
  let n = 0;
  for (const r of rows) if (r.eventId === eventId && r.id !== excludeId && holdsSeat(r, t)) n++;
  return n;
}

/** 剩余名额；不限名额时为 null */
export function seatsLeft(event: SpaceEvent, rows: Registration[], excludeId?: string, t: number = Date.now()): number | null {
  if (event.capacity === null) return null;
  return Math.max(0, event.capacity - seatsTaken(rows, event.id, excludeId, t));
}

/**
 * 把一条报名转正（排队 → 有名额）。费用用活动现在的费用：收费的转成等付款、分一个新口令、保留期从现在算；免费的直接确认。
 * 必须在 registrations 表的临界区里调（口令唯一靠这个）。
 */
export function applyPromotion(r: Registration, event: SpaceEvent, rows: Registration[], t: string): void {
  r.feeCents = event.feeCents;
  if (event.feeCents > 0) {
    r.status = 'pending';
    const clash = !r.payCode || rows.some(x => x.id !== r.id && x.memberId === r.memberId
      && (x.status === 'pending' || x.status === 'claimed') && x.payCode === r.payCode);
    if (clash) r.payCode = newPayCode(rows, r.memberId);
  } else {
    r.status = 'confirmed';
    r.payCode = null;
  }
  r.updatedAt = t;
}

/**
 * 先来后到：有空位、又有人在排队时，按报名先后把排队的人转正，直到名额占满或者没人排队。
 * 取消、驳回、保留期过了、主人调大名额，空出来的名额都先给排队的人，不给后来的新报名。
 * 活动开始了、取消了、还是草稿时不动。返回被转正的那几条（调用方负责提醒主人和报名人）。
 * 必须在 registrations 表的临界区里调。
 */
/**
 * 在 registrations 的临界区里重新读一次活动。临界区外面读到的那份可能已经过时——同一时刻被取消、
 * 改了名额或费用——拿它去结算排队、续名额，会给一个刚取消的活动「补上名额」。
 * 活动已经被删了的，当作已取消：什么都不结算。
 */
export async function freshEvent(event: SpaceEvent): Promise<SpaceEvent> {
  return (await get('events', event.id)) ?? { ...event, status: 'cancelled' };
}

export function settleWaitlist(event: SpaceEvent, rows: Registration[], t: number = Date.now()): Registration[] {
  if (event.status !== 'open' && event.status !== 'closed') return [];
  if (isStarted(event, t)) return [];
  const waiting = rows
    .filter(r => r.eventId === event.id && r.status === 'waitlist')
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const out: Registration[] = [];
  const iso = new Date(t).toISOString();
  for (const r of waiting) {
    const left = seatsLeft(event, rows, undefined, t);
    if (left !== null && left <= 0) break;
    applyPromotion(r, event, rows, iso);
    out.push({ ...r });
  }
  return out;
}

/** 在同一主人所有 pending/claimed 报名之间唯一的四位口令。必须在 registrations 表的临界区里调 */
export function newPayCode(rows: Registration[], memberId: string): string {
  const used = new Set(
    rows.filter(r => r.memberId === memberId && (r.status === 'pending' || r.status === 'claimed') && r.payCode)
      .map(r => r.payCode as string),
  );
  for (let i = 0; i < 500; i++) {
    let code = '';
    for (let k = 0; k < 4; k++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    if (!used.has(code)) return code;
  }
  throw new Error('pay-code-exhausted');
}

/** 封面照片的公开地址：带上更新时间，换了图浏览器不会拿旧的 */
export function coverUrlOf(e: Pick<SpaceEvent, 'id' | 'coverImage' | 'updatedAt'>): string | null {
  if (!e.coverImage) return null;
  const v = Date.parse(e.updatedAt) || 0;
  return `/api/space/event-image?e=${encodeURIComponent(e.id)}&v=${v.toString(36)}`;
}

export function toPublicEvent(e: SpaceEvent, rows: Registration[], t: number = Date.now()): PublicEvent {
  return {
    id: e.id,
    title: e.title,
    desc: e.desc,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    place: e.place,
    mode: e.mode,
    capacity: e.capacity,
    feeCents: e.feeCents,
    status: e.status,
    left: seatsLeft(e, rows, undefined, t),
    started: isStarted(e, t),
    coverUrl: coverUrlOf(e),
  };
}

/**
 * 访客能看到的活动：开放报名、还算「近期」的（开始了但没过去太久的也列着，标成已开始、不给报名），
 * 按开始时间升序。不含任何报名人信息
 */
export async function listPublicEvents(memberId: string): Promise<PublicEvent[]> {
  const t = Date.now();
  const events = await list('events', e => e.memberId === memberId && e.status === 'open' && !isPast(e, t));
  if (!events.length) return [];
  const rows = await list('registrations', r => r.memberId === memberId);
  return events
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .map(e => toPublicEvent(e, rows, t));
}

/** 这场活动对访客可见吗（公开页会列出来）：开放报名、还算近期 */
export function isEventPublic(e: SpaceEvent, t: number = Date.now()): boolean {
  return e.status === 'open' && !isPast(e, t);
}

/** 主人看的：全部活动（含草稿、截止、取消），附上占名额的人数 */
export async function listHostEvents(memberId: string): Promise<(SpaceEvent & { taken: number; left: number | null })[]> {
  const t = Date.now();
  const events = await list('events', e => e.memberId === memberId);
  const rows = await list('registrations', r => r.memberId === memberId);
  return events
    .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))
    .map(e => ({ ...e, taken: seatsTaken(rows, e.id, undefined, t), left: seatsLeft(e, rows, undefined, t) }));
}

export async function getEvent(eventId: string): Promise<SpaceEvent | null> {
  return isId(eventId) ? get('events', eventId) : null;
}

export async function findRegistration(token: string): Promise<Registration | null> {
  if (!isToken(token)) return null;
  return (await list('registrations', r => r.token === token))[0] ?? null;
}

export type EventInput = Pick<SpaceEvent, 'title' | 'desc' | 'startsAt' | 'endsAt' | 'place' | 'mode' | 'capacity' | 'feeCents' | 'status'>;

/**
 * 校验主人填的活动。只校验带了的字段（新建时没带的用默认值，修改时保持原值）；最后合起来再核一遍名字和开始/结束时间。
 * 返回 { error } 时 error 是一句可以直接给主人看的话。
 */
export function parseEventInput(
  body: Record<string, unknown>, cur: SpaceEvent | null,
): { value: EventInput } | { error: string } {
  // 没带的字段：新建时用默认值，修改时保持原值
  const has = (k: string) => k in body;
  const base: EventInput = cur
    ? { title: cur.title, desc: cur.desc, startsAt: cur.startsAt, endsAt: cur.endsAt, place: cur.place, mode: cur.mode, capacity: cur.capacity, feeCents: cur.feeCents, status: cur.status }
    : { title: '', desc: '', startsAt: '', endsAt: null, place: '', mode: 'offline', capacity: null, feeCents: 0, status: 'draft' };
  const v = { ...base };

  if (has('title')) v.title = clean(body.title, LIMITS.eventTitle);
  if (!v.title) return { error: '活动得有个名字' };
  if (has('desc')) v.desc = clean(body.desc, LIMITS.eventDesc);
  if (has('place')) v.place = clean(body.place, LIMITS.place);

  if (has('startsAt')) {
    const t = typeof body.startsAt === 'string' ? Date.parse(body.startsAt) : NaN;
    if (!Number.isFinite(t)) return { error: '开始时间没填，或者格式不对' };
    v.startsAt = new Date(t).toISOString();
  }
  if (has('endsAt')) {
    if (body.endsAt === null || body.endsAt === '' || body.endsAt === undefined) v.endsAt = null;
    else {
      const t = typeof body.endsAt === 'string' ? Date.parse(body.endsAt) : NaN;
      if (!Number.isFinite(t)) return { error: '结束时间的格式不对' };
      v.endsAt = new Date(t).toISOString();
    }
  }
  if (!v.startsAt) return { error: '开始时间没填，或者格式不对' };
  if (v.endsAt && Date.parse(v.endsAt) <= Date.parse(v.startsAt)) return { error: '结束时间要晚于开始时间' };

  if (has('mode')) {
    if (!MODES.has(body.mode as EventMode)) return { error: '选一下线上还是线下' };
    v.mode = body.mode as EventMode;
  }
  if (has('capacity')) {
    const c = body.capacity;
    if (c === null || c === '' || c === undefined) v.capacity = null;
    else {
      const n = Number(c);
      if (!Number.isInteger(n) || n < 1 || n > MAX_CAPACITY) return { error: `名额填 1 到 ${MAX_CAPACITY} 之间的整数，不限名额就空着` };
      v.capacity = n;
    }
  }
  if (has('feeCents')) {
    const n = Number(body.feeCents ?? 0);
    if (!Number.isInteger(n) || n < 0 || n > MAX_FEE_CENTS) return { error: '费用填 0（免费）或一个正常的金额' };
    v.feeCents = n;
  }
  if (has('status')) {
    if (!STATUSES.has(body.status as EventStatus)) return { error: '活动状态不对' };
    v.status = body.status as EventStatus;
  }
  return { value: v };
}

/** 接口统一的出错返回：error 给程序认，message 是一句可以直接给人看的话 */
export function fail(status: number, error: string, message?: string): NextResponse {
  return NextResponse.json(message ? { error, message } : { error }, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

/** 读 JSON 请求体，只接受对象 */
export async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await request.json();
    return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * 这位报名人现在能不能付款（看收款码、传截图）：收费、等付款或已传截图、活动没取消、还没开始；
 * 等付款超过保留期的，名额已经不给留了——还有空位（而且没人排在前面）才让付，免得付了钱却报不上。
 */
export function canPayNow(reg: Registration, event: SpaceEvent, rows: Registration[], t: number = Date.now()): boolean {
  if (reg.feeCents <= 0) return false;
  if (reg.status !== 'pending' && reg.status !== 'claimed') return false;
  if (event.status === 'cancelled') return false;
  if (isStarted(event, t)) return false;
  if (holdExpired(reg, t)) {
    if (rows.some(r => r.eventId === event.id && r.status === 'waitlist')) return false;
    const left = seatsLeft(event, rows, reg.id, t);
    return left === null || left > 0;
  }
  return true;
}

/**
 * 付款前先把名额占上：等付款的保留期过了、但现在还有空位时，把保留期从现在重新算。
 * 这样「看到收款码」和「传截图」之间，名额不会被别人拿走。在 registrations 的临界区里做。
 * 返回续上之后的这条报名；不需要续或者续不上时返回原样（从表里读到的最新值）。
 */
export async function renewHold(regId: string, stale: SpaceEvent): Promise<{ reg: Registration | null; promoted: Registration[] }> {
  return transact('registrations', async rows => {
    const r = rows.find(x => x.id === regId);
    if (!r) return { reg: null, promoted: [] };
    const event = await freshEvent(stale);
    const t = Date.now();
    // 先把空出来的名额按先来后到给排队的人，剩下的才轮到保留期过了的这位
    const promoted = settleWaitlist(event, rows, t);
    if (r.status === 'pending' && holdExpired(r, t) && canPayNow(r, event, rows.filter(x => x.eventId === event.id), t)) {
      r.updatedAt = new Date(t).toISOString();
    }
    return { reg: { ...r }, promoted };
  });
}

/** 报名人凭链接能看到的全部：自己这条报名 + 活动 + 主人的名字。不含任何别人的信息 */
export type RegistrationView = {
  registration: {
    name: string;
    note: string;
    status: RegistrationStatus;
    payCode: string | null;
    feeCents: number;
    claimedAt: string | null;
    hasProof: boolean;
    /** 只在被驳回时给（驳回原因） */
    hostNote: string;
    createdAt: string;
    /** 等付款超过保留期，名额不再保留 */
    holdExpired: boolean;
    /** 等付款的名额保留到什么时候（ISO）；不是等付款时为 null */
    holdUntil: string | null;
    canPay: boolean;
    canCancel: boolean;
  };
  event: Pick<SpaceEvent, 'id' | 'title' | 'desc' | 'startsAt' | 'endsAt' | 'place' | 'mode' | 'status'> & {
    past: boolean;
    /** 已经开始了：不能再付款 */
    started: boolean;
  };
  /** published：主人的空间现在是不是公开的（没发布时不给「回到 TA 的页面」，那个链接会是 404） */
  host: { memberId: string; name: string; spaceUrl: string; published: boolean };
  payQrReady: boolean;
};

/** 读报名人的视图。已经拿到最新的报名（比如刚续过期）时传 fresh，省一次查询 */
export async function loadRegistrationView(token: string, fresh?: Registration | null): Promise<RegistrationView | null> {
  const reg = fresh && fresh.token === token ? fresh : await findRegistration(token);
  if (!reg) return null;
  const event = await get('events', reg.eventId);
  if (!event) return null;
  const t = Date.now();
  const rows = await list('registrations', r => r.eventId === event.id);
  const settings = await getSettings(reg.memberId);
  let hostName = '';
  try {
    hostName = (await fetchMember(reg.memberId))?.name || '';
  } catch {
    // 查不到主人名字不影响报名人看自己的报名
  }
  const past = isPast(event, t);
  const started = isStarted(event, t);
  return {
    registration: {
      name: reg.name,
      note: reg.note,
      status: reg.status,
      payCode: reg.status === 'pending' || reg.status === 'claimed' ? reg.payCode : null,
      feeCents: reg.feeCents,
      claimedAt: reg.claimedAt,
      hasProof: !!reg.proofFile,
      hostNote: reg.status === 'rejected' ? reg.hostNote : '',
      createdAt: reg.createdAt,
      holdExpired: holdExpired(reg, t),
      holdUntil: holdUntil(reg),
      canPay: canPayNow(reg, event, rows, t),
      canCancel: ACTIVE.has(reg.status) && event.status !== 'cancelled' && !started,
    },
    event: {
      id: event.id, title: event.title, desc: event.desc, startsAt: event.startsAt, endsAt: event.endsAt,
      place: event.place, mode: event.mode, status: event.status, past, started,
    },
    host: {
      memberId: reg.memberId,
      name: hostName,
      spaceUrl: settings.slug ? `/@${settings.slug}` : `/space/${reg.memberId}`,
      published: settings.published,
    },
    payQrReady: !!settings.payQr,
  };
}

/** 主人在名单里看到的一条报名：联系方式在这里（只有主人和管理员拿得到），存储路径和来源哈希不给 */
export type HostRegistration = Omit<Registration, 'token' | 'proofFile' | 'memberId' | 'sourceKey'> & {
  hasProof: boolean;
  /** 等付款超过保留期，名额不再保留 */
  holdExpired: boolean;
  /** 等付款的名额保留到什么时候 */
  holdUntil: string | null;
  /** TA 的报名链接（站内路径）：TA 丢了链接时，主人可以复制了再发给 TA。主人本来就看得到联系方式，交出链接不扩大权限 */
  link: string;
  /** 联系方式或来源已经被屏蔽 */
  blocked: boolean;
};

export function toHostRegistration(r: Registration, blocked: ReadonlySet<string>, t: number = Date.now()): HostRegistration {
  const { token, proofFile, memberId: _m, sourceKey, ...rest } = r;
  void _m;
  return {
    ...rest,
    hasProof: !!proofFile,
    holdExpired: holdExpired(r, t),
    holdUntil: holdUntil(r),
    link: `/space/r/${token}`,
    blocked: blocked.has(contactKey(r.contact)) || (!!sourceKey && blocked.has(sourceKey)),
  };
}
