// phil-coach 的免费期：成员能免费用到哪一天、到期了怎么续。
//
// 规则（2026 秋天这一期）：
// - 11 月 15 日（含）之前成为成员的：送 3 个月。
//   10 月 15 日之前就在的老成员从 10 月 15 日算起，之后注册的从注册当天算起；
// - 11 月 15 日之后注册的：送 14 天；
// - 到期之后，在页面上点「申请继续使用」，主理人或 Wendy 在邮件里点「通过」，再开 3 个月。
//
// 免费期不存库，每次用节点卡的 created_at 现算，所以改规则只改这里的常量；
// 只有「续期续到了哪天」需要记下来，存在 phil_coach_access（见 supabase-setup.sql）。
//
// 日期一律按北京时间的「日」来算，free_until 是能用的最后一天（含当天）。
// 天数按字面算足、不多给：10 月 15 日起 3 个月 = 用到 1 月 14 日；11 月 20 日注册的 14 天 = 用到 12 月 3 日。
//
// 读不到数据（表还没建、Supabase 不可用）时 loadAccess 返回 null，调用方一律放行：
// 对话可用性优先于闸门严格性，和 phil-coach 其他闸门一个原则。

import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/** 这一期活动的第一天：老成员从这天起算 3 个月 */
export const PROMO_START = '2026-10-15';
/** 这一天（含）之前成为成员的，送 3 个月 */
export const PROMO_LAST_DAY = '2026-11-15';
export const PROMO_MONTHS = 3;
/** 活动截止之后注册的，送多少天 */
export const TRIAL_DAYS = 14;
/** 每次续期续多久 */
export const RENEW_MONTHS = 3;
/**
 * 免费期还剩几天以内，接口才收续期申请。
 * 页面上目前只在过期被拦下时才出「申请继续使用」，所以实际走到这里的都已经过期；
 * 留着这个窗口，是为了以后想提前提醒时不用再动服务端。
 */
export const RENEW_WINDOW_DAYS = 7;

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 北京时间的日期，形如 2026-10-15 */
export type DayKey = string;

export function shanghaiDay(at: Date): DayKey {
  return new Date(at.getTime() + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
}

function parseDay(day: DayKey): { y: number; m: number; d: number } {
  const [y, m, d] = day.split('-').map(Number);
  return { y, m, d };
}

function dayFromParts(y: number, m: number, d: number): DayKey {
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
}

export function addDays(day: DayKey, days: number): DayKey {
  const { y, m, d } = parseDay(day);
  return dayFromParts(y, m, d + days);
}

/** 加几个月；目标月没有这一天时落在月底（8 月 31 日 + 3 个月 = 11 月 30 日） */
export function addMonths(day: DayKey, months: number): DayKey {
  const { y, m, d } = parseDay(day);
  const lastDayOfTarget = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return dayFromParts(y, m + months, Math.min(d, lastDayOfTarget));
}

const maxDay = (a: DayKey, b: DayKey): DayKey => (a > b ? a : b);

/** 两个日期之间差几天（b - a） */
function daysBetween(a: DayKey, b: DayKey): number {
  const pa = parseDay(a);
  const pb = parseDay(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / DAY_MS);
}

/** 从 start 这天起、为期几个月，最后一天是哪天（含）：10-15 起 3 个月 → 1-14 */
export function lastDayAfterMonths(start: DayKey, months: number): DayKey {
  return addDays(addMonths(start, months), -1);
}

/** 按注册时间算出来的免费期最后一天（还没算续期） */
export function baseFreeUntil(createdAt: string | null | undefined): DayKey {
  const t = createdAt ? new Date(createdAt) : null;
  // 没有注册时间的老数据，当作活动开始前就在的老成员
  const joined = t && !Number.isNaN(t.getTime()) ? shanghaiDay(t) : PROMO_START;
  if (joined <= PROMO_LAST_DAY) return lastDayAfterMonths(maxDay(joined, PROMO_START), PROMO_MONTHS);
  return addDays(joined, TRIAL_DAYS - 1);
}

/**
 * 续期通过后用到哪天：还没到期就从原来最后一天的下一天往后接，
 * 已经过期了就从今天起算。确认页和真正通过用的是同一个算法。
 */
export function renewedFreeUntil(access: PhilAccess, now: Date = new Date()): DayKey {
  const start = access.active ? addDays(access.freeUntil, 1) : shanghaiDay(now);
  return lastDayAfterMonths(start, RENEW_MONTHS);
}

export type PhilAccessRow = {
  member_id: string;
  free_until: DayKey | null;
  renew_token: string | null;
  renew_requested_at: string | null;
  renew_approved_at: string | null;
};

export type PhilAccess = {
  /** 免费期最后一天（含），北京时间 */
  freeUntil: DayKey;
  active: boolean;
  /** 还剩几天：今天是最后一天时为 0，过期为负数 */
  daysLeft: number;
  /** 已经申请续期、还没被通过 */
  renewalPending: boolean;
  /** 现在能不能申请续期：过期了，或者只剩 RENEW_WINDOW_DAYS 天以内 */
  canRenew: boolean;
};

export function computeAccess(
  createdAt: string | null | undefined,
  row: Pick<PhilAccessRow, 'free_until' | 'renew_token'> | null,
  now: Date = new Date(),
): PhilAccess {
  const base = baseFreeUntil(createdAt);
  const freeUntil = row?.free_until ? maxDay(base, row.free_until) : base;
  const today = shanghaiDay(now);
  const daysLeft = daysBetween(today, freeUntil);
  return {
    freeUntil,
    active: daysLeft >= 0,
    daysLeft,
    renewalPending: Boolean(row?.renew_token),
    canRenew: daysLeft <= RENEW_WINDOW_DAYS,
  };
}

type Loaded = { access: PhilAccess; row: PhilAccessRow | null; name: string; email: string; locale: string };

async function loadAll(sb: SupabaseClient, memberId: string, now: Date = new Date()): Promise<Loaded | null> {
  const [card, acc] = await Promise.all([
    sb.from('node_cards').select('name, email, locale, created_at').eq('id', memberId).maybeSingle(),
    sb
      .from('phil_coach_access')
      .select('member_id, free_until, renew_token, renew_requested_at, renew_approved_at')
      .eq('member_id', memberId)
      .maybeSingle(),
  ]);
  if (card.error || acc.error || !card.data) return null;
  const row = (acc.data as PhilAccessRow | null) ?? null;
  return {
    access: computeAccess(card.data.created_at as string | null, row, now),
    row,
    name: String(card.data.name || ''),
    email: String(card.data.email || ''),
    locale: String(card.data.locale || 'zh'),
  };
}

/** 这位成员现在的免费期；读不到就返回 null（调用方放行） */
export async function loadAccess(sb: SupabaseClient, memberId: string): Promise<PhilAccess | null> {
  try {
    return (await loadAll(sb, memberId))?.access ?? null;
  } catch {
    return null;
  }
}

export type RenewRequest =
  | { kind: 'requested'; token: string; name: string; email: string; access: PhilAccess }
  | { kind: 'already-pending'; access: PhilAccess }
  | { kind: 'not-yet'; access: PhilAccess }
  | { kind: 'unavailable' };

/**
 * 成员申请续期。已经在等的不再发一次信（防止反复点按钮刷邮箱）；
 * 离到期还早的也不收——那时候申请，通过了也只是往后顺延，没必要打扰主理人。
 */
export async function requestRenewal(sb: SupabaseClient, memberId: string): Promise<RenewRequest> {
  const loaded = await loadAll(sb, memberId).catch(() => null);
  if (!loaded) return { kind: 'unavailable' };
  const { access } = loaded;
  if (access.renewalPending) return { kind: 'already-pending', access };
  if (!access.canRenew) return { kind: 'not-yet', access };

  /**
   * 只在「还没有待处理的申请」时写：两个标签页同时点，先写进去的那个算数，
   * 后一个看到已经有了就当 already-pending，不再发第二封信——
   * 否则后写的 token 会盖掉先写的，先到的那封信点开就成了一个失效的链接。
   */
  const token = randomBytes(12).toString('base64url');
  const nowIso = new Date().toISOString();
  const fields = { renew_token: token, renew_requested_at: nowIso, updated_at: nowIso };
  const { data, error } = loaded.row
    ? await sb
        .from('phil_coach_access')
        .update(fields)
        .eq('member_id', memberId)
        .is('renew_token', null)
        .select('member_id')
    : await sb
        .from('phil_coach_access')
        .upsert({ member_id: memberId, ...fields }, { onConflict: 'member_id', ignoreDuplicates: true })
        .select('member_id');
  if (error) return { kind: 'unavailable' };
  if (!data || data.length === 0) return { kind: 'already-pending', access: { ...access, renewalPending: true } };
  return {
    kind: 'requested',
    token,
    name: loaded.name,
    email: loaded.email,
    access: { ...access, renewalPending: true },
  };
}

/**
 * 申请的通知信没发出去：把这次申请撤掉，让人能再点一次。
 * 不撤的话，页面显示「已申请」、主理人却什么都没收到，人只能干等。
 */
export async function cancelRenewal(sb: SupabaseClient, memberId: string, token: string): Promise<void> {
  await sb
    .from('phil_coach_access')
    .update({ renew_token: null, updated_at: new Date().toISOString() })
    .eq('member_id', memberId)
    .eq('renew_token', token);
}

/** 「通过」链接签名里的那一段：成员 id + 这一次申请的 token，换一次申请旧链接就作废 */
export function renewActionPayload(memberId: string, token: string): string {
  return `phil-access.${memberId}.${token}`;
}

export type RenewApproval =
  | { kind: 'approved'; freeUntil: DayKey; name: string; email: string; locale: string }
  | { kind: 'already-done'; freeUntil: DayKey; name: string }
  /** 链接对不上、人也还在过期中：多半是撤回了或有更新的一封申请，不能说成「已处理」 */
  | { kind: 'stale'; freeUntil: DayKey; name: string }
  | { kind: 'not-found' }
  | { kind: 'unavailable' };

/**
 * 主理人在邮件里点「通过」。
 *
 * 一次申请只续一次：链接带着申请时生成的 token，通过时把它清掉，
 * 主理人和 Wendy 都点了，第二个人看到的是「已经续过了」，不会续出 6 个月。
 * 清 token 的那一下带着「token 还是这个」的条件，两人同时点也只有一个生效。
 *
 * 还没到期就通过的，从原来的最后一天往后接 3 个月；过期了才通过的，从今天起算（见 renewedFreeUntil）。
 */
export async function approveRenewal(
  sb: SupabaseClient,
  memberId: string,
  token: string,
  now: Date = new Date(),
): Promise<RenewApproval> {
  const loaded = await loadAll(sb, memberId, now).catch(() => null);
  if (!loaded) return { kind: 'unavailable' };
  const { access, row, name, email, locale } = loaded;
  if (!row) return { kind: 'not-found' };
  if (!row.renew_token || row.renew_token !== token) {
    return access.active
      ? { kind: 'already-done', freeUntil: access.freeUntil, name }
      : { kind: 'stale', freeUntil: access.freeUntil, name };
  }

  const freeUntil = renewedFreeUntil(access, now);
  const { data, error } = await sb
    .from('phil_coach_access')
    .update({
      free_until: freeUntil,
      renew_token: null,
      renew_approved_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('member_id', memberId)
    .eq('renew_token', token)
    .select('member_id');
  if (error) return { kind: 'unavailable' };
  if (!data || data.length === 0) {
    // 另一个人刚好先点了
    const again = await loadAll(sb, memberId, now).catch(() => null);
    return { kind: 'already-done', freeUntil: again?.access.freeUntil ?? access.freeUntil, name };
  }
  return { kind: 'approved', freeUntil, name, email, locale };
}

/** 2027-01-15 → 2027 年 1 月 15 日 */
export function formatDayZh(day: DayKey): string {
  const { y, m, d } = parseDay(day);
  return `${y} 年 ${m} 月 ${d} 日`;
}
