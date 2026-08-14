import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import {
  MEMBER_COOKIE,
  MEMBER_COOKIE_MAX_AGE,
  SESSION_COOKIE,
  VERIFIED_EMAIL_COOKIE,
  VERIFIED_EMAIL_MAX_AGE,
  signMemberSession,
  signVerifiedEmail,
} from '@/lib/auth';
import { normalizeCodeInput, normalizeEmail } from '@/lib/loginCode';
import { consumeCode } from '@/lib/loginCodeStore';

export const runtime = 'nodejs';

/**
 * 校验接口的 IP 限流。
 *
 * 这一道是三道闸里最不能省的：单个码限 5 次错，挡的是「盯着一个码猜」；
 * 但攻击者可以不停要新码、每个码试 5 次，用量凑概率。按 IP 限住尝试总数，
 * 那条路才堵死。
 *
 * 内存计数在 serverless 多实例下不精确——这是全站既有的取舍（tts / voice
 * 那几个路由同款）。要真正精确得上 KV，届时这里和其余几处一起换。
 */
const WINDOW_MS = 10 * 60 * 1000;

/**
 * 20 而不是更小：真正挡住「猜某个人的码」的是单码 5 次上限 + 60 秒发码冷却，
 * 算下来 10 分钟里对同一个邮箱最多约 50 次尝试，对 100 万空间可以忽略。
 * 这道 IP 闸防的是拿很多码去撒网，不需要卡得太死。
 *
 * 卡太死反而会误伤：公司网、运营商 NAT 后面的人共用出口 IP，
 * 一个人手抖几次会把同网段的人一起锁在外面。
 */
const MAX_ATTEMPTS_PER_IP = 20;
const ipBuckets = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (ipBuckets.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (recent.length >= MAX_ATTEMPTS_PER_IP) {
    ipBuckets.set(ip, recent);
    return true;
  }
  recent.push(now);
  ipBuckets.set(ip, recent);
  if (ipBuckets.size > 5000) {
    for (const key of Array.from(ipBuckets.keys()).slice(0, 2500)) ipBuckets.delete(key);
  }
  return false;
}

/**
 * 登录成功就把这次尝试从额度里退回去。
 *
 * 额度是用来挡瞎猜的，不是用来限制「正常登录几次」。不退的话，
 * 一家人共用一个出口 IP、或者同一个人在几台设备上登录，很快就会
 * 被自己的成功登录挤到限流里去——那是纯粹的误伤。
 */
function refundAttempt(ip: string): void {
  const bucket = ipBuckets.get(ip);
  if (bucket?.length) bucket.pop();
}

/**
 * POST /api/login/code  body: { email, code }
 *
 * 已注册邮箱成功即登录，并给 node_cards 盖一个 email_verified_at；
 * 新邮箱只获得短期验证凭据，不在这里建号。拿着那张凭据往下走成什么样，由调用方决定：
 * 登录页直接送去七步注册向导，phil-coach 浮层则让人选轻登记还是完整注册。
 *
 * 失败一律回同一个 code-invalid，不区分「没有这个码」「码错了」「过期了」
 * 「试太多次了」。只有验证码正确后才返回 registered 状态，此时邮箱归属已证实。
 */
export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'supabase-not-configured' }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad-json' }, { status: 400 });
  }

  const email = normalizeEmail((body as { email?: unknown })?.email);
  const code = normalizeCodeInput((body as { code?: unknown })?.code);
  if (!email || !code) {
    return NextResponse.json({ error: 'code-invalid' }, { status: 400 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json({ error: 'too-many' }, { status: 429 });
  }

  const sb = createClient(supabaseUrl, serviceKey);
  const verdict = await consumeCode(sb, email, code);
  if (!verdict.ok) {
    // 对外一律同一句，不区分「没有这个码」「错了」「过期」「试太多次」——
    // 任何区分都会把「这个邮箱注册过没有」漏出去
    return NextResponse.json({ error: 'code-invalid' }, { status: 400 });
  }

  refundAttempt(ip);

  // 发码后到验码前，另一个标签页可能已经用同一邮箱完成了注册。
  // node_id 是发码那一刻的快照，所以为空时再按规范化邮箱精确查一次。
  let memberId = verdict.nodeId;
  if (!memberId) {
    const { data: possibleMembers } = await sb
      .from('node_cards')
      .select('id, email')
      .ilike('email', email)
      .limit(20);
    const existing = (possibleMembers || []).find(
      row => typeof row.email === 'string' && row.email.trim().toLowerCase() === email,
    );
    memberId = typeof existing?.id === 'string' ? existing.id : null;
  }

  // 码对上了，但邮箱还不属于成员：只保存短期「邮箱已验证」凭据。
  // 绝不在登录接口里静默建号；前端随后让用户选择轻登记或完整注册。
  if (!memberId) {
    const verified = signVerifiedEmail(email);
    if (!verified.ok) {
      console.error('[api/login/code] AUTH_SECRET not configured');
      return NextResponse.json({ error: 'not-configured' }, { status: 500 });
    }
    const res = NextResponse.json({ ok: true, registered: false });
    res.cookies.set(VERIFIED_EMAIL_COOKIE, verified.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: VERIFIED_EMAIL_MAX_AGE,
    });
    return res;
  }

  const session = signMemberSession(memberId);
  if (!session.ok) {
    console.error('[api/login/code] AUTH_SECRET not configured');
    return NextResponse.json({ error: 'not-configured' }, { status: 500 });
  }

  // 能收到码 = 真的拥有这个邮箱。盖章（失败不影响登录）
  const { error: stampError } = await sb
    .from('node_cards')
    .update({ email_verified_at: new Date().toISOString() })
    .eq('id', memberId);
  if (stampError) {
    console.error('[api/login/code] cannot stamp email_verified_at', stampError.message);
  }

  const res = NextResponse.json({ ok: true, registered: true, memberId });
  res.cookies.set(MEMBER_COOKIE, memberId, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: MEMBER_COOKIE_MAX_AGE,
  });
  res.cookies.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MEMBER_COOKIE_MAX_AGE,
  });
  res.cookies.set(VERIFIED_EMAIL_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
