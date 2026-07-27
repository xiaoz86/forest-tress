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
/** 微信内置浏览器：不给 Web Speech 麦克风权限，需要引导去系统浏览器打开 */
export function isWeChatBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /MicroMessenger/i.test(navigator.userAgent);
}

export function useSpeechInput(onText: (text: string) => void) {
  const rawSupported = useClientFlag(() => Boolean(getRecognitionCtor()));
  const inWeChat = useClientFlag(isWeChatBrowser);
  // 微信里即使有 API 也拿不到麦克风，视为不可用，改为引导去浏览器打开
  const supported = rawSupported && !inWeChat;
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

  return { supported, inWeChat, listening, interim, error, start, stop, toggle };
}

const VOICE_PREF_KEY = 'nf_phil_read_aloud';
const VOICE_NAME_KEY = 'nf_phil_voice_name';

/** 挑一个温柔的中文声音：优先柔和的女声，其次任意中文声音 */
const PREFERRED_VOICES = [
  'Tingting', '婷婷', 'Ting-Ting',      // macOS / iOS 中文默认，温和
  'Google 普通话（中国大陆）', 'Google 普通话',
  'Mei-Jia', '美佳', 'Sinji', 'Yu-shu',
  'Microsoft Xiaoxiao', 'Microsoft Yaoyao', 'Huihui',
];

/** 列出设备上所有可用的中文嗓音（按自然度从高到低排序） */
export function listChineseVoices(): SpeechSynthesisVoice[] {
  try {
    const voices = window.speechSynthesis?.getVoices() ?? [];
    const zh = voices.filter(v => /^zh|cmn|Chinese/i.test(v.lang) || /中文|普通话/.test(v.name));
    const score = (v: SpeechSynthesisVoice) => {
      let s = 0;
      // 增强／高级音色：同一把嗓子里最自然的一档
      if (/enhanced|premium|增强|高级|natural|neural/i.test(v.name)) s += 100;
      // 云端合成通常比设备本地基础音色自然
      if (v.localService === false) s += 40;
      // 偏好列表里的温柔嗓音
      const idx = PREFERRED_VOICES.findIndex(w => v.name.includes(w));
      if (idx >= 0) s += 30 - idx;
      // 大陆普通话优先
      if (/zh[-_]?CN|cmn/i.test(v.lang)) s += 10;
      return s;
    };
    return zh.sort((a, b) => score(b) - score(a));
  } catch {
    return [];
  }
}

function pickGentleVoice(preferredName?: string): SpeechSynthesisVoice | null {
  const zh = listChineseVoices();
  if (!zh.length) return null;
  if (preferredName) {
    const chosen = zh.find(v => v.name === preferredName);
    if (chosen) return chosen;
  }
  return zh[0];
}

/** 把长回复切成短句，让朗读有呼吸——像有人坐在旁边慢慢说，而不是播报 */
function splitForBreath(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  // 在句末标点后断句，同时保留标点
  const rough = clean.split(/(?<=[。！？!?…；;])/);
  const out: string[] = [];
  for (const piece of rough) {
    const s = piece.trim();
    if (!s) continue;
    // 过长的句子再按逗号切一次，避免一口气念太久
    if (s.length > 34) {
      let buf = '';
      for (const part of s.split(/(?<=[，,、])/)) {
        if ((buf + part).length > 34 && buf) {
          out.push(buf.trim());
          buf = part;
        } else {
          buf += part;
        }
      }
      if (buf.trim()) out.push(buf.trim());
    } else {
      out.push(s);
    }
  }
  return out;
}

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
  const speakTokenRef = useRef<symbol | null>(null);
  // 用户选定的嗓音（同一设备下次沿用）
  const [voiceName, setVoiceNameState] = useState<string>('');
  const [voiceOptions, setVoiceOptions] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const refresh = () => {
      const names = listChineseVoices().map(v => v.name);
      setVoiceOptions(names);
      setVoiceNameState(prev => {
        if (prev && names.includes(prev)) return prev;
        try {
          const saved = localStorage.getItem(VOICE_NAME_KEY) || '';
          if (saved && names.includes(saved)) return saved;
        } catch {
          /* ignore */
        }
        return names[0] || '';
      });
    };
    refresh();
    window.speechSynthesis.addEventListener?.('voiceschanged', refresh);
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', refresh);
  }, []);

  const setVoiceName = useCallback((name: string) => {
    setVoiceNameState(name);
    try {
      localStorage.setItem(VOICE_NAME_KEY, name);
    } catch {
      /* ignore */
    }
  }, []);

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
      speakTokenRef.current = null;
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
    const sentences = splitForBreath(text);
    if (!sentences.length) return;

    // 本次朗读的令牌：中途被取消/开始新一段时，旧队列自动作废
    const token = Symbol('speak');
    speakTokenRef.current = token;

    const voice = pickGentleVoice(voiceName);
    const sayFrom = (i: number) => {
      if (speakTokenRef.current !== token) return;      // 已被取代
      if (i >= sentences.length) {
        setSpeaking(false);
        return;
      }
      try {
        const u = new SpeechSynthesisUtterance(sentences[i]);
        u.lang = 'zh-CN';
        u.rate = 0.84;    // 更慢：像坐在你旁边，不赶时间
        u.pitch = 0.96;   // 略低：沉一点更安定，不尖不亮
        u.volume = 0.92;  // 收一点，不逼近耳朵
        if (voice) u.voice = voice;
        u.onend = () => {
          if (speakTokenRef.current !== token) return;
          // 句与句之间留一口气；段末停顿更长一些
          const tail = sentences[i].slice(-1);
          const pause = /[。！？!?…]/.test(tail) ? 520 : 300;
          window.setTimeout(() => sayFrom(i + 1), pause);
        };
        u.onerror = () => {
          if (speakTokenRef.current === token) setSpeaking(false);
        };
        window.speechSynthesis.speak(u);
      } catch {
        setSpeaking(false);
      }
    };

    try {
      window.speechSynthesis.cancel();
      setSpeaking(true);
      // 有些浏览器 getVoices() 首次为空，稍等一拍再开口，能拿到中文嗓音
      window.setTimeout(() => sayFrom(0), voice ? 120 : 320);
    } catch {
      setSpeaking(false);
    }
  }, [voiceName]);

  const stop = useCallback(() => {
    if (typeof window === 'undefined') return;
    speakTokenRef.current = null;   // 作废未念完的句子队列
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
    setSpeaking(false);
  }, []);

  return {
    supported, enabled, setEnabled, speaking, speak, stop,
    voiceName, setVoiceName, voiceOptions,
  };
}
