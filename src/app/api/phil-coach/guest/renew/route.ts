import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { signAdminAction } from '@/lib/auth';
import { getSiteOrigin, notifyPhilGuest } from '@/lib/notify';
import { GUEST_COOKIE, memoryClient } from '@/lib/philCoachMemory';

export const runtime = 'nodejs';

// 轻限流：每 IP 10 分钟内最多 3 次续期申请
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 3;
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

/**
 * POST /api/phil-coach/guest/renew —— 免费期满的访客申请续期。
 * 给主理人+Wendy 发邮件（同一个「✓ 通过」链接，点一次即续 3 个月）。
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json({ error: 'too-many' }, { status: 429 });
  }

  const store = await cookies();
  const guestId = store.get(GUEST_COOKIE)?.value;
  if (!guestId) return NextResponse.json({ error: 'not-registered' }, { status: 401 });

  const sb = memoryClient();
  if (!sb) return NextResponse.json({ error: 'not-configured' }, { status: 500 });

  const { data: guest } = await sb
    .from('phil_coach_guests')
    .select('id, name, contact, source')
    .eq('id', guestId)
    .maybeSingle();
  if (!guest) return NextResponse.json({ error: 'not-registered' }, { status: 401 });

  const sig = signAdminAction(`guest-approve.${guest.id}`);
  const approveUrl = sig
    ? `${getSiteOrigin()}/api/phil-coach/guest/approve?id=${encodeURIComponent(guest.id)}&sig=${encodeURIComponent(sig)}`
    : '';
  notifyPhilGuest({
    name: guest.name,
    contact: guest.contact,
    source: guest.source || '',
    approveUrl,
    renewal: true,
  }).catch(err => {
    console.error('[phil-guest-renew] notify failed', err);
  });

  return NextResponse.json({ ok: true });
}
