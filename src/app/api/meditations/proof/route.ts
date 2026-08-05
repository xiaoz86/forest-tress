import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { isAdminId } from '@/lib/admin';
import { findProofPath } from '@/lib/programOrders';
import { readMemberId } from '@/lib/session';

export const runtime = 'nodejs';

const BUCKET = 'meditations';
const TTL_SECONDS = 10 * 60;

/**
 * 付款截图，只给主理人看。
 *
 * 里面是别人的支付宝账单片段——姓名、金额、时间都在上面，
 * 属于用户的支付信息，不该有第二个人看得到。所以这条路由既不
 * 下发路径，也不接受路径参数，只认订单 id，且必须是管理员。
 */
/** 出错时给一个能看懂的页面，而不是一行 JSON */
function page(title: string, body: string, status: number) {
  const esc = (s: string) => s.replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c));
  return new NextResponse(
    `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · 附近森林</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;padding:32px;
background:#eef3ea;font-family:-apple-system,'PingFang SC',sans-serif;">
<div style="max-width:340px;text-align:center;">
  <h1 style="margin:0 0 12px;font-size:19px;font-weight:650;color:#243229;">${esc(title)}</h1>
  <p style="margin:0 0 24px;font-size:14px;line-height:1.9;color:#5c675f;">${esc(body)}</p>
  <a href="/login" style="display:inline-block;background:#2f513d;color:#fff;text-decoration:none;
     padding:12px 26px;border-radius:999px;font-size:14px;font-weight:600;">去登录</a>
</div></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' } },
  );
}

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'not-configured' }, { status: 503 });
  }

  // 这条是从邮件里点开的，落在新标签页——出错时不能甩一坨 JSON，
  // 手机上打开只会看到 {"error":"forbidden"}，谁也不知道该干什么。
  const memberId = await readMemberId();
  if (!isAdminId(memberId)) {
    return page(
      memberId ? '这个链接只有主理人能打开' : '需要先登录',
      memberId
        ? '当前登录的账号没有权限看付款截图。换主理人账号登录后再点一次邮件里的链接。'
        : '手机上还没登录过。登录之后，回到邮件再点一次「看付款截图」就能看到了。',
      403,
    );
  }

  const orderId = request.nextUrl.searchParams.get('order')?.trim();
  if (!orderId) return page('链接不完整', '这个链接少了订单号，回到开通确认页面找那一笔吧。', 400);

  const path = await findProofPath(orderId);
  if (!path) return page('这一笔没有截图', '可能是早期的申请，那时还没要求传截图。', 404);

  const sb = createClient(supabaseUrl, serviceKey);
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, TTL_SECONDS);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'sign-failed' }, { status: 502 });
  }
  return NextResponse.redirect(data.signedUrl, {
    status: 302,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}
