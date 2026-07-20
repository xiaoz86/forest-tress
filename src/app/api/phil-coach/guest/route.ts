import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { signAdminAction } from '@/lib/auth';
import { getSiteOrigin, notifyPhilGuest } from '@/lib/notify';
import { GUEST_COOKIE, memoryClient } from '@/lib/philCoachMemory';

export const runtime = 'nodejs';

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 年

// 轻限流：每 IP 10 分钟内最多 5 次登记提交
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const buckets = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (buckets.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (arr.length >= MAX_PER_WINDOW) {
    buckets.set(ip, arr);
    return true;
  }
  arr.push(now);
  buckets.set(ip, arr);
  return false;
}

/** GET /api/phil-coach/guest —— 检查登记与审核状态（客户端判断用） */
export async function GET() {
  const store = await cookies();
  const id = store.get(GUEST_COOKIE)?.value;
  if (!id) return NextResponse.json({ registered: false, approved: false });
  const sb = memoryClient();
  if (!sb) return NextResponse.json({ registered: true, approved: false });
  const { data } = await sb
    .from('phil_coach_guests')
    .select('status')
    .eq('id', id)
    .maybeSingle();
  if (!data) return NextResponse.json({ registered: false, approved: false });
  return NextResponse.json({ registered: true, approved: data.status === 'approved' });
}

type Body = { name?: unknown; contact?: unknown; from?: unknown };

/**
 * POST /api/phil-coach/guest —— 轻登记：称呼 + 微信号（或邮箱）。
 * 成功后种 nf_guest cookie（1 年），并邮件通知主理人加微信拉群。
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json({ error: 'too-many' }, { status: 429 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad-json' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : '';
  const contact = typeof body.contact === 'string' ? body.contact.trim().slice(0, 120) : '';
  const source = typeof body.from === 'string' ? body.from.trim().slice(0, 60) : '';
  if (!name || !contact) {
    return NextResponse.json({ error: 'missing-fields' }, { status: 400 });
  }

  const sb = memoryClient();
  if (!sb) return NextResponse.json({ error: 'not-configured' }, { status: 500 });

  const { data, error } = await sb
    .from('phil_coach_guests')
    .insert({ name, contact, source })
    .select('id')
    .single();
  if (error || !data?.id) {
    console.error('[phil-guest] insert failed', error?.message);
    return NextResponse.json({ error: 'save-failed' }, { status: 500 });
  }

  // 生成审核链接（HMAC 签名），通知主理人 + Wendy（尽力而为）
  const sig = signAdminAction(`guest-approve.${data.id}`);
  const approveUrl = sig
    ? `${getSiteOrigin()}/api/phil-coach/guest/approve?id=${encodeURIComponent(data.id)}&sig=${encodeURIComponent(sig)}`
    : '';
  notifyPhilGuest({ name, contact, source, approveUrl }).catch(err => {
    console.error('[phil-guest] notify failed', err);
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(GUEST_COOKIE, data.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
}
