/**
 * 百炼实时识别（qwen3-asr-flash-realtime）的事件归约。纯函数，不引任何 Node 模块——
 * 浏览器直连（第一期主路径）和服务端兜底（lib/dashscopeAsr）共用同一套口径，
 * 也方便直接拿事件夹具做单测。
 *
 * 协议要点（2026-10-26 用真实 Key 跑通）：
 * - open 后先发 session.update，等 session.updated 再推音频，否则前几包会被丢；
 * - 推音频：input_audio_buffer.append，PCM16LE 16k 单声道，100ms 一包（3200 字节）；
 * - Manual 模式下边推边有 `.text` 中间结果：text（已确定）+ stash（未确定），字幕 = 两者相加；
 * - commit + session.finish 之后约 130ms 出 `.completed`（transcript、language、emotion），之后 session.finished。
 *   注意：百炼在 session.finished 之后**不会**自己断开，也不回应关闭帧（2026-10-27 实测），客户端要自己断。
 */

export const ASR_SAMPLE_RATE = 16_000;
/** 100ms 的 16k 单声道 PCM16 */
export const ASR_CHUNK_BYTES = 3_200;

/** 百炼给的七类情绪；neutral 在下游不生成任何观察 */
export type AsrEmotion = 'surprised' | 'neutral' | 'happy' | 'sad' | 'disgusted' | 'angry' | 'fearful';

export type AsrState = {
  phase: 'connecting' | 'ready' | 'done' | 'failed';
  /** 已定稿的部分（每条 completed 依次接上；Manual 模式下通常只有一条） */
  committed: string;
  /** 当前这一条的中间结果：text 已确定，stash 还会变 */
  text: string;
  stash: string;
  /** 至少收到过一条 completed */
  completed: boolean;
  language: string | null;
  emotion: string | null;
  finished: boolean;
  error: { code: string; message: string } | null;
};

export function initialAsrState(): AsrState {
  return {
    phase: 'connecting',
    committed: '',
    text: '',
    stash: '',
    completed: false,
    language: null,
    emotion: null,
    finished: false,
    error: null,
  };
}

/** 字幕：已定稿 + 当前条的已确定 + 未确定 */
export function asrCaption(state: AsrState): string {
  return `${state.committed}${state.text}${state.stash}`;
}

function str(value: unknown, max = 4_000): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function optionalLabel(value: unknown): string | null {
  const v = str(value, 40).trim().toLowerCase();
  return v || null;
}

function errorOf(event: Record<string, unknown>, fallback: string): { code: string; message: string } {
  const error = event.error && typeof event.error === 'object' ? (event.error as Record<string, unknown>) : {};
  return {
    code: str(error.code, 120) || str(error.type, 120) || fallback,
    // 只留一小截，供本地调试；日志里不打印它
    message: str(error.message, 200),
  };
}

/**
 * 纯函数：吃一个服务端事件，吐出新状态。认不出的事件原样返回同一个对象，
 * 调用方可以用引用相等判断「有没有变」，省一次重渲染。
 */
export function reduceAsrEvent(state: AsrState, raw: unknown): AsrState {
  if (!raw || typeof raw !== 'object') return state;
  const event = raw as Record<string, unknown>;
  switch (event.type) {
    case 'session.updated':
      return state.phase === 'connecting' ? { ...state, phase: 'ready' } : state;
    case 'conversation.item.input_audio_transcription.text':
      return {
        ...state,
        text: str(event.text),
        stash: str(event.stash),
        language: optionalLabel(event.language) ?? state.language,
        emotion: optionalLabel(event.emotion) ?? state.emotion,
      };
    case 'conversation.item.input_audio_transcription.completed':
      return {
        ...state,
        committed: `${state.committed}${str(event.transcript)}`,
        text: '',
        stash: '',
        completed: true,
        language: optionalLabel(event.language) ?? state.language,
        emotion: optionalLabel(event.emotion) ?? state.emotion,
      };
    case 'conversation.item.input_audio_transcription.failed':
      return { ...state, phase: 'failed', error: errorOf(event, 'transcription-failed') };
    case 'error':
      return { ...state, phase: 'failed', error: errorOf(event, 'error') };
    case 'session.finished':
      return { ...state, finished: true, phase: state.phase === 'failed' ? 'failed' : 'done' };
    default:
      return state;
  }
}

/**
 * 识别语种跟着界面语言走：中文界面写死 zh，英文界面不传（让模型自己判断）。
 *
 * 为什么英文界面不传 en（2026-10-28 用真实 Key 小量实测，TTS 合成的干净语音）：
 * - 英文语音 + language=zh：照样逐字转成英文，没被硬拗成中文；
 * - 中文语音 + language=en：**被翻译成了英文**——英文界面的用户说中文很常见（海外华人、双语的人），
 *   传 en 会把 ta 的原话换掉；
 * - 不传：中英文都按原话转写，language 字段也判对了。
 * 中文界面保持 zh：这是第一期一直在用、实测过的写法，同音词也更稳。
 * 旧链路的 SenseVoice 本来就是自动判断语种的，英文界面不传正好和它一致。
 */
export function asrLanguageForLocale(locale: string | null | undefined): string | null {
  return locale === 'en' ? null : 'zh';
}

/** Manual 模式：关掉服务端 VAD，什么时候算一句由我们 commit 决定。language 为 null 时不传，由模型自己判断 */
export function buildAsrSessionUpdate(language: string | null = 'zh') {
  return {
    type: 'session.update',
    session: {
      input_audio_format: 'pcm',
      sample_rate: ASR_SAMPLE_RATE,
      ...(language ? { input_audio_transcription: { language } } : {}),
      turn_detection: null,
    },
  };
}
