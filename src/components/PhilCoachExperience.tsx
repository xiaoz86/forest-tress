'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { isWebKitBrowser, useClientFlag, useSpeechInput } from '@/lib/voice';
import {
  PHIL_COACH_VOICES,
  useServerSpeech,
  useServerSpeechInput,
} from '@/lib/voiceServer';
import type { VoiceAnalysis } from '@/lib/philCoachVoice';
import { dict } from '@/i18n';
import type { Locale } from '@/lib/locale';
import {
  PHIL_PATHS,
  PROFILE_PATH,
  getPhilOpening,
  getPhilPath,
  normalizePhilProfileName,
  type PhilPath,
} from '@/lib/philCoach';

/** 以字典里的键为准：lib 里加了小径却没配文案，这里会当场编译报错 */
type PathId = keyof ReturnType<typeof dict>['philCoach']['experience']['paths'];

const MOOD_GRADIENT: Record<PhilPath['mood'], string> = {
  companion: 'bg-[linear-gradient(135deg,#cf9087_0%,#ead0bf_52%,#c7d8cb_100%)]',
  clarity: 'bg-[linear-gradient(135deg,#6f8966_0%,#bac8ad_52%,#e7dac4_100%)]',
  choice: 'bg-[linear-gradient(135deg,#738faa_0%,#b7c7d3_54%,#e5d6d2_100%)]',
  mirror: 'bg-[linear-gradient(135deg,#1d352d_0%,#668579_52%,#d3c5ac_100%)]',
};

type ThreadItem =
  | { kind: 'coach'; text: string }
  | { kind: 'me'; text: string };

type Session = {
  pathId: string;
  thread: ThreadItem[];
};

const OPENING_INDEX_KEY = 'nf_phil_opening_index';
/** 当前这段对话的暂存键：登录/注册跳走再回来，对话还在（只在本次浏览会话内，关掉标签页即散） */
const DRAFT_SESSION_KEY = 'nf_phil_session';
/** 给浏览器听写多久证明它真的在工作；到点没出字就退回服务端分段转写 */
const CAPTION_WATCHDOG_MS = 2500;
const MIC_STARVE_CHECK_MS = 1200;   // 浏览器听写出第一个字之后，给自己的采音这么久证明它也活着
const MIC_ALIVE_LEVEL = 0.02;       // 电平低于这个就是没收到声音

function saveSession(s: Session | null) {
  try {
    if (s && s.thread.some(item => item.kind === 'me')) {
      sessionStorage.setItem(DRAFT_SESSION_KEY, JSON.stringify(s));
    } else {
      sessionStorage.removeItem(DRAFT_SESSION_KEY);
    }
  } catch {
    /* 无痕模式等场景忽略 */
  }
}

function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (!s || typeof s.pathId !== 'string' || !Array.isArray(s.thread)) return null;
    if (!s.thread.length || !getPhilPath(s.pathId)) return null;
    return s;
  } catch {
    return null;
  }
}

function nextOpeningIndex(): number {
  try {
    const stored = Number(localStorage.getItem(OPENING_INDEX_KEY));
    const current = Number.isSafeInteger(stored) && stored >= 0 ? stored : 0;
    localStorage.setItem(OPENING_INDEX_KEY, String(current + 1));
    return current;
  } catch {
    return Date.now();
  }
}

function seedThread(path: PhilPath, opening: string): ThreadItem[] {
  const thread: ThreadItem[] = [];
  for (const [index, beat] of path.beats.entries()) {
    thread.push({ kind: 'coach', text: index === 0 ? opening : beat.coach });
    if (beat.input) break;
  }
  return thread;
}

function mergeTranscript(current: string, transcript: string): { text: string; complete: boolean } {
  const addition = transcript.trim();
  if (!addition) return { text: current, complete: false };
  const separator = current.trim() ? ' ' : '';
  const merged = `${current.trimEnd()}${separator}${addition}`;
  return { text: merged.slice(0, 1200), complete: merged.length <= 1200 };
}

function appendTranscript(current: string, transcript: string): string {
  return mergeTranscript(current, transcript).text;
}

/** 声音的可视化：几根随音量跳动的竖条，让人看见自己在被听见。
 *  没声音时收成一排圆点，静止时也不显得是坏了。 */
function WaveBars({
  level,
  active,
  maxHeight = 32,
  barWidth = 3,
  barClassName = 'bg-coral-soft/85',
}: {
  level: number;
  active: boolean;
  maxHeight?: number;
  barWidth?: number;
  barClassName?: string;
}) {
  const bars = [0.35, 0.6, 0.9, 1, 0.75, 0.5, 0.85, 0.65, 0.4];
  return (
    <div
      className="flex items-center justify-center"
      style={{ height: maxHeight, gap: barWidth }}
      aria-hidden="true"
    >
      {bars.map((weight, i) => {
        const h = active
          ? Math.max(barWidth, Math.min(maxHeight, barWidth + level * (maxHeight - barWidth) * weight * 1.15))
          : barWidth;
        return (
          <span
            key={i}
            className={`rounded-full transition-[height] duration-100 ease-out ${barClassName}`}
            style={{ width: barWidth, height: h }}
          />
        );
      })}
    </div>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current">
      <path d="M6 6l12 12M18 6L6 18" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function MicrophoneIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current">
      <rect x="9" y="3" width="6" height="11" rx="3" strokeWidth="1.8" />
      <path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v4M9 21h6" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** 直达入口的声波图标：几条竖线，和「听写」的麦克风区分开 */
function VoiceWaveIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current">
      <path
        d="M5 10v4M8.5 7.5v9M12 9.5v5M15.5 5.5v13M19 10v4"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SpeakerIcon({ waves = true, className = 'h-4 w-4' }: { waves?: boolean; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={`${className} shrink-0 fill-none stroke-current`}>
      <path d="M4 9.3h3.3L12 5.4v13.2L7.3 14.7H4z" strokeWidth="1.7" strokeLinejoin="round" />
      {waves ? (
        <>
          <path d="M15.6 9.4a3.6 3.6 0 0 1 0 5.2" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M18.3 7a7.2 7.2 0 0 1 0 10" strokeWidth="1.7" strokeLinecap="round" />
        </>
      ) : (
        <path d="M16.2 9.8l4.4 4.4M20.6 9.8l-4.4 4.4" strokeWidth="1.7" strokeLinecap="round" />
      )}
    </svg>
  );
}



/**
 * 文案在客户端自己取。
 *
 * 不能像服务端组件那样把字典切片当 props 传进来——字典里为了英文单复数
 * 用了函数（draftCount、listening 这些），而函数跨不过 server → client
 * 那道序列化边界，页面会直接崩在「Functions cannot be passed directly
 * to Client Components」。所以只传 locale，字典在这边查。
 *
 * 这也不违反「客户端不要自己判断语言」：locale 仍是服务端算好的，
 * 这里不读 cookie，不会先渲染中文再闪成英文。
 */
export default function PhilCoachExperience({ locale }: { locale: Locale }) {
  const t = useMemo(() => dict(locale).philCoach.experience, [locale]);
  const [session, setSession] = useState<Session | null>(null);
  const [draft, setDraft] = useState('');
  const draftRef = useRef('');
  const [voiceInputNotice, setVoiceInputNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [keepState, setKeepState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [profileKnown, setProfileKnown] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [identityReady, setIdentityReady] = useState(false);
  const [importState, setImportState] = useState<'idle' | 'importing' | 'done' | 'error'>('idle');
  /**
   * 老游客：登记过、还在 90 天免费期内的人照旧放行。
   * 换了设计不能把当初按规矩登记过的人拦在外面。
   */
  const [legacyGuestOk, setLegacyGuestOk] = useState(false);
  const [showGate, setShowGate] = useState(false);
  /** 浮层两步：留称呼和邮箱 → 填验证码。都在这一页完成，不跳走。 */
  const [gateStep, setGateStep] = useState<'form' | 'code'>('form');
  const [gateName, setGateName] = useState('');
  const [gateEmail, setGateEmail] = useState('');
  const [gateCode, setGateCode] = useState('');
  const [gateBusy, setGateBusy] = useState(false);
  const [gateError, setGateError] = useState('');
  const [gateCooldown, setGateCooldown] = useState(0);
  const [pendingPathId, setPendingPathId] = useState<string | null>(null);
  const [pendingRetry, setPendingRetry] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const pendingVoiceContextRef = useRef<VoiceAnalysis | null>(null);
  const retryVoiceContextRef = useRef<VoiceAnalysis | null>(null);
  // 两种语音方式，意图由用户按的按钮决定，不再用「输入框空不空」猜
  // （猜的结果是两种界面撞在一起）：
  // dictate = 说话变文字，先进输入框，可改再发；direct = 说完直接发给它。
  const [voiceMode, setVoiceMode] = useState<'dictate' | 'direct' | null>(null);
  const voiceModeRef = useRef<'dictate' | 'direct' | null>(null);
  // 录音时的实时字幕（仅显示用）。真正发出去的文字以服务端转写为准——
  // 系统听写只负责让人「看见自己正在被听到」，说错了也不影响结果。
  const [caption, setCaption] = useState('');
  const [polishing, setPolishing] = useState(false);
  // 浏览器听写到底有没有真的出字——看门狗据此决定要不要退回服务端
  const captionSeenRef = useRef(false);
  const captionWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const starveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peakLevelRef = useRef(0);
  const liveVoice = useSpeechInput(text => {
    captionSeenRef.current = true;
    setCaption(current => appendTranscript(current, text));
  });
  const voiceIn = useServerSpeechInput(result => {
    setCaption('');
    const mode = voiceModeRef.current;
    voiceModeRef.current = null;
    setVoiceMode(null);
    if (mode === 'direct') {
      void sendVoiceMessage(result.text.trim().slice(0, 1200), result.voiceContext);
      return;
    }
    const currentDraft = draftRef.current;
    const merged = mergeTranscript(currentDraft, result.text);
    draftRef.current = merged.text;
    setDraft(merged.text);
    // 原文先落进输入框，别让人等；顺一遍是后台做的事
    void polishDraft(result.text, merged.text);
    pendingVoiceContextRef.current = merged.complete ? result.voiceContext : null;
    setVoiceInputNotice(
      merged.complete
        ? ''
        : currentDraft.length >= 1200
          ? t.voice.overflowAll
          : t.voice.overflowPart,
    );
  });
  /**
   * 把刚转出来的这段顺一遍：同音错字、被切开的句子、乱掉的标点。
   * 不挡着人——原文已经在框里了，顺好了才悄悄换掉，而且只在人还没动过时才换。
   * 顺不动就算了，原文本来就能用。
   */
  const polishDraft = async (rawSegment: string, draftAfterMerge: string) => {
    const raw = rawSegment.trim();
    if (raw.length < 6) return;              // 太短没什么可顺的
    // 顺不成就保持「接缝标点已去掉」的原样。
    // 早先这里会退回保留接缝标点的版本，理由是「有错标点好过没标点」——
    // 那是判断反了：切点落在句中太常见，退回去就成了
    // 「我想。和你聊一聊。今天。发生的事情。」，比没有标点难读得多。
    const applySegment = (value: string) => {
      if (draftRef.current !== draftAfterMerge) return;   // 这期间人改过输入框就别动了
      const before = draftAfterMerge.slice(0, draftAfterMerge.length - raw.length);
      const next = `${before}${value}`.slice(0, 1200);
      draftRef.current = next;
      setDraft(next);
    };
    setPolishing(true);
    try {
      const res = await fetch('/api/phil-coach/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: raw }),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || typeof json.text !== 'string' || !json.changed) return;
      applySegment(json.text.trim());
    } catch {
      /* 顺不动就用原文 */
    } finally {
      setPolishing(false);
    }
  };

  const voiceOut = useServerSpeech();
  const spokenRef = useRef<string>('');
  const importPromiseRef = useRef<Promise<void> | null>(null);

  const path = session ? getPhilPath(session.pathId) : undefined;
  const hasConversation = Boolean(session?.thread.length);
  const conversationReady = identityReady && importState !== 'importing';
  // 字幕两条路：浏览器听写（Web Speech）逐字出、几乎零延迟；
  // 服务端分段转写以短语为单位刷新，但哪儿都能用。
  //
  // 谁真的能走第一条，只有运行时才知道：
  // Edge 压根没实现、Firefox 默认关着、iOS 的微信与 Chrome 都是 WKWebView 拿不到，
  // 而 Chrome/Edge 的后端在 Google——在够不着 Google 的网络里 API 在、一用就报
  // network。所以判据是「它有没有真的出字」，不是嗅探 UA。
  //
  // iPhone / iPad 上还有一层：Web Speech 会自己开一路麦克风，和我们采 PCM 的
  // AudioContext 是两个消费者，可能互相饿死。这条没有真机验不了，所以默认仍然
  // 只走服务端；带上 ?webspeech=1 可以在 iOS Safari 上单独试（微信不受影响）。
  const iosWebSpeechOptIn = useClientFlag(
    () => typeof window !== 'undefined'
      && new URLSearchParams(window.location.search).get('webspeech') === '1',
  );
  // 还有一层比「支不支持」更要紧的：能不能和我们的采音共存。
  // Chrome 上 SpeechRecognition 会把麦克风独占走，我们这一路只录到静音，
  // 最后服务端收到的是空音频——报「这段没能转成文字」。Safari 上实测两路并存没问题。
  const webKitEngine = useClientFlag(isWebKitBrowser);
  const useWebSpeechCaptions =
    liveVoice.supported && !liveVoice.inWeChat && webKitEngine
    && (!liveVoice.inIOS || iosWebSpeechOptIn);
  // 实时字幕：谁有内容就显示谁。
  // 不能按 useWebSpeechCaptions 固定挑一边——看门狗把浏览器听写换成服务端之后，
  // 显示源不跟着切的话，请求照发、字却永远不出现。
  const liveCaption = appendTranscript(caption, liveVoice.interim) || voiceIn.partial;
  const voiceBusy = voiceIn.requesting || voiceIn.recording || voiceIn.transcribing;
  // 直达：大面板只管「正在录」这一段，录音一停立即退场——
  // 等待由对话里的占位气泡承担，面板再留着就是同一状态出现两遍，
  // 还会把气泡顶出视野。
  const voicePanel = voiceMode === 'direct' && (voiceIn.requesting || voiceIn.recording);
  // 听写：输入框不让位，字实时进输入框；底部按钮行换成一条紧凑控制条。
  const dictating = voiceMode === 'dictate' && voiceBusy;
  // 听写录音中把字幕拼进输入框给人看；定稿以服务端转写为准，回来后才真正写入
  const displayedDraft =
    dictating && liveCaption ? appendTranscript(draft, liveCaption) : draft;
  // 三个入口统一包一层：字幕跟着录音一起起停，且字幕失败不影响录音
  const startVoice = async (mode: 'dictate' | 'direct') => {
    // 它正念着的时候开录，麦克风会把它自己的话录回输入框——
    // 手机外放尤其明显，回声消除挡不住。开录第一件事就是让它闭嘴。
    voiceOut.stop();
    voiceModeRef.current = mode;
    setVoiceMode(mode);
    setCaption('');
    captionSeenRef.current = false;
    peakLevelRef.current = 0;
    if (starveTimerRef.current) {
      clearTimeout(starveTimerRef.current);
      starveTimerRef.current = null;
    }
    // Web Speech 在跑就先不花钱做分段转写，等看门狗判定
    await voiceIn.start({
      partials: !useWebSpeechCaptions,
      // 灰色麦克风只是听写，不需要等较慢的语气分析；直达模式才保留声音观察。
      analysis: mode === 'direct',
    });
    // 一定要等麦克风到手再起浏览器听写。两个都在抢麦克风，同时发起的话
    // 两套权限流程会叠在一起——Mac Chrome 上表现为卡在「正在打开麦克风…」。
    if (!useWebSpeechCaptions || voiceModeRef.current !== mode) return;
    liveVoice.start();
    // 看门狗现在只是兜底。正常的失败（没权限、没麦克风、连不上 Google）都会
    // 触发 error 事件，下面那个 effect 会立刻切走，不必白等这几秒。
    // 留着它是为了「不报错也不出字」那种装死的情况。
    if (captionWatchdogRef.current) clearTimeout(captionWatchdogRef.current);
    captionWatchdogRef.current = setTimeout(() => {
      if (captionSeenRef.current) return;
      fallbackToServerCaptions();
    }, CAPTION_WATCHDOG_MS);
  };
  /** 收掉浏览器听写，接上服务端分段转写。PCM 从开录就在攒，所以字幕从头出，不会缺一截。 */
  const fallbackToServerCaptions = () => {
    if (captionWatchdogRef.current) {
      clearTimeout(captionWatchdogRef.current);
      captionWatchdogRef.current = null;
    }
    if (starveTimerRef.current) {
      clearTimeout(starveTimerRef.current);
      starveTimerRef.current = null;
    }
    liveVoice.cancel();
    voiceIn.armPartials();
  };
  const finishVoice = () => {
    if (captionWatchdogRef.current) clearTimeout(captionWatchdogRef.current);
    liveVoice.cancel();   // 定稿以服务端转写为准，字幕直接丢弃
    voiceIn.stop();
  };
  const cancelVoice = () => {
    if (captionWatchdogRef.current) clearTimeout(captionWatchdogRef.current);
    liveVoice.cancel();
    setCaption('');
    voiceModeRef.current = null;
    setVoiceMode(null);
    voiceIn.cancel();
  };

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // 半句话（interim）也算浏览器听写还活着。
  // 只认定稿的话，连续说话的人前几秒往往只有 interim，看门狗会误判成「装死」，
  // 白白退回服务端、多花一串请求。
  useEffect(() => {
    if (voiceIn.level > peakLevelRef.current) peakLevelRef.current = voiceIn.level;
  }, [voiceIn.level]);

  useEffect(() => {
    if (!liveVoice.interim) return;
    captionSeenRef.current = true;
    // Web Speech 出字了，说明人确实在说话。如果这时我们自己的采音电平一直贴地，
    // 那就是麦克风被它独占了——继续下去最后只会上传一段静音。
    // 收掉它，把麦克风还回来，改走服务端分段转写。
    if (starveTimerRef.current) return;
    starveTimerRef.current = setTimeout(() => {
      starveTimerRef.current = null;
      if (peakLevelRef.current >= MIC_ALIVE_LEVEL) return;
      fallbackToServerCaptions();
    }, MIC_STARVE_CHECK_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveVoice.interim]);

  // 浏览器听写自己认输了就马上换路。
  // 这是 Windows / 安卓 / 够不着 Google 的网络里真正省下来的那几秒——
  // 以前要等满看门狗才切，那几秒是纯亏的。
  useEffect(() => {
    if (!liveVoice.failed) return;
    if (!voiceIn.recording && !voiceIn.requesting) return;
    fallbackToServerCaptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveVoice.failed]);

  // 挂载时恢复上一次未走完的对话（去登录/注册回来后，聊过的内容不会丢）
  useEffect(() => {
    const restored = loadSession();
    if (!restored) return;
    setSession(current => current ?? restored);
  }, []);

  // 对话有变化就暂存（仅本次浏览会话）
  useEffect(() => {
    saveSession(session);
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [session]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [session?.thread.length, loading, error, voiceIn.transcribing]);

  // 开着朗读时，把最新一条回复念出来（同一条不重复念）。
  // 正在录音就先别念——念出来会被麦克风录回去，成了它在跟自己说话。
  useEffect(() => {
    if (!voiceOut.enabled || !session) return;
    if (voiceIn.recording || voiceIn.requesting) return;
    const last = [...session.thread].reverse().find(item => item.kind === 'coach');
    if (!last || last.text === spokenRef.current) return;
    spokenRef.current = last.text;
    voiceOut.speak(last.text);
  }, [session, voiceOut, voiceIn.recording, voiceIn.requesting]);

  // 登录检测 + 第一次对话默认导入注册资料
  useEffect(() => {
    let active = true;

    async function loadIdentity() {
      try {
        const response = await fetch('/api/phil-coach/memory');
        const json = response.ok ? await response.json() : null;
        if (!active) return;
        if (!json) {
          setLoggedIn(false);
          return;
        }
        setLoggedIn(true);
        setProfileName(normalizePhilProfileName(json.profileName));
        const mems: { path_id?: string }[] = json.memories ?? [];
        setProfileKnown(mems.some(m => m.path_id === PROFILE_PATH));
        // 第一次：还没有任何记忆时，默认把注册资料导入为「关于我」种子
        if (mems.length === 0) await importProfile();
      } catch {
        if (active) setLoggedIn(false);
      } finally {
        if (active) setIdentityReady(true);
      }
    }

    void loadIdentity();
    return () => {
      active = false;
    };
  }, []);

  // 轻登记检测（方案A：第一条小径免登记，之后登记并经主理人通过后继续）
  // 老游客还在免费期内就照旧放行（新人不会有这个 cookie，拿到的是 false）
  useEffect(() => {
    fetch('/api/phil-coach/guest')
      .then(r => (r.ok ? r.json() : null))
      .then(json => setLegacyGuestOk(Boolean(json?.approved)))
      .catch(() => {});
  }, []);

  // 重新发送的 60 秒倒计时（服务端也有同样的冷却）
  useEffect(() => {
    if (gateCooldown <= 0) return;
    const id = setTimeout(() => setGateCooldown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [gateCooldown]);

  function pathsDone(): number {
    try {
      return Number(localStorage.getItem('nf_phil_paths_done') || '0') || 0;
    } catch {
      return 0;
    }
  }
  function markPathDone() {
    try {
      localStorage.setItem('nf_phil_paths_done', String(pathsDone() + 1));
    } catch {
      /* 无痕模式等场景忽略 */
    }
  }

  /** 把注册资料导入/刷新为 phil-coach 的「关于我」种子（默认导入 & 重新导入共用） */
  function importProfile(): Promise<void> {
    if (importPromiseRef.current) return importPromiseRef.current;

    const request = (async () => {
      setImportState('importing');
      try {
        const res = await fetch('/api/phil-coach/memory/import-profile', { method: 'POST' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error('import-failed');
        setProfileName(normalizePhilProfileName(json.profileName));
        if (json.memory) setProfileKnown(true);
        setImportState('done');
      } catch {
        setImportState('error');
      }
    })();

    importPromiseRef.current = request;
    void request.finally(() => {
      if (importPromiseRef.current === request) importPromiseRef.current = null;
    });
    return request;
  }

  function openingForNextConversation(): string {
    return getPhilOpening(t.opening, profileKnown ? profileName : '', nextOpeningIndex());
  }

  function begin(p: PhilPath) {
    if (!identityReady || importPromiseRef.current) return;
    liveVoice.cancel();
    voiceIn.cancel();
    // 方案A：走完第一条小径后，未登录且（未登记或未获通过）→ 先走登记/等待流程
    if (!loggedIn && !legacyGuestOk && pathsDone() >= 1) {
      setPendingPathId(p.id);
      setShowGate(true);
      return;
    }
    setDraft('');
    setVoiceInputNotice('');
    setCopied(false);
    setError('');
    setKeepState('idle');
    pendingVoiceContextRef.current = null;
    retryVoiceContextRef.current = null;
    setSession({ pathId: p.id, thread: seedThread(p, openingForNextConversation()) });
  }

  function reset() {
    liveVoice.cancel();
    voiceIn.cancel();
    if (session?.thread.some(item => item.kind === 'me')) markPathDone();
    setSession(null);
    setDraft('');
    setVoiceInputNotice('');
    setCopied(false);
    setLoading(false);
    setError('');
    setKeepState('idle');
    pendingVoiceContextRef.current = null;
    retryVoiceContextRef.current = null;
  }

  /** 明示同意的「留住」：把当前对话存进自己的记忆（仅注册用户） */
  async function keepThread() {
    if (!session || !path || keepState === 'saving') return;
    setKeepState('saving');
    try {
      const res = await fetch('/api/phil-coach/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pathId: path.id,
          messages: session.thread.map(item => ({
            role: item.kind === 'coach' ? 'assistant' : 'user',
            content: item.text,
          })),
        }),
      });
      if (!res.ok) throw new Error('keep-failed');
      setKeepState('saved');
    } catch {
      setKeepState('error');
    }
  }

  /** 发送对话线取回复；命中登记闸门时返回 'gate'（不视为错误） */
  async function sendThread(
    thread: ThreadItem[],
    pathId: string,
    voiceContext: VoiceAnalysis | null = null,
  ): Promise<'ok' | 'gate'> {
    const res = await fetch('/api/phil-coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pathId,
        messages: thread.map(item => ({
          role: item.kind === 'coach' ? 'assistant' : 'user',
          content: item.text,
        })),
        ...(voiceContext ? { voiceContext } : {}),
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 403 && json.error === 'member-required') {
      return 'gate';
    }
    if (!res.ok || typeof json.reply !== 'string') {
      throw new Error(json.error || 'reply-failed');
    }
    setSession(current =>
      current && current.pathId === pathId
        ? { ...current, thread: [...current.thread, { kind: 'coach', text: json.reply.trim() }] }
        : current,
    );
    // 对话有了新内容，「留住」重新可用
    setKeepState(prev => (prev === 'saved' ? 'idle' : prev));
    return 'ok';
  }

  /** 发送核心：submit（手动）与 sendVoiceMessage（语音直达）共用 */
  async function deliverMessage(
    answer: string,
    voiceContext: VoiceAnalysis | null,
  ): Promise<boolean> {
    if (!path || !session || loading) return false;

    const nextThread: ThreadItem[] = [...session.thread, { kind: 'me', text: answer }];
    setSession({ ...session, thread: nextThread });
    setDraft('');
    setVoiceInputNotice('');
    setError('');
    setLoading(true);

    try {
      const r = await sendThread(nextThread, path.id, voiceContext);
      if (r === 'gate') {
        retryVoiceContextRef.current = voiceContext;
        setPendingRetry(true);
        setShowGate(true);
      } else {
        retryVoiceContextRef.current = null;
      }
    } catch {
      retryVoiceContextRef.current = null;
      setError(t.error.send);
    } finally {
      setLoading(false);
    }
    return true;
  }

  async function submit() {
    if (
      loading ||
      liveVoice.listening ||
      voiceIn.requesting ||
      voiceIn.recording ||
      voiceIn.transcribing
    ) return;
    const answer = draft.trim();
    if (!answer) return;
    const voiceContext = pendingVoiceContextRef.current;
    pendingVoiceContextRef.current = null;
    await deliverMessage(answer, voiceContext);
  }

  /** 语音直达：转写完成后直接发送；发不出去时退回输入框，话不能丢 */
  async function sendVoiceMessage(answer: string, voiceContext: VoiceAnalysis | null) {
    if (!answer) return;
    const delivered = await deliverMessage(answer, voiceContext);
    if (!delivered) {
      const merged = mergeTranscript(draftRef.current, answer);
      draftRef.current = merged.text;
      setDraft(merged.text);
      pendingVoiceContextRef.current = voiceContext;
    }
  }



  /** 第一步：把验证码发到这个邮箱。已经是成员的人填同一个邮箱就是登录。 */
  async function sendGateCode() {
    const email = gateEmail.trim();
    if (!gateName.trim() || !/^.+@.+\..+$/.test(email) || gateBusy || gateCooldown > 0) return;
    setGateBusy(true);
    setGateError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error('failed');
      // 服务端一律回 ok（不暴露这个邮箱注册过没有），所以无条件进第二步
      setGateStep('code');
      setGateCode('');
      setGateCooldown(60);
    } catch {
      setGateError(t.gate.error.send);
    } finally {
      setGateBusy(false);
    }
  }

  /**
   * 第二步：填码。对上了就登录——已经是成员的直接进，还不是的当场开一张节点卡。
   * 全程不离开这一页：对话存在 sessionStorage 里，跳走一次就没了。
   */
  async function verifyGateCode() {
    const code = gateCode.replace(/\s+/g, '');
    if (code.length !== 6 || gateBusy) return;
    setGateBusy(true);
    setGateError('');
    try {
      const res = await fetch('/api/login/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: gateEmail.trim(), code, name: gateName.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.memberId) {
        setLoggedIn(true);
        setShowGate(false);
        setGateStep('form');
        setGateCode('');
        await resumePending();
        return;
      }
      setGateError(res.status === 429 ? t.gate.error.tooMany : t.gate.error.code);
    } catch {
      setGateError(t.gate.error.network);
    } finally {
      setGateBusy(false);
    }
  }

  /** 通过开通后，续上被拦下的动作 */
  async function resumePending() {
    if (pendingPathId) {
      const p = getPhilPath(pendingPathId);
      setPendingPathId(null);
      if (p) {
        setDraft('');
        setVoiceInputNotice('');
        setCopied(false);
        setError('');
        setKeepState('idle');
        pendingVoiceContextRef.current = null;
        retryVoiceContextRef.current = null;
        setSession({ pathId: p.id, thread: seedThread(p, openingForNextConversation()) });
      }
      return;
    }
    if (pendingRetry && session && path) {
      setPendingRetry(false);
      setLoading(true);
      try {
        const r = await sendThread(session.thread, path.id, retryVoiceContextRef.current);
        if (r === 'ok') retryVoiceContextRef.current = null;
        else setPendingRetry(true);
      } catch {
        setError(t.error.resend);
      } finally {
        setLoading(false);
      }
    }
  }


  async function copyThread() {
    if (!session) return;
    const text = session.thread
      .map(item => (item.kind === 'coach' ? `${t.copyPrefix.coach}${item.text}` : `${t.copyPrefix.me}${item.text}`))
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      /* 剪贴板不可用时忽略 */
    }
  }

  /**
   * 闸门浮层：悬浮在对话之上，对话记录保持可见可回看，可点 × 关掉。
   *
   * 两步都在这一页完成，绝不跳走——对话存在 sessionStorage 里，
   * 跳一次页就没了。这也是为什么登录用验证码而不是邮件链接。
   */
  const gateOverlay = showGate ? (
    <div className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-black/55 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-[560px] rounded-2xl border border-coral-soft/25 bg-[#131a15] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.55)] max-md:p-6">
        <button
          onClick={() => setShowGate(false)}
          type="button"
          aria-label={t.gate.close}
          className="absolute right-4 top-3 text-2xl leading-none text-white/35 transition-colors hover:text-white"
        >
          ×
        </button>

        <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-coral-soft">
          {t.gate.eyebrow}
        </div>
        <h3 className="text-xl font-semibold">{t.gate.title}</h3>

        {gateStep === 'form' ? (
          <>
            <p className="mt-3 text-[14px] leading-[1.95] text-white/55">{t.gate.body}</p>
            <div className="mt-6 grid gap-3">
              <input
                value={gateName}
                onChange={e => setGateName(e.target.value)}
                maxLength={60}
                placeholder={t.gate.namePlaceholder}
                className="w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-[14px] text-white placeholder:text-white/28 focus:border-coral-soft/60 focus:outline-none"
              />
              <input
                value={gateEmail}
                onChange={e => setGateEmail(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') void sendGateCode();
                }}
                type="email"
                autoComplete="email"
                maxLength={120}
                placeholder={t.gate.emailPlaceholder}
                className="w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-[14px] text-white placeholder:text-white/28 focus:border-coral-soft/60 focus:outline-none"
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <button
                onClick={sendGateCode}
                disabled={!gateName.trim() || !gateEmail.trim() || gateBusy}
                type="button"
                className="rounded-full bg-coral-soft px-6 py-2.5 text-[14px] font-medium text-[#20140f] transition-opacity disabled:opacity-40"
              >
                {gateBusy ? t.gate.sending : t.gate.cta}
              </button>
              {gateError && <span className="text-[13px] text-coral-soft">{gateError}</span>}
            </div>
            <p className="mt-5 text-[12px] leading-relaxed text-white/32">{t.gate.privacy}</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-white/32">{t.gate.alreadyMember}</p>
          </>
        ) : (
          <>
            <p className="mt-3 text-[14px] leading-[1.95] text-white/55">
              {t.gate.codeSentTo(gateEmail.trim())}
              <br />
              <span className="text-white/35">{t.gate.codeHint}</span>
            </p>
            <input
              value={gateCode}
              onChange={e => setGateCode(e.target.value.replace(/[^\d\s]/g, '').slice(0, 8))}
              onKeyDown={e => {
                if (e.key === 'Enter') void verifyGateCode();
              }}
              // 手机上弹数字键盘；one-time-code 让系统能从邮件通知里一键填充，
              // 人不用切出去再回来——切出去这个标签页就可能被系统回收
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              autoFocus
              placeholder={t.gate.codePlaceholder}
              className="mt-5 w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-center font-mono text-[20px] tracking-[0.4em] text-white placeholder:tracking-normal placeholder:font-sans placeholder:text-white/28 focus:border-coral-soft/60 focus:outline-none"
            />
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <button
                onClick={verifyGateCode}
                disabled={gateCode.replace(/\s+/g, '').length !== 6 || gateBusy}
                type="button"
                className="rounded-full bg-coral-soft px-6 py-2.5 text-[14px] font-medium text-[#20140f] transition-opacity disabled:opacity-40"
              >
                {gateBusy ? t.gate.verifying : t.gate.codeCta}
              </button>
              {gateError && <span className="text-[13px] text-coral-soft">{gateError}</span>}
            </div>
            <div className="mt-5 flex items-center justify-between text-[12px] text-white/32">
              <button
                onClick={() => {
                  setGateStep('form');
                  setGateCode('');
                  setGateError('');
                }}
                type="button"
                className="underline-offset-4 transition-colors hover:text-white hover:underline"
              >
                {t.gate.changeEmail}
              </button>
              <button
                onClick={sendGateCode}
                disabled={gateCooldown > 0 || gateBusy}
                type="button"
                className="underline-offset-4 transition-colors hover:text-white hover:underline disabled:no-underline disabled:hover:text-white/32"
              >
                {gateCooldown > 0 ? t.gate.resendIn(gateCooldown) : t.gate.resend}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  ) : null;

  if (!session || !path) {
    return (
      <div>
        {gateOverlay}
        <div className="mb-8 flex items-center gap-4 text-[12px] text-white/36">
          <span className="h-px w-10 bg-white/20" />
          <span>{t.chooseHint}</span>
        </div>
        {loggedIn && (
          <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-white/40">
            <span>
              {importState === 'importing'
                ? t.profile.importing
                : profileKnown
                  ? t.profile.known
                  : t.profile.unknown}
            </span>
            <button
              onClick={importProfile}
              disabled={importState === 'importing'}
              type="button"
              className="text-coral-soft underline-offset-4 transition-colors hover:text-white hover:underline disabled:opacity-50"
            >
              {profileKnown ? t.profile.reimport : t.profile.import}
            </button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-6 max-md:grid-cols-1">
          {PHIL_PATHS.map(p => (
            <button
              key={p.id}
              onClick={() => begin(p)}
              disabled={!conversationReady}
              className={`group relative overflow-hidden rounded-lg border border-white/12 p-7 text-left shadow-[0_18px_60px_rgba(0,0,0,0.16)] transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70 disabled:hover:translate-y-0 ${MOOD_GRADIENT[p.mood]}`}
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_16%,rgba(255,255,255,0.24),transparent_36%),linear-gradient(180deg,transparent_0%,rgba(5,17,11,0.42)_100%)]" />
              <div className="relative">
                <div className="mb-4 h-px w-10 bg-white/50" />
                <h3
                  className="text-[1.5rem] font-semibold leading-snug text-white"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {t.paths[p.id as PathId].label}
                </h3>
                <p className="mt-3 text-[14px] leading-relaxed text-white/78">{t.paths[p.id as PathId].hint}</p>
                <span className="mt-6 inline-flex items-center gap-2 text-[13px] text-white/82">
                  {conversationReady ? t.enter : t.entering}
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {gateOverlay}
      <div className="mb-7 flex items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-coral-soft">
            {t.paths[path.id as PathId].label}
          </div>
          <div className="mt-2 text-[12px] text-white/30">{t.ephemeral}</div>
        </div>
        <button
          onClick={reset}
          className="text-[13px] text-white/40 underline-offset-4 transition-colors hover:text-white"
        >
          {t.switchPath}
        </button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 max-md:p-4">
        <div className="flex flex-col gap-4">
          {session.thread.map((item, i) =>
            item.kind === 'coach' ? (
              <div key={i} className="max-w-[86%] self-start">
                <div className="mb-1 text-[10px] tracking-[0.2em] text-white/28">
                  phil-coach
                </div>
                <div className="rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.06] px-5 py-3.5 text-[15px] leading-[1.9] text-white/82">
                  {item.text}
                </div>
              </div>
            ) : (
              <div key={i} className="max-w-[86%] self-end">
                <div className="mb-1 text-right text-[10px] uppercase tracking-[0.2em] text-white/28">
                  {t.me}
                </div>
                <div className="whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-coral-soft/85 px-5 py-3.5 text-[15px] leading-[1.9] text-[#20140f]">
                  {item.text}
                </div>
              </div>
            ),
          )}
          {/* 语音直达：转写还没回来时先把气泡放上屏——等待发生在对话里，而不是输入框里 */}
          {voiceIn.transcribing && voiceMode === 'direct' && (
            <div className="max-w-[86%] self-end">
              <div className="mb-1 text-right text-[10px] uppercase tracking-[0.2em] text-white/28">
                {t.me}
              </div>
              <div className="animate-pulse whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-coral-soft/45 px-5 py-3.5 text-[15px] leading-[1.9] text-[#20140f]/75">
                {liveCaption || t.transcribing}
              </div>
            </div>
          )}
          {loading && (
            <div className="max-w-[86%] self-start">
              <div className="mb-1 text-[10px] tracking-[0.2em] text-white/28">
                phil-coach
              </div>
              <div className="rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.06] px-5 py-3.5 text-[15px] leading-[1.9] text-white/48">
                {t.thinking}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="mt-6 border-t border-white/8 pt-5">
          {error && (
            <div className="mb-3 rounded-xl border border-coral-soft/25 bg-coral-soft/10 px-4 py-3 text-[13px] text-coral-soft">
              {error}
            </div>
          )}
          {voiceIn.error && (
            <div role="alert" className="mb-3 text-[12px] text-coral-soft/90">
              {voiceIn.error}
              {/* 一路静音多半是虚拟声卡（Cast、Krisp、Loopback…）抢了默认输入。
                  与其让人去浏览器设置里翻，不如就地把设备列出来点一下。 */}
              {voiceIn.inputDevices.length > 0 && (
                <span className="mt-2 flex flex-wrap gap-1.5">
                  {voiceIn.inputDevices.map(device => (
                    <button
                      key={device.id}
                      type="button"
                      onClick={() => voiceIn.chooseInputDevice(device.id)}
                      className="rounded-full border border-coral-soft/40 px-2.5 py-1 text-[11.5px] text-coral-soft transition-colors hover:bg-coral-soft/12"
                    >
                      {device.label}
                    </button>
                  ))}
                </span>
              )}
            </div>
          )}
          {voiceInputNotice && (
            <div role="status" className="mb-3 text-[12px] text-coral-soft/90">
              {voiceInputNotice}
            </div>
          )}
          {voiceOut.error && (
            <div role="alert" className="mb-3 text-[12px] text-coral-soft/90">{voiceOut.error}</div>
          )}
          {voiceOut.playbackBlocked && (
            <div role="status" className="mb-3 flex flex-wrap items-center gap-2 text-[12px] text-white/55">
              {t.voice.autoplayBlocked}
              <button
                onClick={voiceOut.resume}
                type="button"
                className="rounded-full border border-coral-soft/40 px-2.5 py-1 text-coral-soft transition-colors hover:bg-coral-soft/12"
              >
                {t.voice.autoplayCta}
              </button>
            </div>
          )}
          <div
            className={`relative rounded-2xl border transition-colors ${
              voicePanel || dictating
                ? 'border-coral-soft/55 bg-coral-soft/[0.07]'
                : 'border-white/12 bg-white/[0.04] focus-within:border-coral-soft/50'
            }`}
          >
            {voicePanel ? (
              /* 录音态：一整块都能点，再点一次就结束——手指不用去瞄小按钮 */
              <div className="relative">
                {!voiceIn.transcribing && (
                  <button
                    onClick={cancelVoice}
                    type="button"
                    aria-label={t.voice.cancelRecording}
                    title={t.voice.cancel}
                    className="absolute right-2 top-2 z-10 grid h-11 w-11 place-items-center rounded-full text-white/30 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <CloseIcon />
                  </button>
                )}
                <button
                  onClick={finishVoice}
                  disabled={!voiceIn.recording}
                  type="button"
                  aria-label={voiceIn.recording ? t.voice.speakStop : t.voice.speakPreparing}
                  className="flex w-full flex-col items-center gap-5 px-4 py-10 disabled:cursor-default"
                >
                  <span
                    className={`relative grid h-28 w-28 place-items-center rounded-full bg-coral-soft/90 ${
                      voiceIn.transcribing ? 'animate-pulse' : ''
                    }`}
                  >
                    {voiceIn.recording && (
                      <span className="absolute inset-0 animate-ping rounded-full bg-coral-soft/25" />
                    )}
                    <span className="relative">
                      <WaveBars
                        level={voiceIn.level}
                        active={voiceIn.recording}
                        maxHeight={46}
                        barWidth={5}
                        barClassName="bg-[#24140f]/85"
                      />
                    </span>
                  </span>
                  <span className="text-center">
                    <span className="block text-[14.5px] text-white/80">
                      {voiceIn.requesting
                        ? t.voice.opening
                        : t.voice.listening(formatSeconds(voiceIn.elapsed))}
                    </span>
                    {voiceIn.recording && (
                      <span className="mt-1.5 block text-[12.5px] text-white/40">
                        {t.voice.speakHint}
                      </span>
                    )}
                    {voiceIn.recording && liveCaption && (
                      <span className="mx-auto mt-3 line-clamp-2 block max-w-[480px] px-2 text-[13.5px] leading-[1.8] text-white/60">
                        {liveCaption}
                      </span>
                    )}
                  </span>
                </button>
              </div>
            ) : (
              <>
                <textarea
                  value={displayedDraft}
                  onChange={e => {
                    draftRef.current = e.target.value;
                    setDraft(e.target.value);
                    setVoiceInputNotice('');
                    pendingVoiceContextRef.current = null;
                  }}
                  onKeyDown={e => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
                  }}
                  disabled={loading}
                  readOnly={dictating}
                  rows={3}
                  maxLength={1200}
                  placeholder={dictating ? t.voice.dictatingPlaceholder : t.voice.draftPlaceholder}
                  className="w-full resize-none rounded-2xl border-0 bg-transparent px-4 pb-1 pt-3.5 text-[15px] leading-relaxed text-white placeholder:text-white/28 focus:outline-none disabled:opacity-55"
                />
                {dictating ? (
                  /* 听写中：按钮行原地变一条紧凑控制条——输入框不让位，字在上面实时出现 */
                  <div className="flex items-center gap-3 px-3 pb-3">
                    {!voiceIn.transcribing && (
                      <button
                        onClick={cancelVoice}
                        type="button"
                        aria-label={t.voice.dictateCancel}
                        title={t.voice.cancel}
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        <CloseIcon />
                      </button>
                    )}
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <WaveBars level={voiceIn.level} active={voiceIn.recording} maxHeight={20} />
                      <span className="truncate text-[12.5px] text-coral-soft/90">
                        {voiceIn.transcribing
                          ? t.voice.converting
                          : voiceIn.requesting
                            ? t.voice.opening
                            : t.voice.listening(formatSeconds(voiceIn.elapsed))}
                      </span>
                    </div>
                    <button
                      /* 还没录起来时它是「退出」——否则一旦卡在开麦克风这一步就出不来了 */
                      onClick={voiceIn.recording ? finishVoice : cancelVoice}
                      disabled={voiceIn.transcribing}
                      type="button"
                      aria-label={voiceIn.recording ? t.voice.dictateDone : t.voice.dictateExit}
                      title={voiceIn.recording ? t.voice.done : t.voice.exit}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-coral-soft text-[#24140f] transition-opacity disabled:opacity-45"
                    >
                      <span aria-hidden="true" className="block h-3.5 w-3.5 rounded-[3px] bg-current" />
                    </button>
                  </div>
                ) : (
                <div className="flex items-center justify-between gap-2 px-3 pb-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  {/* 朗读开关：和麦克风放在一起，说和听在同一排 */}
                  <button
                    onClick={() => voiceOut.setEnabled(!voiceOut.enabled)}
                    aria-pressed={voiceOut.enabled}
                    type="button"
                    title={
                      voiceOut.enabled
                        ? t.voice.readOn
                        : t.voice.readOff
                    }
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] transition-colors ${
                      voiceOut.enabled
                        ? 'border-coral-soft/55 bg-coral-soft/12 text-coral-soft'
                        : 'border-white/12 bg-white/[0.04] text-white/45 hover:text-white'
                    }`}
                  >
                    <SpeakerIcon waves={voiceOut.enabled} />
                    {voiceOut.enabled
                      ? voiceOut.loading
                        ? t.voice.readPreparing
                        : t.voice.readStateOn
                      : t.voice.readStateOff}
                  </button>
                  {/* 换嗓音：只在开着朗读时出现，一颗按钮在两个嗓音之间轮换
                      （手机宽度放不下两颗并排的音色） */}
                  {voiceOut.enabled && (
                    <button
                      onClick={() => {
                        const i = PHIL_COACH_VOICES.findIndex(v => v.id === voiceOut.voiceId);
                        voiceOut.setVoice(PHIL_COACH_VOICES[(i + 1) % PHIL_COACH_VOICES.length].id);
                      }}
                      type="button"
                      title={t.voice.switchVoice}
                      className="rounded-full px-2.5 py-1.5 text-[12px] text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white"
                    >
                      {PHIL_COACH_VOICES.find(v => v.id === voiceOut.voiceId)?.label}
                    </button>
                  )}
                  </div>
                  {voiceIn.supported && (
                    /* 两个语音入口，像 Gemini：🎤 听写进输入框（可改再发），声波直达（说完就发） */
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => void startVoice('dictate')}
                        disabled={loading || voiceBusy || displayedDraft.length >= 1200}
                        type="button"
                        aria-label={t.voice.dictateLabel}
                        title={t.voice.dictateTitle}
                        className="grid h-10 w-10 place-items-center rounded-full border border-white/14 bg-white/[0.05] text-white/70 transition-colors hover:bg-white/12 hover:text-white disabled:opacity-40"
                      >
                        <MicrophoneIcon />
                      </button>
                      <button
                        onClick={() => void startVoice('direct')}
                        disabled={loading || voiceBusy}
                        type="button"
                        aria-label={t.voice.speakLabel}
                        title={t.voice.speakTitle}
                        className="grid h-10 w-10 place-items-center rounded-full bg-coral-soft/90 text-[#24140f] transition-colors hover:bg-coral-soft disabled:opacity-40"
                      >
                        <VoiceWaveIcon />
                      </button>
                    </div>
                  )}
                </div>
                )}
              </>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <span className="text-[12px] text-white/45">
              {polishing
                ? t.tidying
                : displayedDraft.length >= 1200
                  ? t.draftLimit
                  : t.draftCount(displayedDraft.length)}
            </span>
            <div className="flex flex-wrap gap-3">
              {hasConversation && loggedIn && session.thread.some(item => item.kind === 'me') && (
                <button
                  onClick={keepThread}
                  disabled={keepState === 'saving' || keepState === 'saved'}
                  type="button"
                  className="rounded-full border border-coral-soft/40 bg-coral-soft/10 px-5 py-2.5 text-[14px] text-coral-soft transition-colors hover:bg-coral-soft/20 disabled:opacity-60"
                >
                  {keepState === 'saved'
                    ? t.keep.done
                    : keepState === 'saving'
                      ? t.keep.saving
                      : keepState === 'error'
                        ? t.keep.failed
                        : t.keep.idle}
                </button>
              )}
              {hasConversation && (
                <button
                  onClick={copyThread}
                  type="button"
                  className="rounded-full border border-white/16 bg-white/[0.06] px-5 py-2.5 text-[14px] text-white/70 transition-colors hover:bg-white/12 hover:text-white"
                >
                  {copied ? t.copied : t.copy}
                </button>
              )}
              <button
                onClick={submit}
                disabled={
                  loading ||
                  liveVoice.listening ||
                  voiceIn.requesting ||
                  voiceIn.recording ||
                  voiceIn.transcribing ||
                  !draft.trim()
                }
                type="button"
                className="rounded-full bg-white px-6 py-2.5 text-[14px] font-medium text-[#141a12] transition-opacity disabled:opacity-35"
              >
                {loading ? t.sending : t.send}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          onClick={reset}
          type="button"
          className="rounded-full border border-white/16 bg-white/[0.06] px-5 py-2.5 text-[14px] text-white/78 transition-colors hover:bg-white/12 hover:text-white"
        >
          {t.againPath}
        </button>
        <Link
          href="/#join"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-coral-soft px-5 py-2.5 text-[14px] font-medium text-[#20140f] no-underline transition-opacity hover:opacity-90"
        >
          {t.join}
        </Link>
      </div>
    </div>
  );
}
