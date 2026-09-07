import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { isAdminId } from '@/lib/admin';
import {
  DEFAULT_MEDITATION_CONTENT,
  MEDITATION_CONTENT_ID,
  normalizeMeditationContent,
} from '@/lib/meditations';
import { getAuthenticatedMemberId } from '@/lib/session';

const BUCKET = 'films';
const MAX_BYTES = 200 * 1024 * 1024;
const VIDEO_MIME = new Set(['video/mp4', 'video/webm']);
const VIDEO_EXT = new Set(['mp4', 'webm']);

export const runtime = 'nodejs';

function config() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return supabaseUrl && serviceKey ? { supabaseUrl, serviceKey } : null;
}

function jsonError(error: string, status: number, detail?: string) {
  return NextResponse.json(detail ? { error, detail } : { error }, { status });
}

function getExtension(fileName: string): string {
  const match = /^.+\.([a-z0-9]+)$/i.exec(fileName.trim());
  return match?.[1].toLowerCase() || '';
}

function isFilmTrack(content: ReturnType<typeof normalizeMeditationContent>, trackId: string): boolean {
  const track = content.tracks.find(item => item.id === trackId);
  if (!track) return false;
  return (content.categories.find(category => category.id === track.categoryId)?.kind || 'guided') === 'film';
}

async function getContent(sb: SupabaseClient) {
  const { data, error } = await sb
    .from('meditation_content')
    .select('payload')
    .eq('id', MEDITATION_CONTENT_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return normalizeMeditationContent(data?.payload || DEFAULT_MEDITATION_CONTENT);
}

export async function POST(request: NextRequest) {
  const settings = config();
  if (!settings) return jsonError('supabase-not-configured', 500);
  if (!isAdminId(await getAuthenticatedMemberId())) return jsonError('forbidden', 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad-json', 400);
  }

  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const trackId = typeof input.trackId === 'string' ? input.trackId.trim() : '';
  const fileName = typeof input.fileName === 'string' ? input.fileName.trim() : '';
  const fileType = typeof input.fileType === 'string' ? input.fileType.trim().toLowerCase() : '';
  const fileSize = typeof input.fileSize === 'number' ? input.fileSize : NaN;
  const ext = getExtension(fileName);

  if (!trackId) return jsonError('missing-track-id', 400);
  if (!/^[A-Za-z0-9_-]+$/.test(trackId)) return jsonError('bad-track-id', 400);
  if (!fileName || fileName.length > 180 || fileName.includes('/') || fileName.includes('\\')) {
    return jsonError('bad-file-name', 400);
  }
  if (!VIDEO_EXT.has(ext) || (fileType && (!VIDEO_MIME.has(fileType) || fileType !== `video/${ext}`))) {
    return jsonError('bad-file-type', 400);
  }
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0) return jsonError('bad-file-size', 400);
  if (fileSize > MAX_BYTES) return jsonError('file-too-large', 400);

  const sb = createClient(settings.supabaseUrl, settings.serviceKey);
  let content: ReturnType<typeof normalizeMeditationContent>;
  try {
    content = await getContent(sb);
  } catch {
    return jsonError('content-read-failed', 502);
  }
  if (!isFilmTrack(content, trackId)) return jsonError('film-track-not-found', 404);

  const path = `${trackId}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (error || !data?.token) {
    return jsonError('signed-upload-unavailable', 502, error?.message);
  }

  return NextResponse.json({ bucket: BUCKET, path, token: data.token });
}

export async function PATCH(request: NextRequest) {
  const settings = config();
  if (!settings) return jsonError('supabase-not-configured', 500);
  if (!isAdminId(await getAuthenticatedMemberId())) return jsonError('forbidden', 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad-json', 400);
  }

  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const trackId = typeof input.trackId === 'string' ? input.trackId.trim() : '';
  const objectPath = typeof input.path === 'string' ? input.path.trim() : '';
  const objectName = trackId && objectPath.startsWith(`${trackId}/`)
    ? objectPath.slice(trackId.length + 1)
    : '';
  if (!trackId || !/^[A-Za-z0-9_-]+$/.test(trackId)
    || !objectName || !/^[A-Za-z0-9_-]+\.(mp4|webm)$/i.test(objectName)) {
    return jsonError('bad-path', 400);
  }
  const objectExtension = getExtension(objectName);

  const sb = createClient(settings.supabaseUrl, settings.serviceKey);
  let content: ReturnType<typeof normalizeMeditationContent>;
  try {
    content = await getContent(sb);
  } catch {
    return jsonError('content-read-failed', 502);
  }
  const idx = content.tracks.findIndex(track => track.id === trackId);
  if (idx < 0 || !isFilmTrack(content, trackId)) return jsonError('film-track-not-found', 404);

  const { data: info, error: infoError } = await sb.storage.from(BUCKET).info(objectPath);
  if (infoError || !info) return jsonError('uploaded-file-not-found', 404, infoError?.message);
  if (!Number.isFinite(info.size) || !info.size || info.size > MAX_BYTES) {
    return jsonError('file-too-large', 400);
  }
  if (!info.contentType || !VIDEO_MIME.has(info.contentType.toLowerCase())
    || info.contentType.toLowerCase() !== `video/${objectExtension}`) {
    return jsonError('bad-file-type', 400);
  }

  const videoUrl = sb.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl;
  const tracks = [...content.tracks];
  tracks[idx] = { ...tracks[idx], videoUrl };
  const nextContent = { ...content, tracks };
  const { error: updateError } = await sb
    .from('meditation_content')
    .upsert({
      id: MEDITATION_CONTENT_ID,
      payload: nextContent,
      updated_at: new Date().toISOString(),
    });
  if (updateError) return jsonError('db-update-failed', 502, updateError.message);

  return NextResponse.json({ track: tracks[idx] });
}
