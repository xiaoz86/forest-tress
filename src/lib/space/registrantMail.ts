import 'server-only';
import { getSiteOrigin } from '@/lib/notify';
import { fetchMember } from './access';
import { insert, newId, now } from './db';
import { formatEventTime, formatFee, formatMoment } from './eventTime';
import { HOLD_MS, holdUntil } from './events';
import { managePath, tellHost } from './mail';
import type { Registration, SpaceEvent } from './types';

/**
 * 报名状态变了（转正、确认、驳回、主人替 TA 取消、活动取消、改了时间地点），告诉报名人。
 *
 * 报名表只收一个自由填写的联系方式：它像邮箱时就发一封信；不像邮箱（微信号、手机）时发不了，
 * 由接口把这个人列进返回值的 notify 里，主人在管理页上看到「去通知 TA」，自己复制联系方式和报名链接去说。
 *
 * 本地开发不真发信：和 mail.ts 一样写进发件箱（outbox 表，memberId 记活动主人），管理页里看得到。
 * 只有生产环境才真发——SPACE_MAIL=live 在本地只用来试「发给主人自己」的信，不能借它给陌生人的邮箱发信。
 *
 * 调用方用 after() 包起来：发信慢或失败都不影响主人那边的操作结果。
 */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const EMAIL_TIMEOUT_MS = 8_000;

export function isEmail(contact: string): boolean {
  return EMAIL_RE.test(contact.trim());
}

/** 报名人自己的报名链接（站内路径） */
export function registrationPath(token: string): string {
  return `/space/r/${token}`;
}

/** 主人操作之后，界面上要列出来的「去通知 TA」 */
export type NotifyItem = {
  id: string;
  name: string;
  contact: string;
  /** 报名链接（站内路径，前端补上域名） */
  link: string;
  /** 发生了什么，一句话，给主人看 */
  what: string;
  /** 联系方式是邮箱，已经发了信（本地是写进发件箱） */
  emailed: boolean;
};

export type Change =
  | 'promoted'
  | 'confirmed'
  | 'rejected'
  | 'host-cancelled'
  | 'event-cancelled'
  | 'event-changed';

/** 给主人看的「发生了什么」 */
const WHAT: Record<Change, string> = {
  promoted: '从排队转正了',
  confirmed: '确认了',
  rejected: '被驳回了',
  'host-cancelled': '你替 TA 取消了报名',
  'event-cancelled': '活动取消了',
  'event-changed': '活动的时间或地点改了',
};

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** 给报名人的信：说清楚发生了什么、下一步做什么，附上 TA 自己的报名链接 */
function letter(change: Change, reg: Registration, event: SpaceEvent, hostName: string): { subject: string; lines: string[] } {
  const title = event.title;
  const who = hostName || '活动的主人';
  const when = formatEventTime(event.startsAt, event.endsAt);
  switch (change) {
    case 'promoted': {
      if (reg.status === 'pending') {
        const until = holdUntil(reg);
        return {
          subject: `「${title}」有名额了，你从排队转正了`,
          lines: [
            `${reg.name}，你好。`,
            `你排队的「${title}」（${when}）空出了名额，已经给你了。`,
            `还差一步：付款 ${formatFee(reg.feeCents)}，付款备注里写口令 ${reg.payCode}，然后传一张付款截图。`,
            until ? `名额给你留到 ${formatMoment(until)}（北京时间），过了这个时间名额就不再保留。` : '',
          ].filter(Boolean),
        };
      }
      return {
        subject: `「${title}」有名额了，你报上了`,
        lines: [`${reg.name}，你好。`, `你排队的「${title}」（${when}）空出了名额，你已经报上了。到时候见。`],
      };
    }
    case 'confirmed':
      return {
        subject: `「${title}」的报名确认了`,
        lines: [`${reg.name}，你好。`, `${who}确认了你的「${title}」报名（${when}）。到时候见。`],
      };
    case 'rejected':
      return {
        subject: `「${title}」的报名没有通过`,
        lines: [
          `${reg.name}，你好。`,
          `你的「${title}」报名没有通过。`,
          reg.hostNote ? `主人留言：${reg.hostNote}` : '',
          '有疑问可以直接联系主人。',
        ].filter(Boolean),
      };
    case 'host-cancelled':
      return {
        subject: `「${title}」：你的报名被取消了`,
        lines: [`${reg.name}，你好。`, `${who}取消了你的「${title}」报名。有疑问可以直接联系主人。`],
      };
    case 'event-cancelled': {
      const paid = reg.status === 'claimed' || (reg.status === 'confirmed' && reg.feeCents > 0);
      return {
        subject: `「${title}」取消了`,
        lines: [
          `${reg.name}，你好。`,
          `你报名的「${title}」（${when}）取消了，不用再去了。`,
          paid ? '你付过款，主人会和你联系退款；等不到的话，直接联系主人。' : '',
        ].filter(Boolean),
      };
    }
    case 'event-changed':
      return {
        subject: `「${title}」的时间或地点改了`,
        lines: [
          `${reg.name}，你好。`,
          `你报名的「${title}」有变化，以这里为准：`,
          `时间：${when}`,
          event.place ? `地点：${event.place}` : '',
          '去不了的话，打开下面的报名链接可以取消报名。',
        ].filter(Boolean),
      };
  }
}

async function send(to: string, subject: string, lines: string[], link: string, key: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_FROM?.trim() || '';
  if (!apiKey || !from) {
    console.error('[space] registrant mail skipped: RESEND_API_KEY / NOTIFY_FROM not set');
    return;
  }
  const body = lines.map(l => `<p style="margin:0 0 10px;">${escape(l)}</p>`).join('');
  const html = `<div style="font-family:-apple-system,'PingFang SC',sans-serif;font-size:15px;line-height:1.8;color:#23331f;max-width:520px;">
${body}
<p style="margin:22px 0 0;"><a href="${escape(link)}" style="display:inline-block;padding:11px 22px;border-radius:999px;background:#2d4a2d;color:#fff;font-weight:600;font-size:14px;text-decoration:none;">查看我的报名</a></p>
<p style="margin:26px 0 0;font-size:12.5px;color:#8a917f;">你在附近森林上报名了这场活动，所以收到这封信。上面的链接只有你有，别转给别人。</p>
</div>`;
  const text = `${lines.join('\n')}\n\n查看我的报名：${link}`;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `space-reg-${key}` },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
      signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
    });
    if (!res.ok) console.error('[space] registrant mail rejected', { key, status: res.status });
  } catch (err) {
    console.error('[space] registrant mail failed', { key, error: err instanceof Error ? err.name : 'unknown' });
  }
}

/** 给一位报名人发信（联系方式是邮箱时）。返回 true 表示发了（本地是写进发件箱） */
async function mailOne(change: Change, reg: Registration, event: SpaceEvent, hostName: string, key: string): Promise<boolean> {
  const to = reg.contact.trim();
  if (!isEmail(to)) return false;
  const { subject, lines } = letter(change, reg, event, hostName);
  const link = `${getSiteOrigin()}${registrationPath(reg.token)}`;
  try {
    if (process.env.NODE_ENV !== 'production') {
      await insert('outbox', {
        id: newId(),
        memberId: event.memberId,
        to: [to],
        subject,
        text: `${lines.join('\n')}\n\n查看我的报名：${link}`,
        createdAt: now(),
      });
      return true;
    }
    await send(to, subject, lines, link, key);
    return true;
  } catch (err) {
    console.error('[space] registrant mail error', err);
    return false;
  }
}

/**
 * 把这些报名人列成「去通知 TA」，同时决定谁能发信。发信本身返回一个函数，调用方放进 after() 里跑。
 * key 用来防重复（同一件事同一个人只发一次）。
 */
export function planNotices(change: Change, regs: Registration[], event: SpaceEvent, hostName: string, key: string):
  { items: NotifyItem[]; run: () => Promise<void> } {
  const items = regs.map(r => ({
    id: r.id,
    name: r.name,
    contact: r.contact,
    link: registrationPath(r.token),
    what: WHAT[change],
    emailed: isEmail(r.contact),
  }));
  const run = async () => {
    for (const r of regs) await mailOne(change, r, event, hostName, `${key}-${r.id}`);
  };
  return { items, run };
}

/**
 * 排队的人被自动转正了（有人取消、被驳回、保留期过了、名额调大）：告诉报名人（能发信的），再提醒主人一声，
 * 联系方式不是邮箱的，主人得自己去说——收费活动的保留期从转正那一刻就开始算了。
 * 在 after() 里调。
 */
export async function announcePromotions(event: SpaceEvent, promoted: Registration[]): Promise<void> {
  if (!promoted.length) return;
  let hostEmail = '';
  let hostName = '';
  try {
    const node = await fetchMember(event.memberId);
    hostEmail = node?.email || '';
    hostName = node?.name || '';
  } catch {
    // 查不到主人：报名人的信照发
  }
  const { run } = planNotices('promoted', promoted, event, hostName, `auto-promote-${Date.now()}`);
  await run();
  const manual = promoted.filter(r => !isEmail(r.contact));
  await tellHost({
    memberId: event.memberId,
    hostEmail,
    subject: `「${event.title}」排队的人转正了`,
    lines: [
      `「${event.title}」空出了名额，按先来后到，排队的 ${promoted.map(r => r.name).join('、')} 转正了。`,
      event.feeCents > 0
        ? `收费活动：TA 们要在 ${Math.round(HOLD_MS / 60_000)} 分钟内付款，名额才留得住。`
        : '免费活动，已经自动确认。',
      manual.length
        ? `${manual.map(r => r.name).join('、')} 留的不是邮箱，没法自动通知，去管理页复制 TA 的报名链接发过去。`
        : '留了邮箱的，已经发信告诉 TA 了。',
    ],
    path: managePath(event.memberId, 'events'),
    linkLabel: '去管理页看报名',
    key: `auto-promote-${promoted.map(r => r.id).join('-').slice(0, 120)}`,
  });
}
