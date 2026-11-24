import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getAuthenticatedMemberId } from '@/lib/session';
import { ARTICLE_MEDIA_BUCKET, articleMediaError, articleMediaExtension } from '@/lib/shareArticleMedia';

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

async function handle(request: Request) {
  const memberId = await getAuthenticatedMemberId();
  if (!memberId) return fail('login-required', 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return fail('upload-failed', 503);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return fail('invalid-request', 400);

  const sb = createClient(url, key);
  const bucket = sb.storage.from(ARTICLE_MEDIA_BUCKET);
  const folder = `article-media/${memberId}/`;

  if (request.method === 'POST') {
    const type = typeof body.fileType === 'string' ? body.fileType : '';
    const error = articleMediaError({ type, size: body.fileSize });
    if (error) return fail(error, 400);
    const { data: member, error: memberError } = await sb.from('node_cards').select('id').eq('id', memberId).maybeSingle();
    if (memberError) return fail('upload-failed', 502);
    if (!member) return fail('login-required', 401);

    const path = `${folder}${crypto.randomUUID()}.${articleMediaExtension(type)}`;
    const { data, error: signError } = await bucket.createSignedUploadUrl(path, { upsert: false });
    if (signError || !data?.token) return fail('upload-failed', 502);
    return NextResponse.json({ path, token: data.token });
  }

  const path = body.path;
  const filename = typeof path === 'string' && path.startsWith(folder) ? path.slice(folder.length) : '';
  const match = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\.([a-z0-9]+)$/.exec(filename);
  if (!match) return fail('invalid-request', 400);

  const { data: info, error: readError } = await bucket.info(path);
  if (readError || !info) return fail('upload-failed', 502);
  const type = info.contentType ?? info.metadata?.mimetype ?? '';
  const size = info.size ?? info.metadata?.size;
  if (!type || typeof size !== 'number') return fail('upload-failed', 502);
  const error = articleMediaError({ type, size });
  if (error || articleMediaExtension(type) !== match[1]) {
    await bucket.remove([path]);
    return fail(error || 'bad-file-type', 400);
  }
  return NextResponse.json({ url: bucket.getPublicUrl(path).data.publicUrl });
}

export { handle as POST, handle as PATCH };
