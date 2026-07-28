import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// 朗读：把 phil-coach 的回复读出来。
// 走 SiliconFlow 的 CosyVoice2（神经网络合成），比系统内置 TTS 自然得多——
// 系统 TTS 那种"播报腔"会破坏陪伴感，这一步是为了让声音听起来像有人在旁边说话。

const MAX_CHARS = 600;
const WINDOW_MS = 5 * 60 * 1000;
const MAX_PER_WINDOW = 60;
const buckets = new Map<string, number[]>();

const PHIL_COACH_VOICE = 'FunAudioLLM/CosyVoice2-0.5B:anna';

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
  if (!key) return NextResponse.json({ error: 'voice-not-configured' }, { status: 503 });

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) return NextResponse.json({ error: 'too-many' }, { status: 429 });

  let text = '';
  try {
    const body = (await request.json()) as { text?: unknown };
    text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_CHARS) : '';
  } catch {
    return NextResponse.json({ error: 'bad-json' }, { status: 400 });
  }
  if (!text) return NextResponse.json({ error: 'empty-text' }, { status: 400 });

  try {
    const res = await fetch('https://api.siliconflow.cn/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'FunAudioLLM/CosyVoice2-0.5B',
        input: text,
        voice: PHIL_COACH_VOICE,
        response_format: 'mp3',
        speed: 0.9,          // 稍慢，贴陪伴的语速
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[phil-tts] upstream', res.status, detail.slice(0, 200));
      return NextResponse.json({ error: 'tts-failed' }, { status: 502 });
    }
    const audio = await res.arrayBuffer();
    return new NextResponse(audio, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[phil-tts] failed', err);
    return NextResponse.json({ error: 'tts-failed' }, { status: 502 });
  }
}
