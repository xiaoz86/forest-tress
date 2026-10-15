import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAction } from '@/lib/auth';
import { notifyPhilAccessRenewed } from '@/lib/notify';
import {
  approveRenewal,
  formatDayZh,
  loadAccess,
  renewActionPayload,
  renewedFreeUntil,
} from '@/lib/philCoachAccess';
import { memoryClient } from '@/lib/philCoachMemory';

export const runtime = 'nodejs';

function page(title: string, body: string): NextResponse {
  return new NextResponse(
    `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} · 附近森林</title></head>
<body style="margin:0;padding:40px 20px;background:#f0f5ec;font-family:-apple-system,'PingFang SC',sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;box-shadow:0 4px 20px rgba(26,46,26,0.08);text-align:center;">
    <h1 style="margin:0 0 14px;font-size:20px;color:#2d4a2d;">${title}</h1>
    <div style="font-size:14px;color:#2a2a2a;line-height:1.9;">${body}</div>
  </div>
</body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
}

/** 成员自己填的称呼要转义再拼进这一页：主理人是带着登录态打开它的 */
function esc(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

type Params = { memberId: string; token: string; sig: string };

function verified(p: Params): boolean {
  return Boolean(p.memberId && p.token && verifyAdminAction(renewActionPayload(p.memberId, p.token), p.sig));
}

const INVALID = () => page('链接无效', '这个链接不完整或已失效。请从通知邮件里重新点击。');

/** 已经续过了：现在的免费期还有效 */
const DONE = (name: string, freeUntil: string) =>
  page(
    '这次申请已经处理过了',
    `<p style="margin:0;"><strong>${esc(name)}</strong> 现在可以免费用到 <strong>${formatDayZh(freeUntil)}</strong>。</p>`,
  );

/** 链接对不上、人也还在过期中：不能说成「已处理」，否则主理人会以为续上了 */
const STALE = (name: string, freeUntil: string) =>
  page(
    '这个链接已经失效',
    `<p style="margin:0 0 10px;"><strong>${esc(name)}</strong> 的免费期在 <strong>${formatDayZh(freeUntil)}</strong> 结束了，还没有续上。</p>
     <p style="margin:0;color:#6b8f5e;">可能 ta 又申请了一次（请点最新那封邮件里的链接），或者这次申请因为通知没发出去被撤回了。</p>`,
  );

/**
 * GET /api/phil-coach/access/approve?m=…&t=…&sig=… —— 主理人在通知邮件里点开。
 *
 * 只显示一页确认，真正续期要再点一下按钮（POST）。
 * 有的邮箱会替人预先打开信里的链接做安全扫描；要是 GET 一下就续上，
 * 等于每个申请都被扫描器「通过」了，人工那一下就没了意义。
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const p = { memberId: q.get('m') || '', token: q.get('t') || '', sig: q.get('sig') || '' };
  if (!verified(p)) return INVALID();

  const sb = memoryClient();
  if (!sb) return page('服务未配置', '数据库连接未配置，请稍后再试。');

  const [{ data: card }, access, { data: row }] = await Promise.all([
    sb.from('node_cards').select('name, email').eq('id', p.memberId).maybeSingle(),
    loadAccess(sb, p.memberId),
    sb.from('phil_coach_access').select('renew_token').eq('member_id', p.memberId).maybeSingle(),
  ]);
  if (!card || !access) return page('没有找到这位成员', '记录可能已被删除，或者数据库暂时读不到。');

  if (row?.renew_token !== p.token) {
    return access.active ? DONE(card.name, access.freeUntil) : STALE(card.name, access.freeUntil);
  }

  const next = renewedFreeUntil(access);
  const status = access.active
    ? `免费期到 ${formatDayZh(access.freeUntil)}，快到期了。`
    : `免费期已在 ${formatDayZh(access.freeUntil)} 结束。`;
  return page(
    `续期 ${esc(card.name) || '这位成员'} 的 phil-coach？`,
    `<p style="margin:0 0 6px;">${esc(status)}</p>
     <p style="margin:0 0 6px;">邮箱：<strong>${esc(card.email) || '（未填）'}</strong></p>
     <p style="margin:0 0 20px;">通过后可以免费用到 <strong>${formatDayZh(next)}</strong>。</p>
     <form method="post" style="margin:0;">
       <input type="hidden" name="m" value="${esc(p.memberId)}">
       <input type="hidden" name="t" value="${esc(p.token)}">
       <input type="hidden" name="sig" value="${esc(p.sig)}">
       <button type="submit" style="padding:12px 28px;border:0;border-radius:999px;background:#2d4a2d;color:#fff;font-weight:600;font-size:14px;cursor:pointer;">✓ 确认通过，再开 3 个月</button>
     </form>
     <p style="margin:16px 0 0;font-size:12px;color:#8a8a8a;">你或 Wendy 任一人点即可；另一人再点会看到「已经处理过了」。</p>`,
  );
}

/** POST：确认页上那颗按钮。签名同 GET，一次申请只续一次（见 approveRenewal）。 */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const p = {
    memberId: String(form?.get('m') || ''),
    token: String(form?.get('t') || ''),
    sig: String(form?.get('sig') || ''),
  };
  if (!verified(p)) return INVALID();

  const sb = memoryClient();
  if (!sb) return page('服务未配置', '数据库连接未配置，请稍后再试。');

  const result = await approveRenewal(sb, p.memberId, p.token);
  if (result.kind === 'unavailable') return page('续期失败', '数据库暂时写不进去，请稍后再点一次邮件里的链接。');
  if (result.kind === 'not-found') return page('没有找到这次申请', '记录可能已被删除。');
  if (result.kind === 'already-done') return DONE(result.name, result.freeUntil);
  if (result.kind === 'stale') return STALE(result.name, result.freeUntil);

  let told = '';
  if (result.email) {
    const sent = await notifyPhilAccessRenewed({
      to: result.email,
      name: result.name,
      freeUntil: result.freeUntil,
      locale: result.locale === 'en' ? 'en' : 'zh',
      idempotencyKey: `phil-renewed-${p.memberId}-${p.token}`,
    });
    told = sent.ok ? '已经发邮件告诉 ta 了。' : '通知邮件没发出去，可以直接告诉 ta 一声。';
  } else {
    told = 'ta 的节点卡上没有邮箱，可以直接告诉 ta 一声。';
  }
  return page(
    '🌿 已续期 3 个月',
    `<p style="margin:0 0 10px;"><strong>${esc(result.name)}</strong> 现在可以免费用到 <strong>${formatDayZh(result.freeUntil)}</strong>。</p>
     <p style="margin:0;color:#6b8f5e;">${told}</p>`,
  );
}
