import { after, NextRequest, NextResponse } from 'next/server';
import { insert, newId, now } from '@/lib/space/db';
import { gateSpace, isFail } from '@/lib/space/gate';
import { admit, clean, cleanLine, honeypot, isBlocked, sourceKey } from '@/lib/space/guard';
import { managePath, tellHost } from '@/lib/space/mail';
import { LIMITS, type Greeting } from '@/lib/space/types';

export const runtime = 'nodejs';

/**
 * POST /api/space/greet?id=…
 * body：{ name, contact, message, website }（website 是蜜罐，人不会填）
 *
 * 访客在别人的个人空间里「打个招呼」。联系方式只进主人的收件箱，提醒邮件里不放。
 * 被屏蔽的联系方式或来源照样回 { ok: true }：不让对方知道被屏蔽，但什么都不存、不提醒。
 * 太频繁时回 429 { error: 'too-many', message }，message 是给人看的话，前端原样显示。
 */
export async function POST(request: NextRequest) {
  const g = await gateSpace(request.nextUrl.searchParams.get('id'));
  if (isFail(g)) return NextResponse.json({ error: g.error }, { status: g.status });

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
  if (!g.settings.greetingsOpen) return NextResponse.json({ error: 'closed' }, { status: 403 });

  const name = cleanLine(body.name, LIMITS.name);
  const contact = cleanLine(body.contact, LIMITS.contact);
  const message = clean(body.message, LIMITS.message);
  if (!name) return NextResponse.json({ error: 'need-name' }, { status: 400 });
  if ([...contact].length < 3) return NextResponse.json({ error: 'need-contact' }, { status: 400 });

  const source = sourceKey(request);
  if (isBlocked(g.settings.blocked, contact, source)) return NextResponse.json({ ok: true });

  // 所有校验都过了、马上要入库：这时才计数（无效请求刷不满桶，锁不住别人的空间）
  const a = admit(request, { action: 'greet', memberId: g.memberId, contact });
  if (!a.ok) return NextResponse.json({ error: a.error, message: a.message }, { status: a.status });

  const row: Greeting = {
    id: newId(),
    memberId: g.memberId,
    name,
    contact,
    message,
    visitorMemberId: g.viewer.viewerId || null,
    sourceKey: source,
    readAt: null,
    createdAt: now(),
  };
  try {
    await insert('greetings', row);
  } catch (err) {
    console.error('[space] greet insert failed', err);
    return NextResponse.json({ error: 'storage-unavailable' }, { status: 500 });
  }

  const hostEmail = g.node.email;
  const memberId = g.memberId;
  after(() => tellHost({
    memberId,
    hostEmail,
    subject: `${name} 在你的个人空间打了个招呼`,
    lines: [
      message ? `${name} 说：「${excerpt(message, 60)}」` : `${name} 没有留话，只留了联系方式。`,
      row.visitorMemberId ? 'TA 是登录过附近森林的成员。' : '',
      'TA 留的联系方式在收件箱里，只有你能看到。',
    ].filter(Boolean),
    path: managePath(memberId, 'inbox'),
    linkLabel: '去收件箱看看',
    key: `greet-${row.id}`,
  }));

  return NextResponse.json({ ok: true });
}

function excerpt(s: string, max: number): string {
  const chars = [...s.replace(/\s+/g, ' ')];
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : chars.join('');
}
