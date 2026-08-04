import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { isAdminId } from '@/lib/admin';
import type { Work } from '@/lib/supabase';
import { readMemberId } from '@/lib/session';

const BUCKET = 'works';
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_WORKS = 24;
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export const runtime = 'nodejs';

function makeId(): string {
  return `w_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function trimOr(value: FormDataEntryValue | null, max: number): string {
  if (typeof value !== 'string') return '';
  const t = value.trim();
  return t.length > max ? t.slice(0, max) : t;
}

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

  const nodeId = (form.get('nodeId') as string | null)?.trim();
  if (!nodeId) return NextResponse.json({ error: 'missing-node-id' }, { status: 400 });
  const memberId = await readMemberId();
  const isOwner = !!memberId && memberId === nodeId;
  const isAdmin = isAdminId(memberId);
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const title = trimOr(form.get('title'), 80);
  const desc = trimOr(form.get('desc'), 240);
  const url = trimOr(form.get('url'), 500);
  const file = form.get('file');

  if (!title) {
    return NextResponse.json({ error: 'missing-title' }, { status: 400 });
  }
  if (url && !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: 'bad-url' }, { status: 400 });
  }

  const sb = createClient(supabaseUrl, serviceKey);

  // 1) 读现有节点 → 检查上限
  const { data: row, error: readErr } = await sb
    .from('node_cards')
    .select('works')
    .eq('id', nodeId)
    .single();
  if (readErr) {
    return NextResponse.json(
      { error: 'node-not-found', detail: readErr.message },
      { status: 404 },
    );
  }
  const existing: Work[] = Array.isArray(row?.works) ? (row!.works as Work[]) : [];
  if (existing.length >= MAX_WORKS) {
    return NextResponse.json({ error: 'too-many-works' }, { status: 400 });
  }

  // 2) 可选封面图上传
  let imageUrl: string | undefined;
  if (file instanceof File && file.size > 0) {
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json({ error: 'bad-file-type' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'file-too-large' }, { status: 400 });
    }
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
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().slice(0, 6);
    const path = `${nodeId}/${Date.now()}.${ext}`;
    const buf = await file.arrayBuffer();
    const { error: upErr } = await sb.storage.from(BUCKET).upload(path, buf, {
      contentType: file.type,
      upsert: true,
    });
    if (upErr) {
      console.error('[api/works] upload failed', upErr.message);
      return NextResponse.json(
        { error: 'upload-failed', detail: upErr.message },
        { status: 500 },
      );
    }
    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
    imageUrl = pub.publicUrl;
  }

  const work: Work = {
    id: makeId(),
    title,
    ...(desc ? { desc } : {}),
    ...(imageUrl ? { image_url: imageUrl } : {}),
    ...(url ? { url } : {}),
    created_at: new Date().toISOString(),
  };

  const next = [work, ...existing];
  const { error: updErr } = await sb
    .from('node_cards')
    .update({ works: next })
    .eq('id', nodeId);
  if (updErr) {
    if (/works/i.test(updErr.message) && /column/i.test(updErr.message)) {
      return NextResponse.json({ error: 'column-missing' }, { status: 500 });
    }
    return NextResponse.json(
      { error: 'db-update-failed', detail: updErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ work, works: next });
}

export async function DELETE(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'supabase-not-configured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const nodeId = searchParams.get('nodeId')?.trim();
  const workId = searchParams.get('workId')?.trim();
  if (!nodeId || !workId) {
    return NextResponse.json({ error: 'missing-params' }, { status: 400 });
  }
  const memberId = await readMemberId();
  const isOwner = !!memberId && memberId === nodeId;
  const isAdmin = isAdminId(memberId);
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const sb = createClient(supabaseUrl, serviceKey);
  const { data: row, error: readErr } = await sb
    .from('node_cards')
    .select('works')
    .eq('id', nodeId)
    .single();
  if (readErr) {
    return NextResponse.json({ error: 'node-not-found' }, { status: 404 });
  }
  const existing: Work[] = Array.isArray(row?.works) ? (row!.works as Work[]) : [];
  const removed = existing.find(w => w.id === workId);
  const next = existing.filter(w => w.id !== workId);

  const { error: updErr } = await sb
    .from('node_cards')
    .update({ works: next })
    .eq('id', nodeId);
  if (updErr) {
    return NextResponse.json(
      { error: 'db-update-failed', detail: updErr.message },
      { status: 500 },
    );
  }

  if (removed?.image_url) {
    await removeCoverBestEffort(sb, removed.image_url);
  }

  return NextResponse.json({ works: next });
}

// PATCH /api/works?nodeId=...&workId=...
// 表单字段 — 只更新提供了的：title / desc / url / file（封面图）
// desc 传空串会清空；url 传空串会清空；title 不允许空
export async function PATCH(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'supabase-not-configured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const nodeId = searchParams.get('nodeId')?.trim();
  const workId = searchParams.get('workId')?.trim();
  if (!nodeId || !workId) {
    return NextResponse.json({ error: 'missing-params' }, { status: 400 });
  }
  const memberId = await readMemberId();
  const isOwner = !!memberId && memberId === nodeId;
  const isAdmin = isAdminId(memberId);
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'invalid-form' }, { status: 400 });
  }

  const sb = createClient(supabaseUrl, serviceKey);
  const { data: row, error: readErr } = await sb
    .from('node_cards')
    .select('works')
    .eq('id', nodeId)
    .single();
  if (readErr) {
    return NextResponse.json({ error: 'node-not-found' }, { status: 404 });
  }
  const existing: Work[] = Array.isArray(row?.works) ? (row!.works as Work[]) : [];
  const idx = existing.findIndex(w => w.id === workId);
  if (idx < 0) {
    return NextResponse.json({ error: 'work-not-found' }, { status: 404 });
  }

  const current = existing[idx];
  const patch: Partial<Work> = {};

  if (form.has('title')) {
    const title = trimOr(form.get('title'), 80);
    if (!title) return NextResponse.json({ error: 'missing-title' }, { status: 400 });
    patch.title = title;
  }
  if (form.has('desc')) {
    const desc = trimOr(form.get('desc'), 240);
    patch.desc = desc || undefined;
  }
  if (form.has('url')) {
    const url = trimOr(form.get('url'), 500);
    if (url && !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: 'bad-url' }, { status: 400 });
    }
    patch.url = url || undefined;
  }

  let oldImageToCleanup: string | undefined;
  const file = form.get('file');
  if (file instanceof File && file.size > 0) {
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json({ error: 'bad-file-type' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'file-too-large' }, { status: 400 });
    }
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
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().slice(0, 6);
    const path = `${nodeId}/${Date.now()}.${ext}`;
    const buf = await file.arrayBuffer();
    const { error: upErr } = await sb.storage.from(BUCKET).upload(path, buf, {
      contentType: file.type,
      upsert: true,
    });
    if (upErr) {
      console.error('[api/works PATCH] upload failed', upErr.message);
      return NextResponse.json(
        { error: 'upload-failed', detail: upErr.message },
        { status: 500 },
      );
    }
    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
    patch.image_url = pub.publicUrl;
    oldImageToCleanup = current.image_url;
  }

  // 没有任何字段提交
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing-to-update' }, { status: 400 });
  }

  // 显式构造，避免 spread 顺序导致的"清空字段失败"
  const updated: Work = {
    id: current.id,
    title: 'title' in patch ? patch.title! : current.title,
    created_at: current.created_at,
  };
  const finalDesc = 'desc' in patch ? patch.desc : current.desc;
  if (finalDesc) updated.desc = finalDesc;
  const finalUrl = 'url' in patch ? patch.url : current.url;
  if (finalUrl) updated.url = finalUrl;
  const finalImage = patch.image_url ?? current.image_url;
  if (finalImage) updated.image_url = finalImage;

  const next = [...existing];
  next[idx] = updated;

  const { error: updErr } = await sb
    .from('node_cards')
    .update({ works: next })
    .eq('id', nodeId);
  if (updErr) {
    return NextResponse.json(
      { error: 'db-update-failed', detail: updErr.message },
      { status: 500 },
    );
  }

  if (oldImageToCleanup) {
    await removeCoverBestEffort(sb, oldImageToCleanup);
  }

  return NextResponse.json({ work: updated, works: next });
}

type SbStorage = { storage: { from: (b: string) => { remove: (paths: string[]) => Promise<unknown> } } };

async function removeCoverBestEffort(sb: SbStorage, imageUrl: string): Promise<void> {
  try {
    const url = new URL(imageUrl);
    const i = url.pathname.indexOf(`/${BUCKET}/`);
    if (i < 0) return;
    const path = url.pathname.slice(i + BUCKET.length + 2);
    await sb.storage.from(BUCKET).remove([path]);
  } catch {
    // ignore
  }
}
