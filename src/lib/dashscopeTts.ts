/**
 * 百炼语音合成（qwen-audio-3.1-tts-flash）：HTTP SSE 流式拿裸 PCM。
 *
 * 为什么是 HTTP SSE 而不是 WebSocket：SSE 有文档、复刻音色明确可用，Vercel 函数完全能承载；
 * 一段文字一个请求，失败了也只影响这一段。非流式接口返回的是 OSS 地址（保留 24 小时），
 * 我们不想让任何一段声音在别人的存储里多留一天，所以只用流式。
 *
 * 协议（2026-10-26 用真实 Key 跑通，见 /tmp/qa/impl/tts.mjs）：
 * - POST https://{workspace}.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer
 *   头 `X-DashScope-SSE: enable`，体 {model, input:{text, voice, format:'pcm', sample_rate:24000, instruction}}
 * - 每个 SSE 事件的 data 是 JSON，音频在 output.audio.data（base64 的 PCM16LE 24k 单声道），
 *   output.type 依次 sentence-begin / sentence-synthesis / sentence-end，最后一条带 usage；
 * - 出错时 data 里有 code / message。首包约 740ms。
 *
 * 日志纪律：这里不打日志；调用方只记错误类别、状态码和耗时。
 */
import {
  anySignal,
  classifyDashscopeError,
  createCircuitBreaker,
  DashscopeError,
  getDashscopeConfig,
  toDashscopeError,
  ttsEndpoint,
  type DashscopeConfig,
} from './dashscope.ts';
import type { SpeechTone } from './philCoachSpeechSign.ts';
import { createPcmAligner, createPcmLeveler, createPcmSilenceTrimmer } from './wavPcm.ts';

type Env = Record<string, string | undefined>;

export const TTS_SAMPLE_RATE = 24_000;
/** /speak 响应头 X-Audio-Format 的值，前端播放器按它分派 */
export const TTS_PCM_FORMAT = `pcm_s16le;rate=${TTS_SAMPLE_RATE}`;

/**
 * 默认语气指令（替代 SiliconFlow 那边的 speed: 0.9）。可以用 DASHSCOPE_TTS_INSTRUCTION 覆盖，
 * 方便不改代码就试听调整。
 */
export const DEFAULT_TTS_INSTRUCTION =
  '请用轻柔、平稳、中正温和的语气慢慢地说，音量放轻，语调起伏小，句子之间自然停顿，像在安静的房间里陪一个人说话，不要播音腔，不要夸张的情绪。';

/** 危机回复：那一段要每个字都听得清，不能轻到听不见 */
const STEADY_INSTRUCTION = '请用平稳、清楚、温和而坚定的语气说，语速适中，每个字都说清楚，不要播音腔，不要夸张的情绪。';

export function bailianTtsInstruction(tone: SpeechTone, env: Env = process.env): string {
  if (tone === 'steady') return STEADY_INSTRUCTION;
  const custom = env.DASHSCOPE_TTS_INSTRUCTION?.trim();
  return custom ? custom.slice(0, 500) : DEFAULT_TTS_INSTRUCTION;
}

/**
 * 前端只传 female / male 两个键名，这里映射到百炼复刻得到的 voice_id。
 * 认不出的键名回落到 female；任意字符串不会被透传给上游。没配返回 null。
 */
/**
 * 每把嗓音的响度提升（dB），见 createPcmLeveler。默认女声、男声均 +7；
 * 男声由 +4 调至 +7，以缩小手机试听及同文样本中的响度差。实际响度仍随合成内容变化。
 * 可以用 DASHSCOPE_TTS_GAIN_DB_FEMALE / DASHSCOPE_TTS_GAIN_DB_MALE 调，范围 0–12，0 就是不处理。
 */
export function bailianTtsGainDb(voiceKey: unknown, env: Env = process.env): number {
  const male = voiceKey === 'male';
  const raw = (male ? env.DASHSCOPE_TTS_GAIN_DB_MALE : env.DASHSCOPE_TTS_GAIN_DB_FEMALE)?.trim();
  const parsed = raw ? Number(raw) : NaN;
  const value = Number.isFinite(parsed) ? parsed : 7;
  return Math.max(0, Math.min(12, value));
}

export function resolveBailianVoice(voiceKey: unknown, env: Env = process.env): string | null {
  const key = voiceKey === 'male' ? 'MALE' : 'FEMALE';
  return env[`DASHSCOPE_TTS_VOICE_${key}`]?.trim() || null;
}

// —— SSE 解析（纯函数） ——

export type TtsSseEvent =
  | { kind: 'audio'; pcm: Uint8Array }
  | { kind: 'error'; code: string; message: string; status?: number }
  | { kind: 'usage'; usage: Record<string, number> };

function numericFields(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== 'object') return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** 一个 SSE 块（已去掉空行分隔）→ 事件 */
function parseBlock(block: string): TtsSseEvent[] {
  let eventName = '';
  let status: number | undefined;
  const dataLines: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
    else if (line.startsWith('event:')) eventName = line.slice(6).trim();
    else if (line.startsWith(':HTTP_STATUS/')) status = Number(line.slice(13)) || undefined;
  }
  const data = dataLines.join('\n').trim();
  if (!data) return [];

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(data) as Record<string, unknown>;
  } catch {
    return eventName === 'error' ? [{ kind: 'error', code: 'bad-event', message: '', status }] : [];
  }

  const output = (json.output && typeof json.output === 'object' ? json.output : {}) as Record<string, unknown>;
  const audio = (output.audio && typeof output.audio === 'object' ? output.audio : {}) as Record<string, unknown>;
  const code = typeof json.code === 'string' ? json.code : '';
  const events: TtsSseEvent[] = [];

  if (eventName === 'error' || (code && typeof audio.data !== 'string') || (status !== undefined && status >= 400)) {
    events.push({
      kind: 'error',
      code: code || 'upstream-error',
      message: typeof json.message === 'string' ? json.message.slice(0, 200) : '',
      status,
    });
    return events;
  }
  if (typeof audio.data === 'string' && audio.data) {
    const bytes = Buffer.from(audio.data, 'base64');
    if (bytes.length) {
      events.push({ kind: 'audio', pcm: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) });
    }
  }
  const usage = numericFields(json.usage) ?? numericFields(output.usage);
  if (usage) events.push({ kind: 'usage', usage });
  return events;
}

/**
 * SSE 文本流 → 事件。网络块可能切在一个事件、一行、甚至一段 base64 的中间，
 * 所以先攒到空行（事件边界）再解析。\r 一律去掉（有的网关会把换行改成 CRLF，
 * 而 \r\n 本身也可能被切在两块之间）。
 */
export function createTtsSseParser() {
  let buffer = '';
  return {
    push(text: string): TtsSseEvent[] {
      buffer += text.replace(/\r/g, '');
      const events: TtsSseEvent[] = [];
      let at: number;
      while ((at = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, at);
        buffer = buffer.slice(at + 2);
        events.push(...parseBlock(block));
      }
      return events;
    },
    /** 流结束：最后一个事件后面可能没有空行 */
    flush(): TtsSseEvent[] {
      const rest = buffer;
      buffer = '';
      return rest.trim() ? parseBlock(rest) : [];
    },
  };
}

// —— 流式合成 ——

/** 同一实例上连续三次失败就歇 60 秒，期间 /speak 直接走 SiliconFlow */
export const ttsCircuit = createCircuitBreaker({ threshold: 3, coolDownMs: 60_000 });

export type TtsStreamDone = {
  /** 实际发给前端的字节数（已裁掉首尾静音） */
  audioBytes: number;
  usage: Record<string, number> | null;
  /** 前端断开或被打断，没念完 */
  cancelled: boolean;
};

export type TtsPcmStream = {
  /** 裸 PCM16LE 24k 单声道，每块都是偶数字节 */
  stream: ReadableStream<Uint8Array>;
  /** 从发请求到拿到第一块音频的毫秒数 */
  firstAudioMs: number;
};

function timeoutError(): DOMException {
  return new DOMException('timeout', 'TimeoutError');
}

/**
 * 发起一段合成，等到**第一块音频**到手才返回。
 *
 * 为什么要等第一块：/speak 的响应头（X-Audio-Format）一旦发出就不能改了。
 * 在第一块之前失败（Key、额度、限流、音色不对），调用方还来得及在同一个请求里
 * 换成 SiliconFlow、改回 mp3；之后才失败的，只能让这段流以错误结束。
 *
 * signal：前端断开或被打断时中止上游，不让它对着空气继续合成、继续计费。
 */
export async function streamTtsPcm({
  text,
  voice,
  instruction,
  config,
  signal,
  firstAudioTimeoutMs = 8_000,
  totalTimeoutMs = 45_000,
  gainDb = 0,
  onDone,
}: {
  text: string;
  voice: string;
  instruction?: string;
  config?: DashscopeConfig | null;
  signal?: AbortSignal;
  firstAudioTimeoutMs?: number;
  totalTimeoutMs?: number;
  /** 响度提升（dB），0 就是不处理；见 bailianTtsGainDb */
  gainDb?: number;
  onDone?: (info: TtsStreamDone) => void;
}): Promise<TtsPcmStream> {
  const cfg = config === undefined ? getDashscopeConfig() : config;
  if (!cfg) throw new DashscopeError('not-configured');

  const startedAt = Date.now();
  const ctrl = new AbortController();
  const combined = anySignal([signal, ctrl.signal]);
  const firstTimer = setTimeout(() => ctrl.abort(timeoutError()), firstAudioTimeoutMs);
  const totalTimer = setTimeout(() => ctrl.abort(timeoutError()), totalTimeoutMs);
  const stopTimers = () => {
    clearTimeout(firstTimer);
    clearTimeout(totalTimer);
  };

  let res: Response;
  try {
    res = await fetch(ttsEndpoint(cfg), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'X-DashScope-SSE': 'enable',
      },
      body: JSON.stringify({
        model: cfg.ttsModel,
        input: {
          text,
          voice,
          format: 'pcm',
          sample_rate: TTS_SAMPLE_RATE,
          ...(instruction ? { instruction } : {}),
        },
      }),
      signal: combined,
    });
  } catch (err) {
    stopTimers();
    throw toDashscopeError(err, combined);
  }

  if (!res.ok || !res.body) {
    stopTimers();
    const raw = await res.text().catch(() => '');
    let code: string | undefined;
    let message: string | undefined;
    try {
      const json = JSON.parse(raw) as { code?: unknown; message?: unknown };
      code = typeof json.code === 'string' ? json.code : undefined;
      message = typeof json.message === 'string' ? json.message : undefined;
    } catch {
      // 非 JSON 错误体可能是 SSE：拿解析器过一遍
      const parser = createTtsSseParser();
      const error = [...parser.push(raw), ...parser.flush()].find(e => e.kind === 'error');
      if (error?.kind === 'error') {
        code = error.code;
        message = error.message;
      }
    }
    throw new DashscopeError(classifyDashscopeError({ status: res.status, code, message }), {
      status: res.status,
      code,
    });
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = createTtsSseParser();
  const aligner = createPcmAligner();
  // 裁掉每段首尾的静音（见 createPcmSilenceTrimmer）：不然首字节到了还要再等一秒才出声
  const trimmer = createPcmSilenceTrimmer({ sampleRate: TTS_SAMPLE_RATE });
  // 再把响度提上来（尖峰用限幅器压住，不会爆音）：手机外放、iPhone 走 <audio> 时网页没法再加音量
  const leveler = createPcmLeveler({ sampleRate: TTS_SAMPLE_RATE, gainDb });
  const pending: Uint8Array[] = [];
  const enqueue = (bytes: Uint8Array) => {
    if (!bytes.length) return;
    pending.push(bytes);
    audioBytes += bytes.length;
  };
  let audioBytes = 0;
  let usage: Record<string, number> | null = null;
  let upstreamDone = false;

  const absorb = (events: TtsSseEvent[]) => {
    for (const event of events) {
      if (event.kind === 'error') {
        throw new DashscopeError(
          classifyDashscopeError({ status: event.status, code: event.code, message: event.message }),
          { status: event.status, code: event.code },
        );
      }
      if (event.kind === 'usage') {
        usage = event.usage;
        continue;
      }
      const aligned = aligner.push(event.pcm);
      if (aligned.length) enqueue(leveler.push(trimmer.push(aligned)));
    }
  };

  /** 读一块上游；返回 false 表示上游已经读完 */
  const readMore = async (): Promise<boolean> => {
    if (upstreamDone) return false;
    const { value, done } = await reader.read();
    if (done) {
      upstreamDone = true;
      absorb(parser.push(decoder.decode()));
      absorb(parser.flush());
      aligner.flush();
      enqueue(leveler.push(trimmer.flush()));
      return false;
    }
    absorb(parser.push(decoder.decode(value, { stream: true })));
    return true;
  };

  const release = () => {
    stopTimers();
    reader.cancel().catch(() => {});
  };

  try {
    while (!pending.length) {
      if (!(await readMore())) break;
    }
  } catch (err) {
    release();
    throw toDashscopeError(err, combined);
  }
  if (!pending.length) {
    release();
    throw new DashscopeError('upstream', { code: 'tts-empty' });
  }
  clearTimeout(firstTimer);
  const firstAudioMs = Date.now() - startedAt;

  let finished = false;
  const finish = (cancelled = false) => {
    if (finished) return;
    finished = true;
    stopTimers();
    onDone?.({ audioBytes, usage, cancelled });
  };

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (!pending.length) {
          if (!(await readMore())) break;
        }
        const next = pending.shift();
        if (next) {
          controller.enqueue(next);
          return;
        }
        finish();
        controller.close();
      } catch (err) {
        finish();
        reader.cancel().catch(() => {});
        controller.error(toDashscopeError(err, combined));
      }
    },
    cancel() {
      // 前端断开、或者被打断：中止上游。日志要分得清「念完」和「被打断」，
      // 才看得出 Vercel 上中止到底有没有传到上游
      finish(true);
      ctrl.abort();
      reader.cancel().catch(() => {});
    },
  });

  return { stream, firstAudioMs };
}
