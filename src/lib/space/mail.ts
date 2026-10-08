import 'server-only';
import { getSiteOrigin, notifySpaceHost } from '@/lib/notify';
import { insert, newId, now } from './db';

/**
 * 提醒空间的主人：有人打招呼、报名、预约、传了付款截图。
 *
 * 本地开发时不真的发信——写进「发件箱」（outbox 表），管理页的收件箱里能看到每一封「本来会发出去的信」。
 * 要在本地试发真邮件，设 SPACE_MAIL=live（只会发到空间主人自己的注册邮箱）。
 *
 * 调用方用 after() 包起来：发信慢或失败都不影响访客那边的提交结果。
 */
export async function tellHost(params: {
  memberId: string;
  hostEmail: string | null | undefined;
  subject: string;
  lines: string[];
  /** 站内路径，如 /space/{id}/manage#inbox */
  path: string;
  linkLabel: string;
  /** 同一件事只提醒一次 */
  key: string;
}): Promise<void> {
  const to = params.hostEmail?.trim();
  if (!to) return;
  const link = `${getSiteOrigin()}${params.path}`;
  const live = process.env.NODE_ENV === 'production' || process.env.SPACE_MAIL === 'live';
  try {
    if (!live) {
      await insert('outbox', {
        id: newId(),
        memberId: params.memberId,
        to: [to],
        subject: params.subject,
        text: `${params.lines.join('\n')}\n\n${params.linkLabel}：${link}`,
        createdAt: now(),
      });
      return;
    }
    const r = await notifySpaceHost({
      to, subject: params.subject, lines: params.lines, link, linkLabel: params.linkLabel,
      idempotencyKey: `space-${params.key}`,
    });
    if (!r.ok) console.error('[space] host mail failed', { key: params.key, reason: r.reason });
  } catch (err) {
    console.error('[space] host mail error', err);
  }
}

/** 管理页的站内路径 */
export function managePath(memberId: string, tab: 'share' | 'visibility' | 'events' | 'inbox'): string {
  return `/space/${memberId}/manage?tab=${tab}`;
}
