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

function fromB64url(value: string): string | null {
  try {
    return Buffer.from(value, 'base64url').toString('utf8');
  } catch {
    return null;
  }
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
/** 同一浏览器登录后保持约六个月；到期后才需要重新验证邮箱。 */
export const MEMBER_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;
export const SESSION_COOKIE = 'nf_session';

/**
 * 用户刚刚通过验证码证明拥有某个邮箱，但还没有选择「轻登记」还是完整注册。
 * 只放在 HttpOnly cookie 里，30 分钟后失效，也不能当成成员会话使用。
 */
export const VERIFIED_EMAIL_COOKIE = 'nf_verified_email';
export const VERIFIED_EMAIL_MAX_AGE = 60 * 30;

export function signVerifiedEmail(email: string): SignResult {
  const secret = getSecret();
  if (!secret) return { ok: false, reason: 'no-secret' };

  const normalized = email.trim().toLowerCase();
  const encodedEmail = b64url(normalized);
  const expiresAt = Math.floor(Date.now() / 1000) + VERIFIED_EMAIL_MAX_AGE;
  const payload = `${encodedEmail}.${expiresAt}`;
  const sig = sign(`verified-email.${payload}`, secret);
  return { ok: true, token: `${payload}.${sig}`, expiresAt };
}

export type VerifyEmailResult =
  | { ok: true; email: string }
  | { ok: false; reason: 'no-secret' | 'malformed' | 'bad-sig' | 'expired' };

export function verifyVerifiedEmail(token: string): VerifyEmailResult {
  const secret = getSecret();
  if (!secret) return { ok: false, reason: 'no-secret' };

  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [encodedEmail, expStr, sig] = parts;
  if (!encodedEmail || !expStr || !sig) return { ok: false, reason: 'malformed' };

  const email = fromB64url(encodedEmail);
  if (!email || b64url(email.trim().toLowerCase()) !== encodedEmail) {
    return { ok: false, reason: 'malformed' };
  }

  const expected = sign(`verified-email.${encodedEmail}.${expStr}`, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad-sig' };
  }

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) {
    return { ok: false, reason: 'expired' };
  }

  return { ok: true, email: email.trim().toLowerCase() };
}

/**
 * 服务器信任的会话凭证。nf_member 还要给前端读，只用来展示个人页入口；
 * 付费、解锁和管理权限只认这个 HttpOnly 签名 cookie。
 *
 * 为什么非做不可：成员 id 在 /creators/<id> 这类公开链接里到处都是，
 * 明文放 cookie 等于「用户名即密码」——抄一个设进 cookie 就冒充成功，
 * 抄到管理员的就拿到后台。签名之后，没有 AUTH_SECRET 就伪造不出来。
 *
 * 没配 secret 时不退回明文：那等于把洞留着。宁可登录不上。
 */
export function signMemberSession(memberId: string): SignResult {
  const secret = getSecret();
  if (!secret) return { ok: false, reason: 'no-secret' };
  const expiresAt = Math.floor(Date.now() / 1000) + MEMBER_COOKIE_MAX_AGE;
  const payload = `${memberId}.${expiresAt}`;
  const sig = sign(`session.${payload}`, secret);
  return { ok: true, token: `${payload}.${sig}`, expiresAt };
}

export function verifyMemberSession(token: string): VerifyResult {
  const secret = getSecret();
  if (!secret) return { ok: false, reason: 'no-secret' };

  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [memberId, expStr, sig] = parts;
  if (!memberId || !expStr || !sig) return { ok: false, reason: 'malformed' };

  const expected = sign(`session.${memberId}.${expStr}`, secret);
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

// ──────────────────────────────────────────────────────────────
// 邮件里的「点开就能看」链接：凭证在链接上，不靠 cookie
// ──────────────────────────────────────────────────────────────

const VIEW_LINK_TTL_SECONDS = 60 * 60 * 24 * 7; // 和登录链接同寿命：一周内翻回旧邮件还点得开

/**
 * 签一条只对某一件东西有效的查看链接，返回 `${expiry}.${sig}`。
 *
 * 和 magic link 是同一把 secret、同一套 HMAC，区别只在换到手的东西：
 * magic link 换来一整个会话，这个只换 scope + subject 指定的那一件，
 * 到期即止，也不写任何 cookie。
 *
 * 存在的理由是手机：邮件客户端的内置浏览器和 Safari 不共享 cookie，
 * 点开必然「未登录」。把凭证放进链接，人在邮件里点一下就看见图，
 * 不用先跳去登录再绕回来。
 */
export function signViewLink(
  scope: string,
  subject: string,
  ttlSeconds: number = VIEW_LINK_TTL_SECONDS,
): string | null {
  const secret = getSecret();
  if (!secret || !scope || !subject) return null;
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `${expiresAt}.${sign(`view.${scope}.${subject}.${expiresAt}`, secret)}`;
}

export type ViewLinkVerdict =
  | { ok: true }
  | { ok: false; reason: 'no-secret' | 'malformed' | 'bad-sig' | 'expired' };

/** 校验 signViewLink 签出来的 token。scope 和 subject 必须和签发时一模一样。 */
export function verifyViewLink(scope: string, subject: string, token: string): ViewLinkVerdict {
  const secret = getSecret();
  if (!secret) return { ok: false, reason: 'no-secret' };
  if (!scope || !subject || !token) return { ok: false, reason: 'malformed' };

  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'malformed' };
  const [expStr, sig] = parts;
  if (!expStr || !sig) return { ok: false, reason: 'malformed' };

  const expected = sign(`view.${scope}.${subject}.${expStr}`, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad-sig' };
  }

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true };
}
