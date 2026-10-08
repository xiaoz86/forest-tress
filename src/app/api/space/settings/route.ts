import { NextRequest, NextResponse } from 'next/server';
import { gateHost, isFail } from '@/lib/space/gate';
import { saveSettings, type SettingsPatch } from '@/lib/space/settings';
import { spaceUrls } from '@/lib/space/share';
import type { SpaceSettings } from '@/lib/space/types';

export const runtime = 'nodejs';

/** 给管理页的设置：名片口令、屏蔽名单这类内部字段不下发 */
function view(s: SpaceSettings) {
  return {
    published: s.published,
    publishedAt: s.publishedAt,
    slug: s.slug,
    visibility: s.visibility,
    greetingsOpen: s.greetingsOpen,
    bookingsOpen: s.bookingsOpen,
    hasPayQr: !!s.payQr,
    blockedCount: s.blocked.length,
    updatedAt: s.updatedAt,
  };
}

/** GET /api/space/settings?id=… —— 本人或管理员 */
export async function GET(request: NextRequest) {
  const g = await gateHost(request.nextUrl.searchParams.get('id'));
  if (isFail(g)) return NextResponse.json({ error: g.error }, { status: g.status });
  return NextResponse.json(
    { settings: view(g.settings), urls: spaceUrls(g.memberId, g.settings) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

/**
 * PATCH /api/space/settings?id=…
 * body：{ published?, slug?, visibility?, greetingsOpen?, bookingsOpen?, rotateCardToken? }
 * 收款码（payQr）和屏蔽名单（blocked）不在这里改：分别走 pay-qr 和 inbox 接口，那里有各自的校验。
 */
export async function PATCH(request: NextRequest) {
  const g = await gateHost(request.nextUrl.searchParams.get('id'));
  if (isFail(g)) return NextResponse.json({ error: g.error }, { status: g.status });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '请求格式不对' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: '请求格式不对' }, { status: 400 });
  }

  const patch: SettingsPatch = {};
  if (typeof body.published === 'boolean') patch.published = body.published;
  // 发布 = 本人确认了 AI 起的这一版，只能本人来。管理员可以帮忙改内容、也可以下线（处理问题时要用），但不替人发布
  if (patch.published && !g.settings.published && !g.viewer.isOwner) {
    return NextResponse.json({ error: '发布要 TA 本人来：发布表示 TA 确认了这一版。管理员可以帮忙改，但不能替 TA 发布。' }, { status: 403 });
  }
  if (body.slug === null || typeof body.slug === 'string') patch.slug = body.slug as string | null;
  if (body.visibility && typeof body.visibility === 'object' && !Array.isArray(body.visibility)) {
    patch.visibility = body.visibility as SettingsPatch['visibility'];
  }
  if (typeof body.greetingsOpen === 'boolean') patch.greetingsOpen = body.greetingsOpen;
  if (typeof body.bookingsOpen === 'boolean') patch.bookingsOpen = body.bookingsOpen;
  if (body.rotateCardToken === true) patch.rotateCardToken = true;

  const r = await saveSettings(g.memberId, patch);
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 409 });
  return NextResponse.json({ settings: view(r), urls: spaceUrls(g.memberId, r) });
}
