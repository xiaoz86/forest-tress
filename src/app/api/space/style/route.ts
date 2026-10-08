import { NextRequest, NextResponse } from 'next/server';
import { previewAccess } from '@/lib/space/access';
import { isMemberId, mutateSpace, type StyleChoice } from '@/lib/space/store';
import { DIMENSIONS, getTheme, type StyleVector } from '@/lib/space/themes';

export const runtime = 'nodejs';

/**
 * POST /api/space/style?id=…
 * body: { mode, test, picks, chosen } —— 保存风格测试的答案、看图挑中的主题、最终选定的主题。
 */
export async function POST(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')?.trim().toLowerCase() || '';
  if (!isMemberId(id)) return NextResponse.json({ error: 'invalid-id' }, { status: 400 });
  if (!(await previewAccess(id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad-json' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'bad-body' }, { status: 400 });
  }

  const test: Partial<StyleVector> = {};
  const rawTest = (body.test && typeof body.test === 'object' ? body.test : {}) as Record<string, unknown>;
  for (const d of DIMENSIONS) {
    const v = rawTest[d.key];
    if (v === -2 || v === 2) test[d.key] = v;
  }
  const picks = (Array.isArray(body.picks) ? body.picks : [])
    .map(String).filter(p => getTheme(p)).slice(0, 3);
  // 自动保存（测试答案、挑图）不带 chosen 字段：保留原来选定的那套，只有点「就选这一套」才改它。
  // 「原来选定的」要在写入的同一把锁里读：点「就选这一套」紧跟着一次自动保存时，
  // 先读后写会把刚选定的那套用旧值盖回去
  const pickedNow = 'chosen' in body
    ? { chosen: typeof body.chosen === 'string' && getTheme(body.chosen) ? body.chosen : null }
    : null;
  const mode: StyleChoice['mode'] = body.mode === 'fallback' ? 'fallback' : 'portrait';
  const savedAt = new Date().toISOString();
  let style: StyleChoice | null = null;
  const next = await mutateSpace(id, cur => {
    style = { mode, test, picks, chosen: pickedNow ? pickedNow.chosen : cur.style?.chosen ?? null, savedAt };
    return { style };
  });
  if (!next || !style) {
    return NextResponse.json({ error: 'storage-unavailable' }, { status: 500 });
  }
  return NextResponse.json({ style });
}
