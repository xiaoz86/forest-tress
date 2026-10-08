import { after, NextRequest, NextResponse } from 'next/server';
import { insert, newId, newToken, now } from '@/lib/space/db';
import { gateSpace, isFail } from '@/lib/space/gate';
import { admit, clean, cleanLine, honeypot, isBlocked, sourceKey } from '@/lib/space/guard';
import { managePath, tellHost } from '@/lib/space/mail';
import { hasOfferText, shownServiceTitles } from '@/lib/space/services';
import { LIMITS, type Booking } from '@/lib/space/types';
import { canSee } from '@/lib/space/viewer';

export const runtime = 'nodejs';

/**
 * POST /api/space/book?id=…
 * body：{ serviceTitle, name, contact, preferred, note, website }
 *
 * 访客预约服务单里的一项（serviceTitle 为空 = 泛泛的「想约你」）。
 * 返回 { token }：预约人凭 /space/b/<token> 查看状态，不需要登录。
 * 被屏蔽的联系方式或来源回 { ok: true }（不带 token）：不让对方知道被屏蔽，也不入库、不提醒。
 * 「一起做点什么」对 TA 不可见时回 404；太频繁时回 429 { error: 'too-many', message }（message 给人看）。
 */
export async function POST(request: NextRequest) {
  const g = await gateSpace(request.nextUrl.searchParams.get('id'));
  if (isFail(g)) return NextResponse.json({ error: g.error }, { status: g.status });
  // 「一起做点什么」这一章对 TA 不可见，服务单也就不存在（和报名一致）
  if (!g.host && !canSee(g.settings.visibility.offer, g.viewer)) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad-json' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'bad-body' }, { status: 400 });
  }

  // 蜜罐：直接拒绝，不计数
  if (honeypot(body)) return NextResponse.json({ error: 'rejected' }, { status: 400 });
  if (!g.settings.bookingsOpen) return NextResponse.json({ error: 'closed' }, { status: 403 });

  const serviceTitle = cleanLine(body.serviceTitle, 60);
  const name = cleanLine(body.name, LIMITS.name);
  const contact = cleanLine(body.contact, LIMITS.contact);
  const preferred = cleanLine(body.preferred, LIMITS.preferred);
  const note = clean(body.note, LIMITS.note);
  if (!name) return NextResponse.json({ error: 'need-name' }, { status: 400 });
  if ([...contact].length < 3) return NextResponse.json({ error: 'need-contact' }, { status: 400 });

  // 只认页面上当前显示的服务：不让人借预约往收件箱里塞任意「服务名」，也不让人拿它逐个验证隐藏的服务。
  // 「可以提供」原话都清空了，页面上就没有任何预约入口，泛预约（serviceTitle 为空）也不收。
  if (!hasOfferText(g.node)) return NextResponse.json({ error: 'unknown-service' }, { status: 400 });
  if (serviceTitle) {
    let titles: string[];
    try {
      titles = await shownServiceTitles(g.memberId, g.node);
    } catch {
      return NextResponse.json({ error: 'storage-unavailable' }, { status: 500 });
    }
    if (!titles.includes(serviceTitle)) return NextResponse.json({ error: 'unknown-service' }, { status: 400 });
  }

  const source = sourceKey(request);
  if (isBlocked(g.settings.blocked, contact, source)) return NextResponse.json({ ok: true });

  // 所有校验都过了、马上要入库：这时才计数
  const a = admit(request, { action: 'book', memberId: g.memberId, contact });
  if (!a.ok) return NextResponse.json({ error: a.error, message: a.message }, { status: a.status });

  const t = now();
  const row: Booking = {
    id: newId(),
    memberId: g.memberId,
    serviceTitle,
    name,
    contact,
    preferred,
    note,
    visitorMemberId: g.viewer.viewerId || null,
    sourceKey: source,
    status: 'new',
    hostNote: '',
    token: newToken(),
    createdAt: t,
    updatedAt: t,
  };
  try {
    await insert('bookings', row);
  } catch (err) {
    console.error('[space] booking insert failed', err);
    return NextResponse.json({ error: 'storage-unavailable' }, { status: 500 });
  }

  const hostEmail = g.node.email;
  const memberId = g.memberId;
  const what = serviceTitle ? `「${serviceTitle}」` : '';
  after(() => tellHost({
    memberId,
    hostEmail,
    subject: `${name} 想预约你的${what || '时间'}`,
    lines: [
      `${name} 在你的个人空间提交了一个预约${what ? `：${what}` : '。'}`,
      preferred ? `TA 希望的时间：${preferred}` : 'TA 没写希望的时间。',
      note ? `TA 说：「${excerpt(note, 60)}」` : '',
      row.visitorMemberId ? 'TA 是登录过附近森林的成员。' : '',
      'TA 留的联系方式在收件箱里，只有你能看到。在收件箱里点「接受」或「婉拒」，TA 在自己的预约页面能看到。',
    ].filter(Boolean),
    path: managePath(memberId, 'inbox'),
    linkLabel: '去收件箱看看',
    key: `book-${row.id}`,
  }));

  return NextResponse.json({ ok: true, token: row.token });
}

function excerpt(s: string, max: number): string {
  const chars = [...s.replace(/\s+/g, ' ')];
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : chars.join('');
}
