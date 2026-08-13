import { createClient } from '@supabase/supabase-js';
import { after, NextRequest, NextResponse } from 'next/server';
import {
  MEMBER_COOKIE,
  MEMBER_COOKIE_MAX_AGE,
  SESSION_COOKIE,
  VERIFIED_EMAIL_COOKIE,
  signLoginToken,
  signMemberSession,
  verifyVerifiedEmail,
} from '@/lib/auth';
import { getLocale } from '@/lib/locale';
import { getSiteOrigin, notifyNewNode, notifyWelcome } from '@/lib/notify';
import type { NodeCard } from '@/lib/supabase';

export const runtime = 'nodejs';

/** 邮箱验证后选择「轻登记」：只留下称呼，马上继续 phil-coach。 */
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
  const rawName = (body as { name?: unknown })?.name;
  const name = typeof rawName === 'string' ? rawName.trim().slice(0, 60) : '';
  if (!name) {
    return NextResponse.json({ error: 'name-required' }, { status: 400 });
  }

  const proof = request.cookies.get(VERIFIED_EMAIL_COOKIE)?.value || '';
  const verified = verifyVerifiedEmail(proof);
  if (!verified.ok) {
    return NextResponse.json({ error: 'email-verification-required' }, { status: 401 });
  }

  const sb = createClient(supabaseUrl, serviceKey);
  const { data: existing } = await sb
    .from('node_cards')
    .select('id, email')
    .ilike('email', verified.email)
    .limit(20);
  const existingNode = ((existing || []) as Pick<NodeCard, 'id' | 'email'>[]).find(
    row => row.email?.trim().toLowerCase() === verified.email,
  );

  let memberId = existingNode?.id || '';
  let createdNode: NodeCard | null = null;
  if (!memberId) {
    const { data: inserted, error } = await sb
      .from('node_cards')
      .insert([{
        name,
        email: verified.email,
        email_verified_at: new Date().toISOString(),
      }])
      .select();
    if (error || !inserted?.[0]?.id) {
      // 数据库若有邮箱唯一约束，并发的另一请求可能已经先建好节点。
      // 此时再读一次，避免把已完成的轻登记误报成失败。
      const { data: raced } = await sb
        .from('node_cards')
        .select('id, email')
        .ilike('email', verified.email)
        .limit(20);
      const racedNode = ((raced || []) as Pick<NodeCard, 'id' | 'email'>[]).find(
        row => row.email?.trim().toLowerCase() === verified.email,
      );
      if (racedNode?.id) {
        memberId = racedNode.id;
      } else {
        console.error('[api/join/light] cannot create member', error?.message);
        return NextResponse.json({ error: 'create-failed' }, { status: 500 });
      }
    } else {
      createdNode = inserted[0] as NodeCard;
      memberId = createdNode.id!;
    }
  }

  const session = signMemberSession(memberId);
  if (!session.ok) {
    console.error('[api/join/light] AUTH_SECRET not configured');
    return NextResponse.json({ error: 'not-configured' }, { status: 500 });
  }

  if (createdNode) {
    const locale = await getLocale();
    const signed = signLoginToken(memberId);
    const magicLink = signed.ok
      ? `${getSiteOrigin()}/api/login/verify?token=${encodeURIComponent(signed.token)}`
      : '';
    after(async () => {
      await notifyNewNode(createdNode!);
      if (magicLink) await notifyWelcome(createdNode!, magicLink, locale);
    });
  }

  const res = NextResponse.json({ ok: true, memberId, created: Boolean(createdNode) });
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
