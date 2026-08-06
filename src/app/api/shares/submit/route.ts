import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { notifyShareSubmission } from '@/lib/notify';
import { getAuthenticatedMemberId } from '@/lib/session';
import {
  DEFAULT_SHARE_CONTENT,
  SHARE_CONTENT_ID,
  normalizeShareContent,
  type ShareEntry,
  type ShareMediaKind,
} from '@/lib/shares';
import type { NodeCard } from '@/lib/supabase';

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

function makeId(): string {
  return `share-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function trim(form: FormData, key: string, max: number): string {
  const value = form.get(key);
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function tagsFrom(value: string): string[] {
  const tags = value
    .split(/[，,]/)
    .map(tag => tag.trim().slice(0, 12))
    .filter(Boolean);
  return Array.from(new Set(tags)).slice(0, 8);
}

async function ensureBucket(sb: SupabaseClient) {
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
}

async function uploadFile(
  sb: SupabaseClient,
  shareId: string,
  slot: 'media' | 'poster',
  file: File | null,
): Promise<{ url?: string; mediaKind?: ShareMediaKind; error?: string }> {
  if (!(file instanceof File) || file.size === 0) return {};
  if (file.size > MAX_BYTES) return { error: 'file-too-large' };

  const isImage = ALLOWED_IMAGE.has(file.type);
  const isVideo = ALLOWED_VIDEO.has(file.type);
  if (!isImage && !isVideo) return { error: 'bad-file-type' };
  if (slot === 'poster' && !isImage) return { error: 'poster-needs-image' };

  await ensureBucket(sb);

  const ext = (file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg')).toLowerCase().slice(0, 8);
  const path = `${shareId}/${slot}-${Date.now()}.${ext}`;
  const buf = await file.arrayBuffer();
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, buf, {
    contentType: file.type,
    upsert: true,
  });
  if (upErr) return { error: 'upload-failed' };

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
  return {
    url: pub.publicUrl,
    mediaKind: isVideo ? 'video' : 'image',
  };
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'supabase-not-configured' }, { status: 500 });
  }

  const memberId = await getAuthenticatedMemberId();
  if (!memberId) {
    return NextResponse.json({ error: 'login-required' }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'invalid-form' }, { status: 400 });
  }

  const title = trim(form, 'title', 64);
  const question = trim(form, 'question', 120);
  const summary = trim(form, 'summary', 260);
  const note = trim(form, 'note', 220);
  const href = trim(form, 'href', 900);
  const tags = tagsFrom(trim(form, 'tags', 120));
  const media = form.get('media');
  const poster = form.get('poster');

  if (!title || !summary) {
    return NextResponse.json({ error: 'missing-required-fields' }, { status: 400 });
  }
  if (href && !/^https?:\/\//i.test(href)) {
    return NextResponse.json({ error: 'bad-url' }, { status: 400 });
  }

  const sb = createClient(supabaseUrl, serviceKey);
  const { data: node, error: nodeErr } = await sb
    .from('node_cards')
    .select('*')
    .eq('id', memberId)
    .maybeSingle();
  if (nodeErr || !node) {
    return NextResponse.json({ error: 'member-not-found' }, { status: 404 });
  }

  const shareId = makeId();
  const mediaResult = await uploadFile(
    sb,
    shareId,
    'media',
    media instanceof File ? media : null,
  );
  if (mediaResult.error) {
    return NextResponse.json({ error: mediaResult.error }, { status: 400 });
  }
  const posterResult = await uploadFile(
    sb,
    shareId,
    'poster',
    poster instanceof File ? poster : null,
  );
  if (posterResult.error) {
    return NextResponse.json({ error: posterResult.error }, { status: 400 });
  }

  const { data: existing } = await sb
    .from('share_content')
    .select('payload')
    .eq('id', SHARE_CONTENT_ID)
    .maybeSingle();
  const content = normalizeShareContent(existing?.payload || DEFAULT_SHARE_CONTENT);
  const member = node as NodeCard;
  const share: ShareEntry = {
    id: shareId,
    title,
    kicker: `${member.name || '一位超级个体'}的分享`,
    author: member.name || '有温度的超级个体',
    authorLabel: '待审核',
    badgeLabel: `${member.name || '有温度的超级个体'} · 待审核`,
    question,
    summary,
    note,
    tags: tags.length ? tags : ['分享'],
    mediaKind: mediaResult.mediaKind || 'poster',
    ...(mediaResult.url ? { mediaUrl: mediaResult.url } : {}),
    ...(posterResult.url ? { posterUrl: posterResult.url } : {}),
    ...(href ? { href } : {}),
    featured: false,
    status: 'pending',
    ownerId: memberId,
    submittedAt: new Date().toISOString(),
  };

  const next = { ...content, shares: [share, ...content.shares] };
  const { error: updErr } = await sb
    .from('share_content')
    .upsert({
      id: SHARE_CONTENT_ID,
      payload: next,
      updated_at: new Date().toISOString(),
    });
  if (updErr) {
    return NextResponse.json(
      { error: 'db-update-failed', detail: updErr.message },
      { status: 500 },
    );
  }

  notifyShareSubmission(member, share).catch(err => {
    console.error('[api/shares/submit] notify failed', err);
  });

  return NextResponse.json({ ok: true, share });
}
