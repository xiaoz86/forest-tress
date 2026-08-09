import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import {
  MEMBER_COOKIE,
  MEMBER_COOKIE_MAX_AGE,
  SESSION_COOKIE,
  signMemberSession,
} from '@/lib/auth';
import { CODE_MAX_ATTEMPTS, codeMatches, normalizeCodeInput, normalizeEmail } from '@/lib/loginCode';

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
const MAX_ATTEMPTS_PER_IP = 12;
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
 * POST /api/login/code  body: { email, code }
 *
 * 成功即登录，并给 node_cards 盖一个 email_verified_at ——
 * 能收到这个邮箱里的码，就证明这个邮箱确实是本人的。
 * 注册流程不验证邮箱，所以这个戳是「此人真的拥有该邮箱」的唯一凭据。
 *
 * 失败一律回同一个 code-invalid，不区分「没有这个码」「码错了」「过期了」
 * 「试太多次了」——任何区分都会把「这个邮箱注册过没有」漏出去。
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
  const { data: row, error } = await sb
    .from('login_codes')
    .select('id, node_id, code_hash, expires_at, attempts')
    .eq('email', email)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[api/login/code] supabase error', error.message);
    return NextResponse.json({ error: 'code-invalid' }, { status: 400 });
  }
  if (!row) {
    return NextResponse.json({ error: 'code-invalid' }, { status: 400 });
  }

  // 过期的直接作废，不给它继续被猜的机会
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await sb.from('login_codes').update({ consumed_at: new Date().toISOString() }).eq('id', row.id);
    return NextResponse.json({ error: 'code-invalid' }, { status: 400 });
  }

  // 错满即作废：一个码只给 5 次机会，剩下的 99.999% 空间就不用猜了
  if ((row.attempts ?? 0) >= CODE_MAX_ATTEMPTS) {
    await sb.from('login_codes').update({ consumed_at: new Date().toISOString() }).eq('id', row.id);
    return NextResponse.json({ error: 'code-invalid' }, { status: 400 });
  }

  if (!codeMatches(email, code, row.code_hash)) {
    await sb
      .from('login_codes')
      .update({ attempts: (row.attempts ?? 0) + 1 })
      .eq('id', row.id);
    return NextResponse.json({ error: 'code-invalid' }, { status: 400 });
  }

  // 对上了。先把码作废再发 cookie——顺序反过来的话，两个并发请求
  // 可能都拿到登录态；虽然同一个人无害，但没有理由留这个口子。
  await sb.from('login_codes').update({ consumed_at: new Date().toISOString() }).eq('id', row.id);

  if (!row.node_id) {
    return NextResponse.json({ error: 'code-invalid' }, { status: 400 });
  }

  const session = signMemberSession(row.node_id);
  if (!session.ok) {
    console.error('[api/login/code] AUTH_SECRET not configured');
    return NextResponse.json({ error: 'not-configured' }, { status: 500 });
  }

  // 能收到码 = 真的拥有这个邮箱。盖章（失败不影响登录）
  const { error: stampError } = await sb
    .from('node_cards')
    .update({ email_verified_at: new Date().toISOString() })
    .eq('id', row.node_id);
  if (stampError) {
    console.error('[api/login/code] cannot stamp email_verified_at', stampError.message);
  }

  const res = NextResponse.json({ ok: true, memberId: row.node_id });
  res.cookies.set(MEMBER_COOKIE, row.node_id, {
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
  return res;
}
