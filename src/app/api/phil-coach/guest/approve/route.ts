import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAction } from '@/lib/auth';
import { memoryClient } from '@/lib/philCoachMemory';

export const runtime = 'nodejs';

function page(title: string, body: string): NextResponse {
  return new NextResponse(
    `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · 附近森林</title></head>
<body style="margin:0;padding:40px 20px;background:#f0f5ec;font-family:-apple-system,'PingFang SC',sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;box-shadow:0 4px 20px rgba(26,46,26,0.08);text-align:center;">
    <h1 style="margin:0 0 14px;font-size:20px;color:#2d4a2d;">${title}</h1>
    <div style="font-size:14px;color:#2a2a2a;line-height:1.9;">${body}</div>
  </div>
</body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

/**
 * 访客自己填的名字和联系方式要转义再拼进这一页。
 *
 * 登记接口是匿名的，只做了截断，不挡任何字符；这一页又是主理人带着登录态打开的。
 * 不转义的话，一个把联系方式填成 <img onerror=…> 的人，就等于拿到了管理员的手——
 * nf_session 是 HttpOnly 偷不走，但同源请求会自动带上它。
 */
function esc(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * GET /api/phil-coach/guest/approve?id=…&sig=…
 * 主理人在通知邮件里点击「通过开通」。HMAC 签名防伪造；幂等（重复点击无害）。
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') || '';
  const sig = request.nextUrl.searchParams.get('sig') || '';
  if (!id || !verifyAdminAction(`guest-approve.${id}`, sig)) {
    return page('链接无效', '这个审核链接不完整或已失效。请从通知邮件里重新点击。');
  }

  const sb = memoryClient();
  if (!sb) return page('服务未配置', '数据库连接未配置，请稍后再试。');

  const { data: guest } = await sb
    .from('phil_coach_guests')
    .select('name, contact, status')
    .eq('id', id)
    .maybeSingle();
  if (!guest) return page('没有找到这条登记', '记录可能已被删除。');

  // 点一次 = 开通/续期 3 个月（approved_at 刷新，重复点击等于延长，无害）
  const { error } = await sb
    .from('phil_coach_guests')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return page('开通失败', `写入失败：${esc(error.message)}，请稍后重试。`);

  const isRenewal = guest.status === 'approved';
  return page(
    isRenewal ? '🌿 已续期 3 个月' : '🌿 已通过开通',
    `<p style="margin:0 0 10px;"><strong>${esc(guest.name)}</strong> ${
      isRenewal ? '的免费使用已续期 3 个月。' : '现在可以继续使用 phil-coach 了（免费 3 个月）。'
    }</p>
     <p style="margin:0 0 10px;">微信/联系方式：<strong>${esc(guest.contact)}</strong></p>
     <p style="margin:0;color:#6b8f5e;">${isRenewal ? '如还没加 ta 微信，记得补上。' : '下一步：加 ta 微信，问候并邀请进附近森林社群。'}</p>`,
  );
}
