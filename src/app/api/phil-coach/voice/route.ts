import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// 服务端转写：把用户录的音转成文字。
// 走 SiliconFlow 的 SenseVoiceSmall——中文准、快、便宜；
// 关键是它让**微信里也能用语音**（微信 WebView 不给 Web Speech，但给 MediaRecorder）。

const MAX_BYTES = 8 * 1024 * 1024;   // 8MB，约 5 分钟语音足够
const WINDOW_MS = 5 * 60 * 1000;
const MAX_PER_WINDOW = 30;
const buckets = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (buckets.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (arr.length >= MAX_PER_WINDOW) {
    buckets.set(ip, arr);
    return true;
  }
  arr.push(now);
  buckets.set(ip, arr);
  return false;
}

export async function POST(request: NextRequest) {
  const key = process.env.SILICONFLOW_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'voice-not-configured' }, { status: 503 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json({ error: 'too-many' }, { status: 429 });
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get('audio');
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: 'bad-form' }, { status: 400 });
  }
  if (!file || file.size === 0) {
    return NextResponse.json({ error: 'no-audio' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'too-large' }, { status: 413 });
  }

  // 转发给 SiliconFlow。文件名后缀要能反映真实格式，服务端据此解码。
  const ext = file.type.includes('mp4') || file.type.includes('m4a')
    ? 'm4a'
    : file.type.includes('mpeg') || file.type.includes('mp3')
      ? 'mp3'
      : file.type.includes('wav')
        ? 'wav'
        : 'webm';

  const upstream = new FormData();
  upstream.append('file', file, `speech.${ext}`);
  upstream.append('model', 'FunAudioLLM/SenseVoiceSmall');

  try {
    const res = await fetch('https://api.siliconflow.cn/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: upstream,
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[phil-voice] upstream', res.status, detail.slice(0, 200));
      return NextResponse.json({ error: 'transcribe-failed' }, { status: 502 });
    }
    const json = (await res.json()) as { text?: unknown };
    const text = typeof json.text === 'string' ? json.text.trim() : '';
    if (!text) return NextResponse.json({ error: 'empty-result' }, { status: 422 });
    return NextResponse.json({ text });
  } catch (err) {
    console.error('[phil-voice] failed', err);
    return NextResponse.json({ error: 'transcribe-failed' }, { status: 502 });
  }
}
