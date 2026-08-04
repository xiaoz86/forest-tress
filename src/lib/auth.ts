import { createHmac, timingSafeEqual } from 'crypto';

/**
 * 简易 HMAC 登录 token：用 AUTH_SECRET 签名，返回 `${memberId}.${expiry}.${sig}`。
 * 不存数据库，验证完全靠签名 + 过期时间。
 *
 * 流程：
 *   1. 用户在 /login 输入注册邮箱
 *   2. 服务端按邮箱查节点，签发 token，发邮件含 magic link
 *   3. 用户点 link → /api/login/verify 校验签名 → 设置 nf_member cookie
 */

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 天，足够邮件抵达后多次重试

function getSecret(): string | null {
  const s = process.env.AUTH_SECRET?.trim();
  if (s && s.length >= 16) return s;
  // 回落：只要 supabase service role key 存在，就拿它做派生 secret —— 至少不会泄露给前端。
  // 部署时强烈建议显式设置 AUTH_SECRET。
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (fallback && fallback.length >= 16) return `nf:${fallback}`;
  return null;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function sign(payload: string, secret: string): string {
  return b64url(createHmac('sha256', secret).update(payload).digest());
}

export type SignResult =
  | { ok: true; token: string; expiresAt: number }
  | { ok: false; reason: 'no-secret' };

export function signLoginToken(memberId: string): SignResult {
  const secret = getSecret();
  if (!secret) return { ok: false, reason: 'no-secret' };
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = `${memberId}.${expiresAt}`;
  const sig = sign(payload, secret);
  return { ok: true, token: `${payload}.${sig}`, expiresAt };
}

export type VerifyResult =
  | { ok: true; memberId: string }
  | { ok: false; reason: 'no-secret' | 'malformed' | 'bad-sig' | 'expired' };

export function verifyLoginToken(token: string): VerifyResult {
  const secret = getSecret();
  if (!secret) return { ok: false, reason: 'no-secret' };

  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [memberId, expStr, sig] = parts;
  if (!memberId || !expStr || !sig) return { ok: false, reason: 'malformed' };

  const expected = sign(`${memberId}.${expStr}`, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad-sig' };
  }

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) {
    return { ok: false, reason: 'expired' };
  }

  return { ok: true, memberId };
}

export const MEMBER_COOKIE = 'nf_member';
export const MEMBER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 年

// ──────────────────────────────────────────────────────────────
// 登录态 cookie 的签名
//
// 原来 cookie 里直接放明文成员 id。但成员 id 在 /creators/<id> 这类公开
// 链接里到处都是，等于「用户名即密码」——抄一个设进 cookie 就冒充成功，
// 抄到管理员的就拿到后台。所以现在存 `<id>.<签发时刻>.<签名>`，
// 没有 AUTH_SECRET 就伪造不出来。
// ──────────────────────────────────────────────────────────────

export function signSessionValue(memberId: string): string {
  const secret = getSecret();
  // 没配 secret 时不能退回明文——那等于把洞留着。宁可登录不上。
  if (!secret || !memberId) return '';
  const issued = Math.floor(Date.now() / 1000);
  const payload = `${memberId}.${issued}`;
  return `${payload}.${sign(`session.${payload}`, secret)}`;
}

/** 验签并取出成员 id；不合法一律返回空串（＝未登录） */
export function verifySessionValue(value: string): string {
  const secret = getSecret();
  if (!secret || !value) return '';

  const parts = value.split('.');
  if (parts.length !== 3) return '';
  const [memberId, issuedStr, sig] = parts;
  if (!memberId || !issuedStr || !sig) return '';

  const expected = sign(`session.${memberId}.${issuedStr}`, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return '';

  const issued = Number(issuedStr);
  if (!Number.isFinite(issued)) return '';
  if (issued * 1000 + MEMBER_COOKIE_MAX_AGE * 1000 < Date.now()) return '';

  return memberId;
}

// ──────────────────────────────────────────────────────────────
// 管理动作签名（如 phil-coach 登记审核链接）：HMAC 防伪造
// ──────────────────────────────────────────────────────────────

export function signAdminAction(payload: string): string | null {
  const secret = getSecret();
  if (!secret) return null;
  return sign(`admin.${payload}`, secret);
}

export function verifyAdminAction(payload: string, sig: string): boolean {
  const secret = getSecret();
  if (!secret || !sig) return false;
  const expected = sign(`admin.${payload}`, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
