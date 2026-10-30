/**
 * 朗读用的文字处理：把模型的回复变成「适合念出来的一段一段」。纯函数，前后端都能用。
 *
 * - cleanForSpeech：去掉 markdown、链接、表情和舞台提示——这些看得见却念不出来，
 *   念出来又很怪（「星号星号」「括号语气温和括号」）。气泡里的原文不受影响。
 * - createSpeechChunker：流式回复一边长，一边按句切给 TTS。
 *
 * 断句的取舍（为什么不是一句一段）：
 * - 第一段要快：遇到句末标点、够 4 个字就发——「停止说话 → 听见声音」的等待主要卡在这一段；
 *   28 个字还没等到句号，就在最后一个逗号处切，别让一个长句把开口拖住。
 * - 之后各段要攒：攒到 40 字以上、遇到句末再发，单段不超过 120 字。
 *   第一段在念的时候后面有的是时间；段数少一些，TTS 请求就少（百炼 RPM 只有 180，账号共用），
 *   语调也更连贯——一句一段念出来，每句都像重新起头。
 */

export type SpeechChunk = { index: number; text: string };

export type SpeechChunkerOptions = {
  /** 第一段最少几个字（太短的「嗯。」单独合成不值一个请求，也念不出语气） */
  firstMin?: number;
  /** 第一段等句号最多等到几个字，之后就在逗号处切 */
  firstSoftMax?: number;
  /** 之后各段攒到几个字再发 */
  minLength?: number;
  /** 任何一段的上限（/speak 收 200 字，这里留余量） */
  maxLength?: number;
};

const SENTENCE_END = new Set(['。', '！', '？', '!', '?', '…', '；', ';']);
/** 句末标点后面紧跟着的这些，归到同一段：引号、括号、连续的标点 */
const TRAILERS = new Set(['。', '！', '？', '!', '?', '…', '；', ';', '.', '~', '～', '”', '’', '」', '』', '》', '】', '"', "'"]);
const SOFT_BREAK = new Set(['，', ',', '、', '：', ':']);
const OPEN_PAREN = new Set(['（', '(']);
const CLOSE_PAREN = new Set(['）', ')']);

/**
 * 看起来像舞台提示的括号内容：提示词第 8 条明令禁止，但模型偶尔还是会写。
 * 文字气泡里留着无妨，念出来就成了「括号，微微一笑，括号」，必须去掉。
 * 其余的括号内容（「不用急着回我」这类）是正文，只去掉括号本身、换成停顿。
 */
const STAGE_DIRECTION =
  /语气|微笑|一笑|笑了|^笑|停顿|顿了|轻声|柔声|低声|叹气|叹了|沉默|点头|摇头|温和地|温柔地|看着你|pause|smil|sigh|laugh|chuckl|nod|softly|gently|whisper|warmly/i;

const CJK = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/;

export function cleanForSpeech(input: string): string {
  let s = input.replace(/\r\n?/g, '\n');

  // 代码块、HTML 样的标签、图片：整段念不出来，直接拿掉
  s = s.replace(/```[\s\S]*?```/g, ' ');
  s = s.replace(/<\/?[a-z_][\w-]*[^>]*>/gi, ' ');
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
  // 链接只念文字，裸网址不念
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  s = s.replace(/https?:\/\/[^\s)）\]】]+/g, ' ');

  // 行首的标题、引用、列表符号、分隔线
  s = s.replace(/^[ \t]*#{1,6}[ \t]*/gm, '');
  s = s.replace(/^[ \t]*>[ \t]?/gm, '');
  s = s.replace(/^[ \t]*[-*_]{3,}[ \t]*$/gm, '');
  s = s.replace(/^[ \t]*(?:[-*+•·]|\d{1,2}[.)、])[ \t]+/gm, '');
  // 强调、删除线、行内代码的符号；表格竖线
  s = s.replace(/[*_~`]+/g, '');
  s = s.replace(/\|/g, ' ');

  // 括号：舞台提示整段去掉，其余只换成停顿
  s = s.replace(/[（(]([^（）()]{0,60})[）)]/g, (_m, inner: string) => {
    const content = inner.trim();
    if (!content) return ' ';
    if (content.length <= 20 && STAGE_DIRECTION.test(content)) return ' ';
    return CJK.test(content) ? `，${content}，` : `, ${content}, `;
  });
  // 落单的括号、方头括号只去符号
  s = s.replace(/[（）()【】[\]]/g, '');

  // 表情和肤色、变体选择符、零宽连接符
  s = s.replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}]/gu, '');

  // 换行是停顿：前面已有标点就直接接上，没有就补一个句号（列表项之间不能连成一口气）
  s = s.replace(/[ \t]*\n+[ \t]*/g, (_m, offset: number, whole: string) => {
    const prev = whole[offset - 1];
    if (prev === undefined || /[。！？!?…；;，,、：:.\s]/.test(prev)) return '';
    return CJK.test(prev) ? '。' : '. ';
  });

  // 上面几步留下的标点碎渣：「，。」「。，」「，，」、标点前的空格（「tired .」）
  s = s.replace(/[ \t\u3000]+(?=[，,。！？!?；;：:、…]|\.(?:\s|$))/g, '');
  s = s.replace(/[，,]\s*(?=[，,。！？!?；;：:、…])/g, '');
  s = s.replace(/([。！？!?；;：:、…])\s*[，,]+/g, '$1');
  // 开头不该有的：标点、从上一段落下来的右引号
  s = s.replace(/^[\s，,。、；;：:”’」』》】.!?！？]+/, '');
  // 结尾的逗号念出来像没说完
  s = s.replace(/[\s，,、]+$/, '');
  // 中文之间的空格去掉，其余连续空白压成一个
  s = s.replace(/(?<=[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef])[ \t\u3000]+(?=[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef])/g, '');
  s = s.replace(/[ \t\u3000]{2,}/g, ' ');
  return s.trim();
}

type Cut = { end: number; strong: boolean };

/**
 * 找出缓冲区里所有可以切的位置（切在 end 之前）。
 * strong = 句末，weak = 逗号一类。括号里面不切——舞台提示被切成两半就认不出来了。
 * 非 final 时，句末标点正好落在缓冲区末尾的先不算：下一个 delta 可能是「”」或者又一个「？」。
 */
function scanCuts(buf: string, final: boolean): Cut[] {
  const cuts: Cut[] = [];
  let depth = 0;
  for (let i = 0; i < buf.length; i += 1) {
    const ch = buf[i];
    if (OPEN_PAREN.has(ch)) {
      depth += 1;
      continue;
    }
    if (CLOSE_PAREN.has(ch)) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth > 0) continue;

    if (ch === '\n') {
      cuts.push({ end: i + 1, strong: true });
      continue;
    }

    let strong = SENTENCE_END.has(ch);
    if (ch === '.') {
      // 英文句号：后面是空白才算句末；「3.5」「1. 」不算；落在末尾的等下一个字
      const next = buf[i + 1];
      if (/\d/.test(buf[i - 1] || '')) continue;
      if (next === undefined) {
        if (!final) continue;
        strong = true;
      } else if (/\s/.test(next)) {
        strong = true;
      } else {
        continue;
      }
    }

    if (strong) {
      let j = i + 1;
      while (j < buf.length && TRAILERS.has(buf[j])) j += 1;
      if (j >= buf.length && !final) break;
      cuts.push({ end: j, strong: true });
      i = j - 1;
      continue;
    }
    if (SOFT_BREAK.has(ch)) cuts.push({ end: i + 1, strong: false });
  }
  return cuts;
}

export function createSpeechChunker(options: SpeechChunkerOptions = {}) {
  const firstMin = options.firstMin ?? 4;
  const firstSoftMax = options.firstSoftMax ?? 28;
  const minLength = options.minLength ?? 40;
  const maxLength = options.maxLength ?? 120;

  let buf = '';
  let index = 0;

  const spoken = (end: number) => cleanForSpeech(buf.slice(0, end)).length;

  /** 实在找不到标点又超了上限：从后往前找到不超限的位置，英文尽量落在空格上 */
  function hardCut(): number {
    let end = buf.length;
    while (end > 1 && spoken(end) > maxLength) end -= 1;
    const space = buf.lastIndexOf(' ', end);
    return space > end - 20 && space > 0 ? space + 1 : end;
  }

  /** 现在能切出一段的话返回切点，否则 null */
  function nextCut(final: boolean): number | null {
    if (!buf.trim()) return null;
    const cuts = scanCuts(buf, final);

    if (index === 0) {
      const sentence = cuts.find(c => c.strong && spoken(c.end) >= firstMin);
      if (sentence && spoken(sentence.end) <= maxLength) return sentence.end;
      if (spoken(buf.length) >= firstSoftMax) {
        for (let k = cuts.length - 1; k >= 0; k -= 1) {
          const len = spoken(cuts[k].end);
          if (len >= firstMin && len <= maxLength) return cuts[k].end;
        }
      }
    } else {
      const ready = cuts.find(c => c.strong && spoken(c.end) >= minLength);
      if (ready && spoken(ready.end) <= maxLength) return ready.end;
    }

    if (spoken(buf.length) > maxLength) {
      const within = cuts.filter(c => {
        const len = spoken(c.end);
        return len > 0 && len <= maxLength;
      });
      let lastStrong: Cut | undefined;
      for (const c of within) if (c.strong) lastStrong = c;
      const lastAny = within[within.length - 1];
      // 句末够长就切在句末（语调完整）；否则切在最远的逗号，免得为几个字单独发一个请求
      const pick = lastStrong && spoken(lastStrong.end) >= minLength ? lastStrong : lastAny;
      return pick ? pick.end : hardCut();
    }

    return final ? buf.length : null;
  }

  function drain(final: boolean): SpeechChunk[] {
    const out: SpeechChunk[] = [];
    for (;;) {
      const cut = nextCut(final);
      if (cut === null || cut <= 0) break;
      const text = cleanForSpeech(buf.slice(0, cut));
      buf = buf.slice(cut);
      // 只剩符号、表情的段（清洗后为空）不占序号
      if (text) out.push({ index: index++, text });
      if (!buf.trim()) {
        buf = final ? '' : buf;
        break;
      }
    }
    return out;
  }

  return {
    /** 喂一段新长出来的文字，返回此刻能切出的段（可能为空） */
    push(delta: string): SpeechChunk[] {
      if (!delta) return [];
      buf += delta;
      return drain(false);
    },
    /** 回复结束：剩下的全部切出来 */
    flush(): SpeechChunk[] {
      return drain(true);
    },
    /** 已经发出去几段 */
    get count(): number {
      return index;
    },
  };
}

/** 一整段文字一次切完（确定性回复、补念上一条时用） */
export function chunkForSpeech(text: string, options?: SpeechChunkerOptions): SpeechChunk[] {
  const chunker = createSpeechChunker(options);
  return [...chunker.push(text), ...chunker.flush()];
}
