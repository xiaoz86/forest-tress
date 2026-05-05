import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { isAdminId } from '@/lib/admin';

const BUCKET = 'avatars';
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'supabase-not-configured' }, { status: 500 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'invalid-form' }, { status: 400 });
  }

  const id = (form.get('id') as string | null)?.trim();
  const file = form.get('file');

  if (!id) return NextResponse.json({ error: 'missing-id' }, { status: 400 });
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'missing-file' }, { status: 400 });
  }

  // 允许本人上传，或管理员替任意成员上传
  const cookieStore = await cookies();
  const memberId = cookieStore.get('nf_member')?.value;
  const isOwner = !!memberId && memberId === id;
  const isAdmin = isAdminId(memberId);
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: 'bad-file-type' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'file-too-large' }, { status: 400 });
  }

  const sb = createClient(supabaseUrl, serviceKey);

  // 兜底：如果 bucket 不存在则创建（首次部署时友好）
  try {
    const list = await sb.storage.listBuckets();
    if (list.data && !list.data.some(b => b.name === BUCKET)) {
      await sb.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: MAX_BYTES,
      });
    }
  } catch {
    // 忽略，下面 upload 失败会再报错
  }

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().slice(0, 6);
  const path = `${id}/${Date.now()}.${ext}`;

  const arrayBuf = await file.arrayBuffer();
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, arrayBuf, {
    contentType: file.type,
    upsert: true,
  });
  if (upErr) {
    console.error('[api/avatar] upload failed', upErr.message);
    return NextResponse.json(
      { error: 'upload-failed', detail: upErr.message },
      { status: 500 },
    );
  }

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
  const url = pub.publicUrl;

  const { error: updErr } = await sb
    .from('node_cards')
    .update({ avatar_url: url })
    .eq('id', id);

  if (updErr) {
    if (/avatar_url/i.test(updErr.message)) {
      return NextResponse.json({ error: 'column-missing' }, { status: 500 });
    }
    return NextResponse.json(
      { error: 'db-update-failed', detail: updErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ url });
}
