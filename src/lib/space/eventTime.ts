/**
 * 活动时间的显示与输入。客户端、服务端都用，不能引入服务端依赖。
 *
 * 活动时间一律按北京时间（UTC+8，没有夏令时）来理解和显示：
 * 服务端渲染和浏览器所在时区可能不一样，按各自本地时区格式化会前后对不上（还会触发 hydration 报错）；
 * 主人在管理页填的「14:00」，到哪台机器上显示出来都是「14:00」。
 */

const OFFSET_MS = 8 * 3600_000;
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const WEEK_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function wall(iso: string): Date | null {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t + OFFSET_MS) : null;
}

const pad = (n: number) => String(n).padStart(2, '0');

function dayPart(d: Date, withYear: boolean, en = false): string {
  if (en) return `${WEEK_EN[d.getUTCDay()]}, ${MONTH_EN[d.getUTCMonth()]} ${d.getUTCDate()}${withYear ? `, ${d.getUTCFullYear()}` : ''}`;
  return `${withYear ? `${d.getUTCFullYear()}年` : ''}${d.getUTCMonth() + 1}月${d.getUTCDate()}日 ${WEEK[d.getUTCDay()]}`;
}

function clock(d: Date): string {
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** 「10月12日 周日 14:00–16:00」（英文：「Sun, Oct 12 14:00–16:00」）；跨天时写全两头；不是今年的加上年份 */
export function formatEventTime(startsAt: string, endsAt?: string | null, nowMs: number = Date.now(), en = false): string {
  const s = wall(startsAt);
  if (!s) return '';
  const thisYear = new Date(nowMs + OFFSET_MS).getUTCFullYear();
  const head = `${dayPart(s, s.getUTCFullYear() !== thisYear, en)} ${clock(s)}`;
  const e = endsAt ? wall(endsAt) : null;
  if (!e || e.getTime() <= s.getTime()) return head;
  const sameDay = e.getUTCFullYear() === s.getUTCFullYear() && e.getUTCMonth() === s.getUTCMonth() && e.getUTCDate() === s.getUTCDate();
  if (sameDay) return `${head}–${clock(e)}`;
  return `${head} – ${dayPart(e, e.getUTCFullYear() !== thisYear, en)} ${clock(e)}`;
}

/** 某一刻（北京时间）：「9月30日 周三 22:30」；不是今年的加上年份。用来写「名额给你留到……」 */
export function formatMoment(iso: string, nowMs: number = Date.now()): string {
  const d = wall(iso);
  if (!d) return '';
  const thisYear = new Date(nowMs + OFFSET_MS).getUTCFullYear();
  return `${dayPart(d, d.getUTCFullYear() !== thisYear)} ${clock(d)}`;
}

/** 活动在公开页上的锚点：<li id="e-xxxxxxxx">；报名链接带着 #e-xxxxxxxx 打开就滚到这场活动 */
export function eventAnchor(eventId: string): string {
  return `e-${eventId.slice(0, 8)}`;
}

/** ISO → datetime-local 输入框的值（北京时间的「YYYY-MM-DDTHH:mm」） */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = wall(iso);
  if (!d) return '';
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${clock(d)}`;
}

/** datetime-local 的值（按北京时间理解）→ ISO；空或格式不对返回 null */
export function localInputToIso(v: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v.trim());
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - OFFSET_MS;
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** 金额：6800 → 「¥68」，6850 → 「¥68.5」 */
export function formatFee(cents: number): string {
  if (!cents) return '免费';
  const yuan = cents / 100;
  return `¥${Number.isInteger(yuan) ? yuan : yuan.toFixed(2).replace(/0$/, '')}`;
}

export const MODE_LABEL: Record<'online' | 'offline' | 'both', string> = {
  online: '线上',
  offline: '线下',
  both: '线上线下都可以',
};

export const MODE_LABEL_EN: Record<'online' | 'offline' | 'both', string> = {
  online: 'Online',
  offline: 'In person',
  both: 'Online or in person',
};
