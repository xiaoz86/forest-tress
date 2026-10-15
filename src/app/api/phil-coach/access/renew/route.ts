import { NextResponse } from 'next/server';
import { signAdminAction } from '@/lib/auth';
import { getSiteOrigin, notifyPhilAccessRenewal } from '@/lib/notify';
import { cancelRenewal, formatDayZh, renewActionPayload, requestRenewal } from '@/lib/philCoachAccess';
import { memoryClient } from '@/lib/philCoachMemory';
import { getAuthenticatedMemberId } from '@/lib/session';

export const runtime = 'nodejs';

/**
 * POST /api/phil-coach/access/renew —— 成员申请继续使用 phil-coach。
 *
 * 只有登录成员能申请；已经在等的不再发信，离到期还早的也不收（见 requestRenewal）。
 * 返回最新的免费期，前端直接拿来换掉显示。
 */
export async function POST() {
  const memberId = await getAuthenticatedMemberId();
  if (!memberId) return NextResponse.json({ error: 'not-logged-in' }, { status: 401 });

  const sb = memoryClient();
  if (!sb) return NextResponse.json({ error: 'not-configured' }, { status: 500 });

  const result = await requestRenewal(sb, memberId);
  if (result.kind === 'unavailable') {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
  if (result.kind === 'not-yet') {
    return NextResponse.json({ error: 'not-yet', access: result.access }, { status: 409 });
  }
  if (result.kind === 'already-pending') {
    return NextResponse.json({ ok: true, access: result.access });
  }

  const sig = signAdminAction(renewActionPayload(memberId, result.token));
  const approveUrl = sig
    ? `${getSiteOrigin()}/api/phil-coach/access/approve?m=${encodeURIComponent(memberId)}&t=${encodeURIComponent(result.token)}&sig=${encodeURIComponent(sig)}`
    : '';

  // 等信发出去再回话：发不出去就撤回这次申请，让人能再点一次
  const sent = approveUrl
    ? await notifyPhilAccessRenewal({
        name: result.name,
        email: result.email,
        memberId,
        freeUntil: formatDayZh(result.access.freeUntil),
        expired: !result.access.active,
        approveUrl,
        token: result.token,
      })
    : null;
  if (!sent?.ok) {
    console.error('[phil-access] renewal notice not sent', { reason: sent ? sent.reason : 'no-signature' });
    await cancelRenewal(sb, memberId, result.token).catch(() => {});
    return NextResponse.json({ error: 'notify-failed' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, access: result.access });
}
