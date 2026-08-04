import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { isAdminId } from '@/lib/admin';
import { readMemberId } from '@/lib/session';
import {
  DEFAULT_SHARE_CONTENT,
  SHARE_CONTENT_ID,
  normalizeShareContent,
  type ShareMediaKind,
} from '@/lib/shares';

const BUCKET = 'shares';
const MAX_BYTES = 160 * 1024 * 1024;
const ALLOWED_IMAGE = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);
const ALLOWED_VIDEO = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
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

  const shareId = (form.get('shareId') as string | null)?.trim();
  const slot = (form.get('slot') as string | null)?.trim() || 'media';
  const file = form.get('file');
  if (!shareId) return NextResponse.json({ error: 'missing-share-id' }, { status: 400 });
  if (slot !== 'media' && slot !== 'poster') {
    return NextResponse.json({ error: 'bad-slot' }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'missing-file' }, { status: 400 });
  }
  const isImage = ALLOWED_IMAGE.has(file.type);
  const isVideo = ALLOWED_VIDEO.has(file.type);
  if (!isImage && !isVideo) {
    return NextResponse.json({ error: 'bad-file-type' }, { status: 400 });
  }
  if (slot === 'poster' && !isImage) {
    return NextResponse.json({ error: 'poster-needs-image' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'file-too-large' }, { status: 400 });
  }

  const sb = createClient(supabaseUrl, serviceKey);
  const { data: existing } = await sb
    .from('share_content')
    .select('payload')
    .eq('id', SHARE_CONTENT_ID)
    .maybeSingle();
  const content = normalizeShareContent(existing?.payload || DEFAULT_SHARE_CONTENT);
  const idx = content.shares.findIndex(share => share.id === shareId);
  if (idx < 0) return NextResponse.json({ error: 'share-not-found' }, { status: 404 });

  try {
    const list = await sb.storage.listBuckets();
    if (list.data && !list.data.some(b => b.name === BUCKET)) {
      await sb.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: MAX_BYTES,
      });
    }
  } catch {
    // upload 失败会再报错
  }

  const ext = (file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg')).toLowerCase().slice(0, 8);
  const path = `${shareId}/${slot}-${Date.now()}.${ext}`;
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

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = pub.publicUrl;
  const mediaKind: ShareMediaKind = isVideo ? 'video' : 'image';
  const current = content.shares[idx];
  content.shares[idx] = slot === 'poster'
    ? { ...current, posterUrl: publicUrl }
    : { ...current, mediaUrl: publicUrl, mediaKind };

  const { error: updErr } = await sb
    .from('share_content')
    .upsert({
      id: SHARE_CONTENT_ID,
      payload: content,
      updated_at: new Date().toISOString(),
    });
  if (updErr) {
    return NextResponse.json(
      { error: 'db-update-failed', detail: updErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ content, url: publicUrl });
}
