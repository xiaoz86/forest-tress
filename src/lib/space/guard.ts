import 'server-only';
import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';

/**
 * 访客提交（打招呼、报名、预约、传截图）的防刷与清洗。
 *
 * 用法分两步：
 *   1. 一进来先 honeypot(body)——蜜罐被填了就拒绝（不计数）
 *   2. 所有校验（必填、开关、屏蔽、名额……）都过了、马上要入库之前，再 admit()——只有真正要写入的提交才计数
 * 这样用一堆无效请求刷不满桶，也就没法把某个人的空间锁住。
 *
 * 计数按来源（网络）算，全站合计；另按联系方式算，挡住同一个人换网络反复刷。
 *
 * 计数在进程内存里：本地和单实例够用；线上多实例要换成数据库或 KV（见 supabase-space.sql 的备注）。
 */

const buckets = new Map<string, number[]>();

function allow(key: string, limit: number, windowMs: number): boolean {
  const t = Date.now();
  const hits = (buckets.get(key) ?? []).filter(x => t - x < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(t);
  buckets.set(key, hits);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (!v.some(x => t - x < 3_600_000)) buckets.delete(k);
  }
  return true;
}

export function hashOf(s: string): string {
  const salt = process.env.AUTH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'space';
  return createHash('sha256').update(`${salt}:${s}`).digest('base64url').slice(0, 22);
}

/**
 * 客户端 IP：线上优先用 Vercel 自己设的头（访客伪造不了），本地开发才退回 X-Forwarded-For 的第一段。
 * IPv6 按 /64 聚合——一台设备能在自己的 /64 里随便换地址。
 */
function clientIp(request: NextRequest): string {
  const raw = request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || (process.env.VERCEL ? '' : request.headers.get('x-forwarded-for')?.split(',')[0]?.trim())
    || 'local';
  if (raw.includes(':')) return raw.split(':').slice(0, 4).join(':').toLowerCase();
  return raw;
}

/** 来源的哈希：只用来限流和屏蔽，不存明文 IP */
export function sourceKey(request: NextRequest): string {
  return hashOf(`ip:${clientIp(request)}`);
}

/**
 * 联系方式归一：全角转半角（NFKC）、去掉零宽和各种空白、转小写；像手机号的只留数字（去掉 +86）。
 * 屏蔽和查重都用它——换个写法（加空格、全角、零宽字符）不能绕开。
 */
export function normalizeContact(contact: string): string {
  let t = contact.normalize('NFKC').replace(/[\p{Cf}\p{Z}\s]/gu, '').toLowerCase();
  if (/^[+\d()\-.]{7,20}$/.test(t)) {
    t = t.replace(/\D/g, '');
    if (t.length === 13 && t.startsWith('86')) t = t.slice(2);
  }
  return t;
}

export function contactKey(contact: string): string {
  return hashOf(`contact:${normalizeContact(contact)}`);
}

/** 清洗访客填的正文：去控制字符、首尾空白，按字数截断（保留换行和 emoji 的零宽连接符） */
export function clean(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  const t = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  return [...t].slice(0, max).join('');
}

/**
 * 清洗单行字段（名字、联系方式）：再去掉换行和 bidi 这类格式控制符（会进邮件主题，不能用来伪造行、翻转文字）。
 * 保留 U+200D（emoji 的零宽连接符）。
 */
export function cleanLine(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  const t = v.replace(/[\r\n\t]+/g, ' ').replace(/[\p{Cc}]|(?!‍)\p{Cf}/gu, '').replace(/\s{2,}/g, ' ').trim();
  return [...t].slice(0, max).join('');
}

/** 蜜罐：表单里藏一个 name="website" 的输入框，人看不见也不会填，脚本常常会填 */
export function honeypot(body: Record<string, unknown>): boolean {
  return typeof body.website === 'string' && body.website.trim() !== '';
}

export const TOO_MANY_MESSAGE = '提交得有点频繁，过几分钟再试。你写的内容还在。';

/**
 * 真正要入库之前调用：计数，超了就拒绝。
 * - 同一来源（网络）：每 10 分钟 5 次，全站合计
 * - 同一联系方式对同一个人：每 10 分钟 3 次
 */
export function admit(request: NextRequest, opts: { action: string; memberId: string; contact?: string }):
  { ok: true; source: string } | { ok: false; status: 429; error: 'too-many'; message: string } {
  const source = sourceKey(request);
  const { action, memberId } = opts;
  const keys: [string, number, number][] = [[`${action}:s:${source}`, 5, 10 * 60_000]];
  if (opts.contact) keys.push([`${action}:c:${contactKey(opts.contact)}:${memberId}`, 3, 10 * 60_000]);
  // 先检查再计数：一个桶满了，不要让其他桶白白多记一次
  const t = Date.now();
  for (const [k, limit, win] of keys) {
    const hits = (buckets.get(k) ?? []).filter(x => t - x < win);
    if (hits.length >= limit) return { ok: false, status: 429, error: 'too-many', message: TOO_MANY_MESSAGE };
  }
  for (const [k, limit, win] of keys) allow(k, limit, win);
  return { ok: true, source };
}

/** 这个提交是不是被主人屏蔽了（联系方式或来源） */
export function isBlocked(blocked: string[], contact: string, source: string): boolean {
  return blocked.includes(contactKey(contact)) || blocked.includes(source);
}

/**
 * @deprecated 旧接口：只做蜜罐检查、不再计数。计数改用 admit()，放在入库之前。
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function screen(request: NextRequest, body: Record<string, unknown>, _action: string, _memberId: string):
  { ok: true; source: string } | { ok: false; status: number; error: string } {
  if (honeypot(body)) return { ok: false, status: 400, error: 'rejected' };
  return { ok: true, source: sourceKey(request) };
}
