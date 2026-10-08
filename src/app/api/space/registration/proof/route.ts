import { after, NextRequest, NextResponse } from 'next/server';
import { signViewLink, verifyViewLink } from '@/lib/auth';
import { fetchMember } from '@/lib/space/access';
import { deleteUpload, get, readUpload, saveUpload, transact } from '@/lib/space/db';
import { canPayNow, fail, findRegistration, isId, isStarted } from '@/lib/space/events';
import { formatFee } from '@/lib/space/eventTime';
import { gateHost, isFail } from '@/lib/space/gate';
import { admit } from '@/lib/space/guard';
import { managePath, tellHost } from '@/lib/space/mail';
import { getSiteOrigin } from '@/lib/notify';
import type { Registration, SpaceEvent } from '@/lib/space/types';

export const runtime = 'nodejs';

/** 换掉这个字符串，等于把之前签出去的看图链接全部作废 */
const PROOF_SCOPE = 'space-proof';
/** 两次上传之间的最小间隔：挡的是「以为没传上」的连点 */
const RECLAIM_COOLDOWN_MS = 60_000;

/** 传截图时名额已经留不住了：写在主人那边的备注里（报名人看不到——hostNote 只在驳回时给报名人看） */
const OVER_NOTE = '传截图时名额保留已过、名额已满：钱可能已经付了，看是加位还是退款';

/**
 * 能不能传（换）付款截图：收费、等付款或已传截图、活动没取消、还没开始。
 * 和 canPayNow 不同，这里不管名额——钱可能已经付了，证据要收下（名额的事交给主人）。
 */
function canUpload(r: Registration, event: SpaceEvent, t: number = Date.now()): boolean {
  return r.feeCents > 0 && (r.status === 'pending' || r.status === 'claimed') && event.status !== 'cancelled' && !isStarted(event, t);
}

const UPLOAD_ERRORS: Record<string, string> = {
  'unsupported-type': '只能传 JPG、PNG 或 WebP 格式的截图',
  'too-large': '图太大了（超过 4MB），截一张图就够了，换一张试试',
  'bad-image': '这个文件打不开，换一张截图试试',
};

function page(title: string, body: string, status: number): NextResponse {
  return new NextResponse(
    `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} · 附近森林</title></head>
<body style="margin:0;padding:40px 20px;background:#f5f1e8;font-family:-apple-system,'PingFang SC',sans-serif;">
  <div style="max-width:420px;margin:12vh auto 0;text-align:center;">
    <h1 style="margin:0 0 12px;font-size:19px;color:#1e3528;">${title}</h1>
    <div style="font-size:14px;color:#4f5f53;line-height:1.9;">${body}</div>
  </div>
</body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' } },
  );
}

/**
 * GET /api/space/registration/proof?r=报名id&t=签名
 * 主人看付款截图。两条路都认：邮件里带签名的链接（手机邮件客户端里没登录也点得开，一周有效），
 * 或主人（本人、管理员）的登录态——管理页里的「看截图」走这条。
 * 截图里是别人的支付账单片段，图只从这个接口现读现回，不下发存储路径。
 */
export async function GET(request: NextRequest) {
  const regId = request.nextUrl.searchParams.get('r')?.trim() || '';
  const sig = request.nextUrl.searchParams.get('t')?.trim() || '';
  if (!isId(regId)) return page('链接不完整', '这个链接少了报名编号，回到管理页的报名名单里点「看截图」吧。', 400);
  const reg = await get('registrations', regId);

  const signed = sig ? verifyViewLink(PROOF_SCOPE, regId, sig) : null;
  if (!signed?.ok) {
    if (!reg) return page('这条报名不在了', '可能已经被删掉了。', 404);
    const g = await gateHost(reg.memberId);
    if (isFail(g)) {
      if (signed && signed.reason === 'expired') {
        return page('链接过期了', '这条看图链接只在一周内有效。登录附近森林之后，到个人空间管理页的报名名单里还能看到这张截图。', 410);
      }
      return page('这张截图只有活动主人能看', '登录活动主人的账号之后，再点一次链接；或者到管理页的报名名单里点「看截图」。', 403);
    }
  }
  if (!reg || !reg.proofFile) return page('这条报名没有截图', '报名人还没传付款截图，或者报名已经被删掉了。', 404);
  const img = await readUpload(reg.proofFile);
  if (!img) return page('图暂时取不出来', '过一会再点一次；一直不行就到管理页里看。', 404);
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

/** 从等付款传截图时，名额还给不给留：保留期内、或者还有空位（没人排在前面）就给 */
function stillFits(r: Registration, event: SpaceEvent, rows: Registration[], t: number): boolean {
  return r.status === 'claimed' || canPayNow(r, event, rows, t);
}

/**
 * POST /api/space/registration/proof?t=报名token（multipart，字段 file）
 * 报名人付完款传一张截图：pending → claimed，名额先占上（「先开后审」），主人事后对账。
 * 已经传过的可以换一张（传错了），一分钟内不能连传。
 *
 * 钱可能已经付出去了：等付款的人即使保留期刚过、名额又被占满，截图也照收（转成待核对），
 * 在主人那边标一句「传截图时名额已满」，由主人决定加位还是退款——不能让付了钱的人连证据都交不上。
 */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t')?.trim() || '';
  const reg = await findRegistration(token);
  if (!reg) return fail(404, 'not-found', '这个报名链接不对，或者报名已经被删掉了');

  const event = await get('events', reg.eventId);
  if (!event) return fail(404, 'not-found', '这个活动已经不在了');
  if (!canUpload(reg, event)) {
    return fail(409, 'cannot-pay', event.status === 'cancelled'
      ? '活动已经取消了，不用付款'
      : isStarted(event) && (reg.status === 'pending' || reg.status === 'claimed')
        ? '活动已经开始了，不能再传截图了。已经付过款的话，直接联系主人'
        : '这条报名现在不需要付款，刷新一下看看');
  }
  if (reg.claimedAt && Date.now() - Date.parse(reg.claimedAt) < RECLAIM_COOLDOWN_MS) {
    return fail(429, 'too-soon', '刚刚已经传上了。要换一张的话，过一分钟再传');
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, 'invalid-form', '没有收到图片，重新选一张再传');
  }
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return fail(400, 'missing-file', '没有收到图片，重新选一张再传');

  const gate = admit(request, { action: 'proof', memberId: reg.memberId });
  if (!gate.ok) return fail(gate.status, gate.error, gate.message);

  const saved = await saveUpload('proof', file);
  if (typeof saved !== 'string') return fail(400, saved.error, UPLOAD_ERRORS[saved.error] || '这张图传不上，换一张试试');

  // 状态在同一个临界区里再核一遍；名额满了也照收，只是标出来
  let previous: string | null = null;
  let over = false;
  let updated: Registration | null;
  try {
    updated = await transact('registrations', rows => {
      const r = rows.find(x => x.id === reg.id);
      if (!r || !canUpload(r, event)) return null;
      const t = Date.now();
      over = !stillFits(r, event, rows.filter(x => x.eventId === event.id), t);
      previous = r.proofFile;
      const iso = new Date(t).toISOString();
      r.status = 'claimed';
      r.claimedAt = iso;
      r.proofFile = saved;
      r.updatedAt = iso;
      if (over) r.hostNote = OVER_NOTE;
      return { ...r };
    });
  } catch (err) {
    // 写库报错（比如超时）不一定是没写上：查一下这条报名现在指着的是不是刚传的这张
    const landed = await get('registrations', reg.id).catch(() => undefined);
    if (landed && landed.proofFile === saved) {
      updated = landed;
    } else {
      console.error('[space] proof save failed', err);
      // 确定没写上才删图；查不到（数据库还连不上）就先留着——删掉一张被引用的图，主人就看不到截图了
      if (landed !== undefined) await deleteUpload(saved);
      return fail(500, 'storage-unavailable', '截图没有存上，过一会再传一次。已经付过款的话别担心，截图留在你手机里就好');
    }
  }
  if (!updated) {
    await deleteUpload(saved);
    return fail(409, 'cannot-pay', '这条报名的状态刚刚变了，刷新一下看看');
  }
  const done: Registration = updated;
  const overCap = over as boolean;

  const old = previous as string | null;
  after(async () => {
    if (old && old !== saved) await deleteUpload(old);
    let hostEmail = '';
    try {
      hostEmail = (await fetchMember(event.memberId))?.email || '';
    } catch {
      return;
    }
    const sigOut = signViewLink(PROOF_SCOPE, done.id);
    const manage = `${getSiteOrigin()}${managePath(event.memberId, 'events')}`;
    await tellHost({
      memberId: event.memberId,
      hostEmail,
      subject: `「${event.title}」有人传了付款截图（口令 ${done.payCode}）`,
      lines: [
        `${done.name} 为「${event.title}」传了付款截图。`,
        `金额 ${formatFee(done.feeCents)}，付款备注里应该写着口令 ${done.payCode}。`,
        overCap
          ? '注意：TA 传截图时名额保留已经过了，名额也满了。钱可能已经付了——看是给 TA 加个位，还是退款。'
          : '名额先给 TA 留着了。对一下收款记录：对得上就在管理页点「确认」，对不上就「驳回」。',
        ...(sigOut ? [`管理页：${manage}`] : []),
      ],
      path: sigOut
        ? `/api/space/registration/proof?r=${encodeURIComponent(done.id)}&t=${encodeURIComponent(sigOut)}`
        : managePath(event.memberId, 'events'),
      linkLabel: sigOut ? '看截图' : '去管理页看截图',
      key: `proof-${done.id}-${Math.floor(Date.now() / 60_000)}`,
    });
  });

  return NextResponse.json({ status: done.status, claimedAt: done.claimedAt, over: overCap }, { headers: { 'Cache-Control': 'private, no-store' } });
}
