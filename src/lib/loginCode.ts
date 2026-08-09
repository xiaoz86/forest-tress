/**
 * 邮箱验证码登录。
 *
 * 原来只有 magic link：必须在收信的那个客户端里点开。手机上收信在邮件 App，
 * 点开进的是 App 内置浏览器，和 Safari / Chrome 不共享 cookie——人想在
 * 浏览器里登录就没辙。验证码把「在哪收信」和「在哪登录」解耦：
 * 信到哪都行，码填回当前这个浏览器就登录成功。
 *
 * 六位数字只有 100 万种可能，所以安全性全靠三道闸一起兜：
 *   1. 短有效期（10 分钟）
 *   2. 单个码最多试 5 次，错满即作废——不给在一个码上慢慢猜的机会
 *   3. 校验接口按 IP 限流——不给用很多码去凑概率的机会
 * 三道缺一道，六位码就撑不住。改这里之前先想清楚动的是哪一道。
 *
 * 码不落库，落库的是 HMAC——数据库被读走也换不出能用的码。
 */
import { createHmac, randomInt, timingSafeEqual } from 'crypto';

/** 有效期。太短会被邮件延迟坑死，太长等于放宽爆破窗口。 */
export const CODE_TTL_MS = 10 * 60 * 1000;

/** 单个码允许错几次。错满作废，必须重新要一个。 */
export const CODE_MAX_ATTEMPTS = 5;

export const CODE_LENGTH = 6;

function getSecret(): string | null {
  const s = process.env.AUTH_SECRET?.trim();
  if (s && s.length >= 16) return s;
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (fallback && fallback.length >= 16) return `nf:${fallback}`;
  return null;
}

/**
 * 生成六位码。
 *
 * 用 randomInt 而不是 Math.random：后者不是密码学随机，能被预测。
 * 也不用 `randomBytes % 1000000`——那会有模偏，前面几个数出现得更频繁。
 * randomInt 内部做了拒绝采样，是均匀的。
 */
export function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
}

/**
 * 码 + 邮箱一起做 HMAC。
 *
 * 把邮箱也搅进去，是为了让同一个码在不同邮箱下算出不同的哈希——
 * 否则拿到一条哈希就能拿去撞别人的记录。
 */
export function hashCode(email: string, code: string): string | null {
  const secret = getSecret();
  if (!secret) return null;
  return createHmac('sha256', secret)
    .update(`${email.trim().toLowerCase()}:${code}`)
    .digest('hex');
}

/** 定长比较，不用 === ——避免按字符提前返回泄露出「前几位对了」。 */
export function codeMatches(email: string, code: string, storedHash: string): boolean {
  const computed = hashCode(email, code);
  if (!computed) return false;
  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** 只收六位纯数字，多余空格容忍掉（有人会从邮件里连空格一起复制） */
export function normalizeCodeInput(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/\s+/g, '');
  return new RegExp(`^\\d{${CODE_LENGTH}}$`).test(cleaned) ? cleaned : null;
}

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const e = raw.trim().toLowerCase();
  return /^.+@.+\..+$/.test(e) ? e : null;
}
