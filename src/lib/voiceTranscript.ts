/** SenseVoice 会把语种、情绪等元数据夹在转写文字里。 */
const ASR_TAG = /<\|([^|]*)\|>/gi;
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;
const JAPANESE_KANA = /[\u3040-\u30ff\u31f0-\u31ff\uff66-\uff9f]/u;
const KOREAN = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/u;

const LANGUAGE_TAGS = new Set(['zh', 'yue', 'en', 'ja', 'jp', 'ko']);

export type NormalizedAsrTranscript = {
  text: string;
  language: string;
  suspiciousLanguage: boolean;
};

/**
 * 清掉 ASR 元数据，并保留“被错判成日韩语”的证据。
 * PhilCoach 的听写入口默认是普通话；可疑结果不应直接落进输入框。
 */
export function normalizeAsrTranscript(raw: string): NormalizedAsrTranscript {
  let language = '';
  for (const match of raw.matchAll(ASR_TAG)) {
    const value = (match[1] || '').trim().toLowerCase();
    if (LANGUAGE_TAGS.has(value)) language = value;
  }

  const text = raw
    .replace(ASR_TAG, '')
    .replace(EMOJI, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return {
    text,
    language,
    suspiciousLanguage:
      language === 'ja' ||
      language === 'jp' ||
      language === 'ko' ||
      JAPANESE_KANA.test(text) ||
      KOREAN.test(text),
  };
}

function compactTranscript(value: string): string {
  return value.replace(/[\s，。！？、；：,.!?;:]/g, '');
}

/**
 * 实时分片会保留一小段音频重叠，避免在词中间硬切；这里把重叠转出的文字去重。
 * 只消除完全相同的前后缀，拿不准时宁可保留，最终整段转写仍会覆盖预览。
 */
export function mergeIncrementalTranscript(current: string, incoming: string): string {
  const left = current.trimEnd();
  const right = incoming.trimStart();
  if (!left) return right;
  if (!right) return left;

  const maxOverlap = Math.min(left.length, right.length, 24);
  for (let length = maxOverlap; length > 0; length -= 1) {
    if (left.slice(-length) === right.slice(0, length)) {
      return `${left}${right.slice(length)}`;
    }
  }
  return `${left}${right}`;
}

/**
 * 完整录音是权威定稿；只有定稿为空、语种异常，或明显只是实时字幕的前缀时，
 * 才保留已经出现在输入框里的较完整版本。
 */
export function chooseCompleteTranscript(finalText: string, liveText: string): string {
  const finalValue = finalText.trim();
  const liveValue = liveText.trim();
  if (!liveValue) return finalValue;
  if (!finalValue) return liveValue;

  const finalInfo = normalizeAsrTranscript(finalValue);
  const liveInfo = normalizeAsrTranscript(liveValue);
  if (finalInfo.suspiciousLanguage && !liveInfo.suspiciousLanguage) return liveInfo.text;

  const finalCompact = compactTranscript(finalInfo.text);
  const liveCompact = compactTranscript(liveInfo.text);
  if (liveCompact.startsWith(finalCompact) && liveCompact.length > finalCompact.length) {
    return liveInfo.text;
  }
  return finalInfo.text;
}
