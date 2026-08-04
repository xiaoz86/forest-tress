import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { isAdminId } from '@/lib/admin';
import { readMemberId } from '@/lib/session';
import {
  DEFAULT_MEDITATION_CONTENT,
  MEDITATION_CONTENT_ID,
  normalizeMeditationContent,
} from '@/lib/meditations';

const BUCKET = 'meditations';
const MAX_BYTES = 80 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'audio/aac',
  'audio/flac',
  'audio/m4a',
  'audio/mp3',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/x-m4a',
  'video/mp4',
]);

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'supabase-not-configured' }, { status: 500 });
  }
  const memberId = await readMemberId();
  if (!isAdminId(memberId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'invalid-form' }, { status: 400 });
  }

  const trackId = (form.get('trackId') as string | null)?.trim();
  const file = form.get('file');
  if (!trackId) return NextResponse.json({ error: 'missing-track-id' }, { status: 400 });
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'missing-file' }, { status: 400 });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: 'bad-file-type' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'file-too-large' }, { status: 400 });
  }

  const sb = createClient(supabaseUrl, serviceKey);
  const { data: existing } = await sb
    .from('meditation_content')
    .select('payload')
    .eq('id', MEDITATION_CONTENT_ID)
    .maybeSingle();
  const content = normalizeMeditationContent(existing?.payload || DEFAULT_MEDITATION_CONTENT);
  const idx = content.tracks.findIndex(track => track.id === trackId);
  if (idx < 0) return NextResponse.json({ error: 'track-not-found' }, { status: 404 });

  try {
    const list = await sb.storage.listBuckets();
    if (list.data && !list.data.some(b => b.name === BUCKET)) {
      // 私有桶：音频要付费才能听，不能靠一条永久公开链接发出去。
      // 取用一律走 /api/meditations/stream，那里校验资格后现发签名链接。
      await sb.storage.createBucket(BUCKET, {
        public: false,
        fileSizeLimit: MAX_BYTES,
      });
    }
  } catch {
    // upload 失败会再报错
  }

  const ext = (file.name.split('.').pop() || 'mp3').toLowerCase().slice(0, 8);
  const path = `${trackId}/${Date.now()}.${ext}`;
  const buf = await file.arrayBuffer();
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, buf, {
    contentType: file.type,
    upsert: true,
  });
  if (upErr) {
    return NextResponse.json(
      { error: 'upload-failed', detail: upErr.message },
      { status: 500 },
    );
  }

  // 只存对象路径。桶是私有的，公开 URL 拿不到内容，存了也只是误导。
  const next = { ...content.tracks[idx], audioPath: path };
  delete next.audioUrl;
  content.tracks[idx] = next;

  const { error: updErr } = await sb
    .from('meditation_content')
    .upsert({
      id: MEDITATION_CONTENT_ID,
      payload: content,
      updated_at: new Date().toISOString(),
    });
  if (updErr) {
    return NextResponse.json(
      { error: 'db-update-failed', detail: updErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ content, audioPath: path });
}
