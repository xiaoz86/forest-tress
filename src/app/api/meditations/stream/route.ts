import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { isAdminId } from '@/lib/admin';
import { readMemberId } from '@/lib/session';
import {
  canAccessTrack,
  fetchMeditationContent,
  fetchPaidPrograms,
  resolveAudioPath,
} from '@/lib/meditations';

export const runtime = 'nodejs';

const BUCKET = 'meditations';
// 签名链接的有效期。最长的一段二十来分钟，一小时足够听完还能回放几次；
// 再长就等于又变回一条可以转发的永久链接了。
const SIGN_TTL_SECONDS = 60 * 60;

/**
 * 音频的唯一入口。浏览器永远拿不到对象地址，只拿得到这个 URL：
 *
 *   <audio src="/api/meditations/stream?track=sleep-d04">
 *
 * 每次播放都在这里校验一次资格，然后 302 到一条短时效签名链接。
 * 用重定向而不是代理转发，是为了让 Range 请求直接打到 Supabase——
 * 拖动进度条才不会卡，Vercel 也不用替一个 30MB 的文件当中转。
 */
export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'supabase-not-configured' }, { status: 503 });
  }

  const trackId = request.nextUrl.searchParams.get('track')?.trim();
  if (!trackId) {
    return NextResponse.json({ error: 'missing-track' }, { status: 400 });
  }

  const content = await fetchMeditationContent();
  const track = content.tracks.find(t => t.id === trackId);
  if (!track) {
    return NextResponse.json({ error: 'track-not-found' }, { status: 404 });
  }

  // 资格检查必须在「有没有音频」之前：否则没买的人能靠 404 和 403 的区别，
  // 探出后面哪些段落已经传了音频。这道门要无条件地先关上。
  const memberId = await readMemberId();
  // 主理人要能在管理页试听全部音频，包括还没人买的那些
  if (!isAdminId(memberId)) {
    const paid = await fetchPaidPrograms(memberId);
    if (!canAccessTrack(content, track, paid)) {
      return NextResponse.json({ error: 'locked' }, { status: 403 });
    }
  }

  const path = resolveAudioPath(track);
  if (!path) {
    return NextResponse.json({ error: 'no-audio' }, { status: 404 });
  }

  const sb = createClient(supabaseUrl, serviceKey);
  const { data, error } = await sb.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGN_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    console.error('[meditations/stream] sign failed', path, error?.message);
    return NextResponse.json({ error: 'sign-failed' }, { status: 502 });
  }

  return NextResponse.redirect(data.signedUrl, {
    status: 302,
    // 这条重定向绝不能被缓存或被 CDN 共享：它带着签名，且因人而异。
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}
