/**
 * 百炼实时识别（qwen3-asr-flash-realtime）：服务端出站转写。
 *
 * /api/phil-coach/voice 定稿时，用握手请求头里的长期 Key 连出去，
 * 一段录音开一个会话（Manual 模式），一口气推完、commit、finish，取 completed。
 * 事件归约在 lib/asrEvents.ts（纯函数，浏览器直连也用它），这里重新导出一份方便服务端引用。
 *
 * 协议要点（2026-10-26/27 用真实 Key 跑通，见 /tmp/qa/impl 的探针）：
 * - open 后先发 session.update，等 session.updated 再推音频，否则前几包会被丢；
 * - commit + session.finish 之后约 130ms 出 `.completed`，之后 session.finished；
 * - 百炼在 session.finished 之后既不断开、也不回关闭帧，所以出站连接用自己的客户端
 *   （lib/outboundWebSocket），关的时候发完关闭帧就销毁，不会漏连接。连接不能复用。
 */
import {
  anySignal,
  buildAsrRealtimeUrl,
  classifyDashscopeError,
  createCircuitBreaker,
  DashscopeError,
  getDashscopeConfig,
  openDashscopeSocket,
  toDashscopeError,
  type DashscopeConfig,
  type RealtimeSocketFactory,
} from './dashscope.ts';
import {
  ASR_CHUNK_BYTES,
  ASR_SAMPLE_RATE,
  buildAsrSessionUpdate,
  initialAsrState,
  reduceAsrEvent,
} from './asrEvents.ts';

export {
  ASR_CHUNK_BYTES,
  ASR_SAMPLE_RATE,
  asrCaption,
  asrLanguageForLocale,
  buildAsrSessionUpdate,
  initialAsrState,
  reduceAsrEvent,
  type AsrEmotion,
  type AsrState,
} from './asrEvents.ts';

/** 服务端 → 消息文本；二进制帧（不该出现）按 UTF-8 解开 */
function messageText(data: unknown): string | null {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
  return null;
}

export type RealtimeTranscript = {
  transcript: string;
  language: string | null;
  emotion: string | null;
};

/** 同一实例上连续三次失败就歇 60 秒，期间 /voice 直接走 SiliconFlow */
export const asrCircuit = createCircuitBreaker({ threshold: 3, coolDownMs: 60_000 });

/** completed 到了以后，再等 session.finished 这么久；Manual 模式下通常一百来毫秒就到 */
const FINISH_GRACE_MS = 800;

/**
 * 整段 PCM（16k 单声道 PCM16LE）→ 转写 + 情绪。
 *
 * 推送比实时快：15 秒录音一口气推完，commit 后约 1.5 秒出结果（实测）。
 * 默认总时限随录音长度伸缩：5 秒起，每秒音频加 120ms，封顶 15 秒——
 * 超时就由调用方落回 SiliconFlow，所以这里宁可短一点。
 */
export async function transcribePcmRealtime(
  pcm: Uint8Array,
  {
    config,
    language = 'zh',
    timeoutMs,
    signal,
    socketFactory,
  }: {
    config?: DashscopeConfig | null;
    /** null = 不传语种，由模型自己判断（英文界面，见 asrEvents 的 asrLanguageForLocale） */
    language?: string | null;
    timeoutMs?: number;
    signal?: AbortSignal;
    socketFactory?: RealtimeSocketFactory;
  } = {},
): Promise<RealtimeTranscript> {
  const cfg = config === undefined ? getDashscopeConfig() : config;
  if (!cfg) throw new DashscopeError('not-configured');

  const seconds = pcm.length / (ASR_SAMPLE_RATE * 2);
  const budget = timeoutMs ?? Math.min(15_000, 5_000 + Math.round(seconds * 120));
  const combined = anySignal([signal, AbortSignal.timeout(budget)]);

  const ws = await openDashscopeSocket(buildAsrRealtimeUrl(cfg), {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    signal: combined,
    timeoutMs: Math.min(5_000, budget),
    socketFactory,
  });

  return new Promise<RealtimeTranscript>((resolve, reject) => {
    let state = initialAsrState();
    let pushed = false;
    let settled = false;
    let graceTimer: ReturnType<typeof setTimeout> | null = null;

    const send = (payload: unknown) => ws.send(JSON.stringify(payload));
    const cleanup = () => {
      if (graceTimer) clearTimeout(graceTimer);
      combined.removeEventListener('abort', onAbort);
      ws.removeEventListener('message', onMessage);
      ws.removeEventListener('close', onClose);
      ws.removeEventListener('error', onClose);
      try { ws.close(); } catch { /* 已经断了 */ }
    };
    const succeed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ transcript: state.committed.trim(), language: state.language, emotion: state.emotion });
    };
    const fail = (err: DashscopeError) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const pushAll = () => {
      for (let i = 0; i < pcm.length; i += ASR_CHUNK_BYTES) {
        const chunk = pcm.subarray(i, Math.min(pcm.length, i + ASR_CHUNK_BYTES));
        send({ type: 'input_audio_buffer.append', audio: Buffer.from(chunk).toString('base64') });
      }
      send({ type: 'input_audio_buffer.commit' });
      send({ type: 'session.finish' });
    };

    function onMessage(event: Event) {
      const text = messageText((event as MessageEvent).data);
      if (!text) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return;
      }
      const type = (parsed as { type?: unknown })?.type;
      state = reduceAsrEvent(state, parsed);

      if (state.phase === 'failed') {
        const code = state.error?.code;
        fail(new DashscopeError(classifyDashscopeError({ code, message: state.error?.message }), { code }));
        return;
      }
      if (type === 'session.updated' && !pushed) {
        pushed = true;
        try {
          pushAll();
        } catch {
          fail(new DashscopeError('upstream', { code: 'ws-send' }));
        }
        return;
      }
      if (state.finished) {
        succeed();
        return;
      }
      if (state.completed && !graceTimer) {
        graceTimer = setTimeout(succeed, FINISH_GRACE_MS);
      }
    }
    function onClose() {
      // 连接中途断了：completed 已经到了就算成功（session.finished 没等到也无妨）
      if (state.completed || state.finished) succeed();
      else fail(new DashscopeError('upstream', { code: 'ws-closed' }));
    }
    function onAbort() {
      fail(toDashscopeError(combined.reason, combined));
    }

    ws.addEventListener('message', onMessage);
    ws.addEventListener('close', onClose);
    ws.addEventListener('error', onClose);
    combined.addEventListener('abort', onAbort, { once: true });
    if (combined.aborted) {
      onAbort();
      return;
    }
    try {
      send(buildAsrSessionUpdate(language));
    } catch {
      fail(new DashscopeError('upstream', { code: 'ws-send' }));
    }
  });
}
