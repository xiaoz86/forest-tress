import { NextRequest, NextResponse } from 'next/server';
import { isAdminId } from '@/lib/admin';
import {
  NOTE_MAX_CHARS,
  createTrackNote,
  fetchTrackNotes,
  hideTrackNote,
} from '@/lib/meditationNotes';
import {
  canAccessTrack,
  fetchMeditationContent,
  fetchPaidPrograms,
} from '@/lib/meditations';
import { getAuthenticatedMemberId } from '@/lib/session';

export const runtime = 'nodejs';

async function viewer() {
  return getAuthenticatedMemberId();
}

export async function GET(request: NextRequest) {
  const trackId = request.nextUrl.searchParams.get('track')?.trim();
  if (!trackId) return NextResponse.json({ error: 'missing-track' }, { status: 400 });

  const notes = await fetchTrackNotes(trackId, await viewer());
  return NextResponse.json(
    { notes },
    // 因人而异（mine 字段），绝不能被 CDN 共享缓存
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export async function POST(request: NextRequest) {
  const memberId = await viewer();
  if (!memberId) {
    return NextResponse.json({ error: 'not-logged-in' }, { status: 401 });
  }

  let payload: { track?: unknown; body?: unknown; anonymous?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad-json' }, { status: 400 });
  }

  const trackId = typeof payload.track === 'string' ? payload.track.trim() : '';
  const body = typeof payload.body === 'string' ? payload.body : '';
  if (!trackId) return NextResponse.json({ error: 'missing-track' }, { status: 400 });

  const content = await fetchMeditationContent();
  const track = content.tracks.find(t => t.id === trackId);
  if (!track) return NextResponse.json({ error: 'track-not-found' }, { status: 404 });

  // 没解锁就不能写。否则没买的人能在收费段下面留言，
  // 等于绕开付费墙参与了这段内容。
  const paid = await fetchPaidPrograms(memberId);
  if (!isAdminId(memberId) && !canAccessTrack(content, track, paid)) {
    return NextResponse.json({ error: 'locked' }, { status: 403 });
  }

  const result = await createTrackNote({
    trackId,
    programId: track.categoryId,
    memberId,
    body,
    anonymous: payload.anonymous === true,
  });

  if (!result.ok) {
    const status = result.reason === 'too-many' ? 429
      : result.reason === 'not-configured' ? 503
      : result.reason === 'failed' ? 500
      : 400;
    return NextResponse.json({ error: result.reason, max: NOTE_MAX_CHARS }, { status });
  }
  return NextResponse.json({ note: result.note });
}

export async function DELETE(request: NextRequest) {
  const memberId = await viewer();
  if (!memberId) return NextResponse.json({ error: 'not-logged-in' }, { status: 401 });

  const id = request.nextUrl.searchParams.get('id')?.trim();
  if (!id) return NextResponse.json({ error: 'missing-id' }, { status: 400 });

  const ok = await hideTrackNote(id, memberId, isAdminId(memberId));
  if (!ok) return NextResponse.json({ error: 'not-allowed' }, { status: 403 });
  return NextResponse.json({ ok: true });
}
