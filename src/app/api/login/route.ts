import { createClient } from '@supabase/supabase-js';
import { after, NextRequest, NextResponse } from 'next/server';
import { notifyLoginCode } from '@/lib/notify';
import { getLocale } from '@/lib/locale';
import { normalizeEmail } from '@/lib/loginCode';
import { issueCode } from '@/lib/loginCodeStore';
import type { NodeCard } from '@/lib/supabase';

export const runtime = 'nodejs';

const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_IP = 10;
const EMAIL_COOLDOWN_MS = 60 * 1000;
const ipBuckets = new Map<string, number[]>();
/**
 * 按邮箱做冷却，不是按成员 id。
 *
 * 未注册的邮箱现在也会收到码（phil-coach 闸门和注册验证都靠它），
 * 所以冷却必须在「还不知道是不是成员」的阶段就能算——否则这个接口
 * 就成了给任意地址发骚扰邮件的工具。
 */
const emailCooldowns = new Map<string, number>();

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

function emailCoolingDown(email: string): boolean {
  const now = Date.now();
  const last = emailCooldowns.get(email) || 0;
  if (now - last < EMAIL_COOLDOWN_MS) return true;
  emailCooldowns.set(email, now);
  if (emailCooldowns.size > 5000) {
    for (const key of Array.from(emailCooldowns.keys()).slice(0, 2500)) emailCooldowns.delete(key);
  }
  return false;
}

/**
 * POST /api/login  body: { email: string }
 * 按邮箱查成员，签发六位验证码发过去。校验在 /api/login/code。
 *
 * 为什么从 magic link 换成验证码：magic link 必须在收信那个客户端里点开。
 * 手机上收信在邮件 App，点开进的是 App 内置浏览器，和 Safari / Chrome
 * 不共享 cookie——人想在自己浏览器里登录就没辙。验证码把「在哪收信」
 * 和「在哪登录」解耦。
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
  const normalized = normalizeEmail((body as { email?: unknown })?.email);
  if (!normalized) {
    return NextResponse.json({ error: 'bad-email' }, { status: 400 });
  }
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
  // node 为 null 表示还不是成员——照样发码。
  // phil-coach 闸门那条路要靠它当场开号；从外面看两种情况完全一样，
  // 这本身也是「不暴露某人注册过没有」的一部分。
  if (!emailCoolingDown(normalized)) {
    // 语言必须在进 after 之前取好：after 里跑的时候请求上下文已经收了，
    // 那时再读 cookie / 来源国家会拿不到，信就会一律发成中文。
    const locale = await getLocale();
    // after 使用 Vercel/Next.js 的 waitUntil 生命周期保障，不阻塞响应，也不产生计时侧信道。
    after(async () => {
      const issued = await issueCode(sb, normalized, node?.id ?? null);
      if (!issued.ok) {
        console.error('[api/login] cannot issue code', issued.reason);
        return;
      }
      const delivery = await notifyLoginCode(normalized, issued.code, locale);
      if (!delivery.ok) {
        console.error('[api/login] login code email not accepted', {
          reason: delivery.reason,
          status: delivery.status,
        });
      }
    });
  } else {
    console.log('[api/login] email cooldown active');
  }

  return NextResponse.json({ ok: true });
}
