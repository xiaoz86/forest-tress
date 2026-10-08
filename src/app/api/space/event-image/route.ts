import { NextRequest, NextResponse } from 'next/server';
import { deleteUpload, now, readUpload, saveUpload, transact } from '@/lib/space/db';
import { coverUrlOf, fail, getEvent, isEventPublic } from '@/lib/space/events';
import { gateHost, gateSpace, isFail } from '@/lib/space/gate';
import { canSee } from '@/lib/space/viewer';

export const runtime = 'nodejs';

const UPLOAD_ERRORS: Record<string, string> = {
  'unsupported-type': '只能传 JPG、PNG 或 WebP 格式的照片',
  'too-large': '照片太大了（超过 4MB），换一张小一点的',
  'bad-image': '这个文件打不开，换一张试试',
};

/**
 * 活动的封面照片。图存在私有目录里，只经过这个接口往外给：
 *
 * - GET ?e=活动id：活动对这位访客可见时才给（空间已发布、「一起做点什么」对 TA 可见、活动开放报名而且还算近期）；
 *   主人（本人、管理员）什么时候都能看。地址里带着更新时间（v=），换了图就是新地址，可以让浏览器缓存一会。
 * - POST ?e=活动id（multipart，字段 file）：主人上传或替换
 * - DELETE ?e=活动id：主人删掉
 */
export async function GET(request: NextRequest) {
  const event = await getEvent(request.nextUrl.searchParams.get('e')?.trim() || '');
  if (!event?.coverImage) return fail(404, 'not-found');
  const g = await gateSpace(event.memberId);
  if (isFail(g)) return fail(404, 'not-found');
  if (!g.host && !(canSee(g.settings.visibility.offer, g.viewer) && isEventPublic(event))) return fail(404, 'not-found');
  const img = await readUpload(event.coverImage);
  if (!img) return fail(404, 'not-found');
  return new NextResponse(new Uint8Array(img.body), {
    headers: {
      'Content-Type': img.type,
      'Content-Disposition': 'inline',
      // 可见性可能只给森林成员或扫过名片的人：只让本人的浏览器缓存，不进共享缓存
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function hostEvent(request: NextRequest) {
  const event = await getEvent(request.nextUrl.searchParams.get('e')?.trim() || '');
  if (!event) return { error: fail(404, 'not-found', '这个活动不在了，刷新一下看看') };
  const g = await gateHost(event.memberId);
  if (isFail(g)) return { error: fail(g.status, g.error) };
  return { event };
}

/** 换封面：在 events 的临界区里读旧值、写新值，被换下来的那张删掉 */
async function swapCover(eventId: string, next: string | null) {
  return transact('events', rows => {
    const e = rows.find(x => x.id === eventId);
    if (!e) return null;
    const prev = e.coverImage ?? null;
    e.coverImage = next;
    e.updatedAt = now();
    return { prev, event: { ...e } };
  });
}

export async function POST(request: NextRequest) {
  const h = await hostEvent(request);
  if ('error' in h) return h.error;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, 'invalid-form', '没有收到照片，重新选一张再传');
  }
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return fail(400, 'missing-file', '没有收到照片，重新选一张再传');
  const saved = await saveUpload('event', file);
  if (typeof saved !== 'string') return fail(400, saved.error, UPLOAD_ERRORS[saved.error] || '这张照片传不上，换一张试试');
  let res: Awaited<ReturnType<typeof swapCover>>;
  try {
    res = await swapCover(h.event.id, saved);
  } catch (err) {
    console.error('[space] event cover save failed', err);
    await deleteUpload(saved);
    return fail(500, 'save-failed', '没有存上，过一会再试一次');
  }
  if (!res) {
    await deleteUpload(saved);
    return fail(404, 'not-found', '这个活动不在了，刷新一下看看');
  }
  if (res.prev && res.prev !== saved) await deleteUpload(res.prev);
  return NextResponse.json({ coverUrl: coverUrlOf(res.event) }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function DELETE(request: NextRequest) {
  const h = await hostEvent(request);
  if ('error' in h) return h.error;
  let res: Awaited<ReturnType<typeof swapCover>>;
  try {
    res = await swapCover(h.event.id, null);
  } catch (err) {
    console.error('[space] event cover delete failed', err);
    return fail(500, 'save-failed', '没有删掉，过一会再试一次');
  }
  if (!res) return fail(404, 'not-found', '这个活动不在了，刷新一下看看');
  if (res.prev) await deleteUpload(res.prev);
  return NextResponse.json({ coverUrl: null }, { headers: { 'Cache-Control': 'private, no-store' } });
}
