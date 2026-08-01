'use client';

// 服务端语音：录音上传转写（微信也能用）+ 神经网络朗读（不再是播报腔）。
// 与 voice.ts 里的浏览器原生方案互补：这里音质与兼容性更好，代价是要走一次网络。

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { normalizeVoiceAnalysis, type VoiceAnalysis } from '@/lib/philCoachVoice';

export type VoiceInputResult = {
  text: string;
  voiceContext: VoiceAnalysis | null;
};

const MAX_RECORDING_MS = 55_000;
const VOICE_SAMPLE_RATE = 16_000;
const MAX_WAV_BYTES = 1_950_000;
const PARTIAL_MS = 900;         // 字幕刷新间隔：只转新增那一段，所以可以压得很短
const PARTIAL_FIRST_MS = 700;   // 第一次早发，别让人盯着空框等一个完整周期
const PARTIAL_TIMEOUT_MS = 7_000;
const MIN_SEG_S = 0.7;          // 太短的片段容易只有半个音节，先和后面合起来
const MAX_SEG_S = 1.6;          // 一直没停顿也得切，否则字迟迟不出
// 「安静」得相对于当前环境来判断。固定阈值在有底噪的地方永远够不着，
// 于是每一段都只能等 MAX_SEG_S 硬切——那正是手机上「说完还要等三四秒」的来源。
const QUIET_RATIO = 0.22;       // 低于本段峰值的这个比例算停顿
const QUIET_RMS_FLOOR = 0.012;  // 再安静的环境也不至于把气声当成人声
const QUIET_RMS_CEIL = 0.06;    // 再吵也不能把说话本身当成停顿
const RECORDING_TAIL_MS = 300;  // 点完成后给手机录音编码器留住最后几个字
// 边说边纠错：在停顿处把已经攒下的整段顺一遍，而不是逐段顺。
// 逐段不行——纠错靠上下文，单独一个「很平近」的碎片没有判断依据。
const LIVE_POLISH_DEBOUNCE_MS = 1_100;   // 一段转完后再静一会儿才动手，避开连着说的时候
const LIVE_POLISH_MIN_INTERVAL_MS = 3_000;
const LIVE_POLISH_MIN_CHARS = 10;        // 太短没有上下文，纠了也是猜
const LIVE_POLISH_MIN_GROWTH = 7;        // 没新增多少就别重复调用

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

/**
 * 把攒下的裸 PCM 编成 WAV。实时字幕和最终定稿都走这一条。
 * 不用 MediaRecorder 有两个原因：一是它的分段数据截不出中途可解的音频
 * （webm 勉强能拼，iOS 的 mp4 把索引写在结尾，录到一半根本解不开），
 * 二是 iOS Safari 上同一条音轨被它和 AudioContext 同时读时，
 * AudioContext 会被饿死——波形不动、字幕全是静音。裸 PCM 没有容器，
 * 任何时刻都能编出完整 WAV，也让采音口只剩一个。
 */
function encodePcmWav(flat: Float32Array, sampleRate: number): Blob {
  const ratio = sampleRate / VOICE_SAMPLE_RATE;
  const maxSamples = Math.floor((MAX_WAV_BYTES - 44) / 2);
  const outputLength = Math.min(Math.floor(flat.length / ratio), maxSamples);

  const wav = new ArrayBuffer(44 + outputLength * 2);
  const view = new DataView(wav);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + outputLength * 2, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, VOICE_SAMPLE_RATE, true);
  view.setUint32(28, VOICE_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, outputLength * 2, true);

  for (let index = 0; index < outputLength; index += 1) {
    const clamped = Math.max(-1, Math.min(1, flat[Math.floor(index * ratio)] || 0));
    view.setInt16(44 + index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return new Blob([wav], { type: 'audio/wav' });
}

/** 把分片里 [from, to) 这段拍平成一条。逐样本遍历分片会退化成 O(样本数 × 分片数)。 */
function flattenRange(chunks: Float32Array[], from: number, to: number): Float32Array {
  const out = new Float32Array(Math.max(0, to - from));
  let cursor = 0;   // 当前分片起点在全局的下标
  let filled = 0;
  for (const c of chunks) {
    const start = Math.max(from, cursor);
    const end = Math.min(to, cursor + c.length);
    if (end > start) {
      out.set(c.subarray(start - cursor, end - cursor), filled);
      filled += end - start;
    }
    cursor += c.length;
    if (cursor >= to) break;
  }
  return out;
}

/**
 * 在这一段的尾部找一个「安静处」当切点，从后往前找第一个足够静的窗口。
 * 找不到就先不切（返回 null），除非整段已经长到 MAX_SEG_S——
 * 那说明这人一口气说了很久，再等下去就没有「实时」可言了，硬切。
 */
function findQuietCut(flat: Float32Array, rate: number): number | null {
  const minSamples = Math.floor(MIN_SEG_S * rate);
  const win = Math.max(1, Math.floor(0.03 * rate));   // 30ms 一个窗口
  if (flat.length < minSamples + win) return null;

  // 先量一遍这段自己有多响，再定「多安静算停顿」——阈值跟着环境走
  const windows: number[] = [];                        // [0] 是最靠后的窗口
  let peak = 0;
  for (let end = flat.length; end - win >= 0; end -= win) {
    let sum = 0;
    for (let i = end - win; i < end; i += 1) sum += flat[i] * flat[i];
    const value = Math.sqrt(sum / win);
    windows.push(value);
    if (value > peak) peak = value;
  }
  const quiet = Math.min(QUIET_RMS_CEIL, Math.max(QUIET_RMS_FLOOR, peak * QUIET_RATIO));

  for (let index = 0; index < windows.length; index += 1) {
    const end = flat.length - index * win;
    if (end - win < minSamples) break;
    if (windows[index] < quiet) return end;
  }
  return flat.length / rate >= MAX_SEG_S ? flat.length : null;
}

/**
 * 每一段转写都会被补上句末标点，但我们的切点是「一段安静」，
 * 而人说话时句中停顿太常见了——「今天我想和你聊一聊……我将要发生的事」
 * 被切成两段，就成了「聊一聊。」「我将要发生的事。」两句话。
 * 所以接缝处的句末标点一律去掉，真正的断句交给后面的纠错去补。
 */
function trimSeamPunctuation(text: string): string {
  return text.replace(/[。．.!！?？,，、;；]+$/, '');
}

/** 最终识别若明显只少了尾句，保留实时字幕里已经识别出的完整版本。 */
function preferCompleteTranscript(finalText: string, partialText: string): string {
  const finalValue = finalText.trim();
  const partialValue = partialText.trim();
  if (!partialValue) return finalValue;
  if (!finalValue) return partialValue;
  const compact = (value: string) => value.replace(/[\s，。！？、；：,.!?;:]/g, '');
  const finalCompact = compact(finalValue);
  const partialCompact = compact(partialValue);
  return partialCompact.startsWith(finalCompact) && partialCompact.length > finalCompact.length
    ? partialValue
    : finalValue;
}

const noopSubscribe = () => () => {};
function useClientFlag(probe: () => boolean): boolean {
  return useSyncExternalStore(noopSubscribe, probe, () => false);
}

/**
 * 按一下开始说，再按一下结束 → 上传转写 → 文字回填输入框。
 * 走服务端，所以微信里也能用（只要能拿到麦克风）。
 */
export function useServerSpeechInput(onResult: (result: VoiceInputResult) => void) {
  const supported = useClientFlag(
    () =>
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      // 采音改走 Web Audio，所以看的是它有没有，而不是 MediaRecorder
      typeof window !== 'undefined' &&
      Boolean(
        window.AudioContext ||
          (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext,
      ),
  );
  const [requesting, setRequesting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState('');
  /** 停止时要跑的收口逻辑（闭包住这一轮的 generation 与 options） */
  const finalizeRef = useRef<(() => Promise<void>) | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const busyRef = useRef(false);
  const onResultRef = useRef(onResult);
  // 实时音量（0~1）：让人看见自己的声音，录音才不像对着黑盒说话
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const startedAtRef = useRef(0);
  // 实时字幕（服务端分段转写）：iOS Safari 与微信里没有 Web Speech，
  // 只能靠这条路把字送进输入框
  const [partial, setPartial] = useState('');
  const pcmRef = useRef<Float32Array[]>([]);
  const pcmRateRef = useRef(0);
  const tapRef = useRef<ScriptProcessorNode | null>(null);
  const partialTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const partialFirstRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const partialBusyRef = useRef(false);
  const partialRequestRef = useRef<AbortController | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const genRef = useRef(0);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppingRef = useRef(false);
  // 已经转完并接进字幕的进度：文字 + 已消费到第几个样本
  const committedRef = useRef({ text: '', samples: 0 });
  const polishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const polishRequestRef = useRef<AbortController | null>(null);
  const polishBusyRef = useRef(false);
  const polishedRef = useRef({ length: 0, at: 0 });
  // 只有听写才边说边纠：直达最后要整段重转，纠字幕纯属白花钱
  const livePolishRef = useRef(false);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  const stopMeter = useCallback(() => {
    if (partialTimerRef.current) {
      clearInterval(partialTimerRef.current);
      partialTimerRef.current = null;
    }
    if (partialFirstRef.current) {
      clearTimeout(partialFirstRef.current);
      partialFirstRef.current = null;
    }
    if (finishTimerRef.current) {
      clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
    if (polishTimerRef.current) {
      clearTimeout(polishTimerRef.current);
      polishTimerRef.current = null;
    }
    partialRequestRef.current?.abort();
    partialRequestRef.current = null;
    polishRequestRef.current?.abort();
    polishRequestRef.current = null;
    polishBusyRef.current = false;
    polishedRef.current = { length: 0, at: 0 };
    try {
      tapRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    tapRef.current = null;
    pcmRef.current = [];
    committedRef.current = { text: '', samples: 0 };
    partialBusyRef.current = false;
    stoppingRef.current = false;
    try {
      void audioCtxRef.current?.close();
    } catch {
      /* ignore */
    }
    audioCtxRef.current = null;
    setLevel(0);
    setElapsed(0);
  }, []);

  /**
   * 停顿时把已经攒下的字幕整段顺一遍：同音错字、切点补出来的假句号，
   * 在你还在想下一句的时候就已经改好了，不必等到点完停止才一次性整理。
   *
   * 顺的是「整段」而不是「刚转好的那一段」——纠错全靠上下文，
   * 「很平近」单独拿出来没法判断，接在整句里才知道是「平静」。
   */
  const runLivePolish = useCallback(async (generation: number) => {
    if (polishBusyRef.current) return;
    const before = committedRef.current.text;
    if (before.length < LIVE_POLISH_MIN_CHARS) return;
    if (before.length - polishedRef.current.length < LIVE_POLISH_MIN_GROWTH) return;

    polishBusyRef.current = true;
    const controller = new AbortController();
    polishRequestRef.current = controller;
    try {
      const res = await fetch('/api/phil-coach/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: before }),
        signal: controller.signal,
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (generationRef.current !== generation) return;
      polishedRef.current = { length: before.length, at: Date.now() };
      if (!res.ok || typeof json.text !== 'string' || !json.changed) return;
      // 等结果的这段时间里可能又转好了新的一段，把它接回去
      const now = committedRef.current.text;
      if (!now.startsWith(before)) return;
      // 顺的是「说到一半」的话，模型会顺手补个句号收尾——留着它，
      // 下一段接上来就又成了假的句子边界。真正的收尾标点等停止后那一次再补。
      const merged = `${trimSeamPunctuation(json.text.trim())}${now.slice(before.length)}`;
      committedRef.current = { ...committedRef.current, text: merged };
      polishedRef.current = { length: merged.length, at: Date.now() };
      setPartial(merged);
    } catch {
      /* 顺不动就还是原文，字幕本身没坏 */
      polishedRef.current = { length: before.length, at: Date.now() };
    } finally {
      if (polishRequestRef.current === controller) polishRequestRef.current = null;
      polishBusyRef.current = false;
    }
  }, []);

  const scheduleLivePolish = useCallback(
    (generation: number) => {
      if (!livePolishRef.current) return;
      if (polishTimerRef.current) clearTimeout(polishTimerRef.current);
      const since = Date.now() - polishedRef.current.at;
      const wait = Math.max(LIVE_POLISH_DEBOUNCE_MS, LIVE_POLISH_MIN_INTERVAL_MS - since);
      polishTimerRef.current = setTimeout(() => {
        polishTimerRef.current = null;
        if (generationRef.current !== generation) return;
        void runLivePolish(generation);
      }, wait);
    },
    [runLivePolish],
  );

  /**
   * 只把「还没转过的那一段」送去转写，转好就接在已定的字幕后面。
   * 早先是每次重转整段音频：录得越久每次越慢越贵，间隔只能放到 2.5 秒，
   * 字就总是一大块一大块地跳出来。改成增量之后每次请求恒定地小，
   * 间隔可以压到 1.2 秒，说一句出一句。
   *
   * 切点一定要落在停顿上——从词中间切开，两半都会转错。
   * 找不到停顿就先不切，等到 MAX_SEG_S 再硬切（总不能一直不出字）。
   */
  const pushPartial = useCallback(async (generation: number) => {
    if (partialBusyRef.current) return;      // 上一次还没回来就跳过这一轮
    const chunks = pcmRef.current;
    const rate = pcmRateRef.current;
    if (!rate || !chunks.length) return;

    const total = chunks.reduce((n, c) => n + c.length, 0);
    const from = committedRef.current.samples;
    const tail = total - from;
    if (tail / rate < MIN_SEG_S) return;     // 太短转不出东西，白花一次请求

    const flat = flattenRange(chunks, from, total);
    const cut = findQuietCut(flat, rate);
    if (cut === null) return;                // 还没到停顿、也没到硬切长度

    partialBusyRef.current = true;
    const controller = new AbortController();
    partialRequestRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), PARTIAL_TIMEOUT_MS);
    try {
      const fd = new FormData();
      fd.append('audio', encodePcmWav(flat.subarray(0, cut), rate), 'partial.wav');
      fd.append('partial', '1');
      const res = await fetch('/api/phil-coach/voice', {
        method: 'POST',
        body: fd,
        signal: controller.signal,
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (generationRef.current !== generation) return;
      if (res.ok && typeof json.text === 'string') {
        // 接缝处的句末标点是转写补的，不代表这句说完了——去掉才接得上下一句
        const piece = trimSeamPunctuation(json.text.trim());
        // 空结果不能把这段音频消费掉。把它和下一小段一起重试，避免永久缺词。
        if (piece) {
          committedRef.current = {
            text: `${committedRef.current.text}${piece}`,
            samples: from + cut,
          };
          setPartial(committedRef.current.text);
          scheduleLivePolish(generation);
        }
      }
    } catch {
      /* 字幕是锦上添花，掉了就掉了 */
    } finally {
      clearTimeout(timeout);
      if (partialRequestRef.current === controller) partialRequestRef.current = null;
      partialBusyRef.current = false;
    }
  }, [scheduleLivePolish]);

  /** 起转写定时器：第一次早一点发，之后按固定间隔。 */
  const beginPartials = useCallback(
    (generation: number) => {
      if (partialTimerRef.current) return;
      // 第一次早一点发：等满一个完整周期再加上网络往返，
      // 人要盯着空框好几秒才看见第一个字，那就不像「实时」了。
      partialFirstRef.current = setTimeout(() => {
        void pushPartial(generation);
      }, PARTIAL_FIRST_MS);
      partialTimerRef.current = setInterval(() => {
        void pushPartial(generation);
      }, PARTIAL_MS);
    },
    [pushPartial],
  );

  const startMeter = useCallback((stream: MediaStream, withPartials: boolean, generation: number) => {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      // iOS 上就算在手势里建好，拿到麦克风这一等也可能把它挂起；再推一次
      if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      startedAtRef.current = Date.now();
      pcmRef.current = [];
      pcmRateRef.current = ctx.sampleRate;
      committedRef.current = { text: '', samples: 0 };

      const tap = ctx.createScriptProcessor(4096, 1, 1);
      // 音量表和录音都从这一个回调出：
      // 早先电平表挂在 requestAnimationFrame 上，可页面一进后台、iOS 上键盘弹起
      // 或手指在滚动时，rAF 都会被节流甚至停掉——波形就直挺挺躺在那儿，
      // 让人以为没录上。音频回调走的是音频线程，只要有声音进来就会响。
      tap.onaudioprocess = e => {
        const data = e.inputBuffer.getChannelData(0);
        pcmRef.current.push(new Float32Array(data));
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length);
        // 放大到易感知的范围，并留一点底噪门限
        setLevel(Math.min(1, Math.max(0, (rms - 0.01) * 6)));
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
      };
      const mute = ctx.createGain();
      mute.gain.value = 0;              // 不静音就会把麦克风原样播出来
      source.connect(tap);
      tap.connect(mute);
      mute.connect(ctx.destination);    // ScriptProcessor 不接终点不会跑
      tapRef.current = tap;
      genRef.current = generation;
      if (withPartials) beginPartials(generation);
    } catch {
      /* 没有音量表也不影响录音 */
    }
  }, [beginPartials]);

  /**
   * 中途补启分段转写。
   * 给 Web Speech 兜底用：先让浏览器听写试，几秒内没出字（iOS 上它会和
   * MediaRecorder 抢麦、悄悄什么都不给）就调这个接上，PCM 一直在攒，
   * 所以字幕从头开始而不是从半截。
   */
  const armPartials = useCallback(() => {
    if (partialTimerRef.current || !pcmRateRef.current) return;
    beginPartials(genRef.current);
  }, [beginPartials]);

  const cleanup = useCallback(() => {
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    stopMeter();
    try {
      streamRef.current?.getTracks().forEach(t => t.stop());
    } catch {
      /* ignore */
    }
    streamRef.current = null;
  }, [stopMeter]);

  /**
   * 手机点下「完成」时，声音与编码数据还会晚几十到几百毫秒抵达。
   * 先立即切到整理状态，再给尾音一个很短的缓冲，最后主动冲出编码数据。
   */
  const requestStop = useCallback((tailMs = RECORDING_TAIL_MS) => {
    if (!finalizeRef.current || stoppingRef.current) return;
    stoppingRef.current = true;
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    setRecording(false);
    setTranscribing(true);
    // 手机点下「完成」时，最后一点声音还在路上，等一小会儿再收口
    finishTimerRef.current = setTimeout(() => {
      finishTimerRef.current = null;
      const finalize = finalizeRef.current;
      finalizeRef.current = null;
      void finalize?.();
    }, Math.max(0, tailMs));
  }, []);

  const cancel = useCallback(() => {
    generationRef.current += 1;
    busyRef.current = false;
    requestRef.current?.abort();
    requestRef.current = null;
    finalizeRef.current = null;
    cleanup();
    setRequesting(false);
    setRecording(false);
    setTranscribing(false);
  }, [cleanup]);

  useEffect(() => cancel, [cancel]);

  const start = useCallback(async (options?: { partials?: boolean; analysis?: boolean }) => {
    if (busyRef.current) return;
    busyRef.current = true;
    stoppingRef.current = false;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setError('');
    setPartial('');
    setRequesting(true);
    // AudioContext 必须在这里同步建起来：等 getUserMedia 回来就脱离了用户手势，
    // iOS Safari / 微信会给一个 suspended 的上下文——分析器读不到数据（波形一直是
    // 静止的圆点），ScriptProcessor 也不触发（攒不到 PCM，实时字幕永远发不出去）。
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        audioCtxRef.current = ctx;
        void ctx.resume().catch(() => undefined);
      }
    } catch {
      /* 没有音量表和字幕也不影响录音 */
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (generationRef.current !== generation) {
        stream.getTracks().forEach(track => track.stop());
        stopMeter();   // 上面提前建好的 AudioContext 要收掉，别泄漏
        return;
      }
      setRequesting(false);
      streamRef.current = stream;
      livePolishRef.current = options?.analysis === false;
      startMeter(stream, options?.partials !== false, generation);
      // 只用 Web Audio 采音，不再挂 MediaRecorder。
      // iOS Safari 上同一条音轨被两个消费者同时读时，AudioContext 会被饿死——
      // 表现就是波形全程静止、实时字幕拿到的全是静音，而 MediaRecorder 那边一切正常。
      // 定稿本来就已经优先用这份 PCM，索性让它成为唯一的采音口：
      // 顺带省掉停止后的 decode，也不再有 iOS mp4「索引写在结尾」的麻烦。
      finalizeRef.current = async () => {
        const pcmChunks = pcmRef.current.slice();
        const pcmRate = pcmRateRef.current;
        const pcmSamples = pcmChunks.reduce((total, chunk) => total + chunk.length, 0);
        const partialTextAtStop = committedRef.current.text;
        const committedSamples = committedRef.current.samples;
        // 听写：字幕已经把前面绝大部分转完了，收口时只补最后那一小段没转的，
        // 不必把整段重转一遍——那正是「点完停止还要干等」的来源。
        // 直达不走这条：那段话要直接发出去，且语气观察需要完整音频。
        const tailOnly = options?.analysis === false && !!partialTextAtStop && pcmRate > 0;
        const uploadFlat = pcmRate
          ? flattenRange(pcmChunks, tailOnly ? committedSamples : 0, pcmSamples)
          : new Float32Array(0);
        const enoughAudio = uploadFlat.length > pcmRate / 4;
        const pcmBlob = enoughAudio ? encodePcmWav(uploadFlat, pcmRate) : null;
        cleanup();
        if (generationRef.current !== generation) return;
        // 尾巴短到没东西可转：字幕本身就是结果，一个字都不用等
        if (tailOnly && !pcmBlob) {
          setPartial('');
          onResultRef.current({ text: partialTextAtStop, voiceContext: null });
          setTranscribing(false);
          busyRef.current = false;
          return;
        }
        if (!pcmBlob || pcmBlob.size < 1200) {
          setError('好像没录到声音，再说一次试试。');
          setTranscribing(false);
          busyRef.current = false;
          return;
        }
        setTranscribing(true);
        let controller: AbortController | null = null;
        try {
          const fd = new FormData();
          fd.append('audio', pcmBlob, 'speech.wav');
          fd.append('analysis', options?.analysis === false ? '0' : '1');
          // 补尾走轻量转写：不做语气观察，也不占正式配额
          if (tailOnly) fd.append('partial', '1');
          controller = new AbortController();
          requestRef.current = controller;
          const res = await fetch('/api/phil-coach/voice', {
            method: 'POST',
            body: fd,
            signal: controller.signal,
          });
          const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          if (generationRef.current !== generation) return;
          if (!res.ok || typeof json.text !== 'string') {
            if (partialTextAtStop && options?.analysis === false) {
              setPartial('');
              onResultRef.current({ text: partialTextAtStop, voiceContext: null });
              setError('最后一句没能听清，先留着刚才听到的，改完再发也行。');
            } else {
              setError(
                json.error === 'too-many'
                  ? '说得有点频繁，歇一会儿再试。'
                  : '这段没能转成文字，可以直接打字，或再说一次。',
              );
            }
          } else {
            const text = tailOnly
              // 只转了尾巴，接在字幕后面就是完整的一段
              ? `${partialTextAtStop}${json.text.trim()}`.trim()
              : options?.analysis === false
                ? preferCompleteTranscript(json.text, partialTextAtStop)
                : json.text.trim();
            const voiceContext = normalizeVoiceAnalysis(json.voiceContext);
            setPartial('');
            onResultRef.current({
              text,
              voiceContext: voiceContext ? { ...voiceContext, transcript: text } : null,
            });
          }
        } catch {
          if (generationRef.current === generation) {
            if (partialTextAtStop && options?.analysis === false) {
              setPartial('');
              onResultRef.current({ text: partialTextAtStop, voiceContext: null });
              setError('网络不太顺，先留着刚才听到的，改完再发也行。');
            } else {
              setError('网络不太顺，这段没送出去。');
            }
          }
        } finally {
          if (requestRef.current === controller) requestRef.current = null;
          if (generationRef.current === generation) {
            busyRef.current = false;
            setTranscribing(false);
          }
        }
      };
      setRecording(true);
      maxTimerRef.current = setTimeout(() => {
        requestStop(0);
      }, MAX_RECORDING_MS);
    } catch (e) {
      if (generationRef.current !== generation) return;
      const name = (e as { name?: string })?.name || '';
      const inWeChat = /MicroMessenger/i.test(navigator.userAgent);
      setError(
        name === 'NotAllowedError'
          ? inWeChat
            ? '微信没有开放麦克风。请点右上角「…」，选择在浏览器打开后再允许麦克风。'
            : '没有拿到麦克风权限。允许之后就可以对它说话了。'
          : '这个环境暂时用不了麦克风，可以先打字。',
      );
      cleanup();
      busyRef.current = false;
      setRequesting(false);
      setRecording(false);
    }
  }, [cleanup, requestStop, startMeter, stopMeter]);

  const stop = useCallback(() => {
    requestStop();
  }, [requestStop]);

  const toggle = useCallback(() => {
    if (recording) stop();
    else void start();
  }, [recording, start, stop]);

  return {
    supported, requesting, recording, transcribing, error,
    level, elapsed, partial, armPartials,
    start, stop, toggle, cancel,
  };
}

const TTS_PREF_KEY = 'nf_phil_read_aloud';
const TTS_VOICE_KEY = 'nf_phil_tts_voice';

/** 可选的嗓音。键名要和 /api/phil-coach/tts 里的白名单对上。 */
export const PHIL_COACH_VOICES = [
  { id: 'phil', label: 'phil-coach' },
  { id: 'anna', label: 'anna' },
] as const;
export type PhilVoiceId = (typeof PHIL_COACH_VOICES)[number]['id'];
const DEFAULT_VOICE_ID: PhilVoiceId = 'phil';

/** 让 phil-coach 的回复用自然的嗓音读出来（服务端神经网络合成） */
export function useServerSpeech() {
  const storedPref = useClientFlag(() => {
    try {
      return localStorage.getItem(TTS_PREF_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [override, setOverride] = useState<boolean | null>(null);
  const enabled = override ?? storedPref;

  const storedVoice = useSyncExternalStore(
    noopSubscribe,
    () => {
      try {
        return localStorage.getItem(TTS_VOICE_KEY) ?? DEFAULT_VOICE_ID;
      } catch {
        return DEFAULT_VOICE_ID;
      }
    },
    () => DEFAULT_VOICE_ID as string,
  );
  const [voiceOverride, setVoiceOverride] = useState<PhilVoiceId | null>(null);
  const voiceId: PhilVoiceId =
    voiceOverride ??
    (PHIL_COACH_VOICES.some(v => v.id === storedVoice) ? (storedVoice as PhilVoiceId) : DEFAULT_VOICE_ID);
  const voiceIdRef = useRef<PhilVoiceId>(voiceId);
  useEffect(() => {
    voiceIdRef.current = voiceId;
  }, [voiceId]);
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [error, setError] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string>('');
  const tokenRef = useRef<symbol | null>(null);

  const stop = useCallback(() => {
    tokenRef.current = null;
    try {
      audioRef.current?.pause();
    } catch {
      /* ignore */
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = '';
    }
    setSpeaking(false);
    setLoading(false);
    setPlaybackBlocked(false);
  }, []);

  useEffect(() => stop, [stop]);

  const setEnabled = useCallback(
    (v: boolean) => {
      setOverride(v);
      try {
        localStorage.setItem(TTS_PREF_KEY, v ? '1' : '0');
      } catch {
        /* ignore */
      }
      if (!v) stop();
    },
    [stop],
  );

  const setVoice = useCallback(
    (id: PhilVoiceId) => {
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

  const speak = useCallback(
    async (text: string) => {
      const clean = text.replace(/\s+/g, ' ').trim();
      if (!clean) return;
      const token = Symbol('tts');
      tokenRef.current = token;
      stop();
      tokenRef.current = token;      // stop 会清掉，重新标记
      setError('');
      setLoading(true);
      try {
        const res = await fetch('/api/phil-coach/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: clean, voice: voiceIdRef.current }),
        });
        if (!res.ok) throw new Error('tts');
        const blob = await res.blob();
        if (tokenRef.current !== token) return;   // 期间被取消
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          if (tokenRef.current === token) {
            setSpeaking(false);
            setPlaybackBlocked(false);
          }
        };
        audio.onerror = () => {
          if (tokenRef.current === token) {
            setSpeaking(false);
            setPlaybackBlocked(false);
            setError('这段声音没能播放，可以稍后再试。');
          }
        };
        try {
          await audio.play();
          if (tokenRef.current === token) setSpeaking(true);
        } catch {
          if (tokenRef.current === token) {
            setSpeaking(false);
            setPlaybackBlocked(true);
          }
        }
      } catch {
        if (tokenRef.current === token) {
          setSpeaking(false);
          setError('声音暂时没有准备好，可以稍后再试。');
        }
      } finally {
        if (tokenRef.current === token) setLoading(false);
      }
    },
    [stop],
  );

  const resume = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setError('');
    setPlaybackBlocked(false);
    void audio.play().then(
      () => setSpeaking(true),
      () => {
        setSpeaking(false);
        setPlaybackBlocked(true);
      },
    );
  }, []);

  return {
    enabled,
    setEnabled,
    voiceId,
    setVoice,
    speaking,
    loading,
    playbackBlocked,
    error,
    speak,
    resume,
    stop,
  };
}
