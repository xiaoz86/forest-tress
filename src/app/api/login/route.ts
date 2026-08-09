import { createClient } from '@supabase/supabase-js';
import { after, NextRequest, NextResponse } from 'next/server';
import { notifyLoginCode } from '@/lib/notify';
import { getLocale } from '@/lib/locale';
import { CODE_TTL_MS, generateCode, hashCode, normalizeEmail } from '@/lib/loginCode';
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
  if (node?.id) {
    const code = generateCode();
    const codeHash = hashCode(normalized, code);
    if (!codeHash) {
      console.error('[api/login] AUTH_SECRET not configured');
    } else if (!memberCoolingDown(node.id)) {
      // 语言必须在进 after 之前取好：after 里跑的时候请求上下文已经收了，
      // 那时再读 cookie / 来源国家会拿不到，信就会一律发成中文。
      const locale = await getLocale();
      // after 使用 Vercel/Next.js 的 waitUntil 生命周期保障，不阻塞响应，也不产生计时侧信道。
      after(async () => {
        // 先把这个邮箱之前没用掉的码全部作废：永远只有最新那个能用。
        // 不作废的话，攻击者可以攒一堆码来提高蒙中的概率。
        await sb
          .from('login_codes')
          .update({ consumed_at: new Date().toISOString() })
          .eq('email', normalized)
          .is('consumed_at', null);

        const { error: insertError } = await sb.from('login_codes').insert({
          email: normalized,
          node_id: node.id,
          code_hash: codeHash,
          expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
        });
        if (insertError) {
          console.error('[api/login] cannot store login code', insertError.message);
          return;
        }

        const delivery = await notifyLoginCode(normalized, code, locale);
        if (!delivery.ok) {
          console.error('[api/login] login code email not accepted', {
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
