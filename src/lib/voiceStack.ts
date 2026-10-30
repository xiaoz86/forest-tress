/**
 * PhilCoach 语音链路的开关：听（ASR）、说（TTS）、想（流式回复）各走哪条线。
 *
 * 纯函数，只看环境变量「有没有配」，结果里只有枚举和布尔值，不含任何密钥——
 * 所以可以在服务端组件里算好，原样当 prop 传给客户端组件。
 *
 * 默认（auto）的原则是「配齐了才换」：
 * - 没配百炼（DASHSCOPE_API_KEY + DASHSCOPE_WORKSPACE_ID）时，所有路径、返回、界面都和今天一模一样；
 * - 说（TTS）还要两把复刻音色都配了才换——复刻没做完之前，嗓音不能被悄悄换成系统音色；
 * - 浏览器直连识别还要一把只开通识别的专用 Key，没有就整段上传（服务端出站 WS，Key 不出服务端）；
 * - 任何时候想一键回退：把 PHIL_COACH_*_PROVIDER 设成 siliconflow，不用删 Key。
 */
import { getDashscopeConfig, getDashscopeDirectAsrConfig } from './dashscope.ts';

type Env = Record<string, string | undefined>;

export type VoiceProvider = 'bailian' | 'siliconflow';

export type VoiceStack = {
  /** 定稿转写走谁（/api/phil-coach/voice 的 final） */
  asr: VoiceProvider;
  /**
   * 浏览器拿 st- 临时令牌直连百炼实时识别。只在 asr 是百炼、而且配了只开通识别的专用 Key
   * （DASHSCOPE_ASR_DIRECT_*，见 dashscope.ts 的 getDashscopeDirectAsrConfig）时才可能为 true：
   * 令牌要交到浏览器手里，用主 Key 签等于把 TTS 和复刻音色的权限一起交出去。
   */
  asrDirect: boolean;
  /** /api/phil-coach/speak 默认用谁合成 */
  tts: VoiceProvider;
  /** 对话接口是否接受 Accept: application/x-ndjson 的流式回复 */
  streamReply: boolean;
};

/** 什么都没配、或者全部设成 siliconflow / off 时的样子：就是今天线上的行为 */
export const LEGACY_VOICE_STACK: VoiceStack = Object.freeze({
  asr: 'siliconflow',
  asrDirect: false,
  tts: 'siliconflow',
  streamReply: false,
}) as VoiceStack;

function choice<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  const v = value?.trim().toLowerCase();
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** 两把百炼复刻音色都配了没有；只配一把的话，换嗓时另一把会突然变回旧声音，不如都不换 */
export function hasBailianVoices(env: Env): boolean {
  return Boolean(env.DASHSCOPE_TTS_VOICE_FEMALE?.trim() && env.DASHSCOPE_TTS_VOICE_MALE?.trim());
}

export function resolveVoiceStack(env: Env): VoiceStack {
  const bailian = getDashscopeConfig(env) !== null;

  // 显式写 bailian 但 Key 没配，也只能落回 siliconflow——开关表达的是偏好，不是强制
  const asrPref = choice(env.PHIL_COACH_ASR_PROVIDER, ['auto', 'bailian', 'siliconflow'] as const, 'auto');
  const asr: VoiceProvider = asrPref !== 'siliconflow' && bailian ? 'bailian' : 'siliconflow';

  const directPref = choice(env.PHIL_COACH_ASR_DIRECT, ['auto', 'off'] as const, 'auto');
  const asrDirect = asr === 'bailian' && directPref !== 'off' && getDashscopeDirectAsrConfig(env) !== null;

  const ttsPref = choice(env.PHIL_COACH_TTS_PROVIDER, ['auto', 'bailian', 'siliconflow'] as const, 'auto');
  const tts: VoiceProvider =
    ttsPref !== 'siliconflow' && bailian && hasBailianVoices(env) ? 'bailian' : 'siliconflow';

  const streamPref = choice(env.PHIL_COACH_STREAM_REPLY, ['auto', 'on', 'off'] as const, 'auto');
  const streamReply = streamPref === 'on' || (streamPref === 'auto' && bailian);

  return { asr, asrDirect, tts, streamReply };
}
