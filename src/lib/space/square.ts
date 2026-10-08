import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { NodeCard } from '@/lib/supabase';
import { list } from './db';
import { isRegistrationOpen, seatsLeft, seatsTaken, coverUrlOf } from './events';
import { eventAnchor } from './eventTime';
import { spaceMode, withDefaults } from './settings';
import type { EventMode, SpaceSettings } from './types';
import { canSee, cardCookieName, type Viewer } from './viewer';

/**
 * 社区广场「发起吧」：各个个人空间里正在报名的活动，汇到一处。
 *
 * - 只收发起人已经发布了个人空间的（报名在 TA 的空间里进行；没发布的空间访客打不开）
 * - 照发起人在「谁能看到」里给「一起做点什么」设的范围：设成「仅森林成员」的，没登录的访客在广场上也看不到
 * - 只列还能报名的（开放中、还没开始）；不给报名人的任何信息，只给人数
 *
 * 读不到（比如线上还没有空间存储）就返回空：广场照样打开，只是「发起吧」先空着。
 */

export type SquareEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  place: string;
  mode: EventMode;
  feeCents: number;
  capacity: number | null;
  /** 已经占了名额的人数（确认的 + 正在付款的） */
  taken: number;
  /** 剩余名额；不限时为 null */
  left: number | null;
  coverUrl: string | null;
  createdAt: string;
  /** 点进去：发起人空间里的这场活动 */
  href: string;
  /** name 为空：资料里没写名字（页面上按语言给一个称呼） */
  host: { id: string; name: string; avatarUrl: string | null; href: string };
};

type Who = { viewerId: string; isMember: boolean; isAdmin: boolean };

async function hostsById(ids: string[]): Promise<Map<string, Pick<NodeCard, 'id' | 'name' | 'avatar_url' | 'status'>>> {
  const out = new Map<string, Pick<NodeCard, 'id' | 'name' | 'avatar_url' | 'status'>>();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !ids.length) return out;
  const { data, error } = await createClient(url, key)
    .from('node_cards').select('id, name, avatar_url, status').in('id', ids)
    .abortSignal(AbortSignal.timeout(8000));
  if (error) throw error;
  for (const n of (data ?? []) as Pick<NodeCard, 'id' | 'name' | 'avatar_url' | 'status'>[]) if (n.id) out.set(n.id, n);
  return out;
}

export async function listSquareEvents(who: Who, sort: 'new' | 'soon'): Promise<SquareEvent[]> {
  try {
    const t = Date.now();
    // 存下来的设置行可能缺字段（旧数据、只存过一部分）：和空间页一样先补上默认值，不然「谁能看到」读不到就整场漏掉
    const settingsRows = new Map((await list('settings', r => r.published)).map(r => [r.id, withDefaults(r.id, r)] as const));
    if (!settingsRows.size) return [];
    const events = await list('events', e => settingsRows.has(e.memberId) && isRegistrationOpen(e, t));
    if (!events.length) return [];
    const hostIds = [...new Set(events.map(e => e.memberId))];
    const [hosts, regs, jar] = await Promise.all([
      hostsById(hostIds),
      list('registrations', r => hostIds.includes(r.memberId)),
      cookies(),
    ]);

    const out: SquareEvent[] = [];
    for (const e of events) {
      const host = hosts.get(e.memberId);
      const settings: SpaceSettings | undefined = settingsRows.get(e.memberId);
      if (!host || !settings || spaceMode(settings, host) !== 'full') continue;
      const card = jar.get(cardCookieName(e.memberId))?.value || '';
      const viewer: Viewer = {
        viewerId: who.viewerId, viewerName: '',
        isOwner: who.viewerId === e.memberId, isAdmin: who.isAdmin, isMember: who.isMember,
        hasCard: !!card && card === settings.cardToken,
      };
      if (!canSee(settings.visibility.offer, viewer)) continue;
      const hostHref = settings.slug ? `/@${settings.slug}` : `/space/${e.memberId}`;
      out.push({
        id: e.id, title: e.title, startsAt: e.startsAt, endsAt: e.endsAt, place: e.place, mode: e.mode,
        feeCents: e.feeCents, capacity: e.capacity,
        taken: seatsTaken(regs, e.id, undefined, t),
        left: seatsLeft(e, regs, undefined, t),
        coverUrl: coverUrlOf(e),
        createdAt: e.createdAt,
        href: `${hostHref}#${eventAnchor(e.id)}`,
        host: { id: e.memberId, name: (host.name || '').trim(), avatarUrl: host.avatar_url || null, href: hostHref },
      });
    }
    return out.sort((a, b) => sort === 'soon'
      ? Date.parse(a.startsAt) - Date.parse(b.startsAt)
      : Date.parse(b.createdAt) - Date.parse(a.createdAt));
  } catch (err) {
    console.error('[square] events unavailable', err);
    return [];
  }
}

/** 「报名截止倒计时：48天13小时」——报名在活动开始时关闭 */
export function countdown(startsAt: string, en = false, nowMs: number = Date.now()): string {
  const ms = Date.parse(startsAt) - nowMs;
  if (!(ms > 0)) return en ? 'closed' : '已截止';
  const mins = Math.floor(ms / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return en ? `${d}d ${h}h` : `${d}天${h}小时`;
  if (h > 0) return en ? `${h}h ${m}m` : `${h}小时${m}分`;
  return en ? `${Math.max(m, 1)}m` : `${Math.max(m, 1)}分钟`;
}
