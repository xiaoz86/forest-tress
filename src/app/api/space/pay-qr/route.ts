import { after, NextRequest, NextResponse } from 'next/server';
import { deleteUpload, get, list, readUpload, saveUpload } from '@/lib/space/db';
import { canPayNow, fail, findRegistration, renewHold } from '@/lib/space/events';
import { gateHost, isFail } from '@/lib/space/gate';
import { announcePromotions } from '@/lib/space/registrantMail';
import { getSettings, swapPayQr } from '@/lib/space/settings';

export const runtime = 'nodejs';

const UPLOAD_ERRORS: Record<string, string> = {
  'unsupported-type': '只能传 JPG、PNG 或 WebP 格式的图',
  'too-large': '图太大了（超过 4MB），截一张收款码的图就够了',
  'bad-image': '这个文件打不开，换一张试试',
};

function image(img: { body: Buffer; type: string }): NextResponse {
  return new NextResponse(new Uint8Array(img.body), {
    headers: {
      'Content-Type': img.type,
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

/**
 * 主人的收款码。只在「付款那一步」给看（冥想营同样的做法）：
 *
 * - GET ?t=报名token：报名人付款时看。只有这条报名是收费的、正等着付款或已传截图、活动没取消时才给。
 * - GET ?id=成员id：主人（本人、管理员）在管理页预览。
 *
 * 图存在私有目录里，没有任何公开地址；这个接口现读现回，不下发存储路径，也不让浏览器缓存。
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t')?.trim() || '';
  if (token) {
    const reg = await findRegistration(token);
    if (!reg) return fail(404, 'not-found');
    const event = await get('events', reg.eventId);
    if (!event) return fail(404, 'not-found');
    // 付款前先占住名额：保留期过了但还有空位的，从现在起重新保留
    let cur = reg;
    if (reg.status === 'pending') {
      const renewed = await renewHold(reg.id, event);
      if (!renewed.reg) return fail(404, 'not-found');
      cur = renewed.reg;
      if (renewed.promoted.length) after(() => announcePromotions(event, renewed.promoted));
    }
    const rows = await list('registrations', r => r.eventId === event.id);
    if (!canPayNow(cur, event, rows)) return fail(403, 'not-payable');
    const settings = await getSettings(reg.memberId);
    const img = settings.payQr ? await readUpload(settings.payQr) : null;
    return img ? image(img) : fail(404, 'no-qr', '主人还没放收款码');
  }
  const g = await gateHost(request.nextUrl.searchParams.get('id'));
  if (isFail(g)) return fail(g.status, g.error);
  const img = g.settings.payQr ? await readUpload(g.settings.payQr) : null;
  return img ? image(img) : fail(404, 'no-qr');
}

/** POST ?id=…（multipart，字段 file）—— 主人上传或替换收款码 */
export async function POST(request: NextRequest) {
  const g = await gateHost(request.nextUrl.searchParams.get('id'));
  if (isFail(g)) return fail(g.status, g.error);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, 'invalid-form', '没有收到图片，重新选一张再传');
  }
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return fail(400, 'missing-file', '没有收到图片，重新选一张再传');
  const saved = await saveUpload('payqr', file);
  if (typeof saved !== 'string') return fail(400, saved.error, UPLOAD_ERRORS[saved.error] || '这张图传不上，换一张试试');
  // 在设置的临界区里换：连着传两张时，被换下来的那张一定能拿到、删掉，不会留在磁盘上没人引用
  let prev: string | null;
  try {
    ({ prev } = await swapPayQr(g.memberId, saved));
  } catch (err) {
    console.error('[space] pay-qr save failed', err);
    await deleteUpload(saved);
    return fail(500, 'save-failed', '没有存上，过一会再试一次');
  }
  if (prev && prev !== saved) await deleteUpload(prev);
  return NextResponse.json({ payQr: true }, { headers: { 'Cache-Control': 'private, no-store' } });
}

/** DELETE ?id=… —— 主人删掉收款码。已经报了名、等着付款的人会看到「主人还没放收款码」 */
export async function DELETE(request: NextRequest) {
  const g = await gateHost(request.nextUrl.searchParams.get('id'));
  if (isFail(g)) return fail(g.status, g.error);
  let prev: string | null;
  try {
    ({ prev } = await swapPayQr(g.memberId, null));
  } catch (err) {
    console.error('[space] pay-qr delete failed', err);
    return fail(500, 'save-failed', '没有删掉，过一会再试一次');
  }
  if (prev) await deleteUpload(prev);
  return NextResponse.json({ payQr: false }, { headers: { 'Cache-Control': 'private, no-store' } });
}
