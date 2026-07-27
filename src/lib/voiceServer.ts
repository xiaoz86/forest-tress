'use client';

// 服务端语音：录音上传转写（微信也能用）+ 神经网络朗读（不再是播报腔）。
// 与 voice.ts 里的浏览器原生方案互补：这里音质与兼容性更好，代价是要走一次网络。

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

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
export function useServerSpeechInput(onText: (text: string) => void) {
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
  const onTextRef = useRef(onText);

  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  const cleanup = useCallback(() => {
    try {
      streamRef.current?.getTracks().forEach(t => t.stop());
    } catch {
      /* ignore */
    }
    streamRef.current = null;
    recRef.current = null;
    chunksRef.current = [];
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        if (blob.size < 1200) {
          setError('好像没录到声音，再说一次试试。');
          setTranscribing(false);
          return;
        }
        setTranscribing(true);
        try {
          const fd = new FormData();
          fd.append('audio', blob, 'speech');
          const res = await fetch('/api/phil-coach/voice', { method: 'POST', body: fd });
          const json = await res.json().catch(() => ({}));
          if (!res.ok || typeof json.text !== 'string') {
            setError(
              json.error === 'too-many'
                ? '说得有点频繁，歇一会儿再试。'
                : '这段没能转成文字，可以直接打字，或再说一次。',
            );
          } else {
            onTextRef.current(json.text);
          }
        } catch {
          setError('网络不太顺，这段没送出去。');
        } finally {
          setTranscribing(false);
        }
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
    } catch (e) {
      const name = (e as { name?: string })?.name || '';
      setError(
        name === 'NotAllowedError'
          ? '没有拿到麦克风权限。允许之后就可以对它说话了。'
          : '这个环境暂时用不了麦克风，可以先打字。',
      );
      cleanup();
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

  return { supported, recording, transcribing, error, start, stop, toggle };
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
