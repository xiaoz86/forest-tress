'use client';

// 服务端语音：录音上传转写（微信也能用）+ 神经网络朗读（不再是播报腔）。
// 与 voice.ts 里的浏览器原生方案互补：这里音质与兼容性更好，代价是要走一次网络。

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { normalizeVoiceAnalysis, type VoiceAnalysis } from '@/lib/philCoachVoice';
import {
  chooseCompleteTranscript,
  mergeIncrementalTranscript,
  normalizeAsrTranscript,
} from '@/lib/voiceTranscript';

export type VoiceInputResult = {
  text: string;
  voiceContext: VoiceAnalysis | null;
  /** 最终整段转写失败，只能把实时字幕放回输入框请用户确认，不能直接发送。 */
  needsReview?: boolean;
};

const MAX_RECORDING_MS = 55_000;
const VOICE_SAMPLE_RATE = 16_000;
const MAX_WAV_BYTES = 1_950_000;
const PARTIAL_MS = 600;         // 派发间隔。请求是重叠的，所以可以比一次往返短得多
const PARTIAL_FIRST_MS = 700;   // 第一次早发，别让人盯着空框等一个完整周期
const PARTIAL_TIMEOUT_MS = 7_000;
// 这条链路每次请求固定要一两秒，且与音频长短无关。请求重叠发出后，
// 滞后仍是一次往返，但后续短语会持续接上，不必等上一段返回才发下一段。
const MAX_INFLIGHT_PARTIALS = 3;
const MIN_SEG_S = 0.9;          // 太短的片段缺上下文，容易漂成日文或同音错词
const MAX_SEG_S = 2.2;          // 连续说话时稍多留上下文，最终仍由整段录音校准
const PARTIAL_OVERLAP_S = 0.3;  // 保留词边界，文字合并时再去重
const QUIET_WINDOWS_REQUIRED = 4; // 至少 120ms 持续安静才算停顿，30ms 毛刺不能切句
// 「安静」得相对于当前环境来判断。固定阈值在有底噪的地方永远够不着，
// 于是每一段都只能等 MAX_SEG_S 硬切——那正是手机上「说完还要等三四秒」的来源。
const QUIET_RATIO = 0.22;       // 低于本段峰值的这个比例算停顿
const QUIET_RMS_FLOOR = 0.012;  // 再安静的环境也不至于把气声当成人声
const QUIET_RMS_CEIL = 0.06;    // 再吵也不能把说话本身当成停顿
const RECORDING_TAIL_MS = 300;
const MIC_PREF_KEY = 'nf_mic_device';
// 回环/虚拟声卡录的是「电脑正在播放的声音」，不是人说的话。
// 没在放音时它一片静音；一旦开着朗读，它就把 phil-coach 自己的话录回输入框。
// 系统默认输入被这类设备占掉很常见（装了投屏、降噪、录屏、虚拟调音台都会）。
const VIRTUAL_MIC = /virtual|cast|loopback|blackhole|soundflower|obs|krisp|voicemeeter|aggregate|stereo mix|立体声混音|虚拟/i;
// 采音约束。指定 deviceId 时一并写清楚，别依赖各家的默认值——
// 回声消除关掉的话，外放时朗读声会被录回去。
const AUDIO_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
} as const;
const SILENT_MIC_RMS = 0.004;   // 整段最高电平低于这个，就不是「说得轻」，是根本没进来声音  // 点完成后给手机录音编码器留住最后几个字
// 纠错只在停止后做一次，对着整段。逐段纠不行——纠错靠上下文，
// 单独一个「很平近」的碎片没有判断依据。实测这一步 0.5–1.4 秒，压在整段转写（约 0.8 秒）后面，
// 合计不到两秒——比边说边纠时「字出来了又跳变」好受得多。
const FINAL_POLISH_MIN_CHARS = 10;       // 太短没有上下文，纠了也是猜
const FINAL_POLISH_TIMEOUT_MS = 4_000;   // 超时就用原文，绝不让它拖住已经转好的话

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
    // 下采样前做一个轻量盒式低通，不再直接隔几个点抽一个点；后者会把高频混叠
    // 到人声频段，尤其容易伤到中文辅音。
    const from = Math.floor(index * ratio);
    const to = Math.max(from + 1, Math.min(flat.length, Math.floor((index + 1) * ratio)));
    let sum = 0;
    for (let sample = from; sample < to; sample += 1) sum += flat[sample] || 0;
    const clamped = Math.max(-1, Math.min(1, sum / Math.max(1, to - from)));
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

  let quietRun = 0;
  for (let index = 0; index < windows.length; index += 1) {
    const end = flat.length - index * win;
    if (end - win < minSamples) break;
    quietRun = windows[index] < quiet ? quietRun + 1 : 0;
    if (quietRun >= QUIET_WINDOWS_REQUIRED) {
      const newestQuietIndex = index - QUIET_WINDOWS_REQUIRED + 1;
      return flat.length - newestQuietIndex * win;
    }
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

/**
 * 当前拿到的是回环/虚拟声卡时，找一个真麦克风换上。
 * 设备名要有麦克风权限才可见，所以只能拿到流之后再判断。
 */
async function findRealMic(stream: MediaStream): Promise<string | null> {
  const label = stream.getAudioTracks()[0]?.label || '';
  if (!label || !VIRTUAL_MIC.test(label)) return null;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const real = devices.find(
      d => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default'
        && d.label && !VIRTUAL_MIC.test(d.label),
    );
    return real?.deviceId || null;
  } catch {
    return null;
  }
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
  const partialControllersRef = useRef(new Set<AbortController>());
  const partialsClosedRef = useRef(true);
  const inflightRef = useRef(new Set<Promise<void>>());
  // 流水线的账本：派发到第几个样本、下一个序号、该接第几号、以及乱序到货的结果
  const dispatchedRef = useRef(0);
  const seqRef = useRef(0);
  const commitSeqRef = useRef(0);
  const pendingRef = useRef(new Map<number, { raw: string; end: number }>());
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const genRef = useRef(0);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppingRef = useRef(false);
  /** 浏览器实时听写已经显示出的文字；完整录音失败时也不能把它弄丢。 */
  const stopFallbackRef = useRef('');
  // 已经转完并接进字幕的进度：文字 + 已消费到第几个样本
  const committedRef = useRef({ text: '', samples: 0 });
  const polishRequestRef = useRef<AbortController | null>(null);
  // 整段录音里的最高电平 + 正在用的设备名。
  // 「一路静音」是很常见的真实故障（选错输入设备、被别的应用独占、
  // 虚拟声卡没在工作），而它和「说了但没转出字」在结果上长得一模一样——
  // 不区分开，就只能给人一句没法照着做的「没能转成文字」。
  const peakLevelRef = useRef(0);
  const micLabelRef = useRef('');
  // 记住上次选中的输入设备。虚拟声卡（Cast、Krisp、Loopback、OBS…）
  // 抢默认输入很常见，抢到了就是一路静音——让人自己挑一次，然后记住。
  const preferredDeviceRef = useRef<string>('');
  const [inputDevices, setInputDevices] = useState<{ id: string; label: string }[]>([]);
  // 听写模式（直达发送的那颗按钮不需要纠错——它整段重转完就直接送走）
  const dictationRef = useRef(false);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    try {
      preferredDeviceRef.current = localStorage.getItem(MIC_PREF_KEY) || '';
    } catch {
      /* 无痕模式下读不到，用默认设备就是了 */
    }
  }, []);

  /** 列出可选的输入设备。设备名要拿到麦克风权限之后才可见，所以只在出问题时才列。 */
  const listInputDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setInputDevices(
        all
          .filter(d => d.kind === 'audioinput' && d.deviceId)
          .map(d => ({ id: d.deviceId, label: d.label || '未命名设备' })),
      );
    } catch {
      setInputDevices([]);
    }
  }, []);

  const chooseInputDevice = useCallback((id: string) => {
    preferredDeviceRef.current = id;
    try {
      localStorage.setItem(MIC_PREF_KEY, id);
    } catch {
      /* 记不住就下次再选一遍 */
    }
    setError('');
    setInputDevices([]);
  }, []);

  /** 整段录音的最高电平都没过底噪：麦克风一路都是静的。 */
  const silentMic = useCallback(() => peakLevelRef.current < SILENT_MIC_RMS, []);
  const micHint = useCallback(() => {
    void listInputDevices();
    const label = micLabelRef.current;
    return label
      ? `全程没有听到声音——「${label}」这个设备没有把声音送进来。换一个试试：`
      : '全程没有听到声音。换一个输入设备试试：';
  }, [listInputDevices]);

  /** 清空流水线账本。收口时要晚一步做——字幕得先被读走。 */
  const resetPartialState = useCallback(() => {
    pendingRef.current.clear();
    inflightRef.current.clear();
    seqRef.current = 0;
    commitSeqRef.current = 0;
    dispatchedRef.current = 0;
    committedRef.current = { text: '', samples: 0 };
  }, []);

  const stopMeter = useCallback(() => {
    partialsClosedRef.current = true;      // 不再派发新的分段
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
    partialControllersRef.current.forEach(c => c.abort());
    partialControllersRef.current.clear();
    resetPartialState();
    polishRequestRef.current?.abort();
    polishRequestRef.current = null;
    try {
      tapRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    tapRef.current = null;
    pcmRef.current = [];
    stoppingRef.current = false;
    try {
      void audioCtxRef.current?.close();
    } catch {
      /* ignore */
    }
    audioCtxRef.current = null;
    setLevel(0);
    setElapsed(0);
  }, [resetPartialState]);

  /**
   * 停止后把整段文字顺一遍：同音错字、切点补出来的假句号，一次性改好。
   *
   * 原来是边说边纠（防抖 1.1 秒、最短间隔 3 秒）。实测下来那样更难受：
   * 字先出来，三五秒后又跳变一次，人正看着它读，它自己变了。
   * 现在实时只出分片原文（快、稳、不跳字），纠错只在收口时做这一次。
   *
   * 顺的是「整段」而不是某一片——纠错全靠上下文，「很平近」单独拿出来
   * 没法判断，接在整句里才知道是「平静」。
   *
   * 顺不动就返回原文：这一步是锦上添花，不能因为它把已经转好的话弄丢。
   */
  const polishFinalText = useCallback(
    async (text: string, generation: number): Promise<string> => {
      if (text.length < FINAL_POLISH_MIN_CHARS) return text;
      const controller = new AbortController();
      polishRequestRef.current = controller;
      const timeout = setTimeout(() => controller.abort(), FINAL_POLISH_TIMEOUT_MS);
      try {
        const res = await fetch('/api/phil-coach/polish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (generationRef.current !== generation) return text;
        if (!res.ok || typeof json.text !== 'string' || !json.changed) return text;
        /*
          纠错回来的文字也要过一遍语种检查。
          分片和整段转写都会挡日文，唯独这里曾经是「模型返回什么就写什么」——
          只要它某次改了别的字、把假名留在结果里回来，假名就直接进输入框。
        */
        const reviewed = normalizeAsrTranscript(json.text.trim());
        if (!reviewed.text || reviewed.suspiciousLanguage) return text;
        return reviewed.text;
      } catch {
        return text;
      } finally {
        clearTimeout(timeout);
        if (polishRequestRef.current === controller) polishRequestRef.current = null;
      }
    },
    [],
  );

  /**
   * 一段音频转成文字。失败重试一次——流水线里丢掉一段就是永久缺词，
   * 而重试的代价只是这一小段晚到，后面的段还在自己的路上飞。
   */
  const transcribeSegment = useCallback(
    async (blob: Blob, generation: number, attempt = 0): Promise<string> => {
      const controller = new AbortController();
      partialControllersRef.current.add(controller);
      const timeout = setTimeout(() => controller.abort(), PARTIAL_TIMEOUT_MS);
      try {
        const fd = new FormData();
        fd.append('audio', blob, 'partial.wav');
        fd.append('partial', '1');
        const res = await fetch('/api/phil-coach/voice', {
          method: 'POST',
          body: fd,
          signal: controller.signal,
        });
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (res.ok && typeof json.text === 'string') return json.text.trim();
        if (res.status === 422) return '';        // 这一小段本来就是静音，重试也还是空的
        throw new Error('partial-failed');
      } catch {
        if (attempt === 0 && !partialsClosedRef.current && generationRef.current === generation) {
          return transcribeSegment(blob, generation, 1);
        }
        return '';
      } finally {
        clearTimeout(timeout);
        partialControllersRef.current.delete(controller);
      }
    },
    [],
  );

  /**
   * 按派发顺序把结果接进字幕。
   * 请求是重叠发出的，回来的顺序不一定和说话顺序一致；
   * 谁先到就先拼，话会被打乱，所以先攒着，轮到谁才接谁。
   */
  const drainPending = useCallback(
    () => {
      let grew = false;
      for (;;) {
        const entry = pendingRef.current.get(commitSeqRef.current);
        if (!entry) break;
        pendingRef.current.delete(commitSeqRef.current);
        commitSeqRef.current += 1;
        if (entry.raw) {
          committedRef.current = {
            // 接缝处的句末标点是转写补的，不代表这句说完了——去掉才接得上下一句
            text: mergeIncrementalTranscript(
              committedRef.current.text,
              trimSeamPunctuation(entry.raw),
            ),
            samples: entry.end,
          };
          grew = true;
        } else {
          // 空结果（静音，或两次都没转出来）只推进进度，不动文字
          committedRef.current = { ...committedRef.current, samples: entry.end };
        }
      }
      // 实时只出分片原文，不纠错——纠错留到停止时对整段做一次。
      // 边说边纠会让已经出来的字在三五秒后自己跳变，比不纠更难受。
      if (grew) setPartial(committedRef.current.text);
    },
    [],
  );

  /**
   * 把「还没派发过的那一段」送去转写，不等上一段回来。
   *
   * 这条链路每次请求固定要一两秒，且与音频长短无关——
   * 所以「把音频切得更短」并不会让字更快出现，能改善的只有出字的密度。
   * 重叠发出之后，滞后仍是一次往返，但每 0.7 秒就能接上一段。
   *
   * 切点一定要落在停顿上——从词中间切开，两半都会转错。
   * 找不到停顿就先不切，等到 MAX_SEG_S 再硬切（总不能一直不出字）。
   */
  const pushPartial = useCallback(
    (generation: number) => {
      if (partialsClosedRef.current) return;
      if (inflightRef.current.size >= MAX_INFLIGHT_PARTIALS) return;
      const chunks = pcmRef.current;
      const rate = pcmRateRef.current;
      if (!rate || !chunks.length) return;

      const total = chunks.reduce((n, c) => n + c.length, 0);
      const from = dispatchedRef.current;
      if ((total - from) / rate < MIN_SEG_S) return;   // 太短转不出东西，白花一次请求

      const fresh = flattenRange(chunks, from, total);
      const cut = findQuietCut(fresh, rate);
      if (cut === null) return;                        // 还没到停顿、也没到硬切长度

      const seq = seqRef.current;
      seqRef.current += 1;
      const end = from + cut;
      dispatchedRef.current = end;
      const audioFrom = Math.max(0, from - Math.floor(PARTIAL_OVERLAP_S * rate));
      const blob = encodePcmWav(flattenRange(chunks, audioFrom, end), rate);

      const task = (async () => {
        const raw = await transcribeSegment(blob, generation);
        if (generationRef.current !== generation || partialsClosedRef.current) return;
        pendingRef.current.set(seq, { raw, end });
        drainPending();
      })();
      inflightRef.current.add(task);
      void task.finally(() => inflightRef.current.delete(task));
    },
    [transcribeSegment, drainPending],
  );

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

  const startMeter = useCallback(async (
    stream: MediaStream,
    withPartials: boolean,
    generation: number,
  ): Promise<boolean> => {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return false;
      // iOS 上就算在手势里建好，拿到麦克风这一等也可能把它挂起；再推一次
      if (ctx.state === 'suspended') await ctx.resume();
      if (ctx.state !== 'running') return false;
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      startedAtRef.current = Date.now();
      pcmRef.current = [];
      pcmRateRef.current = ctx.sampleRate;
      peakLevelRef.current = 0;
      micLabelRef.current = stream.getAudioTracks()[0]?.label || '';
      resetPartialState();
      partialsClosedRef.current = false;

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
        if (rms > peakLevelRef.current) peakLevelRef.current = rms;
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
      return true;
    } catch {
      // PCM 已是唯一录音源；初始化失败不能再伪装成「正在听」。
      return false;
    }
  }, [beginPartials, resetPartialState]);

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
  const requestStop = useCallback((tailMs = RECORDING_TAIL_MS, fallbackText = '') => {
    if (!finalizeRef.current || stoppingRef.current) return;
    stoppingRef.current = true;
    stopFallbackRef.current = fallbackText.trim();
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
    if (busyRef.current) return false;
    busyRef.current = true;
    stoppingRef.current = false;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setError('');
    setPartial('');
    stopFallbackRef.current = '';
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
      const wanted = preferredDeviceRef.current;
      let stream = await navigator.mediaDevices
        .getUserMedia({
          audio: wanted ? { ...AUDIO_CONSTRAINTS, deviceId: { exact: wanted } } : AUDIO_CONSTRAINTS,
        })
        // 记住的设备被拔掉了就退回默认，别让人卡在一个不存在的麦克风上
        .catch(async err => {
          if (!wanted) throw err;
          preferredDeviceRef.current = '';
          try { localStorage.removeItem(MIC_PREF_KEY); } catch { /* ignore */ }
          return navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
        });
      // 系统默认给的是回环声卡的话，自己换成真麦克风，别等人录废一段才发现
      if (!wanted) {
        const real = await findRealMic(stream);
        if (real) {
          stream.getTracks().forEach(t => t.stop());
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { ...AUDIO_CONSTRAINTS, deviceId: { exact: real } },
          });
        }
      }
      if (generationRef.current !== generation) {
        stream.getTracks().forEach(track => track.stop());
        stopMeter();   // 上面提前建好的 AudioContext 要收掉，别泄漏
        // 这里必须把状态收干净：漏掉的话 UI 会永远停在「正在打开麦克风…」，
        // busyRef 也一直是 true，连重新开始都按不动。
        setRequesting(false);
        busyRef.current = false;
        return false;
      }
      setRequesting(false);
      streamRef.current = stream;
      dictationRef.current = options?.analysis === false;
      const meterStarted = await startMeter(stream, options?.partials !== false, generation);
      if (!meterStarted) {
        const error = new Error('audio-context-not-running') as Error & { name: string };
        error.name = 'AudioContextError';
        throw error;
      }
      // 只用 Web Audio 采音，不再挂 MediaRecorder。
      // iOS Safari 上同一条音轨被两个消费者同时读时，AudioContext 会被饿死——
      // 表现就是波形全程静止、实时字幕拿到的全是静音，而 MediaRecorder 那边一切正常。
      // 定稿本来就已经优先用这份 PCM，索性让它成为唯一的采音口：
      // 顺带省掉停止后的 decode，也不再有 iOS mp4「索引写在结尾」的麻烦。
      finalizeRef.current = async () => {
        const pcmChunks = pcmRef.current.slice();
        const pcmRate = pcmRateRef.current;
        const pcmSamples = pcmChunks.reduce((total, chunk) => total + chunk.length, 0);
        const dictation = options?.analysis === false;
        // 分片只负责实时预览，不能承担最终数据完整性：任一切片超时、被错判成静音，
        // 若收口只上传尾巴，前面的那段话就永久丢了。最终始终重转完整录音；
        // SenseVoice 的耗时主要是一次网络往返，完整 WAV 不会比“只传尾巴”多等一轮。
        const uploadFlat = pcmRate
          ? flattenRange(pcmChunks, 0, pcmSamples)
          : new Float32Array(0);
        const enoughAudio = uploadFlat.length > pcmRate / 4;
        const pcmBlob = enoughAudio ? encodePcmWav(uploadFlat, pcmRate) : null;
        const liveTextAtStop = chooseCompleteTranscript(
          committedRef.current.text,
          stopFallbackRef.current,
        );
        // 完整录音已经覆盖全部内容，停止并丢弃迟到切片，防止它们在收口后“幽灵回填”。
        cleanup();
        if (generationRef.current !== generation) return;

        let finalPromise: Promise<Response> | null = null;
        let finalController: AbortController | null = null;
        if (pcmBlob && pcmBlob.size >= 1200) {
          const fd = new FormData();
          fd.append('audio', pcmBlob, 'speech.wav');
          fd.append('analysis', dictation ? '0' : '1');
          finalController = new AbortController();
          requestRef.current = finalController;
          setTranscribing(true);
          finalPromise = fetch('/api/phil-coach/voice', {
            method: 'POST',
            body: fd,
            signal: finalController.signal,
          });
          void finalPromise.catch(() => undefined);   // 真正的处理在下面，这里只防未捕获
        }

        // PCM 采集偶发失效时，浏览器/服务端实时字幕仍然可以保住用户已经说的话。
        if (!finalPromise && liveTextAtStop) {
          setPartial('');
          onResultRef.current({
            text: liveTextAtStop,
            voiceContext: null,
            needsReview: !dictation,
          });
          if (!dictation) {
            setError('完整定稿没有回来，先把刚才听到的放进输入框，确认后再发。');
          }
          setTranscribing(false);
          busyRef.current = false;
          return;
        }
        if (!finalPromise) {
          setError(silentMic() ? micHint() : '好像没录到声音，再说一次试试。');
          setTranscribing(false);
          busyRef.current = false;
          return;
        }
        try {
          const res = await finalPromise;
          const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          if (generationRef.current !== generation) return;
          if (!res.ok || typeof json.text !== 'string') {
            if (liveTextAtStop) {
              setPartial('');
              onResultRef.current({
                text: liveTextAtStop,
                voiceContext: null,
                needsReview: !dictation,
              });
              setError(
                dictation
                  ? '完整定稿没有回来，先留着刚才听到的，改完再发也行。'
                  : '完整定稿没有回来，先把刚才听到的放进输入框，确认后再发。',
              );
            } else {
              setError(
                json.error === 'too-many'
                  ? '说得有点频繁，歇一会儿再试。'
                  : silentMic()
                    ? micHint()
                    : '这段没能转成文字，可以直接打字，或再说一次。',
              );
            }
          } else {
            const raw = chooseCompleteTranscript(json.text, liveTextAtStop);
            const voiceContext = normalizeVoiceAnalysis(json.voiceContext);
            // 整段转写拿到了，再顺一次错字和假句号——全程只有这一次。
            // 直达发送那颗按钮不顺：它转完就直接送走，没人会看这段字。
            const text = dictation ? await polishFinalText(raw, generation) : raw;
            if (generationRef.current !== generation) return;
            setPartial('');
            onResultRef.current({
              // 情绪分析是对着原始转写做的，别把顺过的文字塞回去当它的依据
              text,
              voiceContext: voiceContext ? { ...voiceContext, transcript: raw } : null,
            });
          }
        } catch {
          if (generationRef.current === generation) {
            if (liveTextAtStop) {
              setPartial('');
              onResultRef.current({
                text: liveTextAtStop,
                voiceContext: null,
                needsReview: !dictation,
              });
              setError(
                dictation
                  ? '网络不太顺，先留着刚才听到的，改完再发也行。'
                  : '网络不太顺，先把刚才听到的放进输入框，确认后再发。',
              );
            } else {
              setError('网络不太顺，这段没送出去。');
            }
          }
        } finally {
          if (requestRef.current === finalController) requestRef.current = null;
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
      return true;
    } catch (e) {
      if (generationRef.current !== generation) return false;
      const name = (e as { name?: string })?.name || '';
      const inWeChat = /MicroMessenger/i.test(navigator.userAgent);
      setError(
        name === 'NotAllowedError'
          ? inWeChat
            ? '微信没有开放麦克风。请点右上角「…」，选择在浏览器打开后再允许麦克风。'
            : '没有拿到麦克风权限。允许之后就可以对它说话了。'
          : name === 'AudioContextError'
            ? '麦克风已允许，但浏览器没有送来声音。刷新页面或换系统浏览器再试。'
            : '这个环境暂时用不了麦克风，可以先打字。',
      );
      cleanup();
      busyRef.current = false;
      setRequesting(false);
      setRecording(false);
      return false;
    }
  }, [cleanup, micHint, polishFinalText, requestStop, silentMic, startMeter, stopMeter]);

  const stop = useCallback((fallbackText = '') => {
    requestStop(RECORDING_TAIL_MS, fallbackText);
  }, [requestStop]);

  const toggle = useCallback(() => {
    if (recording) stop();
    else void start();
  }, [recording, start, stop]);

  return {
    supported, requesting, recording, transcribing, error,
    level, elapsed, partial, armPartials,
    inputDevices, chooseInputDevice,
    start, stop, toggle, cancel,
  };
}

const TTS_PREF_KEY = 'nf_phil_read_aloud';
const TTS_VOICE_KEY = 'nf_phil_tts_voice';

/**
 * 可选的嗓音。键名要和 /api/phil-coach/tts 里的白名单对上。
 * 两个都是克隆出来的真人嗓音，标签就写「女声」「男声」——
 * 原来那两个（phil-coach / anna）是音色的内部名字，对听的人没有意义。
 */
export const PHIL_COACH_VOICES = [
  { id: 'female', label: '女声' },
  { id: 'male', label: '男声' },
] as const;
export type PhilVoiceId = (typeof PHIL_COACH_VOICES)[number]['id'];
const DEFAULT_VOICE_ID: PhilVoiceId = 'female';

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
