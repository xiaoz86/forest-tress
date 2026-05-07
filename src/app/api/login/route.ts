import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { signLoginToken } from '@/lib/auth';
import { notifyLoginLink, getSiteOrigin } from '@/lib/notify';
import type { NodeCard } from '@/lib/supabase';

export const runtime = 'nodejs';

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

  const sb = createClient(supabaseUrl, serviceKey);
  const { data, error } = await sb
    .from('node_cards')
    .select('*')
    .ilike('email', normalized)
    .limit(1);

  if (error) {
    console.error('[api/login] supabase error', error.message);
    // 仍返回 ok 以避免暴露存在性
    return NextResponse.json({ ok: true });
  }

  const node = (data?.[0] || null) as NodeCard | null;
  if (node?.id) {
    const signed = signLoginToken(node.id);
    if (!signed.ok) {
      console.error('[api/login] AUTH_SECRET not configured');
      return NextResponse.json({ error: 'auth-not-configured' }, { status: 500 });
    }
    const magicLink = `${getSiteOrigin()}/api/login/verify?token=${encodeURIComponent(signed.token)}`;
    notifyLoginLink(node, magicLink).catch(err => {
      console.error('[api/login] sendLoginLink failed', err);
    });
  } else {
    console.log('[api/login] no node for email');
  }

  return NextResponse.json({ ok: true });
}
