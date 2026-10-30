export type VoiceAnalysis = {
  transcript: string;
  emotion: string;
  emotionConfidence: number;
  speechSignals: string[];
  implicitNeed: string;
  implicitNeedConfidence: number;
};

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string'
    ? value.replace(/\0/g, '').trim().slice(0, maxLength)
    : '';
}

function cleanSignals(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map(item => cleanText(item, 160)).filter(Boolean)),
  ).slice(0, 5);
}

function cleanConfidence(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0;
}

function cleanEmotion(value: unknown): string {
  if (typeof value === 'string') return cleanText(value, 120);
  if (!value || typeof value !== 'object') return '';
  const labels = (value as Record<string, unknown>).labels;
  return Array.isArray(labels)
    ? labels.map(item => cleanText(item, 40)).filter(Boolean).slice(0, 4).join('、')
    : '';
}

function cleanImplicitNeed(value: unknown): string {
  if (typeof value === 'string') return cleanText(value, 300);
  if (!value || typeof value !== 'object') return '';
  return cleanText((value as Record<string, unknown>).text, 300);
}

/**
 * Qwen 输出和客户端请求都视为不可信输入；统一收窄后才交给界面或教练模型。
 */
export function normalizeVoiceAnalysis(input: unknown): VoiceAnalysis | null {
  if (!input || typeof input !== 'object') return null;
  const item = input as Record<string, unknown>;
  const transcript = cleanText(item.transcript, 1800);
  if (!transcript) return null;

  const emotionalTone = item.emotional_tone;
  const possibleNeed = item.possible_need;
  const emotion = cleanEmotion(item.emotion ?? emotionalTone);
  const implicitNeed = cleanImplicitNeed(item.implicitNeed ?? item.implicit_need ?? possibleNeed);

  return {
    transcript,
    emotion,
    emotionConfidence: emotion
      ? cleanConfidence(
          item.emotionConfidence ??
            item.emotion_confidence ??
            (emotionalTone && typeof emotionalTone === 'object'
              ? (emotionalTone as Record<string, unknown>).confidence
              : undefined),
        )
      : 0,
    speechSignals: cleanSignals(item.speechSignals ?? item.speech_signals),
    implicitNeed,
    implicitNeedConfidence: implicitNeed
      ? cleanConfidence(
          item.implicitNeedConfidence ??
            item.implicit_need_confidence ??
            (possibleNeed && typeof possibleNeed === 'object'
              ? (possibleNeed as Record<string, unknown>).confidence
              : undefined),
        )
      : 0,
  };
}

/**
 * 百炼实时识别（qwen3-asr-flash-realtime）在 completed 事件里顺带给一个情绪标签，
 * 只有七类、没有置信度。这里把它翻成教练模型读得懂的 voiceContext。
 *
 * - neutral（和认不出的标签）不生成观察：平静是默认状态，写进去只会多花 token，
 *   还可能让模型对「平静」过度解读；
 * - 词选得轻一点（sad→低落，不是「悲伤」；angry→恼火，不是「愤怒」）：
 *   这是从七八秒声音里猜的一个字，模型看到重词容易接得太重；
 * - emotionConfidence 固定 0.5：上游不给置信度，0.5 正好表达「可能是，也可能不是」；
 * - 不猜隐含需要——这个模型不提供，编一个比空着更糟；
 * - transcript 必须带上，否则 normalizeVoiceAnalysis 会把整个观察丢掉。
 * 最后再过一遍 normalizeVoiceAnalysis，和 Qwen3-Omni 的结果走同一道收窄。
 */
const ASR_EMOTION_LABELS: Record<string, string> = {
  surprised: '惊讶',
  happy: '轻快',
  sad: '低落',
  angry: '恼火',
  fearful: '不安',
  disgusted: '反感',
};

export function asrEmotionToVoiceAnalysis(
  transcript: string,
  emotion: string | null | undefined,
): VoiceAnalysis | null {
  const label = typeof emotion === 'string' ? ASR_EMOTION_LABELS[emotion.trim().toLowerCase()] : undefined;
  if (!label) return null;
  return normalizeVoiceAnalysis({
    transcript,
    emotion: label,
    emotionConfidence: 0.5,
    speechSignals: [],
    implicitNeed: '',
    implicitNeedConfidence: 0,
  });
}

/** 兼容模型偶尔包裹的 ```json 代码块，同时拒绝缺少有效转写的输出。 */
export function parseVoiceAnalysisJson(content: string): VoiceAnalysis | null {
  const trimmed = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  const candidates = [
    trimmed,
    firstBrace >= 0 && lastBrace > firstBrace ? trimmed.slice(firstBrace, lastBrace + 1) : '',
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const normalized = normalizeVoiceAnalysis(JSON.parse(candidate));
      if (normalized) return normalized;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}
