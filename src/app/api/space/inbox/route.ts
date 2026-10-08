import { NextRequest, NextResponse } from 'next/server';
import { list, now, transact } from '@/lib/space/db';
import { gateHost, isFail } from '@/lib/space/gate';
import { clean, cleanLine, contactKey } from '@/lib/space/guard';
import { saveSettings } from '@/lib/space/settings';
import { LIMITS, type Booking, type BookingStatus, type Greeting, type OutboxMail } from '@/lib/space/types';

export const runtime = 'nodejs';

/**
 * 主人的收件箱：打招呼、预约，以及本地开发时「本来会发出去的提醒邮件」。
 * 只给本人和管理员（gateHost）。联系方式只在这里出现。
 */

/** 来源哈希只在服务端用来屏蔽，不下发 */
export type InboxGreeting = Omit<Greeting, 'sourceKey'> & { blocked: boolean };
/** 预约人的查看口令不下发：主人用不着它 */
export type InboxBooking = Omit<Booking, 'token' | 'sourceKey'> & { blocked: boolean };
export type InboxData = {
  greetings: InboxGreeting[];
  bookings: InboxBooking[];
  /** 只在本地开发时有 */
  outbox: OutboxMail[];
  local: boolean;
  greetingsOpen: boolean;
  bookingsOpen: boolean;
  blockedCount: number;
};

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const STATUSES: BookingStatus[] = ['new', 'accepted', 'declined', 'done'];

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

const desc = (a: { createdAt: string }, b: { createdAt: string }) => b.createdAt.localeCompare(a.createdAt);

/** GET /api/space/inbox?id=… */
export async function GET(request: NextRequest) {
  const g = await gateHost(request.nextUrl.searchParams.get('id'));
  if (isFail(g)) return fail(g.error, g.status);
  const id = g.memberId;
  const local = process.env.NODE_ENV !== 'production';
  try {
    const [greetings, bookings, outbox] = await Promise.all([
      list('greetings', r => r.memberId === id),
      list('bookings', r => r.memberId === id),
      local ? list('outbox', r => r.memberId === id) : Promise.resolve([] as OutboxMail[]),
    ]);
    const blocked = new Set(g.settings.blocked);
    const isOn = (r: { contact: string; sourceKey?: string }) =>
      blocked.has(contactKey(r.contact)) || (!!r.sourceKey && blocked.has(r.sourceKey));
    const data: InboxData = {
      greetings: greetings.sort(desc).map(r => forGreeting(r, isOn(r))),
      bookings: bookings.sort(desc).map(r => forBooking(r, isOn(r))),
      outbox: outbox.sort(desc).slice(0, 50),
      local,
      greetingsOpen: g.settings.greetingsOpen,
      bookingsOpen: g.settings.bookingsOpen,
      blockedCount: g.settings.blocked.length,
    };
    return NextResponse.json(data, { headers: NO_STORE });
  } catch (err) {
    console.error('[space] inbox read failed', err);
    return fail('storage-unavailable', 500);
  }
}

/**
 * PATCH /api/space/inbox?id=…
 * - { kind: 'greeting', id, read: boolean }
 * - { kind: 'booking', id, status?, hostNote? }
 * - { kind: 'block' | 'unblock', contact? | greetingId? | bookingId? | registrationId? }
 *   按某一条记录屏蔽时，联系方式和那条记录的来源一起屏蔽（换个写法的联系方式也挡得住）；解除时一起解除
 * - { kind: 'delete', greetingId? | bookingId? }
 */
export async function PATCH(request: NextRequest) {
  const g = await gateHost(request.nextUrl.searchParams.get('id'));
  if (isFail(g)) return fail(g.error, g.status);
  const memberId = g.memberId;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail('bad-json', 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('bad-body', 400);
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

  try {
    switch (body.kind) {
      case 'greeting': {
        const id = str(body.id);
        const read = body.read !== false;
        const ok = await transact('greetings', rows => {
          const r = rows.find(x => x.id === id && x.memberId === memberId);
          if (!r) return false;
          r.readAt = read ? (r.readAt ?? now()) : null;
          return true;
        });
        return ok ? NextResponse.json({ ok: true }, { headers: NO_STORE }) : fail('not-found', 404);
      }

      case 'booking': {
        const id = str(body.id);
        const status = body.status === undefined ? undefined : str(body.status) as BookingStatus;
        if (status !== undefined && !STATUSES.includes(status)) return fail('bad-status', 400);
        const hostNote = body.hostNote === undefined ? undefined : clean(body.hostNote, LIMITS.note);
        const ok = await transact('bookings', rows => {
          const r = rows.find(x => x.id === id && x.memberId === memberId);
          if (!r) return false;
          if (status !== undefined) r.status = status;
          if (hostNote !== undefined) r.hostNote = hostNote;
          r.updatedAt = now();
          return true;
        });
        return ok ? NextResponse.json({ ok: true }, { headers: NO_STORE }) : fail('not-found', 404);
      }

      case 'block':
      case 'unblock': {
        const target = await targetOf(memberId, body, str);
        if (!target) return fail('not-found', 404);
        const keys = [contactKey(target.contact)];
        if (target.sourceKey) keys.push(target.sourceKey);
        // 在 saveSettings 的临界区里基于最新名单增删：连着屏蔽两个人（两个请求并发）也不会丢掉一个
        const saved = await saveSettings(memberId, body.kind === 'block' ? { blockAdd: keys } : { blockRemove: keys });
        if ('error' in saved) return fail('too-many-blocked', 400);
        return NextResponse.json({ ok: true, blockedCount: saved.blocked.length }, { headers: NO_STORE });
      }

      case 'delete': {
        const greetingId = str(body.greetingId);
        const bookingId = str(body.bookingId);
        let ok = false;
        if (greetingId) {
          ok = await transact('greetings', rows => spliceOwn(rows, greetingId, memberId));
        } else if (bookingId) {
          ok = await transact('bookings', rows => spliceOwn(rows, bookingId, memberId));
        }
        return ok ? NextResponse.json({ ok: true }, { headers: NO_STORE }) : fail('not-found', 404);
      }

      default:
        return fail('bad-kind', 400);
    }
  } catch (err) {
    console.error('[space] inbox write failed', err);
    return fail('storage-unavailable', 500);
  }
}

/** 要屏蔽的对象：直接给的联系方式，或者这位主人收件箱 / 报名名单里某一条的联系方式和来源 */
async function targetOf(
  memberId: string, body: Record<string, unknown>, str: (v: unknown) => string,
): Promise<{ contact: string; sourceKey?: string } | null> {
  const direct = cleanLine(body.contact, LIMITS.contact);
  if (direct) return { contact: direct };
  const pick = (r: { contact: string; sourceKey?: string } | undefined) =>
    (r?.contact ? { contact: r.contact, sourceKey: r.sourceKey } : null);
  const greetingId = str(body.greetingId);
  if (greetingId) return pick((await list('greetings', r => r.id === greetingId && r.memberId === memberId))[0]);
  const bookingId = str(body.bookingId);
  if (bookingId) return pick((await list('bookings', r => r.id === bookingId && r.memberId === memberId))[0]);
  const registrationId = str(body.registrationId);
  if (registrationId) {
    return pick((await list('registrations', r => r.id === registrationId && r.memberId === memberId))[0]);
  }
  return null;
}

function spliceOwn<T extends { id: string; memberId: string }>(rows: T[], id: string, memberId: string): boolean {
  const i = rows.findIndex(r => r.id === id && r.memberId === memberId);
  if (i < 0) return false;
  rows.splice(i, 1);
  return true;
}

function forGreeting(r: Greeting, blocked: boolean): InboxGreeting {
  const out: Partial<Greeting> & { blocked: boolean } = { ...r, blocked };
  delete out.sourceKey;
  return out as InboxGreeting;
}

function forBooking(r: Booking, blocked: boolean): InboxBooking {
  const out: Partial<Booking> & { blocked: boolean } = { ...r, blocked };
  delete out.token;
  delete out.sourceKey;
  return out as InboxBooking;
}
