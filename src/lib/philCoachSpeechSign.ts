/**
 * 朗读分段的签名：/api/phil-coach/speak 只合成「对话接口亲手切出来的句子」。
 *
 * 为什么要签：/speak 背后是按量计费的 TTS。如果它接受任意文本，就成了一个公开的
 * 朗读代理，谁都能拿去刷额度；更要紧的是，语音不能绕过对话闸门——
 * 访客 8 轮、免费期、薄卡这三道闸门都只在对话接口里判定，签名保证了
 * 「能被念出来的话」一定先过了那几道闸门。
 *
 * 签的是 `v1|exp|tone|text`：改一个字、换一个语气、拖过有效期，都验不过。
 * 有效期 10 分钟——够把一条回复从头念到尾，也够关掉朗读再打开时补念上一条。
 *
 * 只在服务端用（要读密钥）。纯 node:crypto，不依赖 Next，方便 node --test 直接测。
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

type Env = Record<string, string | undefined>;

export const SPEECH_SIGN_VERSION = 'v1';
export const SPEECH_SIGN_TTL_SECONDS = 10 * 60;
/** /speak 单段上限；断句器切出来的段不超过 120 字，这里留些余量给英文 */
export const SPEECH_MAX_CHARS = 200;

/**
 * 语气白名单。前端只能传键名，真正的 instruction 在服务端（见 dashscopeTts.ts），
 * 任意字符串不会被透传给上游。
 * - soft：平时的回复
 * - steady：危机回复——那一段要每个字都听得清
 */
export const SPEECH_TONES = ['soft', 'steady'] as const;
export type SpeechTone = (typeof SPEECH_TONES)[number];

export function isSpeechTone(value: unknown): value is SpeechTone {
  return typeof value === 'string' && (SPEECH_TONES as readonly string[]).includes(value);
}

/**
 * 签名密钥：优先用专门配的 PHIL_COACH_SPEECH_SIGNING_SECRET；
 * 没配就从上游 Key 用 HMAC 派生一把（不直接拿 Key 当密钥，派生值泄露也反推不出 Key）。
 * 百炼没配、只用 SiliconFlow 分句朗读时，就从 SiliconFlow 的 Key 派生。
 * 一个都没有就返回 null：调用方据此不发 sentence 事件，/speak 返回 503。
 */
export function getSpeechSigningSecret(env: Env = process.env): string | null {
  const explicit = env.PHIL_COACH_SPEECH_SIGNING_SECRET?.trim();
  if (explicit && explicit.length >= 16) return explicit;
  const base = env.DASHSCOPE_API_KEY?.trim() || env.SILICONFLOW_API_KEY?.trim();
  if (!base) return null;
  return createHmac('sha256', base).update('phil-coach-speech-sign-v1').digest('base64url');
}

function payload(text: string, tone: string, exp: number): string {
  return `${SPEECH_SIGN_VERSION}|${exp}|${tone}|${text}`;
}

function hmac(secret: string, text: string, tone: string, exp: number): string {
  return createHmac('sha256', secret).update(payload(text, tone, exp)).digest('base64url');
}

export type SpeechSignature = { exp: number; sig: string };

export function signSpeech(
  text: string,
  tone: SpeechTone,
  secret: string,
  { now = Date.now(), ttlSeconds = SPEECH_SIGN_TTL_SECONDS }: { now?: number; ttlSeconds?: number } = {},
): SpeechSignature {
  const exp = Math.floor(now / 1000) + ttlSeconds;
  return { exp, sig: hmac(secret, text, tone, exp) };
}

export type SpeechVerifyResult = 'ok' | 'invalid' | 'expired';

export function verifySpeech(
  input: { text: unknown; tone: unknown; exp: unknown; sig: unknown },
  secret: string,
  now = Date.now(),
): SpeechVerifyResult {
  const { text, tone, exp, sig } = input;
  if (typeof text !== 'string' || !text || text.length > SPEECH_MAX_CHARS) return 'invalid';
  if (!isSpeechTone(tone)) return 'invalid';
  if (typeof exp !== 'number' || !Number.isSafeInteger(exp)) return 'invalid';
  if (typeof sig !== 'string' || !sig || sig.length > 128) return 'invalid';

  const expected = Buffer.from(hmac(secret, text, tone, exp));
  const given = Buffer.from(sig);
  // 先比签名再看过期：伪造的签名一律是 invalid，不告诉对方「差一点就对了」
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return 'invalid';
  // 有效期上限也要卡：签名对、但 exp 远在未来，只可能是密钥泄露后自己签的
  const nowSec = Math.floor(now / 1000);
  if (exp < nowSec) return 'expired';
  if (exp > nowSec + SPEECH_SIGN_TTL_SECONDS + 60) return 'invalid';
  return 'ok';
}
