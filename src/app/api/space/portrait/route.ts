import { NextRequest, NextResponse } from 'next/server';
import { fetchMember, previewAccess } from '@/lib/space/access';
import { draftNow } from '@/lib/space/autoDraft';
import { isMemberId } from '@/lib/space/store';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/space/portrait?id=…
 * 用这个人的注册资料形成画像并起稿，存进本地缓存。只有本人或管理员能调。
 */
export async function POST(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')?.trim().toLowerCase() || '';
  if (!isMemberId(id)) return NextResponse.json({ error: 'invalid-id' }, { status: 400 });
  const access = await previewAccess(id);
  if (!access) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  // v1 只在本地试；万一被部署出去，每次都要调模型，先只留给管理员
  if (process.env.NODE_ENV === 'production' && !access.isAdmin) {
    return NextResponse.json({ error: 'preview-only' }, { status: 403 });
  }

  let node;
  try {
    node = await fetchMember(id);
  } catch {
    return NextResponse.json({ error: 'database-unavailable' }, { status: 503 });
  }
  if (!node) return NextResponse.json({ error: 'not-found' }, { status: 404 });

  // 和空间被打开时的后台起稿共用一份：同一个人正在写时，这里等同一个结果，不多调一次模型
  const r = await draftNow({ ...node, id });
  if ('error' in r) return NextResponse.json(r, { status: 502 });
  const { unsaved, ...result } = r;
  if (unsaved) return NextResponse.json({ error: 'storage-unavailable', result }, { status: 500 });
  return NextResponse.json({ result });
}
