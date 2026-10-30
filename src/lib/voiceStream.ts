'use client';

/**
 * 按句朗读（第一期「说」的前端）。
 *
 * 流式回复（/api/phil-coach 的 NDJSON）每切出一段就带一个签了名的 sentence 事件；
 * 这里每段 POST 一次 /api/phil-coach/speak，边收边放：
 *   - 百炼：pcm_s16le;rate=24000 的字节流，收到一块排一块（首包约 0.7 秒就能出声）；
 *   - SiliconFlow：整句 mp3，decodeAudioData 之后放进同一条队列。
 * 两种按响应头 X-Audio-Format 分派，播放严格按段的 index 顺序，最多两段同时在路上（预取）。
 *
 * 播放用 Web Audio：Int16 → Float32，按 nextStartTime 无缝排队；断流时先攒约 150ms 再开播，
 * 免得网络一抖就一顿一顿。iOS 上 Web Audio 起不来（没在手势里解锁、被打断、或者老系统
 * 没有 navigator.audioSession、静音拨片会让 Web Audio 没声）时，退回一个复用的 <audio>：
 * 每段收齐后拼成 WAV（mp3 原样），按段接着放。
 *
 * 失败：
 *   - /speak 自己会在百炼出第一块音频之前失败时换 SiliconFlow（X-Voice-Fallback: 1），
 *     这里看到后，这条回复后面的段都直接要 SiliconFlow，嗓音不来回跳；
 *   - 某段在出声之前就失败（签名过期、两家都不行、限流）：这条回复剩下的文字等到齐后
 *     合成一次交给旧的 /api/phil-coach/tts（CosyVoice 复刻，嗓音接近）；它也失败就静默并报错。
 *   下一条回复重新按默认线路来。
 *
 * 打断（stop）：停掉所有已排上的声音节点、中止所有还在路上的 /speak（服务端随之中止上游 SSE）。
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPcmAligner, pcm16ToWav } from './wavPcm.ts';
import type { SpeechTone } from './philCoachSpeechSign.ts';

export { readNdjson } from './ndjson.ts';
export type { PhilStreamEvent } from './philCoachStream.ts';

const SPEAK_ENDPOINT = '/api/phil-coach/speak';
const LEGACY_TTS_ENDPOINT = '/api/phil-coach/tts';
/** 回复流的协商类型，和服务端 lib/philCoachStream 的 REPLY_STREAM_CONTENT_TYPE 一致（那边引了 node:crypto，不能直接 import） */
export const REPLY_STREAM_TYPE = 'application/x-ndjson';

/** 同时在路上的 /speak 最多几个（含正在放的那段） */
export const MAX_INFLIGHT_SEGMENTS = 2;
/**
 * 最多往后预取到第几段（相对**正在出声**的那段）。一段动辄十几秒，再多就是被打断时白花的钱。
 * 「正在出声」要以播放端的回报为准：百炼合成比实时快好几倍，一段收齐就交给播放端了，
 * 按「交出去了几段」算的话，第一段还在念第二秒，整条回复的 /speak 就已经全发出去了。
 */
export const SEGMENT_LOOKAHEAD = 2;
/** 断流（包括刚开头）时先攒这么多再开播 */
export const START_PREBUFFER_S = 0.15;
/** 排第一块时离「现在」留一点余量，给主线程一个调度的空 */
const START_LEAD_S = 0.05;
/** 播放用的 AudioContext 不在 running 时，等 resume 多久就认输换 <audio> */
const RESUME_WAIT_MS = 300;
/**
 * 在手势里成功跑起来过的上下文，是我们自己挂起的：恢复一定会成功，只是 iOS 上要重新激活音频会话，
 * 偶尔要几百毫秒——多等一会儿，别为这个换到没解锁的 <audio> 上去被拦。
 */
const RESUME_WAIT_UNLOCKED_MS = 1_500;
/** 一条回复念完多久后把播放的 AudioContext 挂起、把音频会话还给系统 */
const IDLE_PARK_MS = 1_500;
/** 点了发送解锁之后，回复迟迟没念（发送失败、被闸门拦下）也别一直占着音频会话 */
const PRIME_HOLD_MS = 15_000;
/** 旧 /tts 一次最多收这么多字（和它的 MAX_CHARS 一致） */
const LEGACY_TTS_MAX_CHARS = 600;
/**
 * SiliconFlow 的整句 mp3 比百炼 PCM 平均轻约 15dB（实测平均 -38 vs -23 dB），
 * 同一条回复中途降级、或在两把嗓子之间 A/B 时会忽大忽小。mp3 进 Web Audio 时补约 +10dB：
 * 它的峰值实测 -19.7dB，补完还有将近 10dB 余量，不会削波。<audio> 回退路径补不了（iOS 不认 volume）。
 */
export const ENCODED_GAIN = 3.16;

// —— 纯函数 ——

export type AudioFormat = { kind: 'pcm'; sampleRate: number } | { kind: 'mp3' };

/** /speak 的 X-Audio-Format：`pcm_s16le;rate=24000` 或 `mp3`；没有这个头时看 Content-Type */
export function parseAudioFormat(header: string | null | undefined, contentType?: string | null): AudioFormat | null {
  const value = (header || '').trim().toLowerCase();
  if (value.startsWith('pcm_s16le')) {
    const rate = Number(/rate=(\d+)/.exec(value)?.[1]);
    return { kind: 'pcm', sampleRate: Number.isFinite(rate) && rate >= 8_000 && rate <= 96_000 ? rate : 24_000 };
  }
  if (value === 'mp3' || value === 'mpeg') return { kind: 'mp3' };
  if (!value && /audio\/mpeg/i.test(contentType || '')) return { kind: 'mp3' };
  return null;
}

/** PCM16LE → Float32（-1..1）。落单的半个采样忽略（对齐器已经保证不会有） */
export function pcm16leToFloat32(bytes: Uint8Array): Float32Array {
  const count = Math.floor(bytes.length / 2);
  const out = new Float32Array(count);
  const view = new DataView(bytes.buffer, bytes.byteOffset, count * 2);
  for (let i = 0; i < count; i += 1) {
    const v = view.getInt16(i * 2, true);
    out[i] = v < 0 ? v / 0x8000 : v / 0x7fff;
  }
  return out;
}

export function concatBytes(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * 播放时钟：下一块从什么时候开始放。
 * 还排着没放完的，就紧接在后面（无缝）；已经放空了（断流，或者刚开头），
 * 就先攒够 START_PREBUFFER_S 再开，开的时候离现在留 START_LEAD_S。
 */
export function createPlaybackClock({ lead = START_LEAD_S, prebuffer = START_PREBUFFER_S } = {}) {
  let next = 0;
  const starved = (now: number) => next <= now + 0.02;
  return {
    starved,
    /** 手上攒着 pendingSeconds 秒，现在该不该排出去；final = 这一段到头了，有多少排多少 */
    shouldFlush(now: number, pendingSeconds: number, final: boolean): boolean {
      if (pendingSeconds <= 0) return false;
      if (final) return true;
      return !starved(now) || pendingSeconds >= prebuffer;
    },
    /** 排一块，返回它的开始时间 */
    place(now: number, duration: number): number {
      const start = Math.max(next, now + lead);
      next = start + duration;
      return start;
    },
    reset() {
      next = 0;
    },
    endTime: () => next,
  };
}

export type SegmentStatus = 'queued' | 'loading' | 'receiving' | 'ready' | 'failed';

/** 这会儿该发出去哪几段：从正在出声的那段（soundingPos）往后，最多 lookahead 段，同时在路上的不超过 maxInflight */
export function pickSegmentsToFetch(
  statuses: SegmentStatus[],
  soundingPos: number,
  maxInflight: number = MAX_INFLIGHT_SEGMENTS,
  lookahead: number = SEGMENT_LOOKAHEAD,
): number[] {
  let inflight = statuses.filter(s => s === 'loading' || s === 'receiving').length;
  const out: number[] = [];
  for (let i = Math.max(0, soundingPos); i < statuses.length && i <= soundingPos + lookahead; i += 1) {
    if (inflight >= maxInflight) break;
    if (statuses[i] === 'queued') {
      out.push(i);
      inflight += 1;
    }
  }
  return out;
}

/** 失败后剩下的几段拼成一次旧 /tts 请求的文字 */
export function joinSpeechTexts(texts: string[], max: number = LEGACY_TTS_MAX_CHARS): string {
  return texts
    .map(t => t.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, max)
    .trim();
}

/**
 * 发对话请求的头和体。不流式（没配百炼）时和改造前一个字节都不差——这一点有单测盯着。
 * 流式时多一个 Accept 协商头，体里多一个 speak（服务端暂时不看，留给以后省签名）。
 */
export function buildReplyRequest(
  streaming: boolean,
  payload: Record<string, unknown>,
  speak: boolean,
): { headers: Record<string, string>; body: string } {
  if (!streaming) {
    return { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };
  }
  return {
    headers: { 'Content-Type': 'application/json', Accept: `${REPLY_STREAM_TYPE}, application/json` },
    body: JSON.stringify({ ...payload, speak }),
  };
}

/** 回来的是不是 NDJSON 事件流（闸门 403、模型没配这些仍是 JSON） */
export function isReplyStream(res: { ok: boolean; headers: { get(name: string): string | null }; body: unknown }): boolean {
  return res.ok && Boolean(res.body) && (res.headers.get('content-type') || '').toLowerCase().includes(REPLY_STREAM_TYPE);
}

// —— 引擎：分段、预取、顺序、降级（不碰 DOM，测试里换成假的 fetch 和假的播放端） ——

export type SignedSentence = { index: number; text: string; exp: number; sig: string; tone: SpeechTone };

export type PhilSpeechVoice = 'female' | 'male';

export type SpeechSource = { kind: 'signed'; sentence: SignedSentence } | { kind: 'text'; text: string };

/** 播放端：Web Audio 或 <audio>。按调用顺序放。 */
export type SpeechSink = {
  pushPcm(bytes: Uint8Array, sampleRate: number): void;
  pushEncoded(bytes: Uint8Array): void;
  /** 当前这一段到头了（PCM 的尾巴要冲出去；<audio> 这时才拼好整段） */
  endSegment(): void;
  /** 已经 endSegment 交过来、还没放完的段数（含正在出声的那段）；引擎据此算「正在出声的是第几段」 */
  pendingSegments(): number;
  /** 交过来的都放完了 */
  idle(): boolean;
  stop(): void;
};

/** 播放端往回报的事 */
export type SinkEvents = {
  /** 真的出声了 */
  sound(): void;
  /** 又放完了一段（引擎借这一下往后预取） */
  advanced(): void;
  /** 交过去的都放完了 */
  drained(): void;
  /** 自动播放被拦（只有 <audio> 会） */
  blocked(blocked: boolean): void;
  /** 某段解不开、放不了 */
  playError(): void;
};

export type SpeechEngineState = { loading: boolean; speaking: boolean };

type Segment = {
  source: SpeechSource;
  status: SegmentStatus;
  format: AudioFormat | null;
  provider: string | null;
  parts: Uint8Array[];
  /** 已经交给播放端的块数 */
  fed: number;
  controller: AbortController | null;
  /** 为了换线路重要过几次（防止来回打转） */
  restarts: number;
};

const MAX_RESTARTS = 2;

type Job = {
  id: number;
  voice: PhilSpeechVoice;
  segments: Segment[];
  ended: boolean;
  /** 正在往播放端喂的那段在 segments 里的位置（不是正在出声的那段，见 soundingPos） */
  playPos: number;
  /** 这条回复后面的段直接要 SiliconFlow（百炼刚失败过） */
  forceSiliconflow: boolean;
  /** 某段出声前失败了：从那段起的文字攒在这里，回复到齐后合成一次旧 /tts */
  fallbackTexts: string[] | null;
  fallbackUsed: boolean;
  /** 放弃了（备用线路也失败、或者放不出来）：已经排上的放完就算结束 */
  broken: boolean;
  /** 「放不出来」这条回复已经报过一次了（<audio> 后面几段多半也一样，别连着报） */
  playErrorReported: boolean;
  sink: SpeechSink | null;
  started: boolean;
  finished: boolean;
};

function textOf(source: SpeechSource): string {
  return source.kind === 'signed' ? source.sentence.text : source.text;
}

export function createSpeechEngine({
  fetchImpl,
  pickSink,
  onChange,
  onError,
  debug,
}: {
  fetchImpl: (url: string, init: RequestInit) => Promise<Response>;
  /** 每条回复开始时选一次播放端（异步：可能要等 AudioContext resume） */
  pickSink: () => Promise<SpeechSink>;
  onChange: (state: SpeechEngineState) => void;
  onError: (kind: 'unavailable' | 'playback') => void;
  debug?: (label: string) => void;
}) {
  let current: Job | null = null;
  let nextId = 1;
  let lastState: SpeechEngineState = { loading: false, speaking: false };

  const emit = () => {
    const job = current;
    const active = Boolean(job && !job.finished);
    const state: SpeechEngineState = {
      loading: Boolean(active && job && !job.started && (job.segments.length > 0 || job.fallbackTexts)),
      speaking: Boolean(active && job?.started),
    };
    if (state.loading === lastState.loading && state.speaking === lastState.speaking) return;
    lastState = state;
    onChange(state);
  };

  const finish = (job: Job) => {
    if (job.finished) return;
    job.finished = true;
    for (const seg of job.segments) seg.controller?.abort();
    if (current === job) current = null;
    debug?.(`job ${job.id} done${job.broken ? ' (broken)' : ''}`);
    emit();
  };

  /**
   * 正在出声的是第几段：喂到了第 playPos 段，播放端手上还有几段没放完，往回数。
   * 播放端还没选好时什么都没喂，就是 playPos（0）。
   */
  const soundingPos = (job: Job) => Math.max(0, job.playPos - (job.sink?.pendingSegments() ?? 0));

  const checkFinished = (job: Job) => {
    const allFed = job.ended && !job.fallbackTexts && job.playPos >= job.segments.length;
    if (!job.broken && !allFed) return;
    if (job.sink && !job.sink.idle()) return;   // 还在放
    finish(job);
  };

  const feed = (job: Job) => {
    const sink = job.sink;
    if (!sink || job.broken) return;
    while (job.playPos < job.segments.length) {
      const seg = job.segments[job.playPos];
      if (seg.format) {
        for (; seg.fed < seg.parts.length; seg.fed += 1) {
          const part = seg.parts[seg.fed];
          if (seg.format.kind === 'pcm') sink.pushPcm(part, seg.format.sampleRate);
          else sink.pushEncoded(part);
        }
      }
      if (seg.status !== 'ready') break;
      sink.endSegment();
      job.playPos += 1;
    }
  };

  const pump = (job: Job) => {
    if (current !== job || job.finished) return;
    if (job.fallbackTexts && job.ended) {
      const text = joinSpeechTexts(job.fallbackTexts);
      job.fallbackTexts = null;
      job.fallbackUsed = true;
      if (text) {
        debug?.(`job ${job.id} fallback to legacy tts`);
        job.segments.push(newSegment({ kind: 'text', text }));
      }
    }
    for (const pos of pickSegmentsToFetch(job.segments.map(s => s.status), soundingPos(job))) {
      void fetchSegment(job, job.segments[pos]);
    }
    feed(job);
    checkFinished(job);
    emit();
  };

  const newSegment = (source: SpeechSource): Segment => ({
    source,
    status: 'queued',
    format: null,
    provider: null,
    parts: [],
    fed: 0,
    controller: null,
    restarts: 0,
  });

  const restartSegment = (job: Job, seg: Segment) => {
    seg.controller?.abort();
    seg.controller = null;
    seg.status = 'queued';
    seg.format = null;
    seg.provider = null;
    seg.parts = [];
    seg.fed = 0;
    pump(job);
  };

  /** 这条回复后面都要 SiliconFlow；已经收到、还没开始放的百炼段重新要一遍，嗓音不在半路换人 */
  const downgrade = (job: Job, from: Segment) => {
    if (job.forceSiliconflow) return;
    job.forceSiliconflow = true;
    debug?.(`job ${job.id} downgrade to siliconflow`);
    const pos = job.segments.indexOf(from);
    for (const seg of job.segments.slice(pos + 1)) {
      if (seg.source.kind !== 'signed' || seg.fed > 0 || seg.restarts >= MAX_RESTARTS) continue;
      if (seg.provider === 'bailian') {
        seg.restarts += 1;
        restartSegment(job, seg);
      }
    }
  };

  const segmentFailed = (job: Job, seg: Segment) => {
    if (seg.fed > 0) {
      // 已经开始放的半截：不重念，就当这段到头了；后面的段改走备用线路
      seg.status = 'ready';
      if (seg.source.kind === 'signed') downgrade(job, seg);
      pump(job);
      return;
    }
    if (seg.parts.length > 0 && seg.source.kind === 'signed' && !job.forceSiliconflow && seg.restarts < MAX_RESTARTS) {
      // 收了一半、还没开始放（预取的那段百炼流断了）：这条回复改走备用线路，这段重要一遍
      downgrade(job, seg);
      seg.restarts += 1;
      restartSegment(job, seg);
      return;
    }
    if (seg.source.kind === 'text') {
      // 旧 /tts 也不行：这条回复不念了，已经排上的放完就结束
      seg.status = 'failed';
      job.broken = true;
      for (const s of job.segments) s.controller?.abort();
      debug?.(`job ${job.id} gave up`);
      onError('unavailable');
      pump(job);
      return;
    }
    if (job.fallbackUsed) {
      // 合并的那一段已经发出去了（这段是更早发出、更晚失败的）：它自己单独走旧 /tts
      seg.source = { kind: 'text', text: textOf(seg.source) };
      seg.restarts += 1;
      restartSegment(job, seg);
      return;
    }
    // 出声之前就失败：从这段起（包括后面已经预取好的）都改成一次旧 /tts，嗓音前后一致。
    // 更靠后的某段先失败过的话，它们的文字已经在 fallbackTexts 里，这一段接在前面。
    const pos = job.segments.indexOf(seg);
    const rest = job.segments.splice(pos);
    for (const s of rest) s.controller?.abort();
    job.fallbackTexts = rest.map(s => textOf(s.source)).concat(job.fallbackTexts ?? []);
    pump(job);
  };

  const fetchSegment = async (job: Job, seg: Segment) => {
    const controller = new AbortController();
    seg.controller = controller;
    seg.status = 'loading';
    const alive = () => current === job && !job.finished && seg.controller === controller && !controller.signal.aborted;
    const source = seg.source;
    const startedAt = Date.now();
    let res: Response;
    try {
      res =
        source.kind === 'signed'
          ? await fetchImpl(SPEAK_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: source.sentence.text,
                exp: source.sentence.exp,
                sig: source.sentence.sig,
                tone: source.sentence.tone,
                voice: job.voice,
                ...(job.forceSiliconflow ? { provider: 'siliconflow' } : {}),
              }),
              signal: controller.signal,
            })
          : await fetchImpl(LEGACY_TTS_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: source.text, voice: job.voice }),
              signal: controller.signal,
            });
    } catch {
      if (alive()) segmentFailed(job, seg);
      return;
    }
    const discard = () => {
      void res.body?.cancel().catch(() => undefined);
    };
    if (!alive()) {
      discard();
      return;
    }
    if (!res.ok) {
      discard();
      debug?.(`segment failed status=${res.status}`);
      segmentFailed(job, seg);
      return;
    }
    const format =
      source.kind === 'text'
        ? ({ kind: 'mp3' } as const)
        : parseAudioFormat(res.headers.get('X-Audio-Format'), res.headers.get('Content-Type'));
    const provider = res.headers.get('X-Voice-Provider');
    if (!format) {
      discard();
      segmentFailed(job, seg);
      return;
    }
    if (source.kind === 'signed') {
      // 请求发出时这条回复还没降级，回来的却是百炼：重要一遍，免得这段换回另一把嗓子
      if (job.forceSiliconflow && provider === 'bailian' && seg.restarts < MAX_RESTARTS) {
        discard();
        seg.restarts += 1;
        restartSegment(job, seg);
        return;
      }
      if (res.headers.get('X-Voice-Fallback') === '1') downgrade(job, seg);
    }
    seg.format = format;
    seg.provider = provider;
    seg.status = 'receiving';
    debug?.(`segment ${provider ?? source.kind} ${format.kind} headers ${Date.now() - startedAt}ms`);
    try {
      if (format.kind === 'mp3' || !res.body) {
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (!alive()) return;
        if (!bytes.length) throw new Error('empty-audio');
        const usable = format.kind === 'pcm' ? bytes.subarray(0, bytes.length - (bytes.length % 2)) : bytes;
        seg.parts.push(usable);
        seg.status = 'ready';
        pump(job);
        return;
      }
      const reader = res.body.getReader();
      const aligner = createPcmAligner();
      for (;;) {
        const { value, done } = await reader.read();
        if (!alive()) {
          void reader.cancel().catch(() => undefined);
          return;
        }
        if (done) break;
        const aligned = aligner.push(value);
        if (aligned.length) {
          seg.parts.push(aligned);
          pump(job);
        }
      }
      aligner.flush();
      if (!seg.parts.length) throw new Error('empty-audio');
      seg.status = 'ready';
      pump(job);
    } catch {
      if (alive()) segmentFailed(job, seg);
    }
  };

  const stopCurrent = () => {
    const job = current;
    current = null;
    if (job) {
      job.finished = true;
      for (const seg of job.segments) seg.controller?.abort();
      job.sink?.stop();
    }
    emit();
  };

  return {
    /** 开一条新的（先停掉上一条），返回它的编号 */
    start(voice: PhilSpeechVoice): number {
      stopCurrent();
      const job: Job = {
        id: nextId,
        voice,
        segments: [],
        ended: false,
        playPos: 0,
        forceSiliconflow: false,
        fallbackTexts: null,
        fallbackUsed: false,
        broken: false,
        playErrorReported: false,
        sink: null,
        started: false,
        finished: false,
      };
      nextId += 1;
      current = job;
      debug?.(`job ${job.id} start`);
      void pickSink().then(
        sink => {
          if (current !== job || job.finished) return;
          sink.stop();   // 播放端是复用的，上一条的残余清干净
          job.sink = sink;
          pump(job);
        },
        () => {
          if (current !== job) return;
          job.broken = true;
          onError('playback');
          pump(job);
        },
      );
      return job.id;
    },
    add(id: number, source: SpeechSource) {
      const job = current;
      if (!job || job.id !== id || job.finished || job.ended) return;
      if (job.fallbackTexts) {
        job.fallbackTexts.push(textOf(source));
        emit();
        return;
      }
      if (job.fallbackUsed || job.broken) return;
      job.segments.push(newSegment(source));
      pump(job);
    },
    end(id: number) {
      const job = current;
      if (!job || job.id !== id || job.finished) return;
      job.ended = true;
      pump(job);
    },
    stop: stopCurrent,
    /** 播放端回报（只认当前这一条） */
    events: {
      sound() {
        const job = current;
        if (!job || job.started) return;
        job.started = true;
        debug?.(`job ${job.id} first sound`);
        emit();
      },
      advanced() {
        if (current) pump(current);
      },
      drained() {
        if (current) pump(current);
      },
      blocked() {
        /* 由外层直接转成 UI 状态 */
      },
      playError() {
        const job = current;
        if (!job) return;
        job.broken = true;
        if (!job.playErrorReported) {
          job.playErrorReported = true;
          onError('playback');
        }
        pump(job);
      },
    } satisfies SinkEvents,
    get active(): boolean {
      return Boolean(current && !current.finished);
    },
  };
}

export type SpeechEngine = ReturnType<typeof createSpeechEngine>;

// —— 播放端（浏览器） ——

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext ||
    null
  );
}

function isAppleMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

type AudioSessionLike = { type: string };
function audioSession(): AudioSessionLike | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as unknown as { audioSession?: AudioSessionLike }).audioSession ?? null;
}

/**
 * iOS 的 Web Audio 默认归在「环境音」里：静音拨片一拨就没声，录过音之后还可能从听筒出来。
 * 放之前把会话类型设成 playback（和 <audio> 一样不受拨片影响、走扬声器）；
 * 开录前（stop）再设回 auto，让系统按「录音」重新选——两件事不会同时发生（录音时不念）。
 */
function setPlaybackSession(on: boolean) {
  const session = audioSession();
  if (!session) return;
  try {
    const next = on ? 'playback' : 'auto';
    if (session.type !== next) session.type = next;
  } catch {
    /* 不支持就算了 */
  }
}

function decodeAudio(ctx: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  // 老 Safari 只认回调写法；新的两种都支持，resolve 两次无妨
  return new Promise((resolve, reject) => {
    try {
      const maybe = ctx.decodeAudioData(data, resolve, reject) as Promise<AudioBuffer> | undefined;
      if (maybe && typeof maybe.then === 'function') maybe.then(resolve, reject);
    } catch (err) {
      reject(err);
    }
  });
}

function createWebAudioSink(ctx: AudioContext, events: SinkEvents): SpeechSink {
  const clock = createPlaybackClock();
  const pcmOut = ctx.createGain();
  pcmOut.connect(ctx.destination);
  const encodedOut = ctx.createGain();
  encodedOut.gain.value = ENCODED_GAIN;
  encodedOut.connect(ctx.destination);

  type Item =
    | { kind: 'pcm'; bytes: Uint8Array; rate: number }
    | { kind: 'end' }
    | { kind: 'encoded'; bytes: Uint8Array; state: 'raw' | 'decoding' | 'ready' | 'failed'; buffer: AudioBuffer | null };
  let items: Item[] = [];
  let pending: Uint8Array[] = [];
  let pendingBytes = 0;
  let pendingRate = 0;
  const sources = new Set<AudioBufferSourceNode>();
  let generation = 0;
  let sounded = false;
  /**
   * 段的进度：endSegment 交过来、还没放完的段数。每段最后一个排上的声音节点记在 boundaries 里，
   * 它放完（onended）就算这段放完了。
   */
  let openSegments = 0;
  const boundaries = new Set<AudioBufferSourceNode>();
  /** 这一段（上一个 end 之后）最后排上的节点；这一段一个都没排上时是 null */
  let segmentLast: AudioBufferSourceNode | null = null;

  const idle = () => !sources.size && !items.length && !pendingBytes;

  const segmentDone = () => {
    openSegments = Math.max(0, openSegments - 1);
  };

  const schedule = (buffer: AudioBuffer, out: AudioNode) => {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(out);
    const at = clock.place(ctx.currentTime, buffer.duration);
    source.onended = () => {
      sources.delete(source);
      try {
        source.disconnect();
      } catch {
        /* ignore */
      }
      if (boundaries.delete(source)) {
        segmentDone();
        if (!idle()) events.advanced();
      }
      if (idle()) events.drained();
    };
    sources.add(source);
    segmentLast = source;
    source.start(at);
    if (!sounded) {
      sounded = true;
      events.sound();
    }
  };

  /** 处理到一段的结尾：它最后一个节点放完才算这段放完；一个都没排上（或早就放完了）就当场算完 */
  const closeSegment = (gen: number) => {
    const last = segmentLast;
    segmentLast = null;
    if (last && sources.has(last)) {
      boundaries.add(last);
      return;
    }
    segmentDone();
    // drain 可能正在引擎的喂数据循环里被调用，回报挪到下一个微任务，别重入
    queueMicrotask(() => {
      if (gen === generation) events.advanced();
    });
  };

  const flushPending = (final: boolean) => {
    if (!pendingBytes || !pendingRate) return;
    if (!clock.shouldFlush(ctx.currentTime, pendingBytes / 2 / pendingRate, final)) return;
    const samples = pcm16leToFloat32(concatBytes(pending));
    pending = [];
    pendingBytes = 0;
    if (!samples.length) return;
    const buffer = ctx.createBuffer(1, samples.length, pendingRate);
    buffer.getChannelData(0).set(samples);
    schedule(buffer, pcmOut);
  };

  const drain = () => {
    const gen = generation;
    while (items.length) {
      const item = items[0];
      if (item.kind === 'pcm') {
        if (pendingBytes && pendingRate !== item.rate) flushPending(true);
        pending.push(item.bytes);
        pendingBytes += item.bytes.length;
        pendingRate = item.rate;
        items.shift();
        continue;
      }
      if (item.kind === 'end') {
        flushPending(true);
        items.shift();
        closeSegment(gen);
        continue;
      }
      flushPending(true);
      if (item.state === 'raw') {
        item.state = 'decoding';
        // decodeAudioData 会把传进去的 ArrayBuffer 拿走（detach），给它一份拷贝
        void decodeAudio(ctx, item.bytes.slice().buffer).then(
          buffer => {
            if (gen !== generation) return;
            item.buffer = buffer;
            item.state = 'ready';
            drain();
          },
          () => {
            if (gen !== generation) return;
            item.state = 'failed';
            drain();
          },
        );
        return;
      }
      if (item.state === 'decoding') return;
      items.shift();
      if (item.state === 'ready' && item.buffer) {
        schedule(item.buffer, encodedOut);
      } else {
        events.playError();
        if (gen !== generation) return;
      }
    }
    flushPending(false);
    // 一段都没排上（比如唯一的一段解不开）时没有 onended 可等，自己报一声
    if (idle()) queueMicrotask(() => {
      if (gen === generation && idle()) events.drained();
    });
  };

  return {
    pushPcm(bytes, rate) {
      if (!bytes.length) return;
      items.push({ kind: 'pcm', bytes, rate });
      drain();
    },
    pushEncoded(bytes) {
      items.push({ kind: 'encoded', bytes, state: 'raw', buffer: null });
      drain();
    },
    endSegment() {
      openSegments += 1;
      items.push({ kind: 'end' });
      drain();
    },
    pendingSegments: () => openSegments,
    idle,
    stop() {
      generation += 1;
      items = [];
      pending = [];
      pendingBytes = 0;
      openSegments = 0;
      boundaries.clear();
      segmentLast = null;
      for (const source of sources) {
        source.onended = null;
        try {
          source.stop();
        } catch {
          /* 还没开始或已经停了 */
        }
        try {
          source.disconnect();
        } catch {
          /* ignore */
        }
      }
      sources.clear();
      clock.reset();
      sounded = false;
    },
  };
}

/** 一小段静音 WAV，在手势里给 <audio> 解锁用（iOS 上被手势放过一次的元素，之后换 src 也能直接播） */
function silentWavUrl(): string {
  const wav = pcm16ToWav(new Uint8Array(2_400), 24_000) as Uint8Array<ArrayBuffer>;
  return URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
}

/** <audio> 播放端里用到的那一小块（测试时换成假的） */
export type AudioElementLike = {
  src: string;
  play(): Promise<void>;
  pause(): void;
  removeAttribute(name: string): void;
  onended: ((event: Event) => void) | null;
  onerror: ((event: Event | string) => void) | null;
};

export function createElementSink(el: AudioElementLike, events: SinkEvents) {
  let segParts: Uint8Array[] = [];
  let segRate = 0;
  let segKind: 'pcm' | 'encoded' | null = null;
  let queue: string[] = [];
  let playing: string | null = null;
  let blocked = false;
  let generation = 0;
  let sounded = false;
  let silentUrl: string | null = null;

  const release = (url: string) => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  };

  const idle = () => !playing && !queue.length && !segParts.length;

  const tryPlay = () => {
    const gen = generation;
    void el.play().then(
      () => {
        if (gen !== generation) return;
        if (blocked) {
          blocked = false;
          events.blocked(false);
        }
        if (!sounded) {
          sounded = true;
          events.sound();
        }
      },
      (err: unknown) => {
        if (gen !== generation) return;
        if ((err as { name?: string } | null)?.name === 'NotAllowedError') {
          // 自动播放被拦：留着这段，等用户点「点一下就能听」
          blocked = true;
          events.blocked(true);
          return;
        }
        skipBroken();
      },
    );
  };

  /**
   * 这一段放不出来（解不开、被系统拒了）：扔掉它，接着放下一段。
   * 只清掉 playing 不往下走的话，队列里剩下的段就一直挂着，idle() 永远是 false，
   * 引擎等不到放完，朗读开关会一直停在「准备中」。
   */
  const skipBroken = () => {
    if (playing) release(playing);
    playing = null;
    const gen = generation;
    events.playError();
    if (gen !== generation) return;   // 引擎那边因此把它停了
    if (queue.length) playNext();
    else if (idle()) events.drained();
  };

  const playNext = () => {
    if (playing || blocked || !queue.length) return;
    const url = queue.shift()!;
    playing = url;
    el.src = url;
    tryPlay();
  };

  el.onended = () => {
    if (!playing) return;
    release(playing);
    playing = null;
    if (queue.length) {
      playNext();
      events.advanced();
    } else if (idle()) {
      events.drained();
    }
  };
  el.onerror = () => {
    if (!playing) return;
    skipBroken();
  };

  const sink: SpeechSink & { resume(): void; unlock(): void } = {
    pushPcm(bytes, rate) {
      segKind = 'pcm';
      segRate = rate;
      segParts.push(bytes);
    },
    pushEncoded(bytes) {
      segKind = 'encoded';
      segParts.push(bytes);
    },
    endSegment() {
      if (!segParts.length) return;
      const blob =
        segKind === 'pcm'
          ? new Blob([pcm16ToWav(concatBytes(segParts), segRate) as Uint8Array<ArrayBuffer>], { type: 'audio/wav' })
          : new Blob([concatBytes(segParts)], { type: 'audio/mpeg' });
      segParts = [];
      segKind = null;
      queue.push(URL.createObjectURL(blob));
      playNext();
    },
    // 一段一个 URL：排着的加上正在放的
    pendingSegments: () => queue.length + (playing ? 1 : 0),
    idle,
    stop() {
      generation += 1;
      try {
        el.pause();
      } catch {
        /* ignore */
      }
      if (playing) release(playing);
      playing = null;
      queue.forEach(release);
      queue = [];
      segParts = [];
      segKind = null;
      if (blocked) {
        blocked = false;
        events.blocked(false);
      }
      sounded = false;
    },
    /** 用户点了「点一下就能听」（在手势里） */
    resume() {
      if (!blocked || !playing) return;
      tryPlay();
    },
    /** 在手势里放一小段静音，给这个元素解锁；正在放东西时不动它 */
    unlock() {
      if (playing || queue.length) return;
      try {
        silentUrl ??= silentWavUrl();
        el.src = silentUrl;
        void el.play().then(
          () => {
            if (!playing) el.pause();
          },
          () => undefined,
        );
      } catch {
        /* ignore */
      }
    },
  };
  return sink;
}

/**
 * 播放端的管理：一个播放专用的 AudioContext（录音那个会在收口时关掉，不能共用）和一个复用的 <audio>。
 * 都是第一次用到时才建；prime() 要在用户手势里调，iOS / 微信才放行。
 *
 * 生命周期：上下文只在念的时候跑。念完（引擎空闲一小会儿）、开录前、关朗读时都挂起，
 * 并把 iOS 的音频会话类型还给系统（auto）。一直 running 的话：
 *   - 录音期间两个 AudioContext 同时跑，iOS 上容易外放变小、走听筒，蓝牙耳机切到通话模式后有杂音；
 *   - 会话类型停在 playback（不和别的 App 混音），用户后台的音乐会一直被打断。
 * 挂起不会把解锁丢掉：在手势里跑起来过的上下文，之后不在手势里也能恢复（WebKit 在第一次手势启动时
 * 就摘掉了「需要手势」的限制；Chrome 看的是页面有没有过用户激活）。
 */
function createAudioOutput(events: SinkEvents, { isBusy }: { isBusy: () => boolean }) {
  let ctx: AudioContext | null = null;
  let web: SpeechSink | null = null;
  let el: HTMLAudioElement | null = null;
  let element: ReturnType<typeof createElementSink> | null = null;
  /** 这个上下文在手势里跑起来过（之后我们挂起它，恢复时可以多等一会儿） */
  let unlocked = false;
  let parkTimer: ReturnType<typeof setTimeout> | null = null;

  const ensureContext = (): AudioContext | null => {
    if (ctx && ctx.state !== 'closed') return ctx;
    const Ctor = audioContextCtor();
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
      web = null;
      unlocked = false;
    } catch {
      ctx = null;
    }
    return ctx;
  };

  const ensureElement = () => {
    if (element) return element;
    if (typeof Audio === 'undefined') return null;
    el = new Audio();
    el.preload = 'auto';
    element = createElementSink(el, events);
    return element;
  };

  /** 老 iOS（没有 audioSession）上 Web Audio 受静音拨片管，宁可一开始就走 <audio> */
  const preferElement = () => isAppleMobile() && !audioSession();

  const noteRunning = (c: AudioContext) => {
    if (c === ctx && c.state === 'running') unlocked = true;
  };

  const cancelPark = () => {
    if (parkTimer) clearTimeout(parkTimer);
    parkTimer = null;
  };

  /** 没在念：挂起上下文、把会话还给系统。正在念（引擎有活、播放端没放完）就什么都不动 */
  const park = () => {
    cancelPark();
    if (isBusy() || (web && !web.idle()) || (element && !element.idle())) return;
    const c = ctx;
    if (c && c.state === 'running' && typeof c.suspend === 'function') {
      void c.suspend().catch(() => undefined);
    }
    setPlaybackSession(false);
  };

  const parkSoon = (delayMs: number) => {
    cancelPark();
    parkTimer = setTimeout(park, delayMs);
  };

  return {
    /**
     * 在手势里解锁播放。unlockOnly：解锁完就挂起（点麦克风那一下——紧接着要开录，回复要录完才到）；
     * 否则先留着跑一会儿（点发送那一下——回复几秒就到），PRIME_HOLD_MS 内没念就挂起。
     */
    prime({ unlockOnly = false }: { unlockOnly?: boolean } = {}) {
      cancelPark();
      if (preferElement()) {
        // 这类设备上 <audio> 就是主路径：在手势里放一下静音给它解锁，之后回复到了才能直接出声。
        // 其余设备不碰它——点麦克风的那一下紧接着就要开录，不去多占一次音频会话。
        ensureElement()?.unlock();
        return;
      }
      const c = ensureContext();
      if (!c) return;
      const settle = () => {
        noteRunning(c);
        if (unlockOnly) park();
        else parkSoon(PRIME_HOLD_MS);
      };
      if (c.state === 'running') settle();
      else void c.resume().then(settle, () => undefined);
    },
    async pickSink(): Promise<SpeechSink> {
      cancelPark();
      setPlaybackSession(true);
      const fallback = () => {
        const sink = ensureElement();
        if (!sink) throw new Error('no-audio-output');
        return sink;
      };
      if (preferElement()) return fallback();
      const c = ensureContext();
      if (!c) return fallback();
      if (c.state !== 'running') {
        await Promise.race([
          c.resume().catch(() => undefined),
          new Promise(resolve => setTimeout(resolve, unlocked ? RESUME_WAIT_UNLOCKED_MS : RESUME_WAIT_MS)),
        ]);
      }
      if (c.state !== 'running') return fallback();
      noteRunning(c);
      web ??= createWebAudioSink(c, events);
      return web;
    },
    resume() {
      if (ctx && ctx.state !== 'running') {
        const c = ctx;
        void c.resume().then(() => noteRunning(c), () => undefined);
      }
      element?.resume();
    },
    stopAll() {
      web?.stop();
      element?.stop();
    },
    /** 一条回复念完了（引擎空闲）：过一小会儿还是空闲就挂起，紧接着又开念就不来回折腾 */
    idleSoon() {
      parkSoon(IDLE_PARK_MS);
    },
    /** 开录前、关朗读、换嗓、被打断：马上挂起，把会话类型还给系统 */
    releaseSession() {
      park();
    },
    close() {
      cancelPark();
      web?.stop();
      element?.stop();
      web = null;
      element = null;
      if (el) {
        el.onended = null;
        el.onerror = null;
        el.removeAttribute('src');
      }
      el = null;
      if (ctx) void ctx.close().catch(() => undefined);
      ctx = null;
      setPlaybackSession(false);
    },
  };
}

// —— React hook ——

const TTS_PREF_KEY = 'nf_phil_read_aloud';
const TTS_VOICE_KEY = 'nf_phil_tts_voice';
const DEFAULT_VOICE: PhilSpeechVoice = 'female';
const REMEMBER_REPLIES = 4;

const noopSubscribe = () => () => {};

export type StreamingSpeechMessages = {
  /** 声音没准备好（备用线路也失败） */
  unavailable: string;
  /** 解不开、放不了 */
  playFailed: string;
};

const DEFAULT_MESSAGES: StreamingSpeechMessages = {
  unavailable: '声音暂时没有准备好，可以稍后再试。',
  playFailed: '这段声音没能播放，可以稍后再试。',
};

/** 一条流式回复的朗读把手：句子到一段交一段，回复写完了 end */
export type ReplySpeech = {
  enqueue(sentence: SignedSentence): void;
  end(): void;
};

function voiceDebugEnabled(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('voiceDebug') === '1';
  } catch {
    return false;
  }
}

/**
 * 和 useServerSpeech 一样的开关、嗓音、状态（同一组 localStorage 键），多出：
 *   startReply()  流式回复边到边念；
 *   speakSigned() 一次给齐的签名段（打开朗读开关时补念上一条）；
 *   remember()    记下一条回复的签名段，speak(全文) 时优先按段念；
 *   prime()       在用户手势里解锁播放（点麦克风、点发送、打开朗读时调）。
 * speak(全文) 找不到签名段时走旧 /tts，但也放进同一个播放队列。
 */
export function useStreamingSpeech({ messages }: { messages?: StreamingSpeechMessages } = {}) {
  const storedPref = useSyncExternalStore(
    noopSubscribe,
    () => {
      try {
        return localStorage.getItem(TTS_PREF_KEY) === '1';
      } catch {
        return false;
      }
    },
    () => false,
  );
  const [override, setOverride] = useState<boolean | null>(null);
  const enabled = override ?? storedPref;

  const storedVoice = useSyncExternalStore(
    noopSubscribe,
    () => {
      try {
        return localStorage.getItem(TTS_VOICE_KEY) ?? DEFAULT_VOICE;
      } catch {
        return DEFAULT_VOICE;
      }
    },
    () => DEFAULT_VOICE as string,
  );
  const [voiceOverride, setVoiceOverride] = useState<PhilSpeechVoice | null>(null);
  const voiceId: PhilSpeechVoice =
    voiceOverride ?? (storedVoice === 'female' || storedVoice === 'male' ? storedVoice : DEFAULT_VOICE);
  const voiceIdRef = useRef<PhilSpeechVoice>(voiceId);
  useEffect(() => {
    voiceIdRef.current = voiceId;
  }, [voiceId]);

  const messagesRef = useRef<StreamingSpeechMessages>(messages ?? DEFAULT_MESSAGES);
  useEffect(() => {
    messagesRef.current = messages ?? DEFAULT_MESSAGES;
  }, [messages]);

  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [error, setError] = useState('');

  const engineRef = useRef<SpeechEngine | null>(null);
  const outputRef = useRef<ReturnType<typeof createAudioOutput> | null>(null);
  const rememberedRef = useRef(new Map<string, SignedSentence[]>());

  /** 第一次用到时才建（不在渲染里碰浏览器音频） */
  const getEngine = useCallback((): { engine: SpeechEngine; output: ReturnType<typeof createAudioOutput> } => {
    if (engineRef.current && outputRef.current) return { engine: engineRef.current, output: outputRef.current };
    const debug = voiceDebugEnabled()
      ? (label: string) => console.info('[phil-voice] speak', label)
      : undefined;
    // 播放端的回报先经过这一层：engine 建好之前不会有任何声音，所以这里拿到的一定是它
    const events: SinkEvents = {
      sound: () => engineRef.current?.events.sound(),
      advanced: () => engineRef.current?.events.advanced(),
      drained: () => engineRef.current?.events.drained(),
      blocked: value => setPlaybackBlocked(value),
      playError: () => engineRef.current?.events.playError(),
    };
    const output = createAudioOutput(events, { isBusy: () => engineRef.current?.active ?? false });
    const engine = createSpeechEngine({
      fetchImpl: (url, init) => fetch(url, init),
      pickSink: () => output.pickSink(),
      onChange: state => {
        setLoading(state.loading);
        setSpeaking(state.speaking);
        // 一条念完了：过一小会儿还空闲就挂起播放、把音频会话还给系统（别一直压着用户的音乐）
        if (!state.loading && !state.speaking) output.idleSoon();
      },
      onError: kind => {
        setError(kind === 'playback' ? messagesRef.current.playFailed : messagesRef.current.unavailable);
      },
      debug,
    });
    engineRef.current = engine;
    outputRef.current = output;
    return { engine, output };
  }, []);

  const stop = useCallback(() => {
    const engine = engineRef.current;
    const output = outputRef.current;
    engine?.stop();
    output?.stopAll();
    output?.releaseSession();
    setSpeaking(false);
    setLoading(false);
    setPlaybackBlocked(false);
  }, []);

  useEffect(
    () => () => {
      engineRef.current?.stop();
      outputRef.current?.close();
      engineRef.current = null;
      outputRef.current = null;
    },
    [],
  );

  const prime = useCallback((options?: { unlockOnly?: boolean }) => {
    getEngine().output.prime(options);
  }, [getEngine]);

  const setEnabled = useCallback(
    (v: boolean) => {
      setOverride(v);
      try {
        localStorage.setItem(TTS_PREF_KEY, v ? '1' : '0');
      } catch {
        /* ignore */
      }
      if (v) prime();   // 这一下就是用户手势：趁机解锁播放
      else stop();
    },
    [prime, stop],
  );

  const setVoice = useCallback(
    (id: PhilSpeechVoice) => {
      setVoiceOverride(id);
      try {
        localStorage.setItem(TTS_VOICE_KEY, id);
      } catch {
        /* ignore */
      }
      stop();   // 换嗓音时把上一条掐掉，免得听到一半换了人
    },
    [stop],
  );

  const startReply = useCallback((): ReplySpeech => {
    const { engine } = getEngine();
    setError('');
    setPlaybackBlocked(false);
    const id = engine.start(voiceIdRef.current);
    return {
      enqueue: sentence => engine.add(id, { kind: 'signed', sentence }),
      end: () => engine.end(id),
    };
  }, [getEngine]);

  const speakSigned = useCallback(
    (sentences: SignedSentence[]) => {
      if (!sentences.length) return;
      const reply = startReply();
      for (const sentence of [...sentences].sort((a, b) => a.index - b.index)) reply.enqueue(sentence);
      reply.end();
    },
    [startReply],
  );

  const remember = useCallback((reply: string, sentences: SignedSentence[]) => {
    const key = reply.trim();
    if (!key || !sentences.length) return;
    const map = rememberedRef.current;
    map.delete(key);
    map.set(key, sentences.slice());
    while (map.size > REMEMBER_REPLIES) {
      const oldest = map.keys().next().value;
      if (oldest === undefined) break;
      map.delete(oldest);
    }
  }, []);

  const speak = useCallback(
    (text: string) => {
      const clean = text.replace(/\s+/g, ' ').trim();
      if (!clean) return;
      const signed = rememberedRef.current.get(text.trim());
      if (signed?.length) {
        speakSigned(signed);
        return;
      }
      const { engine } = getEngine();
      setError('');
      setPlaybackBlocked(false);
      const id = engine.start(voiceIdRef.current);
      engine.add(id, { kind: 'text', text: clean.slice(0, LEGACY_TTS_MAX_CHARS) });
      engine.end(id);
    },
    [getEngine, speakSigned],
  );

  const resume = useCallback(() => {
    setError('');
    outputRef.current?.resume();
  }, []);

  return {
    enabled,
    setEnabled,
    voiceId,
    setVoice,
    speaking,
    // 被自动播放拦下时显示的是「点一下就能听」，不再挂着「准备中」（和旧 hook 一样）
    loading: loading && !playbackBlocked,
    playbackBlocked,
    error,
    speak,
    speakSigned,
    startReply,
    remember,
    prime,
    resume,
    stop,
  };
}
