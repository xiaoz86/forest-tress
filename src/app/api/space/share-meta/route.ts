import { NextRequest, NextResponse } from 'next/server';
import { gateHost, isFail } from '@/lib/space/gate';
import { shareDescription, shareFacts, spaceUrls } from '@/lib/space/share';
import { readSpace, type SpaceRecord } from '@/lib/space/store';

export const runtime = 'nodejs';

/**
 * GET /api/space/share-meta?id=… —— 管理页「分享预览」用：链接卡片上会出现的标题、摘要和分享图地址。
 * 和 buildSpaceMetadata 同一套取法（分享图地址带同一个版本号）。只给本人和管理员。
 */
export async function GET(request: NextRequest) {
  const g = await gateHost(request.nextUrl.searchParams.get('id'));
  if (isFail(g)) return NextResponse.json({ error: g.error }, { status: g.status, headers: { 'Cache-Control': 'private, no-store' } });
  let rec: SpaceRecord = {};
  try {
    rec = await readSpace(g.memberId);
  } catch {
    // 画像读坏了：只用注册资料
  }
  const facts = shareFacts(g.node, rec);
  return NextResponse.json(
    {
      title: `${facts.name} · 附近森林`,
      description: shareDescription(facts),
      ogImageUrl: spaceUrls(g.memberId, g.settings, rec, g.node).ogImageUrl,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
