import { createClient } from '@supabase/supabase-js';
import { after, NextRequest, NextResponse } from 'next/server';
import { isAdminId } from '@/lib/admin';
import { verifyViewLink } from '@/lib/auth';
import { fetchMeditationContent } from '@/lib/meditations';
import { getSiteOrigin, notifyProgramClaim } from '@/lib/notify';
import { PROOF_BUCKET, PROOF_PREFIX, PROOF_VIEW_SCOPE, buildProofUrl } from '@/lib/payProof';
import { attachProof, findLatestOrder, getOrderById } from '@/lib/programOrders';
import { getAuthenticatedMemberId } from '@/lib/session';

export const runtime = 'nodejs';

const MAX_BYTES = 8 * 1024 * 1024;
const EXT_BY_MIME = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);
const PROOF_CONTENT_TYPE = new Map(
  [...EXT_BY_MIME].map(([mime, ext]) => [ext, mime]),
);

const OBJECT_TTL_SECONDS = 60;
/** 两次上传之间的最小间隔。挡的是「以为没传上」的连点，不是恶意。 */
const RECLAIM_COOLDOWN_MS = 60_000;

function page(title: string, body: string, status = 200): NextResponse {
  return new NextResponse(
    `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · 附近森林</title></head>
<body style="margin:0;padding:40px 20px;background:#eef4e9;font-family:-apple-system,'PingFang SC',sans-serif;">
  <div style="max-width:420px;margin:12vh auto 0;text-align:center;">
    <h1 style="margin:0 0 12px;font-size:19px;color:#23331f;">${title}</h1>
    <div style="font-size:14px;color:#5d6b57;line-height:1.9;">${body}</div>
  </div>
</body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' } },
  );
}

const LOGIN_BUTTON = `<p style="margin:24px 0 0;"><a href="/login" style="display:inline-block;padding:11px 26px;background:#24422a;color:#fff;text-decoration:none;border-radius:999px;font-weight:600;font-size:14px;">去登录</a></p>`;

/**
 * GET /api/meditations/proof?order=…&t=…
 *
 * 付款截图。两条路都认：
 *   1. 链接自带的签名（邮件里那个「看截图」）——和登录魔法链接同一套 HMAC，
 *      但换到手的只是这一张图，一周后过期，也不写 cookie。
 *      手机邮件客户端的内置浏览器和 Safari 不共享登录态，没有这条的话
 *      每次都要被踢去登录再绕回来，而这时人正想赶紧对一眼账。
 *   2. 管理员的登录态——看板里那个「看截图」走的是这条。
 *
 * 图片本身始终从私有桶里现取现回，浏览器拿不到对象地址。
 */
export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'not-configured' }, { status: 503 });
  }

  const orderId = request.nextUrl.searchParams.get('order')?.trim() || '';
  const token = request.nextUrl.searchParams.get('t')?.trim() || '';
  if (!orderId) return NextResponse.json({ error: 'missing-order' }, { status: 400 });

  const signed = token ? verifyViewLink(PROOF_VIEW_SCOPE, orderId, token) : null;
  if (!signed?.ok) {
    // 签名过期是一种情况，压根没带签名（比如从看板点进来）是另一种。
    // 两种都还有登录态这条后路，所以先看看是不是主理人本人。
    const memberId = await getAuthenticatedMemberId();
    if (!isAdminId(memberId)) {
      if (signed && signed.reason === 'expired') {
        return page(
          '链接过期了',
          `这条看图链接只在一周内有效。<br />登录之后到「开通确认」里还能看到这张截图。${LOGIN_BUTTON}`,
          410,
        );
      }
      return page(
        '需要先登录',
        `手机上还没登录过。登录之后，回到邮件再点一次「看截图」就能看到了。${LOGIN_BUTTON}`,
        401,
      );
    }
  }

  const order = await getOrderById(orderId);
  if (!order || !order.proofPath) {
    return page('没有这张截图', '这条申请还没有传过付款截图。', 404);
  }

  const sb = createClient(supabaseUrl, serviceKey);
  const { data, error } = await sb.storage
    .from(PROOF_BUCKET)
    .createSignedUrl(order.proofPath, OBJECT_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    console.error('[meditations/proof] sign failed', order.proofPath, error?.message);
    return page('图暂时取不出来', '过一会再点一次；一直不行就到「开通确认」里看。', 502);
  }

  // 这里转发而不是 302 到签名地址：那条地址一旦落到地址栏或转发记录里，
  // 就是一条谁都能打开的链接。转发一遍，出口始终是这个要凭证的接口。
  const upstream = await fetch(data.signedUrl);
  if (!upstream.ok || !upstream.body) {
    return page('图暂时取不出来', '过一会再点一次；一直不行就到「开通确认」里看。', 502);
  }
  return new NextResponse(upstream.body, {
    headers: {
      // 类型从上传时的白名单反查，不透传上游——上游说什么就是什么的话，
      // 桶里一个被改过 content-type 的对象就能在这条链接上变成一张网页。
      'Content-Type': PROOF_CONTENT_TYPE.get(order.proofPath.split('.').pop() || '') || 'image/jpeg',
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

/**
 * POST（multipart：program + file）
 * 用户点「付好了」并传一张截图。传完这一刻权限就先开出去，主理人事后对账。
 *
 * 截图不构成凭证——伪造工具满地都是。它的作用是让主理人在收款记录里
 * 少翻两页（金额、时间、备注一眼能对上），最终以收款记录为准。
 */
export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'not-configured' }, { status: 503 });
  }

  const memberId = await getAuthenticatedMemberId();
  if (!memberId) return NextResponse.json({ error: 'not-logged-in' }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'invalid-form' }, { status: 400 });
  }

  const programId = (form.get('program') as string | null)?.trim() || '';
  const file = form.get('file');
  if (!programId) return NextResponse.json({ error: 'missing-program' }, { status: 400 });
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'missing-file' }, { status: 400 });
  }
  const ext = EXT_BY_MIME.get(file.type);
  if (!ext) return NextResponse.json({ error: 'bad-file-type' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'file-too-large' }, { status: 400 });

  const order = await findLatestOrder(memberId, programId);
  if (!order || order.status !== 'pending') {
    return NextResponse.json({ error: 'no-pending-order' }, { status: 409 });
  }

  // 刚传过就再传，多半是上一次的响应没回到手机、人以为失败又点了一次。
  // 拦一分钟：主理人不会为同一单收到两三封信，桶里也不会堆没人引用的图。
  if (order.claimedAt && Date.now() - new Date(order.claimedAt).getTime() < RECLAIM_COOLDOWN_MS) {
    return NextResponse.json({ error: 'too-soon' }, { status: 429 });
  }

  // 换图之前先记住旧的那张，成功之后再删——顺序反了会在上传失败时把仅有的证据删掉
  const previousPath = order.hasProof ? (await getOrderById(order.id))?.proofPath || '' : '';

  const sb = createClient(supabaseUrl, serviceKey);
  const path = `${PROOF_PREFIX}/${order.id}/${Date.now()}.${ext}`;
  const { error: upErr } = await sb.storage
    .from(PROOF_BUCKET)
    .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });
  if (upErr) {
    console.error('[meditations/proof] upload failed', upErr.message);
    return NextResponse.json({ error: 'upload-failed' }, { status: 500 });
  }

  // 先落库再发信：库写不进去就什么都没发生，重传一次即可；
  // 反过来的话，主理人会收到一封点开是空的信。
  const updated = await attachProof(order.id, memberId, path);
  if (!updated) return NextResponse.json({ error: 'no-pending-order' }, { status: 409 });

  // 发信和收尾都挪到响应之后。发信最坏要 16 秒（8 秒超时 × 2 次重试），
  // 而这时权限已经开好了——让手机上那个「正在传…」干等这 16 秒，
  // 人只会以为失败了再点一次。
  after(async () => {
    try {
      if (previousPath && previousPath !== path) {
        await sb.storage.from(PROOF_BUCKET).remove([previousPath]);
      }
      const content = await fetchMeditationContent();
      const label = content.categories.find(c => c.id === order.programId)?.label || order.programId;
      const detail = await getOrderById(order.id);
      const sent = await notifyProgramClaim({
        memberName: detail?.memberName || '',
        programTitle: label,
        amountCents: updated.amountCents,
        code: updated.code,
        orderId: order.id,
        boardUrl: `${getSiteOrigin()}/meditations/orders?code=${encodeURIComponent(updated.code)}`,
        proofUrl: buildProofUrl(order.id),
      });
      // 信没发出去不影响这个人——权限已经开了，看板上那条也在。只留一行日志。
      if (!sent.ok) console.error('[meditations/proof] claim email failed', sent.reason);
    } catch (err) {
      console.error('[meditations/proof] notify threw', err);
    }
  });

  return NextResponse.json({ order: updated });
}
