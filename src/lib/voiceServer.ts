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

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

/** 把浏览器的 WebM / iOS MP4 压成 Qwen 接受的 16kHz 单声道 WAV。 */
function encodeVoiceWav(source: AudioBuffer): Blob {
  const maxSamples = Math.floor((MAX_WAV_BYTES - 44) / 2);
  const outputLength = Math.min(
    Math.ceil(source.duration * VOICE_SAMPLE_RATE),
    maxSamples,
  );
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

  const channels = Array.from(
    { length: source.numberOfChannels },
    (_, index) => source.getChannelData(index),
  );
  const sourceStep = source.sampleRate / VOICE_SAMPLE_RATE;
  for (let index = 0; index < outputLength; index += 1) {
    const position = index * sourceStep;
    const before = Math.min(Math.floor(position), source.length - 1);
    const after = Math.min(before + 1, source.length - 1);
    const mix = position - before;
    const sample = channels.reduce(
      (sum, channel) => sum + channel[before] + (channel[after] - channel[before]) * mix,
      0,
    ) / channels.length;
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }

  return new Blob([wav], { type: 'audio/wav' });
}

async function qwenCompatibleAudio(blob: Blob): Promise<Blob> {
  if (typeof AudioContext === 'undefined') return blob;
  let context: AudioContext | null = null;
  try {
    context = new AudioContext();
    const source = await context.decodeAudioData(await blob.arrayBuffer());
    return encodeVoiceWav(source);
  } catch {
    return blob;
  } finally {
    if (context) void context.close().catch(() => undefined);
  }
}

const noopSubscribe = () => () => {};
function useClientFlag(probe: () => boolean): boolean {
  return useSyncExternalStore(noopSubscribe, probe, () => false);
}
/** SSR 安全地读取一个客户端值（如 localStorage 偏好） */
function useClientValue(probe: () => string, fallback: string): string {
  return useSyncExternalStore(noopSubscribe, probe, () => fallback);
}

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',          // iOS Safari / 微信 iOS 走这个
    'audio/mpeg',
  ];
  for (const t of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      /* ignore */
    }
  }
  return '';
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
      typeof MediaRecorder !== 'undefined',
  );
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState('');
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const busyRef = useRef(false);
  const onResultRef = useRef(onResult);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  const cleanup = useCallback(() => {
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    try {
      streamRef.current?.getTracks().forEach(t => t.stop());
    } catch {
      /* ignore */
    }
    streamRef.current = null;
    recRef.current = null;
    chunksRef.current = [];
  }, []);

  const cancel = useCallback(() => {
    generationRef.current += 1;
    busyRef.current = false;
    requestRef.current?.abort();
    requestRef.current = null;
    const recorder = recRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } catch {
        /* ignore */
      }
    }
    cleanup();
    setRecording(false);
    setTranscribing(false);
  }, [cleanup]);

  useEffect(() => cancel, [cancel]);

  const start = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (generationRef.current !== generation) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = e => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        const type = rec.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        cleanup();
        if (generationRef.current !== generation) return;
        if (blob.size < 1200) {
          setError('好像没录到声音，再说一次试试。');
          setTranscribing(false);
          busyRef.current = false;
          return;
        }
        setTranscribing(true);
        let controller: AbortController | null = null;
        try {
          const uploadBlob = await qwenCompatibleAudio(blob);
          if (generationRef.current !== generation) return;
          const fd = new FormData();
          fd.append('audio', uploadBlob, uploadBlob.type === 'audio/wav' ? 'speech.wav' : 'speech');
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
            setError(
              json.error === 'too-many'
                ? '说得有点频繁，歇一会儿再试。'
                : '这段没能转成文字，可以直接打字，或再说一次。',
            );
          } else {
            onResultRef.current({
              text: json.text.trim(),
              voiceContext: normalizeVoiceAnalysis(json.voiceContext),
            });
          }
        } catch {
          if (generationRef.current === generation) {
            setError('网络不太顺，这段没送出去。');
          }
        } finally {
          if (requestRef.current === controller) requestRef.current = null;
          if (generationRef.current === generation) {
            busyRef.current = false;
            setTranscribing(false);
          }
        }
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
      maxTimerRef.current = setTimeout(() => {
        if (rec.state === 'recording') rec.stop();
        setRecording(false);
      }, MAX_RECORDING_MS);
    } catch (e) {
      if (generationRef.current !== generation) return;
      const name = (e as { name?: string })?.name || '';
      setError(
        name === 'NotAllowedError'
          ? '没有拿到麦克风权限。允许之后就可以对它说话了。'
          : '这个环境暂时用不了麦克风，可以先打字。',
      );
      cleanup();
      busyRef.current = false;
      setRecording(false);
    }
  }, [cleanup]);

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    setRecording(false);
  }, []);

  const toggle = useCallback(() => {
    if (recording) stop();
    else void start();
  }, [recording, start, stop]);

  return { supported, recording, transcribing, error, start, stop, toggle, cancel };
}

const TTS_PREF_KEY = 'nf_phil_read_aloud';
const TTS_VOICE_KEY = 'nf_phil_tts_voice';

export const TTS_VOICES: { id: string; label: string }[] = [
  { id: 'anna', label: '安然（女声）' },
  { id: 'bella', label: '贝拉（女声）' },
  { id: 'claire', label: '克莱尔（女声）' },
  { id: 'diana', label: '黛安（女声）' },
  { id: 'charles', label: '沉稳（男声）' },
  { id: 'david', label: '温和（男声）' },
];

/** 让 phil-coach 的回复用自然的嗓音读出来（服务端神经网络合成） */
export function useServerSpeech() {
  const storedPref = useClientFlag(() => {
    try {
      return localStorage.getItem(TTS_PREF_KEY) === '1';
    } catch {
      return false;
    }
  });
  const storedVoice = useClientValue(() => {
    try {
      return localStorage.getItem(TTS_VOICE_KEY) || 'anna';
    } catch {
      return 'anna';
    }
  }, 'anna');

  const [override, setOverride] = useState<boolean | null>(null);
  const [voiceOverride, setVoiceOverride] = useState<string | null>(null);
  const enabled = override ?? storedPref;
  const voice = voiceOverride ?? storedVoice;
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
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

  const setVoice = useCallback((v: string) => {
    setVoiceOverride(v);
    try {
      localStorage.setItem(TTS_VOICE_KEY, v);
    } catch {
      /* ignore */
    }
  }, []);

  const speak = useCallback(
    async (text: string) => {
      const clean = text.replace(/\s+/g, ' ').trim();
      if (!clean) return;
      const token = Symbol('tts');
      tokenRef.current = token;
      stop();
      tokenRef.current = token;      // stop 会清掉，重新标记
      setLoading(true);
      try {
        const res = await fetch('/api/phil-coach/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: clean, voice }),
        });
        if (!res.ok) throw new Error('tts');
        const blob = await res.blob();
        if (tokenRef.current !== token) return;   // 期间被取消
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          if (tokenRef.current === token) setSpeaking(false);
        };
        audio.onerror = () => {
          if (tokenRef.current === token) setSpeaking(false);
        };
        setSpeaking(true);
        await audio.play().catch(() => setSpeaking(false));
      } catch {
        setSpeaking(false);
      } finally {
        if (tokenRef.current === token) setLoading(false);
      }
    },
    [stop, voice],
  );

  return { enabled, setEnabled, voice, setVoice, speaking, loading, speak, stop };
}
