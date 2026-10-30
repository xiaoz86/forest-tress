import { NextResponse } from 'next/server';
import { DashscopeError, getDashscopeConfig, toDashscopeError } from '@/lib/dashscope';
import {
  bailianTtsInstruction,
  resolveBailianVoice,
  streamTtsPcm,
  TTS_PCM_FORMAT,
  ttsCircuit,
} from '@/lib/dashscopeTts';
import { clientIp, createMemoryRateLimiter, createUseCounter } from '@/lib/memoryRateLimit';
import { getSpeechSigningSecret, verifySpeech, type SpeechTone } from '@/lib/philCoachSpeechSign';
import {
  resolveSiliconflowVoice,
  siliconflowTtsSpeed,
  synthesizeSiliconflowMp3,
} from '@/lib/siliconflowTts';
import { resolveVoiceStack } from '@/lib/voiceStack';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * 按句朗读：流式回复里的每个 sentence 事件，前端各 POST 一次到这里。
 *
 * 这个路由只合成签名合法的文字（见 lib/philCoachSpeechSign）——那些句子只可能出自对话接口，
 * 也就是已经过了访客、免费期、薄卡三道闸门。签名伪造不了，但能重放：签名不绑人，
 * 十分钟内拿着同一句可以反复要，所以每个签名在本实例上最多合成 SPEECH_MAX_USES 次。
 *
 * 说清楚边界：「整个系统不是公开的 TTS 代理」这句话靠的不只是这里——
 * 旧的 /api/phil-coach/tts 仍接受任意文字（改造前就是这样，按 IP 限流，流式朗读失败时也退到它）；
 * 浏览器直连识别的 st- 令牌必须用只开通了识别的专用 Key 签（见 voice/token 路由），
 * 否则拿着令牌就能直接调百炼 TTS，这里的签名形同虚设。
 *
 * 两条线由 PHIL_COACH_TTS_PROVIDER 决定（auto：百炼 Key、Workspace 和两把复刻音色都配了才用百炼）：
 * - bailian：qwen-audio-3.1-tts-flash，HTTP SSE 拿 PCM，边收边往前端流——首包约 0.7 秒；
 *   响应头 X-Audio-Format: pcm_s16le;rate=24000
 * - siliconflow：今天线上的 CosyVoice2 复刻嗓音，整句 mp3；响应头 X-Audio-Format: mp3
 * 前端播放器按 X-Audio-Format 分派，两种都放进同一个播放队列。
 *
 * 降级：百炼在第一块音频之前就失败了（Key、额度、限流、超时），同一个请求里直接换 SiliconFlow；
 * 前端也可以传 provider: 'siliconflow' 主动降级（比如这条回复前面某段已经失败过）。
 * 反方向不行——ops 把开关切成 siliconflow 时，前端不能再把请求拉回百炼。
 *
 * 不落盘、不打印文字和音频；日志只有类别、状态码、耗时和用量数字。
 */

const MAX_BODY_BYTES = 4_096;
// 一条回复 3–6 段，五分钟 240 段足够连着聊；限住的是拿签名句子反复刷
const isRateLimited = createMemoryRateLimiter({ max: 240, windowMs: 5 * 60 * 1000 });
/**
 * 同一个签名句子最多合成几次。正常用法：首次 1 次，换线路重要最多 2 次，
 * 关掉朗读再打开补念上一条再来一轮——6 次够用；拿一个签名反复刷的，到这里就停。
 * 多实例下各数各的，只是抬高门槛。
 */
const SPEECH_MAX_USES = 6;
const speechUsedTooOften = createUseCounter({ max: SPEECH_MAX_USES });
/**
 * 整个请求的时间预算（maxDuration 60 秒，留 5 秒余量）：百炼首块最多等 8 秒，
 * 落回 SiliconFlow 时只给剩下的时间，别让平台在 60 秒时直接掐掉函数、前端连个错误都收不到。
 */
const REQUEST_BUDGET_MS = 55_000;
const MIN_FALLBACK_MS = 5_000;

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

export async function POST(request: Request) {
  const requestStartedAt = Date.now();
  const secret = getSpeechSigningSecret();
  if (!secret) return jsonError('speech-not-configured', 503);

  const stack = resolveVoiceStack(process.env);
  const siliconKey = process.env.SILICONFLOW_API_KEY?.trim() || '';
  const bailian = stack.tts === 'bailian' ? getDashscopeConfig() : null;
  if (!bailian && !siliconKey) return jsonError('voice-not-configured', 503);

  if (isRateLimited(clientIp(request))) return jsonError('too-many', 429);

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return jsonError('too-large', 413);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return jsonError('bad-json', 400);
    body = parsed as Record<string, unknown>;
  } catch {
    return jsonError('bad-json', 400);
  }

  const verdict = verifySpeech(
    { text: body.text, tone: body.tone, exp: body.exp, sig: body.sig },
    secret,
  );
  if (verdict !== 'ok') return jsonError(verdict === 'expired' ? 'expired' : 'bad-signature', 401);
  // 验过签再数：签名不对的请求不该占掉真句子的次数
  if (speechUsedTooOften(body.sig as string, (body.exp as number) * 1000)) return jsonError('too-many', 429);
  const text = body.text as string;
  const tone = body.tone as SpeechTone;
  // 认不出的键名回落到 female，不报错——朗读不该因为这个断掉
  const voiceKey = body.voice === 'male' ? 'male' : 'female';

  /**
   * 默认线路是百炼、前端也没主动要 SiliconFlow，最后却落到了 SiliconFlow——不管是熔断开着、
   * 音色没解析出来，还是首块之前失败——都要带 X-Voice-Fallback: 1。前端只认这个头来降级：
   * 这条回复后面的段都改走 SiliconFlow，已经收到、还没开始放的百炼段重要一遍，嗓音不在半路换人。
   */
  const expectedBailian = Boolean(bailian) && body.provider !== 'siliconflow';
  const bailianVoice = resolveBailianVoice(voiceKey);
  if (bailian && bailianVoice && body.provider !== 'siliconflow' && !ttsCircuit.isOpen()) {
    const startedAt = Date.now();
    try {
      const { stream, firstAudioMs } = await streamTtsPcm({
        text,
        voice: bailianVoice,
        instruction: bailianTtsInstruction(tone),
        config: bailian,
        signal: request.signal,
        onDone: ({ audioBytes, usage, cancelled }) => {
          console.info(
            cancelled ? '[phil-speak] bailian cancelled' : '[phil-speak] bailian ok',
            `first=${firstAudioMs}ms`,
            `total=${Date.now() - startedAt}ms`,
            `audio=${(audioBytes / 2 / 24_000).toFixed(1)}s`,
            usage ? `tokens=${usage.output_tokens ?? '?'}/${usage.input_tokens ?? '?'}` : '',
          );
        },
      });
      ttsCircuit.success();
      return new Response(stream, {
        headers: {
          ...NO_STORE,
          'Content-Type': 'application/octet-stream',
          'X-Audio-Format': TTS_PCM_FORMAT,
          'X-Voice-Provider': 'bailian',
          'X-First-Audio-Ms': String(firstAudioMs),
          'X-Accel-Buffering': 'no',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch (err) {
      const e = err instanceof DashscopeError ? err : toDashscopeError(err, request.signal);
      if (e.kind === 'aborted' || request.signal.aborted) {
        // 前端已经走了（被打断、换嗓），不算上游故障
        return jsonError('aborted', 499);
      }
      // 400 是这一句或这份配置的问题（比如某个复刻音色被删了），不是百炼挂了——
      // 不算进熔断，不然连错三次会把另一把好好的嗓音也一起切到 SiliconFlow
      if (e.status !== 400) ttsCircuit.failure();
      console.warn('[phil-speak] bailian failed', e.kind, e.status ?? '', e.code ?? '', `${Date.now() - startedAt}ms`);
      if (!siliconKey) return jsonError('tts-failed', 502);
    }
  }

  if (!siliconKey) return jsonError('voice-not-configured', 503);
  const fellBack = expectedBailian;
  try {
    const audio = await synthesizeSiliconflowMp3({
      apiKey: siliconKey,
      text,
      voice: resolveSiliconflowVoice(voiceKey),
      speed: siliconflowTtsSpeed(),
      signal: request.signal,
      timeoutMs: Math.max(MIN_FALLBACK_MS, REQUEST_BUDGET_MS - (Date.now() - requestStartedAt)),
    });
    return new Response(audio, {
      headers: {
        ...NO_STORE,
        'Content-Type': 'audio/mpeg',
        'X-Audio-Format': 'mp3',
        'X-Voice-Provider': 'siliconflow',
        ...(fellBack ? { 'X-Voice-Fallback': '1' } : {}),
      },
    });
  } catch (err) {
    if (request.signal.aborted) return jsonError('aborted', 499);
    const status = (err as { status?: number } | null)?.status;
    console.error('[phil-speak] siliconflow failed', status ?? (err as { name?: string } | null)?.name ?? 'error');
    return jsonError('tts-failed', 502);
  }
}
