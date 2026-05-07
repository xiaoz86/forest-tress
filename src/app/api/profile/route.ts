import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { isAdminId } from '@/lib/admin';
import { MEMBER_COOKIE } from '@/lib/auth';

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TEXT_FIELDS = [
  'name',
  'city',
  'doing',
  'experience',
  'offer',
  'seeking',
  'product',
  'wechat',
  'interests',
] as const;

const LIMITS: Record<string, number> = {
  name: 60,
  city: 60,
  doing: 600,
  experience: 600,
  offer: 600,
  seeking: 600,
  product: 600,
  wechat: 80,
  interests: 240,
  email: 200,
};

/**
 * PATCH /api/profile?id=...
 * body: JSON — 每个字段独立可选；未传则保留原值。
 *   text fields:  TEXT_FIELDS 列表
 *   email:  必须合法格式；改邮箱会同时校验唯一
 *   topics: string[]，最多 12 条
 *
 * 仅本人 / 管理员可调用。
 */
export async function PATCH(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'supabase-not-configured' }, { status: 500 });
  }

  const nodeId = request.nextUrl.searchParams.get('id')?.trim();
  if (!nodeId) return NextResponse.json({ error: 'missing-id' }, { status: 400 });

  const cookieStore = await cookies();
  const memberId = cookieStore.get(MEMBER_COOKIE)?.value;
  const isOwner = !!memberId && memberId === nodeId;
  const isAdmin = isAdminId(memberId);
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'bad-json' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  for (const f of TEXT_FIELDS) {
    if (!(f in body)) continue;
    const v = body[f];
    if (typeof v !== 'string') {
      return NextResponse.json({ error: `bad-${f}` }, { status: 400 });
    }
    patch[f] = v.trim().slice(0, LIMITS[f]);
  }
  if ('name' in patch && !(patch.name as string)) {
    return NextResponse.json({ error: 'name-required' }, { status: 400 });
  }

  if ('email' in body) {
    const e = body.email;
    if (typeof e !== 'string' || !EMAIL_RE.test(e.trim())) {
      return NextResponse.json({ error: 'email-invalid' }, { status: 400 });
    }
    patch.email = e.trim().toLowerCase().slice(0, LIMITS.email);
  }

  if ('topics' in body) {
    const raw = body.topics;
    if (!Array.isArray(raw)) {
      return NextResponse.json({ error: 'bad-topics' }, { status: 400 });
    }
    const cleaned: string[] = [];
    for (const t of raw) {
      if (typeof t !== 'string') continue;
      const v = t.trim().slice(0, 24);
      if (!v) continue;
      if (cleaned.includes(v)) continue;
      cleaned.push(v);
      if (cleaned.length >= 12) break;
    }
    patch.topics = cleaned;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing-to-update' }, { status: 400 });
  }

  const sb = createClient(supabaseUrl, serviceKey);

  // 邮箱被改 → 校验未被其他成员占用
  if (typeof patch.email === 'string') {
    const { data: dup } = await sb
      .from('node_cards')
      .select('id')
      .ilike('email', patch.email as string)
      .neq('id', nodeId)
      .limit(1);
    if (dup && dup.length > 0) {
      return NextResponse.json({ error: 'email-taken' }, { status: 409 });
    }
  }

  const { data, error } = await sb
    .from('node_cards')
    .update(patch)
    .eq('id', nodeId)
    .select()
    .single();
  if (error) {
    if (/column/i.test(error.message)) {
      return NextResponse.json(
        { error: 'column-missing', detail: error.message },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: 'db-update-failed', detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ node: data });
}
