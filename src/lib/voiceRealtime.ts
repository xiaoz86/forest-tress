'use client';

/**
 * 浏览器直连百炼实时识别（qwen3-asr-flash-realtime）——第一期「听」的主路径。
 *
 * 为什么能直连：服务端（/api/phil-coach/voice/token）用一把只开通了识别的专用 Key 换一个 60 秒的
 * st- 临时令牌，拼进 wss 地址的 api_key 参数交给这里；要令牌得带上页面渲染时签的进门票。
 * 这是文档外的传法（2026-10-26 实测可用），
 * 所以这一层的原则是「能用就用，任何不对劲都无感退回」：
 *   - 拿不到地址、握手失败、session 出错、连上之后迟迟不 ready → 录音中立刻接回原来的字幕方案
 *     （WebKit 用 Web Speech，其余用 /voice 分段），定稿走整段上传 /voice；
 *   - 停止后 3 秒内等不到 completed → 定稿照旧整段上传。整段 PCM 一直在采音层的内存里，什么都不丢。
 *
 * 一段录音一个会话（连接不能复用）：
 *   开录 → 并发「拿地址 → 连 WS → session.update（Manual 模式）」，期间采到的 PCM 先攒着；
 *   session.updated → 攒的补推、之后边采边推（16k PCM16LE，100ms 一包）；
 *   .text 事件 → 字幕（text 已确定 + stash 未确定）；
 *   停止 → 推完尾巴，commit + session.finish → 等 completed（transcript + emotion）。
 * 百炼在 session.finished 之后不会自己断开、也不回关闭帧（2026-10-27 实测），所以拿到结果就自己 close，
 * 不等 close 事件。
 *
 * 日志纪律：地址里带着令牌，绝不打印；音频和 base64 也不打印。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ASR_CHUNK_BYTES,
  ASR_SAMPLE_RATE,
  asrCaption,
  buildAsrSessionUpdate,
  initialAsrState,
  reduceAsrEvent,
} from './asrEvents.ts';
import { asrEmotionToVoiceAnalysis, type VoiceAnalysis } from './philCoachVoice.ts';

const TOKEN_ENDPOINT = '/api/phil-coach/voice/token';
/** 开录之后多久还没 ready（拿令牌 + 握手 + session.updated）就认输，接回原来的字幕 */
export const REALTIME_CONNECT_TIMEOUT_MS = 5_000;
/** 停止之后最多等 completed 这么久；实测 commit 后约 130ms 就到 */
export const REALTIME_FINISH_TIMEOUT_MS = 3_000;
const TOKEN_TIMEOUT_MS = 4_000;
/** completed 到了再等 session.finished 这么一小会儿（Manual 模式下几乎同时到） */
const FINISH_GRACE_MS = 250;
/** 没 ready 之前最多攒这么多（60 秒）；录音上限 55 秒，正常碰不到 */
const MAX_QUEUED_BYTES = 60 * ASR_SAMPLE_RATE * 2;

// —— 纯函数：重采样、分包、base64 ——

/**
 * 流式下采样到 16k，输出 PCM16LE 字节。
 *
 * 和 voiceServer 的 encodePcmWav 用同一种盒式低通（每个输出样本取对应输入区间的平均），
 * 只是改成能一块一块喂：44.1k → 16k 这种非整数倍，区间会跨块，落在块尾的输入样本留到下一块。
 * 所以不管怎么切块，输出都和一次性处理整段完全一样。
 */
export function createDownsampler(inputRate: number, outputRate: number = ASR_SAMPLE_RATE) {
  const ratio = inputRate / outputRate;
  let carry = new Float32Array(0);
  let carryStart = 0;   // carry[0] 在整条输入里的下标
  let produced = 0;     // 已经输出了几个样本

  const toBytes = (values: number[]): Uint8Array => {
    const out = new Uint8Array(values.length * 2);
    const view = new DataView(out.buffer);
    for (let i = 0; i < values.length; i += 1) {
      const v = Math.max(-1, Math.min(1, values[i]));
      view.setInt16(i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    }
    return out;
  };

  const run = (input: Float32Array, final: boolean): Uint8Array => {
    let buffer = input;
    if (carry.length) {
      buffer = new Float32Array(carry.length + input.length);
      buffer.set(carry);
      buffer.set(input, carry.length);
    }
    const total = carryStart + buffer.length;
    const values: number[] = [];
    for (;;) {
      const from = Math.floor(produced * ratio);
      const to = Math.max(from + 1, Math.floor((produced + 1) * ratio));
      // 收尾时最后一段不完整的区间也算上（有几个平均几个），别丢掉最后几毫秒
      const end = final ? Math.min(to, total) : to;
      if (end > total || from >= total) break;
      let sum = 0;
      for (let i = from; i < end; i += 1) sum += buffer[i - carryStart] || 0;
      values.push(sum / Math.max(1, end - from));
      produced += 1;
      if (end < to) break;   // 收尾时的残段只出一个
    }
    const keepFrom = Math.min(total, Math.floor(produced * ratio));
    carry = final ? new Float32Array(0) : buffer.slice(keepFrom - carryStart);
    carryStart = final ? total : keepFrom;
    return toBytes(values);
  };

  return {
    push(samples: Float32Array): Uint8Array {
      return run(samples, false);
    },
    /** 录音结束：把手上不够一个完整区间的尾巴也交出去 */
    flush(): Uint8Array {
      return run(new Float32Array(0), true);
    },
  };
}

/** 按固定字节数切包（百炼建议 100ms 一包 = 3200 字节）；不够一包的留到下一次 */
export function createPacketizer(size: number = ASR_CHUNK_BYTES) {
  let buffer = new Uint8Array(0);
  return {
    push(bytes: Uint8Array): Uint8Array[] {
      if (!bytes.length) return [];
      const joined = new Uint8Array(buffer.length + bytes.length);
      joined.set(buffer);
      joined.set(bytes, buffer.length);
      const packets: Uint8Array[] = [];
      let offset = 0;
      while (joined.length - offset >= size) {
        packets.push(joined.slice(offset, offset + size));
        offset += size;
      }
      buffer = joined.slice(offset);
      return packets;
    },
    flush(): Uint8Array | null {
      if (!buffer.length) return null;
      const rest = buffer;
      buffer = new Uint8Array(0);
      return rest;
    },
  };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  // 一次塞太多参数给 fromCharCode 会爆栈，分段拼
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * completed 的结果 → 采音层要的定稿。
 * 直接发模式才把情绪翻成 voiceContext（neutral 不生成）；听写不需要，和整段上传时 analysis=0 一致。
 */
export function realtimeVoiceResult(
  result: RealtimeAsrResult | null,
  analysis: boolean,
): { text: string; voiceContext: VoiceAnalysis | null } | null {
  const text = result?.transcript.trim() ?? '';
  if (!result || !text) return null;
  return {
    text,
    voiceContext: analysis ? asrEmotionToVoiceAnalysis(text, result.emotion) : null,
  };
}

// —— 会话 ——

/** 浏览器 WebSocket 里这里用到的那一小块（测试时换成假的） */
export type RealtimeSocketLike = {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
};

export type RealtimeAsrResult = {
  transcript: string;
  emotion: string | null;
  language: string | null;
};

export type RealtimeFailReason =
  | 'token'
  | 'socket'
  | 'connect-timeout'
  | 'server-error'
  | 'closed';

export type RealtimeAsrSession = {
  /** 采音层的 PCM（任意采样率） */
  push(samples: Float32Array, sampleRate: number): void;
  /** 停止：推完尾巴，commit + finish，等 completed；拿不到就是 null（调用方照旧整段上传） */
  finish(): Promise<RealtimeAsrResult | null>;
  /** 放弃这一段（取消录音、新对话、卸载）：不触发 onFail */
  cancel(): void;
  readonly failed: boolean;
  /** 到现在为止出过的字幕（会话坏了也留着最后那一版）：收口时整段上传也失败，就拿它兜底 */
  readonly caption: string;
};

const WS_OPEN = 1;

export function createRealtimeAsrSession({
  getUrl,
  openSocket,
  onCaption,
  onFail,
  language = 'zh',
  connectTimeoutMs = REALTIME_CONNECT_TIMEOUT_MS,
  finishTimeoutMs = REALTIME_FINISH_TIMEOUT_MS,
  debug,
}: {
  /** 拿一次性 wss 地址；拿不到返回 null */
  getUrl: (signal: AbortSignal) => Promise<string | null>;
  openSocket: (url: string) => RealtimeSocketLike;
  onCaption: (caption: string) => void;
  /** 录音还在进行时坏了（停止之后坏的只会让 finish 返回 null，不走这里） */
  onFail: (reason: RealtimeFailReason) => void;
  /** null = 不传语种，由模型自己判断（英文界面，见 asrEvents 的 asrLanguageForLocale） */
  language?: string | null;
  connectTimeoutMs?: number;
  finishTimeoutMs?: number;
  debug?: (label: string) => void;
}): RealtimeAsrSession {
  const startedAt = Date.now();
  const log = (label: string) => debug?.(`${label} +${Date.now() - startedAt}ms`);
  let phase: 'connecting' | 'ready' | 'settled' = 'connecting';
  let failed = false;
  let state = initialAsrState();
  let caption = '';
  let socket: RealtimeSocketLike | null = null;
  const tokenController = new AbortController();
  let queue: Uint8Array[] = [];
  let queuedBytes = 0;
  let downsampler: ReturnType<typeof createDownsampler> | null = null;
  let downsamplerRate = 0;
  const packetizer = createPacketizer(ASR_CHUNK_BYTES);
  let finishing = false;
  let committed = false;
  let finishPromise: Promise<RealtimeAsrResult | null> | null = null;
  let resolveFinish: ((result: RealtimeAsrResult | null) => void) | null = null;
  let connectTimer: ReturnType<typeof setTimeout> | null = null;
  let finishTimer: ReturnType<typeof setTimeout> | null = null;
  let graceTimer: ReturnType<typeof setTimeout> | null = null;

  // 状态会在各种回调里变，读的时候走函数，别让 TS 按声明处的初值把它收窄
  const settled = () => phase === 'settled';

  const clearTimers = () => {
    for (const timer of [connectTimer, finishTimer, graceTimer]) if (timer) clearTimeout(timer);
    connectTimer = null;
    finishTimer = null;
    graceTimer = null;
  };

  /** 自己断：先摘掉回调，免得 close 事件再绕回来当成「意外断开」 */
  const closeSocket = () => {
    const ws = socket;
    socket = null;
    if (!ws) return;
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    try {
      ws.close(1000, 'done');
    } catch {
      /* 已经断了 */
    }
  };

  /** 收尾（成功、失败、取消都走这里），只走一次 */
  const settle = (result: RealtimeAsrResult | null) => {
    if (phase === 'settled') return;
    phase = 'settled';
    clearTimers();
    tokenController.abort();
    closeSocket();
    queue = [];
    queuedBytes = 0;
    if (!result) failed = true;
    resolveFinish?.(result);
    resolveFinish = null;
  };

  const fail = (reason: RealtimeFailReason) => {
    if (phase === 'settled') return;
    log(`fail ${reason}`);
    const duringRecording = !finishing;
    settle(null);
    if (duringRecording) onFail(reason);
  };

  const send = (payload: unknown): boolean => {
    const ws = socket;
    if (!ws || ws.readyState !== WS_OPEN) return false;
    try {
      ws.send(JSON.stringify(payload));
      return true;
    } catch {
      fail('socket');
      return false;
    }
  };

  const sendAudio = (packet: Uint8Array) => {
    if (phase === 'ready') {
      send({ type: 'input_audio_buffer.append', audio: bytesToBase64(packet) });
      return;
    }
    if (phase !== 'connecting' || queuedBytes + packet.length > MAX_QUEUED_BYTES) return;
    queue.push(packet);
    queuedBytes += packet.length;
  };

  const sendFinish = () => {
    if (committed || phase !== 'ready') return;
    committed = true;
    log('commit');
    send({ type: 'input_audio_buffer.commit' });
    send({ type: 'session.finish' });
  };

  const succeed = () => {
    log('completed');
    settle({ transcript: state.committed.trim(), emotion: state.emotion, language: state.language });
  };

  const onMessage = (data: unknown) => {
    if (phase === 'settled' || typeof data !== 'string') return;
    let event: unknown;
    try {
      event = JSON.parse(data);
    } catch {
      return;
    }
    const type = (event as { type?: unknown } | null)?.type;
    state = reduceAsrEvent(state, event);
    if (state.phase === 'failed') {
      fail('server-error');
      return;
    }
    if (type === 'session.updated' && phase === 'connecting') {
      phase = 'ready';
      if (connectTimer) clearTimeout(connectTimer);
      connectTimer = null;
      log('ready');
      // 连上之前攒下的音频按原顺序补推（比实时快也没关系，实测可以）
      const backlog = queue;
      queue = [];
      queuedBytes = 0;
      for (const packet of backlog) sendAudio(packet);
      if (finishing) sendFinish();
      return;
    }
    const nextCaption = asrCaption(state);
    if (nextCaption !== caption) {
      caption = nextCaption;
      onCaption(caption);
    }
    if (!finishing) return;
    if (state.finished) {
      succeed();
      return;
    }
    if (state.completed && !graceTimer) graceTimer = setTimeout(succeed, FINISH_GRACE_MS);
  };

  connectTimer = setTimeout(() => {
    connectTimer = null;
    if (phase === 'connecting') fail('connect-timeout');
  }, connectTimeoutMs);

  void (async () => {
    let url: string | null = null;
    try {
      url = await getUrl(tokenController.signal);
    } catch {
      url = null;
    }
    if (settled()) return;
    if (!url) {
      fail('token');
      return;
    }
    log('token');
    let ws: RealtimeSocketLike;
    try {
      ws = openSocket(url);
    } catch {
      fail('socket');
      return;
    }
    socket = ws;
    ws.onopen = () => {
      log('open');
      send(buildAsrSessionUpdate(language));
    };
    ws.onmessage = event => onMessage(event.data);
    ws.onerror = () => fail('socket');
    ws.onclose = () => {
      // 收尾阶段 completed 已经到了，断了也算成功（session.finished 没等到无妨）
      if (finishing && state.completed) succeed();
      else fail('closed');
    };
  })();

  return {
    push(samples, sampleRate) {
      if (phase === 'settled' || finishing || !samples.length || !sampleRate) return;
      if (!downsampler || downsamplerRate !== sampleRate) {
        downsampler = createDownsampler(sampleRate);
        downsamplerRate = sampleRate;
      }
      for (const packet of packetizer.push(downsampler.push(samples))) sendAudio(packet);
    },
    finish() {
      if (finishPromise) return finishPromise;
      if (phase === 'settled') {
        finishPromise = Promise.resolve(null);
        return finishPromise;
      }
      finishing = true;
      // 尾巴：重采样器手上的零头 + 不够一包的最后一点
      const tail = downsampler?.flush();
      if (tail?.length) for (const packet of packetizer.push(tail)) sendAudio(packet);
      const rest = packetizer.flush();
      if (rest) sendAudio(rest);
      finishPromise = new Promise<RealtimeAsrResult | null>(resolve => {
        resolveFinish = resolve;
      });
      finishTimer = setTimeout(() => {
        finishTimer = null;
        log('finish-timeout');
        settle(null);
      }, finishTimeoutMs);
      sendFinish();   // 还没 ready 的话，等 session.updated 到了再发
      return finishPromise;
    },
    cancel() {
      settle(null);
    },
    get failed() {
      return failed;
    },
    get caption() {
      return caption;
    },
  };
}

// —— React 接线 ——

async function fetchRealtimeUrl(ticket: string, signal: AbortSignal): Promise<string | null> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, TOKEN_TIMEOUT_MS);
  try {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as { url?: unknown } | null;
    return typeof json?.url === 'string' && json.url.startsWith('wss://') ? json.url : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}

function realtimeDebugEnabled(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('voiceDebug') === '1';
  } catch {
    return false;
  }
}

/**
 * 组件用的那一层：一段录音一个会话，字幕放进 state。
 * enabled 为 false（没配百炼、没配专用 Key、开关关了）或没有进门票时，begin 直接返回 null，
 * 什么都不做——旧链路一个字节不变。
 * language：中文界面 'zh'，英文界面 null（不传，模型自己判断）——见 asrEvents 的 asrLanguageForLocale。
 */
export function useRealtimeAsr(
  enabled: boolean,
  { ticket = null, language = 'zh' }: { ticket?: string | null; language?: string | null } = {},
) {
  const [caption, setCaption] = useState('');
  const sessionRef = useRef<RealtimeAsrSession | null>(null);

  const begin = useCallback(
    (onFail: (reason: RealtimeFailReason) => void): RealtimeAsrSession | null => {
      sessionRef.current?.cancel();
      sessionRef.current = null;
      if (!enabled || !ticket || typeof WebSocket === 'undefined') return null;
      setCaption('');
      const debug = realtimeDebugEnabled()
        ? (label: string) => console.info('[phil-voice] asr', label)
        : undefined;
      const session: RealtimeAsrSession = createRealtimeAsrSession({
        getUrl: signal => fetchRealtimeUrl(ticket, signal),
        openSocket: url => new WebSocket(url) as unknown as RealtimeSocketLike,
        language,
        onCaption: text => {
          if (sessionRef.current === session) setCaption(text);
        },
        onFail: reason => {
          if (sessionRef.current === session) onFail(reason);
        },
        debug,
      });
      sessionRef.current = session;
      return session;
    },
    [enabled, ticket, language],
  );

  /** 放弃当前会话（取消录音、新对话） */
  const cancel = useCallback(() => {
    sessionRef.current?.cancel();
    sessionRef.current = null;
    setCaption(current => (current ? '' : current));
  }, []);

  /** 结果已经交出去了：字幕收起来（会话本身此时已经结束） */
  const clear = useCallback(() => {
    sessionRef.current = null;
    setCaption(current => (current ? '' : current));
  }, []);

  useEffect(
    () => () => {
      sessionRef.current?.cancel();
      sessionRef.current = null;
    },
    [],
  );

  return { caption, begin, cancel, clear };
}
