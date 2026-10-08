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
  OPEN_PATH_ID,
  PHIL_PATHS,
  PROFILE_PATH,
  getPhilOpening,
  getPhilPath,
  normalizePhilProfileName,
} from '@/lib/philCoach';

/** 以字典里的键为准：lib 里加了小径却没配文案，这里会当场编译报错 */
type PathId = keyof ReturnType<typeof dict>['philCoach']['experience']['paths'];

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

/**
 * 聊满几轮才出那句「填写完个人信息」的邀请。
 *
 * 数的是 coach 说过几句，和服务端闸门那边口径一致——注意开场白也算一句，
 * 所以 9 实际是「开场白 + 8 次真实回应」。短对话不打扰，
 * 真聊进去的人才会看到。
 */
const INVITE_AFTER_TURNS = 9;
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
  const pt = useMemo(() => dict(locale).philCoach.page, [locale]);
  const en = locale === 'en';
  const [session, setSession] = useState<Session | null>(null);
  /** 输入框下面那排小径里选中的一条（可以不选：不选就是 open，直接开口） */
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null);
  /**
   * 页头那句问话用第几句开场白。首屏固定第一句（服务端渲染出来就有字，不闪）；
   * 每开一段新对话轮到下一句。
   */
  const [openingSlot, setOpeningSlot] = useState(0);
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
  const [showGate, setShowGate] = useState(false);
  /**
   * 浮层三步：验证邮箱 → 填验证码 → 只有新用户才选择轻登记或完整注册。
   * 已有成员在第二步就直接登录，不再重复填称呼。
   */
  const [gateStep, setGateStep] = useState<'email' | 'code' | 'new' | 'name'>('email');
  /**
   * 被哪一道闸拦下的。
   *   member  —— 8 轮，还不是成员：先验证邮箱，再登录或选择登记方式
   *   profile —— 40 轮，是成员但卡片还薄：请他把节点卡填完
   */
  const [gateKind, setGateKind] = useState<'member' | 'profile'>('member');
  const gateKindRef = useRef<'member' | 'profile'>('member');
  /** 我们自己发起的跳转，用来让 beforeunload 那道提示放行 */
  const leavingOnPurposeRef = useRef(false);
  /** 浮层第三步的称呼框。不能靠 autoFocus，见下面那个 effect */
  const gateNameRef = useRef<HTMLInputElement>(null);
  /**
   * 浮层里的提交进行中。用 ref 不用 gateBusy：setGateBusy 是异步的，
   * 快速双击的第二下在重渲染之前发生，两次都能进去——「确认并继续」
   * 双击会把同一个码提交两遍，第二遍查不到未核销的行、报「验证码不对」，
   * 可其实第一遍已经验过了，人看到的是一个自相矛盾的报错。
   */
  const gateSubmittingRef = useRef(false);
  /** 自己的节点 id，补卡片时跳过去用 */
  const [myMemberId, setMyMemberId] = useState('');
  /** 卡片填完了没有。薄卡片的人才会在收尾处看到那句邀请。 */
  const [profileComplete, setProfileComplete] = useState(true);
  const [gateName, setGateName] = useState('');
  const [gateEmail, setGateEmail] = useState('');
  const [gateCode, setGateCode] = useState('');
  const [gateBusy, setGateBusy] = useState(false);
  const [gateError, setGateError] = useState('');
  const [gateCooldown, setGateCooldown] = useState(0);
  const [pendingRetry, setPendingRetry] = useState(false);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  /** 发送进行中。用 ref：setLoading 是异步的，连按两下发送（或语音直达撞上手动发送）会发出两份 */
  const sendingRef = useRef(false);
  /**
   * 第几段对话。「新对话」时加一：上一段还在路上的请求回来时对不上号，结果直接丢掉——
   * 不然旧回复会落进新的空对话里，或者旧请求撞上闸门、报错时把浮层和错误弹在新对话上，
   * 输入框还会一直锁着（sendingRef 要等旧请求回来才放开）。
   */
  const genRef = useRef(0);
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
  const voiceStartLockRef = useRef(false);
  const liveVoice = useSpeechInput(text => {
    captionSeenRef.current = true;
    setCaption(current => appendTranscript(current, text));
  });
  const voiceIn = useServerSpeechInput(result => {
    setCaption('');
    const mode = voiceModeRef.current;
    voiceModeRef.current = null;
    setVoiceMode(null);
    if (mode === 'direct' && !result.needsReview) {
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
  /**
   * 页头那一句大字问话。还没开口时是这一轮的开场白（导入过资料的带称呼）；
   * 开口之后就是这段对话的第一句（开场白已经进了对话记录）。
   */
  const heading = session
    ? session.thread[0]?.kind === 'coach' ? session.thread[0].text : ''
    : getPhilOpening(t.opening, profileKnown ? profileName : '', openingSlot);
  /** 页头之下的对话：第一句开场白已经当问话显示了，不再重复 */
  const logItems = session ? (session.thread[0]?.kind === 'coach' ? session.thread.slice(1) : session.thread) : [];
  // 字幕两条路：浏览器听写（Web Speech）逐字出、几乎零延迟；
  // 服务端分段转写以短语为单位刷新，但哪儿都能用。
  //
  // 谁真的能走第一条，只有运行时才知道：
  // Edge 压根没实现、Firefox 默认关着、iOS 的微信与 Chrome 都是 WKWebView 拿不到，
  // 而 Chrome/Edge 的后端在 Google——在够不着 Google 的网络里 API 在、一用就报
  // network。所以判据是「它有没有真的出字」，不是嗅探 UA。
  //
  // iOS Safari 优先用本机 Web Speech 给即时字幕，同时保留 PCM 做完整定稿。
  // 若某台设备两路采音冲突，下面的电平看门狗会自动切回服务端；排障时也可用
  // ?webspeech=0 主动关掉。微信仍然不会走这条。
  const webSpeechOptOut = useClientFlag(
    () => typeof window !== 'undefined'
      && new URLSearchParams(window.location.search).get('webspeech') === '0',
  );
  // 还有一层比「支不支持」更要紧的：能不能和我们的采音共存。
  // Chrome 上 SpeechRecognition 会把麦克风独占走，我们这一路只录到静音，
  // 最后服务端收到的是空音频——报「这段没能转成文字」。Safari 上实测两路并存没问题。
  const webKitEngine = useClientFlag(isWebKitBrowser);
  const useWebSpeechCaptions =
    liveVoice.supported && !liveVoice.inWeChat && webKitEngine
    && !webSpeechOptOut;
  // 实时字幕：谁有内容就显示谁。
  // 不能按 useWebSpeechCaptions 固定挑一边——看门狗把浏览器听写换成服务端之后，
  // 显示源不跟着切的话，请求照发、字却永远不出现。
  // 一旦退回服务端，以服务端从录音开头重建的字幕为准；否则旧的浏览器定稿会
  // 一直挡在前面，让服务端明明在出字、输入框却看起来没有更新。
  const liveCaption = voiceIn.partial || appendTranscript(caption, liveVoice.interim);
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
    if (voiceStartLockRef.current || voiceBusy) return;
    voiceStartLockRef.current = true;
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
    try {
      const started = await voiceIn.start({
        partials: !useWebSpeechCaptions,
        // 灰色麦克风只是听写，不需要等较慢的语气分析；直达模式才保留声音观察。
        analysis: mode === 'direct',
      });
      if (!started || voiceModeRef.current !== mode) {
        voiceModeRef.current = null;
        setVoiceMode(null);
        return;
      }
      // 一定要等麦克风到手再起浏览器听写。两个都在抢麦克风，同时发起的话
      // 两套权限流程会叠在一起——Mac Chrome 上表现为卡在「正在打开麦克风…」。
      if (!useWebSpeechCaptions) return;
      liveVoice.start();
      // 看门狗现在只是兜底。正常的失败（没权限、没麦克风、连不上 Google）都会
      // 触发 error 事件，下面那个 effect 会立刻切走，不必白等这几秒。
      // 留着它是为了「不报错也不出字」那种装死的情况。
      if (captionWatchdogRef.current) clearTimeout(captionWatchdogRef.current);
      captionWatchdogRef.current = setTimeout(() => {
        if (captionSeenRef.current) return;
        fallbackToServerCaptions();
      }, CAPTION_WATCHDOG_MS);
    } finally {
      voiceStartLockRef.current = false;
    }
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
    if (captionWatchdogRef.current) {
      clearTimeout(captionWatchdogRef.current);
      captionWatchdogRef.current = null;
    }
    if (starveTimerRef.current) {
      clearTimeout(starveTimerRef.current);
      starveTimerRef.current = null;
    }
    liveVoice.cancel();
    // 完整录音仍是定稿；浏览器字幕只在音频链路失败时兜底，用户说过的话不丢。
    voiceIn.stop(liveCaption);
  };
  const cancelVoice = () => {
    if (captionWatchdogRef.current) {
      clearTimeout(captionWatchdogRef.current);
      captionWatchdogRef.current = null;
    }
    if (starveTimerRef.current) {
      clearTimeout(starveTimerRef.current);
      starveTimerRef.current = null;
    }
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
    if (restored) {
      setSession(current => current ?? restored);
      return;
    }
    // 有鼠标键盘的设备上，进来光标就在框里，直接能打字。
    // 手机不自动聚焦：一聚焦就弹键盘，盖住半屏，人还没看清这一页是什么
    if (window.matchMedia('(pointer: fine)').matches) textareaRef.current?.focus({ preventScroll: true });
  }, []);

  // 对话有变化就暂存（仅本次浏览会话）
  useEffect(() => {
    saveSession(session);
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const warn = (e: BeforeUnloadEvent) => {
      // 我们自己按钮发起的跳转不拦。这道提示是防手滑关掉页面丢了对话，
      // 而点「完整注册」是明确要去注册——再弹一次「离开此网站？」
      // 等于让人对自己刚点的按钮再确认一遍，点了取消还会停在原地。
      // 对话本来就存在 sessionStorage 里，跳走也不会丢。
      if (leavingOnPurposeRef.current) return;
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [session]);

  /**
   * 新消息出来时的滚动。输入框跟着对话往下长（不吸底：手机键盘弹起时吸底的框很难伺候），
   * 所以要保证两件事：最新那一条看得见，输入框也尽量看得见。
   * 最新一条加上输入框放得进一屏，就让输入框贴着屏幕下沿；放不进（回复很长），
   * 就把最新一条的开头滚到导航下面，先读它。
   */
  useEffect(() => {
    if (!session) return;
    const composer = composerRef.current;
    const last = logRef.current?.lastElementChild as HTMLElement | null | undefined;
    if (!composer) return;
    const behavior: ScrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
    if (!last) {
      composer.scrollIntoView({ behavior, block: 'nearest' });
      return;
    }
    const span = composer.getBoundingClientRect().bottom - last.getBoundingClientRect().top;
    if (span <= window.innerHeight - 112) composer.scrollIntoView({ behavior, block: 'nearest' });
    else last.scrollIntoView({ behavior, block: 'start' });
    // 只在对话长了一截 / 状态变了时滚；session 对象本身每次输入都会换，不能当触发条件
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  /**
   * 服务器会话是登录态的唯一来源；记忆接口只负责资料和记忆。
   * 这样即使记忆表临时查询失败，也不会把已有登录会话误判成游客。
   */
  async function refreshIdentity(): Promise<boolean> {
    try {
      const sessionResponse = await fetch('/api/session', { cache: 'no-store' });
      if (!sessionResponse.ok) return loggedIn;
      const sessionJson = await sessionResponse.json();
      const memberId = typeof sessionJson?.memberId === 'string' ? sessionJson.memberId : '';
      setLoggedIn(Boolean(memberId));
      setMyMemberId(memberId);
      if (!memberId) return false;

      try {
        const memoryResponse = await fetch('/api/phil-coach/memory', { cache: 'no-store' });
        if (!memoryResponse.ok) return true;
        const json = await memoryResponse.json();
        setProfileName(normalizePhilProfileName(json.profileName));
        setProfileComplete(Boolean(json.profileComplete));
        const mems: { path_id?: string }[] = json.memories ?? [];
        setProfileKnown(mems.some(m => m.path_id === PROFILE_PATH));
        // 第一次：还没有任何记忆时，默认把注册资料导入为「关于我」种子
        if (mems.length === 0) await importProfile();
      } catch {
        // 记忆服务失败只让个性化暂时降级，不改变已确认的登录态。
      }
      return true;
    } catch {
      // 网络瞬断不是退出登录。保留当前状态，真正的对话接口仍会在需要时权威拦截。
      return loggedIn;
    }
  }

  useEffect(() => {
    gateKindRef.current = gateKind;
  }, [gateKind]);

  /**
   * 走到第三步就把光标放进称呼框。
   *
   * 不能靠 autoFocus：验证码框和称呼框在浮层里是同一个父节点的同一个位置、
   * 又都是 <input>，React 认成同一个节点直接复用，不重新挂载——
   * 而 autoFocus 只在挂载那一刻生效，那个属性根本不会被执行。
   */
  useEffect(() => {
    if (showGate && gateStep === 'name') gateNameRef.current?.focus();
  }, [showGate, gateStep]);

  useEffect(() => {
    let active = true;
    void refreshIdentity().finally(() => {
      if (active) setIdentityReady(true);
    });
    return () => {
      active = false;
    };
    // 只在首次挂载读取；验证码成功后会显式再调用一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 从邮件页或另一个标签页完成登录后，回到这页就重新确认会话。
  // Cookie 是同源共享的，不需要再让用户在 PhilCoach 里填第二次验证码。
  useEffect(() => {
    const refreshOnReturn = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshIdentity().then(authenticated => {
        if (!authenticated) return;
        if (gateKindRef.current === 'member') {
          setShowGate(false);
          setGateStep('email');
        }
      });
    };
    window.addEventListener('focus', refreshOnReturn);
    document.addEventListener('visibilitychange', refreshOnReturn);
    return () => {
      window.removeEventListener('focus', refreshOnReturn);
      document.removeEventListener('visibilitychange', refreshOnReturn);
    };
    // 监听器只注册一次；每次回到页面时，权威状态都从 /api/session 重取。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 重新发送的 60 秒倒计时（服务端也有同样的冷却）
  useEffect(() => {
    if (gateCooldown <= 0) return;
    const id = setTimeout(() => setGateCooldown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [gateCooldown]);

  /**
   * 人主动关掉浮层 = 这一次先不处理，那条待重发的消息也要一起放下。
   *
   * 只关浮层不清 pendingRetry 会转成一个自我循环：40 轮那道闸拦下的是**已登录**的人，
   * 于是「已登录 + 待重试 + 浮层已关」正好凑齐下面那个 effect 的全部条件，
   * 它重发 → 服务端照旧回 403 → 重新置上 pendingRetry → effect 再次触发，
   * 一直打下去。而 profile 那版浮层里只有一个跳去补卡片的链接，
   * 关掉它恰恰是最自然的动作。
   *
   * 放下之后不会没法继续：人再说一句话仍会撞上闸门，浮层照常弹回来。
   */
  function dismissGate() {
    setShowGate(false);
    setPendingRetry(false);
  }

  useEffect(() => {
    if (!showGate) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !gateBusy) dismissGate();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showGate, gateBusy]);

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

  function reset() {
    genRef.current += 1;
    sendingRef.current = false;
    setPendingRetry(false);
    setShowGate(false);
    liveVoice.cancel();
    voiceIn.cancel();
    setSession(null);
    setSelectedPathId(null);
    // 轮到下一句开场白。计数器是全浏览器共用的，可能正好轮回到眼前这一句，那就再往后挪一句
    let next = nextOpeningIndex();
    if (next % 4 === openingSlot % 4) next = nextOpeningIndex();
    setOpeningSlot(next);
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

  /**
   * 发送对话线取回复；命中登记闸门时返回 'gate'（不视为错误）。
   * 回来时已经「新对话」过了（gen 对不上）返回 'stale'，什么都不动
   */
  async function sendThread(
    thread: ThreadItem[],
    pathId: string,
    voiceContext: VoiceAnalysis | null,
    gen: number,
  ): Promise<'ok' | 'gate' | 'stale'> {
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
    if (gen !== genRef.current) return 'stale';
    if (res.status === 403 && (json.error === 'member-required' || json.error === 'profile-required')) {
      setGateKind(json.error === 'profile-required' ? 'profile' : 'member');
      if (typeof json.memberId === 'string') setMyMemberId(json.memberId);
      return 'gate';
    }
    if (!res.ok || typeof json.reply !== 'string') {
      throw new Error(String(json.error || 'reply-failed'));
    }
    const reply = json.reply.trim();
    setSession(current =>
      current && current.pathId === pathId
        ? { ...current, thread: [...current.thread, { kind: 'coach', text: reply }] }
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
    if (loading || sendingRef.current) return false;

    let base: Session;
    if (session && path) {
      base = session;
    } else if (!session && conversationReady) {
      // 第一句话：页头那句问话就是开场白，接上这句，对话就开始了。
      // 没选小径就是 open——由模型从话里听出 ta 此刻需要哪一种陪伴
      spokenRef.current = heading;   // 开场白已经在屏幕上了，开着朗读也不再念一遍
      setCopied(false);
      setKeepState('idle');
      retryVoiceContextRef.current = null;
      base = { pathId: selectedPathId ?? OPEN_PATH_ID, thread: [{ kind: 'coach', text: heading }] };
    } else {
      return false;
    }

    sendingRef.current = true;
    const gen = genRef.current;
    const nextThread: ThreadItem[] = [...base.thread, { kind: 'me', text: answer }];
    setSession({ ...base, thread: nextThread });
    setDraft('');
    setVoiceInputNotice('');
    setError('');
    setLoading(true);

    try {
      const r = await sendThread(nextThread, base.pathId, voiceContext, gen);
      if (r === 'gate') {
        retryVoiceContextRef.current = voiceContext;
        setPendingRetry(true);
        setShowGate(true);
      } else if (r === 'ok') {
        retryVoiceContextRef.current = null;
      }
    } catch {
      if (gen === genRef.current) {
        retryVoiceContextRef.current = null;
        setError(t.error.send);
      }
    } finally {
      // 已经开了新对话：loading 和 sendingRef 在 reset() 里放开过了，别去动新对话的状态
      if (gen === genRef.current) {
        setLoading(false);
        sendingRef.current = false;
      }
    }
    return true;
  }

  /**
   * 回复到了，光标回到输入框（有鼠标键盘的设备上）：发送时输入框被禁用，焦点会丢，
   * 不放回去的话每句都要再点一下框才能接着打字。手机不放：一放就弹键盘，挡住刚到的回复
   */
  const wasLoadingRef = useRef(false);
  useEffect(() => {
    if (wasLoadingRef.current && !loading && !showGate && window.matchMedia('(pointer: fine)').matches) {
      // 只在人没去别处打字时放回来（比如等回复时去「关于」里写反馈，就别把光标抢走）
      const here = document.activeElement;
      if (!here || here === document.body || composerRef.current?.contains(here)) {
        textareaRef.current?.focus({ preventScroll: true });
      }
    }
    wasLoadingRef.current = loading;
  }, [loading, showGate]);

  /** 「新对话」：聊过的会散掉，先问一句 */
  function restart() {
    if (session?.thread.some(item => item.kind === 'me') && !window.confirm(t.restartConfirm)) return;
    reset();
    // 和进页面时一样：手机上不自动聚焦（会弹键盘盖住新的问话和小径）
    if (window.matchMedia('(pointer: fine)').matches) textareaRef.current?.focus({ preventScroll: true });
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



  /** 第一步：只验证邮箱。验证码通过后，服务器才安全地分辨老用户和新用户。 */
  async function sendGateCode() {
    const email = gateEmail.trim();
    if (!/^.+@.+\..+$/.test(email) || gateBusy || gateCooldown > 0) return;
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
   * 第二步：填码。已有成员直接登录；新邮箱只完成验证，随后再选轻登记或完整注册。
   */
  async function verifyGateCode() {
    const code = gateCode.replace(/\s+/g, '');
    if (code.length !== 6 || gateBusy || gateSubmittingRef.current) return;
    gateSubmittingRef.current = true;
    setGateBusy(true);
    setGateError('');
    try {
      const res = await fetch('/api/login/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: gateEmail.trim(), code }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.registered === true && json.memberId) {
        setLoggedIn(true);
        setMyMemberId(json.memberId);
        await refreshIdentity();
        setShowGate(false);
        setGateStep('email');
        setGateCode('');
        return;
      }
      if (res.ok && json.registered === false) {
        setGateStep('new');
        setGateCode('');
        return;
      }
      setGateError(res.status === 429 ? t.gate.error.tooMany : t.gate.error.code);
    } catch {
      setGateError(t.gate.error.network);
    } finally {
      setGateBusy(false);
      gateSubmittingRef.current = false;
    }
  }

  /** 新用户选择轻登记：邮箱已在上一步验证，这里只补称呼并创建薄节点。 */
  async function finishLightJoin() {
    if (!gateName.trim() || gateBusy || gateSubmittingRef.current) return;
    gateSubmittingRef.current = true;
    setGateBusy(true);
    setGateError('');
    try {
      const res = await fetch('/api/join/light', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: gateName.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401 && json.error === 'email-verification-required') {
        setGateStep('email');
        setGateError(t.gate.error.verificationExpired);
        return;
      }
      if (!res.ok || !json.memberId) throw new Error('join-failed');
      setLoggedIn(true);
      setMyMemberId(json.memberId);
      await refreshIdentity();
      setShowGate(false);
      setGateStep('email');
      setGateName('');
    } catch {
      setGateError(t.gate.error.join);
    } finally {
      setGateBusy(false);
      gateSubmittingRef.current = false;
    }
  }

  /** 完整注册复用刚刚验证过的邮箱，首页向导不会再发第二封验证码。 */
  function continueToFullJoin() {
    try {
      sessionStorage.setItem('nf_verified_join_email', gateEmail.trim());
      /**
       * 留个记号：这个人是从对话里被拦下来才去注册的，填完那七步之后
       * 得让他回得来。对话本身还在浏览器里，回来是原样的——没有这个记号，
       * 他就停在注册成功那一屏，得自己想起来该怎么走回去。
       *
       * 只留一个记号、不留 URL：跳哪儿由这边的代码决定，
       * 免得 sessionStorage 被改成一个任意地址当跳板。
       */
      sessionStorage.setItem('nf_join_return', 'phil-coach');
    } catch {
      /* 无痕模式下仍可手动在注册表里填同一邮箱 */
    }
    leavingOnPurposeRef.current = true;
    window.location.href = '/#join';
  }

  /** 通过开通后，续上被拦下的动作 */
  async function resumePending() {
    if (pendingRetry && session && path && !sendingRef.current) {
      setPendingRetry(false);
      setLoading(true);
      sendingRef.current = true;
      const gen = genRef.current;
      try {
        const r = await sendThread(session.thread, path.id, retryVoiceContextRef.current, gen);
        if (r === 'ok') {
          retryVoiceContextRef.current = null;
        } else if (r === 'gate') {
          /**
           * 重发又撞上闸门：必须把浮层弹回来，不能只把 pendingRetry 置回去。
           *
           * 只置 pendingRetry 的话，「已登录 + 待重发 + 浮层关着」正好又凑齐
           * 下面那个 effect 的条件，它再发、再撞、再置——静默打成死循环，
           * 界面上什么都看不见。弹回浮层同时也是实话：这一步确实还没过。
           */
          setPendingRetry(true);
          setShowGate(true);
        }
      } catch {
        if (gen === genRef.current) setError(t.error.resend);
      } finally {
        if (gen === genRef.current) {
          setLoading(false);
          sendingRef.current = false;
        }
      }
    }
  }

  useEffect(() => {
    if (!loggedIn || !pendingRetry || showGate || loading) return;
    void resumePending();
    // resumePending 使用当前这次渲染的会话；依赖状态变化就是重试的唯一触发点。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, pendingRetry, showGate, loading]);


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
   * 已注册用户在浮层内完成验证码登录；新用户验证后可轻登记继续，
   * 也可去首页完整注册。当前对话会保留在 sessionStorage 中。
   */
  // coach 说过几句（含开场白）——决定那句邀请出不出
  const coachTurns = session ? session.thread.filter(item => item.kind === 'coach').length : 0;

  const gateOverlay = showGate ? (
    <div className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-pc-ink/40 p-4 backdrop-blur-[3px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="phil-coach-gate-title"
        className="relative w-full max-w-[560px] rounded-2xl border border-pc-ink/10 bg-pc-paper p-8 text-pc-ink shadow-[0_24px_80px_rgba(29,27,31,0.22)] max-md:p-6"
      >
        <button
          onClick={dismissGate}
          type="button"
          aria-label={t.gate.close}
          className="absolute right-2 top-1.5 grid h-11 w-11 place-items-center text-2xl leading-none text-pc-ink-3 transition-colors hover:text-pc-ink"
        >
          ×
        </button>

        <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-pc-plum">
          {gateKind === 'profile' ? t.gate.profile.eyebrow : t.gate.eyebrow}
        </div>
        <h3 id="phil-coach-gate-title" className="text-xl font-medium">
          {gateKind === 'profile'
            ? t.gate.profile.title
            : gateStep === 'name'
              ? t.gate.nameTitle
              : gateStep === 'new'
                ? t.gate.newTitle
              : t.gate.title}
        </h3>

        {gateKind === 'profile' ? (
          <>
            <p className="mt-3 text-[14px] leading-[1.95] text-pc-ink-2">{t.gate.profile.body}</p>
            <div className="mt-6">
              {/* 引到本人节点页的编辑器，不是重新走注册——那条路会撞 email-taken */}
              <Link
                href={myMemberId ? `/creators/${myMemberId}` : '/login'}
                className="inline-block rounded-full bg-pc-ink px-6 py-2.5 text-[14px] font-medium text-pc-ivory no-underline"
              >
                {t.gate.profile.cta}
              </Link>
            </div>
            <p className="mt-5 text-[12px] leading-relaxed text-pc-ink-3">{t.gate.profile.note}</p>
          </>
        ) : gateStep === 'email' ? (
          <>
            <p className="mt-3 text-[14px] leading-[1.95] text-pc-ink-2">{t.gate.body}</p>
            <div className="mt-6">
              <input
                value={gateEmail}
                onChange={e => setGateEmail(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') void sendGateCode();
                }}
                type="email"
                autoComplete="email"
                autoFocus
                aria-label={t.gate.emailPlaceholder}
                maxLength={120}
                placeholder={t.gate.emailPlaceholder}
                className="w-full rounded-xl border border-pc-line bg-white px-4 py-3 text-[16px] text-pc-ink placeholder:text-pc-ink-3 focus:border-pc-plum focus:outline-none"
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <button
                onClick={sendGateCode}
                disabled={!gateEmail.trim() || gateBusy}
                type="button"
                className="rounded-full bg-pc-ink px-6 py-2.5 text-[14px] font-medium text-pc-ivory transition-opacity disabled:opacity-40"
              >
                {gateBusy ? t.gate.sending : t.gate.cta}
              </button>
              {gateError && <span role="status" aria-live="polite" className="text-[13px] text-pc-brick">{gateError}</span>}
            </div>
            <p className="mt-5 text-[12px] leading-relaxed text-pc-ink-3">{t.gate.privacy}</p>
          </>
        ) : gateStep === 'code' ? (
          <>
            <p className="mt-3 text-[14px] leading-[1.95] text-pc-ink-2">
              {t.gate.codeSentTo(gateEmail.trim())}
              <br />
              <span className="text-pc-ink-3">{t.gate.codeHint}</span>
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
              aria-label={t.gate.codePlaceholder}
              maxLength={8}
              autoFocus
              placeholder={t.gate.codePlaceholder}
              className="mt-5 w-full rounded-xl border border-pc-line bg-white px-4 py-3 text-center font-mono text-[20px] tracking-[0.4em] text-pc-ink placeholder:tracking-normal placeholder:font-sans placeholder:text-[16px] placeholder:text-pc-ink-3 focus:border-pc-plum focus:outline-none"
            />
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <button
                onClick={verifyGateCode}
                disabled={gateCode.replace(/\s+/g, '').length !== 6 || gateBusy}
                type="button"
                className="rounded-full bg-pc-ink px-6 py-2.5 text-[14px] font-medium text-pc-ivory transition-opacity disabled:opacity-40"
              >
                {gateBusy ? t.gate.verifying : t.gate.codeCta}
              </button>
              {gateError && <span role="status" aria-live="polite" className="text-[13px] text-pc-brick">{gateError}</span>}
            </div>
            <div className="mt-5 flex items-center justify-between text-[12px] text-pc-ink-3">
              <button
                onClick={() => {
                  setGateStep('email');
                  setGateCode('');
                  setGateError('');
                  /**
                   * 冷却也要清。服务端那 60 秒按邮箱算，换个邮箱不受它管；
                   * 留着的话回到第一步，「发送验证码」看着能点（那颗按钮的
                   * disabled 里没有 cooldown），而 sendGateCode 一进门就
                   * cooldown > 0 直接 return——按下去什么都不发生，也没有提示。
                   */
                  setGateCooldown(0);
                }}
                type="button"
                className="underline-offset-4 transition-colors hover:text-pc-ink hover:underline"
              >
                {t.gate.changeEmail}
              </button>
              <button
                onClick={sendGateCode}
                disabled={gateCooldown > 0 || gateBusy}
                type="button"
                className="underline-offset-4 transition-colors hover:text-pc-ink hover:underline disabled:no-underline disabled:hover:text-pc-ink-3"
              >
                {gateCooldown > 0 ? t.gate.resendIn(gateCooldown) : t.gate.resend}
              </button>
            </div>
          </>
        ) : gateStep === 'new' ? (
          /**
           * 只做选择，不问称呼。称呼框原来摆在两颗按钮之上，可它只属于
           * 「轻登记」那条路——要走完整注册的人根本用不着填，而主按钮
           * 在填之前是灰的，整屏读起来像「得先取个名字才能往下」。
           */
          <>
            <p className="mt-3 text-[14px] leading-[1.95] text-pc-ink-2">{t.gate.newBody}</p>
            {/**
              * 两颗按钮原来是并排的，各配一行说明之后必须改成上下摞——
              * 并排的话说明只能挤在按钮下方半个格子里，两行还会互相串行。
              * 摞起来之后每条路是一个完整的小块：先是那颗按钮，紧跟着它是什么。
              */}
            <div className="mt-5 space-y-4">
              <div>
                <button
                  onClick={() => setGateStep('name')}
                  type="button"
                  className="rounded-full bg-pc-ink px-6 py-2.5 text-[14px] font-medium text-pc-ivory transition-opacity"
                >
                  {t.gate.lightJoin}
                </button>
                <p className="mt-2 text-[12.5px] leading-relaxed text-pc-ink-3">{t.gate.lightDesc}</p>
              </div>
              <div>
                <button
                  onClick={continueToFullJoin}
                  type="button"
                  className="rounded-full border border-pc-ink/25 px-6 py-2.5 text-[14px] font-medium text-pc-ink transition-colors hover:border-pc-ink/50"
                >
                  {t.gate.fullJoin}
                </button>
                <p className="mt-2 text-[12.5px] leading-relaxed text-pc-ink-3">{t.gate.fullDesc}</p>
              </div>
            </div>
            <p className="mt-5 text-[12px] leading-relaxed text-pc-ink-3">{t.gate.newPrivacy}</p>
          </>
        ) : (
          <>
            {/* 不放 placeholder：标题就在框子正上方，同一句话说两遍。
                aria-label 留着——读屏逐个控件念，读到输入框时标题已经过去了。 */}
            <input
              ref={gateNameRef}
              value={gateName}
              onChange={e => setGateName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') void finishLightJoin();
              }}
              maxLength={60}
              aria-label={t.gate.nameTitle}
              className="mt-5 w-full rounded-xl border border-pc-line bg-white px-4 py-3 text-[16px] text-pc-ink placeholder:text-pc-ink-3 focus:border-pc-plum focus:outline-none"
            />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={finishLightJoin}
                disabled={!gateName.trim() || gateBusy}
                type="button"
                className="rounded-full bg-pc-ink px-6 py-2.5 text-[14px] font-medium text-pc-ivory transition-opacity disabled:opacity-40"
              >
                {gateBusy ? t.gate.joining : t.gate.lightJoin}
              </button>
              <button
                onClick={() => {
                  setGateStep('new');
                  setGateError('');
                }}
                disabled={gateBusy}
                type="button"
                className="text-[12px] text-pc-ink-3 underline-offset-4 transition-colors hover:text-pc-ink hover:underline disabled:hover:text-pc-ink-3"
              >
                {t.gate.newBack}
              </button>
              {gateError && <span role="status" aria-live="polite" className="text-[13px] text-pc-brick">{gateError}</span>}
            </div>
            <p className="mt-5 text-[12px] leading-relaxed text-pc-ink-3">{t.gate.newPrivacy}</p>
          </>
        )}
      </div>
    </div>
  ) : null;

  const busyVoice = liveVoice.listening || voiceIn.requesting || voiceIn.recording || voiceIn.transcribing;
  /** 发不了的时候：正在回应 / 正在录音 / 框里没字 / 还没开口而身份还没确认完 */
  const sendDisabled = loading || busyVoice || !draft.trim() || (!session && !conversationReady);
  const pathLabel = session && session.pathId !== OPEN_PATH_ID
    ? t.paths[session.pathId as PathId]?.label ?? ''
    : '';
  const selectedPath = selectedPathId ? t.paths[selectedPathId as PathId] : null;

  // 书名：中文竖排，像书封；英文横排（竖排的拉丁字母读不了）。
  // 宽屏上竖排的书名挂在对话那一栏的左边，不占那一栏的高度
  const title = en ? (
    <h1 className="m-0 mb-3 font-book text-[30px] font-normal leading-[1.2] text-pc-ink lg:mb-4 lg:text-[40px]">
      {pt.title}
    </h1>
  ) : (
    <div className="flex shrink-0 items-start gap-2 lg:absolute lg:right-[calc(100%+64px)] lg:top-0 lg:gap-3">
      <h1 className="m-0 font-book text-[26px] font-medium leading-[1.2] tracking-[0.2em] text-pc-ink [writing-mode:vertical-rl] lg:text-[40px] lg:tracking-[0.24em]">
        {pt.title}
      </h1>
      <span className="self-end font-sans text-[11px] tracking-[0.18em] text-pc-ink-2 [writing-mode:vertical-rl] lg:text-[12px]">
        {pt.byline}
      </span>
    </div>
  );

  const toolbarBtn = 'grid shrink-0 place-items-center transition-colors disabled:opacity-40';

  return (
    <div className="relative">
      {gateOverlay}

      {/* 开口之后：这是哪一种对话、不会被保存；右边随时可以重新开始 */}
      {session && (
        <div className="mb-5 flex items-center justify-between gap-4 text-[12.5px]">
          <p className="m-0 min-w-0 text-pc-ink-2">
            {pathLabel && <span className="mr-2 font-medium text-pc-plum">{pathLabel}</span>}
            {t.ephemeral}
          </p>
          <button
            onClick={restart}
            type="button"
            className="inline-flex min-h-9 shrink-0 items-center rounded-full border border-pc-ink/15 px-3.5 text-pc-ink-2 transition-colors hover:border-pc-ink/35 hover:text-pc-ink"
          >
            {t.restart}
          </button>
        </div>
      )}

      {/* 书名 + 那一句问话（开场白）。手机上两样并排，问话贴着书名的下沿 */}
      <div className={en ? '' : 'flex items-end gap-5 lg:block'}>
        {title}
        <p
          id="pc-question"
          className="m-0 min-w-0 font-book text-[20px] leading-[1.6] text-pc-ink lg:text-[28px] lg:leading-[1.5]"
        >
          {heading}
        </p>
      </div>

      {/* 对话记录。phil-coach 的话不加气泡，像书里的字；自己的话放在淡紫的气泡里 */}
      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-busy={loading}
        className="flex flex-col gap-6 [&:not(:empty)]:mt-8 [&>*]:scroll-mt-[96px]"
      >
        {logItems.map((item, i) =>
          item.kind === 'coach' ? (
            <div key={i} className="max-w-[92%] self-start whitespace-pre-line text-[16.5px] leading-[1.95] text-pc-ink [overflow-wrap:anywhere]">
              <span className="sr-only">phil-coach：</span>
              {item.text}
            </div>
          ) : (
            <div
              key={i}
              className="max-w-[82%] self-end whitespace-pre-wrap rounded-[20px] rounded-br-md bg-pc-veil px-4 py-2.5 text-[16px] leading-[1.8] text-pc-ink [overflow-wrap:anywhere]"
            >
              <span className="sr-only">{t.me}：</span>
              {item.text}
            </div>
          ),
        )}
        {/* 语音直达：转写还没回来时先把气泡放上屏——等待发生在对话里，而不是输入框里 */}
        {voiceIn.transcribing && voiceMode === 'direct' && (
          <div className="flex max-w-[82%] items-start gap-2 self-end whitespace-pre-wrap rounded-[20px] rounded-br-md bg-pc-veil px-4 py-2.5 text-[16px] leading-[1.8] text-pc-ink-2 [overflow-wrap:anywhere]">
            <span aria-hidden="true" className="mt-[0.7em] h-1.5 w-1.5 shrink-0 rounded-full bg-pc-plum motion-safe:animate-pulse" />
            <span className="min-w-0">{liveCaption || t.transcribing}</span>
          </div>
        )}
        {loading && (
          <div className="flex items-center gap-2 self-start text-[15px] leading-[1.9] text-pc-ink-2">
            <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-pc-plum motion-safe:animate-pulse" />
            {t.thinking}
          </div>
        )}
      </div>

      {/* 提示：发送失败、麦克风、自动播放 */}
      {(error || voiceIn.error || voiceInputNotice || voiceOut.error || voiceOut.playbackBlocked) && (
        <div className="mt-6 space-y-2">
          {error && (
            <div role="alert" className="rounded-xl border border-pc-brick/25 bg-pc-brick-bg px-4 py-3 text-[13.5px] text-pc-brick">
              {error}
            </div>
          )}
          {voiceIn.error && (
            <div role="alert" className="text-[13px] text-pc-brick">
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
                      className="rounded-full border border-pc-line px-2.5 py-1 text-[12px] text-pc-plum transition-colors hover:bg-pc-veil"
                    >
                      {device.label}
                    </button>
                  ))}
                </span>
              )}
            </div>
          )}
          {voiceInputNotice && (
            <div role="status" className="text-[13px] text-pc-ink-2">{voiceInputNotice}</div>
          )}
          {voiceOut.error && (
            <div role="alert" className="text-[13px] text-pc-brick">{voiceOut.error}</div>
          )}
          {voiceOut.playbackBlocked && (
            <div role="status" className="flex flex-wrap items-center gap-2 text-[13px] text-pc-ink-2">
              {t.voice.autoplayBlocked}
              <button
                onClick={voiceOut.resume}
                type="button"
                className="rounded-full border border-pc-line px-2.5 py-1 text-pc-plum transition-colors hover:bg-pc-veil"
              >
                {t.voice.autoplayCta}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 输入框：进来就在这里，不用往下翻 */}
      <div
        ref={composerRef}
        className={`mt-6 scroll-mb-6 rounded-[22px] border shadow-[0_10px_36px_rgba(60,52,90,0.10)] transition-colors lg:mt-7 ${
          voicePanel || dictating
            ? 'border-pc-plum bg-[#f1eef6]'
            : 'border-pc-line bg-pc-paper focus-within:border-pc-plum focus-within:ring-2 focus-within:ring-pc-plum/20'
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
                className="absolute right-2 top-2 z-10 grid h-11 w-11 place-items-center rounded-full text-pc-ink-3 transition-colors hover:bg-pc-ink/5 hover:text-pc-ink"
              >
                <CloseIcon />
              </button>
            )}
            <button
              onClick={finishVoice}
              disabled={!voiceIn.recording}
              type="button"
              aria-label={voiceIn.recording ? t.voice.speakStop : t.voice.speakPreparing}
              className="flex w-full flex-col items-center gap-5 px-4 py-9 disabled:cursor-default"
            >
              <span
                className={`relative grid h-24 w-24 place-items-center rounded-full bg-pc-plum ${
                  voiceIn.transcribing ? 'motion-safe:animate-pulse' : ''
                }`}
              >
                {voiceIn.recording && (
                  <span className="absolute inset-0 rounded-full bg-pc-plum/20 motion-safe:animate-ping" />
                )}
                <span className="relative">
                  <WaveBars
                    level={voiceIn.level}
                    active={voiceIn.recording}
                    maxHeight={40}
                    barWidth={5}
                    barClassName="bg-pc-paper/90"
                  />
                </span>
              </span>
              <span className="text-center">
                <span className="block text-[16px] text-pc-ink">
                  {voiceIn.requesting
                    ? t.voice.opening
                    : t.voice.listening(formatSeconds(voiceIn.elapsed))}
                </span>
                {voiceIn.recording && (
                  <span className="mt-1.5 block text-[12.5px] text-pc-ink-2">
                    {t.voice.speakHint}
                  </span>
                )}
                {voiceIn.recording && liveCaption && (
                  <span className="mx-auto mt-3 line-clamp-2 block max-w-[480px] px-2 text-[14px] leading-[1.8] text-pc-ink-2">
                    {liveCaption}
                  </span>
                )}
              </span>
            </button>
          </div>
        ) : (
          <>
            <textarea
              ref={textareaRef}
              value={displayedDraft}
              onChange={e => {
                draftRef.current = e.target.value;
                setDraft(e.target.value);
                setVoiceInputNotice('');
                pendingVoiceContextRef.current = null;
              }}
              onKeyDown={e => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !e.nativeEvent.isComposing) void submit();
              }}
              disabled={loading}
              readOnly={dictating}
              rows={3}
              maxLength={1200}
              aria-labelledby={session ? undefined : 'pc-question'}
              aria-label={session ? t.replyLabel : undefined}
              placeholder={dictating ? t.voice.dictatingPlaceholder : t.voice.draftPlaceholder}
              className="block w-full resize-none rounded-[22px] border-0 bg-transparent px-4 pb-1 pt-3.5 text-[16px] leading-[1.65] text-pc-ink placeholder:text-pc-ink-3 focus:outline-none disabled:opacity-60 lg:px-5 lg:text-[17px]"
            />
            {dictating ? (
              /* 听写中：按钮行原地变一条紧凑控制条——输入框不让位，字在上面实时出现 */
              <div className="flex min-h-12 items-center gap-3 px-3 pb-3">
                {!voiceIn.transcribing && (
                  <button
                    onClick={cancelVoice}
                    type="button"
                    aria-label={t.voice.dictateCancel}
                    title={t.voice.cancel}
                    className={`${toolbarBtn} h-11 w-11 rounded-full text-pc-ink-3 hover:bg-pc-ink/5 hover:text-pc-ink`}
                  >
                    <CloseIcon />
                  </button>
                )}
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <WaveBars level={voiceIn.level} active={voiceIn.recording} maxHeight={20} barClassName="bg-pc-plum/80" />
                  <span className="truncate text-[13px] text-pc-plum">
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
                  className={`${toolbarBtn} h-11 w-11 rounded-full bg-pc-ink text-pc-ivory`}
                >
                  <span aria-hidden="true" className="block h-3.5 w-3.5 rounded-[3px] bg-current" />
                </button>
              </div>
            ) : (
              /* min-h-12 先把按钮那一行的高度留出来：语音按钮要等浏览器确认支持才出现，不留会跳一下 */
              <div className="flex min-h-12 items-center justify-between gap-2 px-3 pb-3">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  {/* 语音回复开关；手机上只留图标 */}
                  <button
                    onClick={() => voiceOut.setEnabled(!voiceOut.enabled)}
                    aria-pressed={voiceOut.enabled}
                    type="button"
                    title={voiceOut.enabled ? t.voice.readOn : t.voice.readOff}
                    className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-3 text-[12.5px] transition-colors ${
                      voiceOut.enabled
                        ? 'border-pc-plum bg-pc-veil text-pc-plum'
                        : 'border-pc-ink/15 text-pc-ink-2 hover:text-pc-ink'
                    }`}
                  >
                    <SpeakerIcon waves={voiceOut.enabled} />
                    <span className="max-sm:sr-only">
                      {voiceOut.enabled
                        ? voiceOut.loading
                          ? t.voice.readPreparing
                          : t.voice.readStateOn
                        : t.voice.readStateOff}
                    </span>
                  </button>
                  {/* 换嗓音：只在开着朗读时出现，一颗按钮在两个嗓音之间轮换 */}
                  {voiceOut.enabled && (
                    <button
                      onClick={() => {
                        const i = PHIL_COACH_VOICES.findIndex(v => v.id === voiceOut.voiceId);
                        voiceOut.setVoice(PHIL_COACH_VOICES[(i + 1) % PHIL_COACH_VOICES.length].id);
                      }}
                      type="button"
                      title={t.voice.switchVoice}
                      className="h-10 shrink-0 whitespace-nowrap rounded-full px-2.5 text-[12px] text-pc-ink-2 transition-colors hover:bg-pc-ink/5 hover:text-pc-ink"
                    >
                      {PHIL_COACH_VOICES.find(v => v.id === voiceOut.voiceId)?.label}
                    </button>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {voiceIn.supported && (
                    /* 两个语音入口，像 Gemini：🎤 听写进输入框（可改再发），声波直达（说完就发） */
                    <>
                      <button
                        onClick={() => void startVoice('dictate')}
                        disabled={loading || voiceBusy || displayedDraft.length >= 1200}
                        type="button"
                        aria-label={t.voice.dictateLabel}
                        title={t.voice.dictateTitle}
                        className={`${toolbarBtn} h-12 min-w-[52px] gap-0.5 rounded-2xl border border-pc-ink/15 px-2 text-pc-ink-2 hover:bg-pc-ink/5 hover:text-pc-ink`}
                      >
                        <MicrophoneIcon />
                        <span className="text-[10px] leading-none">{t.voice.dictateShort}</span>
                      </button>
                      <button
                        onClick={() => void startVoice('direct')}
                        disabled={loading || voiceBusy || (!session && !conversationReady)}
                        type="button"
                        aria-label={t.voice.speakLabel}
                        title={t.voice.speakTitle}
                        className={`${toolbarBtn} h-12 min-w-[52px] gap-0.5 rounded-2xl bg-pc-veil px-2 text-pc-plum hover:bg-[#d8d1ea]`}
                      >
                        <VoiceWaveIcon />
                        <span className="text-[10px] leading-none">{t.voice.speakShort}</span>
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => void submit()}
                    disabled={sendDisabled}
                    type="button"
                    className="inline-flex h-12 shrink-0 items-center rounded-full bg-pc-ink px-5 text-[14px] font-medium text-pc-ivory transition-colors hover:bg-[#35313b] disabled:bg-pc-ink/15 disabled:text-pc-ink-3"
                  >
                    {loading ? t.sending : !session && !conversationReady ? t.start.preparing : t.send}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 输入框下沿：顺稿中 / 快到字数上限；宽屏上有字时提示快捷键 */}
      <div className="mt-2 min-h-5 text-right text-[12px] text-pc-ink-3">
        {polishing
          ? t.tidying
          : displayedDraft.length >= 1200
            ? t.draftLimit
            : displayedDraft.length >= 1000
              ? t.draftCount(displayedDraft.length)
              : displayedDraft.length > 0
                ? <span className="max-lg:hidden">{t.draftCount(displayedDraft.length)}</span>
                : null}
      </div>

      {!session ? (
        <>
          {/* 小径：可选的方向，按一下选中、再按取消。不选也能直接开口 */}
          <div className="mt-4">
            <p id="pc-paths" className="m-0 mb-2.5 text-[12.5px] text-pc-ink-2">{t.start.pathsLabel}</p>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby="pc-paths">
              {PHIL_PATHS.map(p => {
                const on = selectedPathId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSelectedPathId(on ? null : p.id)}
                    className={`inline-flex min-h-11 items-center rounded-full border px-4 text-[13.5px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pc-plum lg:min-h-10 ${
                      on
                        ? 'border-pc-ink bg-pc-ink text-pc-ivory'
                        : 'border-pc-ink/15 bg-pc-paper/60 text-pc-ink-2 hover:border-pc-ink/30 hover:text-pc-ink'
                    }`}
                  >
                    {t.paths[p.id as PathId].label}
                  </button>
                );
              })}
            </div>
            {selectedPath?.hint && (
              <p className="m-0 mt-2.5 text-[12.5px] text-pc-ink-2">{selectedPath.hint}</p>
            )}
          </div>

          <p className="m-0 mt-6 text-[12.5px] leading-[1.8] text-pc-ink-2">
            {t.start.trust} ·{' '}
            <a href="#about" className="whitespace-nowrap text-pc-plum underline decoration-pc-plum/40 underline-offset-4 hover:decoration-pc-plum">
              {t.start.trustMore} ↓
            </a>
          </p>

          {/* 只有登录成员看得到：phil-coach 有没有读过你的资料 */}
          {loggedIn && (
            <p className="m-0 mt-2 text-[12.5px] leading-[1.8] text-pc-ink-2">
              {importState === 'importing'
                ? t.profile.importing
                : profileKnown
                  ? t.profile.known
                  : t.profile.unknown}{' '}
              <button
                onClick={importProfile}
                disabled={importState === 'importing'}
                type="button"
                className="text-pc-plum underline decoration-pc-plum/40 underline-offset-4 hover:decoration-pc-plum disabled:opacity-50"
              >
                {profileKnown ? t.profile.reimport : t.profile.import}
              </button>
            </p>
          )}
        </>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
            {loggedIn && session.thread.some(item => item.kind === 'me') && (
              <button
                onClick={keepThread}
                disabled={keepState === 'saving' || keepState === 'saved'}
                type="button"
                className="min-h-9 text-pc-plum underline decoration-pc-plum/40 underline-offset-4 hover:decoration-pc-plum disabled:no-underline disabled:opacity-70"
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
                className="min-h-9 text-pc-ink-2 underline decoration-pc-ink/25 underline-offset-4 hover:text-pc-ink"
              >
                {copied ? t.copied : t.copy}
              </button>
            )}
            {!loggedIn && (
              <Link
                href="/#join"
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-9 leading-9 text-pc-plum underline decoration-pc-plum/40 underline-offset-4 hover:decoration-pc-plum"
              >
                {t.join}
              </Link>
            )}
          </div>

          {/*
            对话走到收尾之后的一句邀请。聊满 INVITE_AFTER_TURNS 轮才出现——
            短对话不打扰，只有真聊进去的人才会看到。
            只对「已经是成员、但卡片还薄」的人出现，
            而且刻意做成一行浅色小字 + 一个链接——不弹窗、不拦人、不预勾选，
            可以完全忽略。刚聊完一场好对话的人答应的意愿，远高于在墙上被拦住的那一秒。
          */}
          {loggedIn && !profileComplete && coachTurns >= INVITE_AFTER_TURNS && (
            <div className="mt-6 rounded-2xl border border-pc-ink/10 bg-pc-paper/70 px-5 py-4">
              <p className="m-0 text-[13.5px] leading-[1.9] text-pc-ink-2">{t.inviteAfterClose}</p>
              <Link
                href={myMemberId ? `/creators/${myMemberId}` : '/login'}
                className="mt-2 inline-block text-[13.5px] text-pc-plum no-underline underline-offset-4 hover:underline"
              >
                {t.inviteAfterCloseCta} →
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
