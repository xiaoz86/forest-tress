import { createClient } from '@supabase/supabase-js';
import { after, NextRequest, NextResponse } from 'next/server';
import { signLoginToken } from '@/lib/auth';
import { notifyLoginLink, getSiteOrigin } from '@/lib/notify';
import { getLocale } from '@/lib/locale';
import type { NodeCard } from '@/lib/supabase';

export const runtime = 'nodejs';

const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_IP = 10;
const EMAIL_COOLDOWN_MS = 60 * 1000;
const ipBuckets = new Map<string, number[]>();
const memberCooldowns = new Map<string, number>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (ipBuckets.get(ip) || []).filter(time => now - time < RATE_WINDOW_MS);
  if (recent.length >= MAX_REQUESTS_PER_IP) {
    ipBuckets.set(ip, recent);
    return true;
  }
  recent.push(now);
  ipBuckets.set(ip, recent);
  return false;
}

function memberCoolingDown(memberId: string): boolean {
  const now = Date.now();
  const lastRequest = memberCooldowns.get(memberId) || 0;
  if (now - lastRequest < EMAIL_COOLDOWN_MS) return true;
  memberCooldowns.set(memberId, now);
  return false;
}

/**
 * POST /api/login  body: { email: string }
 * 按邮箱查找成员，生成 HMAC magic link 发到 TA 的邮箱。
 *
 * 出于隐私考虑：无论邮箱是否存在，对外都返回相同的 success，避免成员名单被探测。
 * 真正的成败结果只在服务器日志里。
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
  const email = (body as { email?: unknown })?.email;
  if (typeof email !== 'string' || !/^.+@.+\..+$/.test(email.trim())) {
    return NextResponse.json({ error: 'bad-email' }, { status: 400 });
  }
  const normalized = email.trim().toLowerCase();
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  // 始终返回相同的成功响应，避免暴露邮箱是否已注册。
  if (rateLimited(ip)) {
    console.warn('[api/login] request rate limited');
    return NextResponse.json({ ok: true });
  }

  const sb = createClient(supabaseUrl, serviceKey);
  const { data, error } = await sb
    .from('node_cards')
    .select('*')
    .ilike('email', normalized)
    .limit(20);

  if (error) {
    console.error('[api/login] supabase error', error.message);
    // 仍返回 ok 以避免暴露存在性
    return NextResponse.json({ ok: true });
  }

  const node = ((data || []) as NodeCard[]).find(
    row => row.email?.trim().toLowerCase() === normalized,
  ) || null;
  if (node?.id) {
    const signed = signLoginToken(node.id);
    if (!signed.ok) {
      console.error('[api/login] AUTH_SECRET not configured');
    } else if (!memberCoolingDown(node.id)) {
      const magicLink = `${getSiteOrigin()}/api/login/verify?token=${encodeURIComponent(signed.token)}`;
      // 语言必须在进 after 之前取好：after 里跑的时候请求上下文已经收了，
      // 那时再读 cookie / 来源国家会拿不到，信就会一律发成中文。
      const locale = await getLocale();
      // after 使用 Vercel/Next.js 的 waitUntil 生命周期保障，不阻塞响应，也不产生计时侧信道。
      after(async () => {
        const delivery = await notifyLoginLink(node, magicLink, locale);
        if (!delivery.ok) {
          console.error('[api/login] login email not accepted', {
            reason: delivery.reason,
            status: delivery.status,
          });
        }
      });
    } else {
      console.log('[api/login] member email cooldown active');
    }
  } else {
    console.log('[api/login] no node for email');
  }

  return NextResponse.json({ ok: true });
}
