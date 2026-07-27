'use client';

// phil-coach 的语音能力：说给它听（识别）+ 听它说（朗读）。
// 全部用浏览器原生 API，不依赖任何第三方服务，也不上传音频。
// 兼容性说明：识别依赖 webkitSpeechRecognition（Chrome/Edge/部分安卓 WebView 支持，
// iOS Safari 与微信内置浏览器多半不支持）；朗读用 speechSynthesis，覆盖面广得多。
// 因此两个能力各自独立探测、各自降级，不支持时相关按钮直接不出现。

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

/** 读取「浏览器是否支持某能力」——SSR 安全，且不需要在 effect 里 setState */
const noopSubscribe = () => () => {};
function useClientFlag(probe: () => boolean): boolean {
  return useSyncExternalStore(noopSubscribe, probe, () => false);
}

type RecognitionAlternative = { transcript: string };
type RecognitionResult = { isFinal: boolean; 0: RecognitionAlternative; length: number };
type RecognitionEvent = {
  resultIndex: number;
  results: { length: number; [i: number]: RecognitionResult };
};
type RecognitionErrorEvent = { error: string };

type RecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};

type RecognitionCtor = new () => RecognitionInstance;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/** 说给它听：把语音实时转成文字，追加进输入框 */
export function useSpeechInput(onText: (text: string) => void) {
  const supported = useClientFlag(() => Boolean(getRecognitionCtor()));
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const recRef = useRef<RecognitionInstance | null>(null);
  const onTextRef = useRef(onText);

  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  useEffect(() => {
    return () => {
      try {
        recRef.current?.abort();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
    setInterim('');
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    setError('');
    try {
      const rec = new Ctor();
      rec.lang = 'zh-CN';
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = e => {
        let finalText = '';
        let pending = '';
        for (let i = e.resultIndex; i < e.results.length; i += 1) {
          const r = e.results[i];
          const text = r[0]?.transcript ?? '';
          if (r.isFinal) finalText += text;
          else pending += text;
        }
        if (finalText) onTextRef.current(finalText);
        setInterim(pending);
      };
      rec.onerror = e => {
        // no-speech / aborted 属于常见且无害的情况，不打扰用户
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          setError('没有拿到麦克风权限，可以在浏览器设置里允许后再试。');
        } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
          setError('刚才没听清，再说一次试试。');
        }
        setListening(false);
        setInterim('');
      };
      rec.onend = () => {
        setListening(false);
        setInterim('');
      };
      recRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      setError('这个浏览器暂时不支持语音输入。');
      setListening(false);
    }
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  return { supported, listening, interim, error, start, stop, toggle };
}

const VOICE_PREF_KEY = 'nf_phil_read_aloud';

/** 听它说：把 phil-coach 的回复读出来，让人可以闭着眼睛待一会儿 */
export function useSpeechOutput() {
  const supported = useClientFlag(
    () => typeof window !== 'undefined' && 'speechSynthesis' in window,
  );
  // 记住上次的偏好；SSR 首帧一律 false，挂载后再读，避免 hydration 不一致
  const storedPref = useClientFlag(() => {
    try {
      return localStorage.getItem(VOICE_PREF_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [override, setOverride] = useState<boolean | null>(null);
  const enabled = override ?? storedPref;
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    return () => {
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const setEnabled = useCallback((v: boolean) => {
    setOverride(v);
    try {
      localStorage.setItem(VOICE_PREF_KEY, v ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (!v && typeof window !== 'undefined') {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
      setSpeaking(false);
    }
  }, []);

  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = 'zh-CN';
      u.rate = 0.92;   // 稍慢一点，像有人在你旁边慢慢说
      u.pitch = 1.0;
      const zh = window.speechSynthesis.getVoices().find(v => /zh|Chinese/i.test(v.lang));
      if (zh) u.voice = zh;
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      setSpeaking(true);
      window.speechSynthesis.speak(u);
    } catch {
      setSpeaking(false);
    }
  }, []);

  const stop = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
    setSpeaking(false);
  }, []);

  return { supported, enabled, setEnabled, speaking, speak, stop };
}
