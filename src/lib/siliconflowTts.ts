/**
 * SiliconFlow 的 CosyVoice2 朗读（今天线上的那把复刻嗓音）。
 *
 * 旧的 /api/phil-coach/tts 整条回复合成一次；/api/phil-coach/speak 用它按句合成，
 * 两边共用同一套音色映射和语速，保证「一键切回 siliconflow」时听到的还是原来的声音。
 * 只在服务端用。
 */
import { anySignal } from './dashscope.ts';

type Env = Record<string, string | undefined>;

export const SILICONFLOW_TTS_MODEL = 'FunAudioLLM/CosyVoice2-0.5B';
/** 官方音色只当兜底：环境变量没配时不能让朗读整个哑掉，但它是「播报腔」，不该是默认 */
export const SILICONFLOW_FALLBACK_VOICE = 'FunAudioLLM/CosyVoice2-0.5B:anna';
export const SILICONFLOW_DEFAULT_SPEED = 0.9;

/** 前端只传 female / male；认不出的键名回落到 female，任意字符串不透传给上游 */
export function resolveSiliconflowVoice(voiceKey: unknown, env: Env = process.env): string {
  const key = voiceKey === 'male' ? 'MALE' : 'FEMALE';
  return env[`PHIL_COACH_TTS_VOICE_${key}`]?.trim() || SILICONFLOW_FALLBACK_VOICE;
}

/** 稍慢，贴陪伴的语速。可用 PHIL_COACH_TTS_SPEED 调（上游接受 0.25–4） */
export function siliconflowTtsSpeed(env: Env = process.env): number {
  const raw = env.PHIL_COACH_TTS_SPEED?.trim();
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) && value >= 0.25 && value <= 4 ? value : SILICONFLOW_DEFAULT_SPEED;
}

export class SiliconflowTtsError extends Error {
  readonly status?: number;
  constructor(status?: number) {
    super(`siliconflow tts failed${status ? ` (${status})` : ''}`);
    this.name = 'SiliconflowTtsError';
    this.status = status;
  }
}

/** 合成一整段 mp3。失败抛 SiliconflowTtsError（中止时抛原来的 AbortError） */
export async function synthesizeSiliconflowMp3({
  apiKey,
  text,
  voice,
  speed = SILICONFLOW_DEFAULT_SPEED,
  signal,
  timeoutMs = 60_000,
}: {
  apiKey: string;
  text: string;
  voice: string;
  speed?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<ArrayBuffer> {
  const combined = anySignal([signal, AbortSignal.timeout(timeoutMs)]);
  const res = await fetch('https://api.siliconflow.cn/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: SILICONFLOW_TTS_MODEL,
      input: text,
      voice,
      response_format: 'mp3',
      speed,
    }),
    signal: combined,
  });
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new SiliconflowTtsError(res.status);
  }
  return res.arrayBuffer();
}
