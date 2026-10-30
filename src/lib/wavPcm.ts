/**
 * WAV 块表解析：找到 16k、单声道、16bit PCM 的数据块。
 *
 * 从 /api/phil-coach/voice 里原样抽出来，两处共用——
 * Qwen 的格式预检只看「是不是」，百炼实时识别要的是去掉头之后的裸 PCM。
 *
 * 别假设 data 一定在第 36 字节。
 * WAV 允许在 fmt 和 data 之间插 LIST、fact 这类块（ffmpeg 就会写 LIST），
 * 写死偏移量的话，这种文件明明是合规的 16k 单声道 PCM 也会被判成不兼容——
 * 于是静默跳过 Qwen，退回快速模型。而「整段 Qwen 校准」正是
 * 「蜘蛛」不被听成「之初」的那道保险，它失效的时候没有任何迹象。
 * 所以按块表往下走。
 */
export function findWavPcmData(bytes: Uint8Array): { offset: number; size: number } | null {
  if (bytes.length < 12) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number, length: number) =>
    String.fromCharCode(...bytes.slice(offset, offset + length));

  if (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WAVE') return null;

  let offset = 12;
  let sawFmt = false;
  while (offset + 8 <= bytes.length) {
    const id = ascii(offset, 4);
    const size = view.getUint32(offset + 4, true);
    if (id === 'fmt ') {
      if (size < 16 || offset + 8 + 16 > bytes.length) return null;
      const format = view.getUint16(offset + 8, true);
      const channels = view.getUint16(offset + 10, true);
      const sampleRate = view.getUint32(offset + 12, true);
      const bitsPerSample = view.getUint16(offset + 22, true);
      if (format !== 1 || channels !== 1 || sampleRate !== 16_000 || bitsPerSample !== 16) {
        return null;
      }
      sawFmt = true;
    } else if (id === 'data') {
      return sawFmt ? { offset: offset + 8, size } : null;
    }
    // 块长度是奇数时后面补一个填充字节
    offset += 8 + size + (size % 2);
  }
  return null;
}

/**
 * 整个 WAV 文件 → 裸 PCM16LE（16k 单声道）。不是这个格式就返回 null。
 * data 块长度按头里写的取，但不超过文件实际长度（流式写出的 WAV 常把长度写成 0xFFFFFFFF），
 * 末尾落单的半个采样丢掉。
 */
export function wavToPcm16kMono(bytes: Uint8Array): Uint8Array | null {
  const found = findWavPcmData(bytes);
  if (!found) return null;
  const end = Math.min(bytes.length, found.offset + found.size);
  const length = Math.max(0, end - found.offset);
  return bytes.subarray(found.offset, found.offset + length - (length % 2));
}

/**
 * PCM16 字节流对齐：一个采样两个字节，网络块和 base64 分片都可能把它劈成两半。
 * 把落单的那个字节留到下一块的开头，保证交出去的每一块都是偶数长度——
 * 不然下游按 Int16 解读会整体错位一个字节，听起来就是一阵刺耳的噪声。
 * 前端播放器读 /speak 的响应时也要用同一个东西。
 */
export function createPcmAligner() {
  let carry: number | null = null;
  return {
    push(bytes: Uint8Array): Uint8Array {
      if (!bytes.length) return bytes;
      let input = bytes;
      if (carry !== null) {
        const joined = new Uint8Array(bytes.length + 1);
        joined[0] = carry;
        joined.set(bytes, 1);
        input = joined;
        carry = null;
      }
      if (input.length % 2 === 1) {
        carry = input[input.length - 1];
        return input.subarray(0, input.length - 1);
      }
      return input;
    },
    /** 流结束时还落单的半个采样只能丢掉；返回丢掉了几个字节（0 或 1） */
    flush(): number {
      const dropped = carry === null ? 0 : 1;
      carry = null;
      return dropped;
    },
  };
}

/**
 * 流式裁掉一段合成语音首尾的静音（PCM16LE 单声道，输入必须已经对齐成偶数长度）。
 *
 * 百炼 TTS 每段开头会先吐 0.5–1.6 秒静音、结尾再拖 0.5–0.7 秒。
 * 按句流式播放时这些全都叠出来：首字节到了还要再等一秒才出声，
 * 两句之间空出一两秒——听起来像卡住了，而不是在想。
 *
 * - 开头：一直丢到第一个超过阈值的采样，只留它前面 leadMs 的起音（不然第一个字的辅音会被削掉）；
 * - 中间：句子内部的停顿原样保留——那是语气的一部分；
 * - 结尾：最后一个响的采样之后的部分先扣着，后面又响了就原样放出去（说明那是句中停顿），
 *   一直到流结束都没再响，只放出 maxTrailMs，当作句与句之间的换气。
 *
 * 阈值按「明显是人声」来定（约 −40 dBFS）：合成语音的静音段几乎是数字零，
 * 而轻声的尾音、气声都在它上面，不会被误裁。
 */
export function createPcmSilenceTrimmer({
  sampleRate,
  threshold = 328,
  leadMs = 60,
  maxTrailMs = 350,
}: {
  sampleRate: number;
  threshold?: number;
  leadMs?: number;
  maxTrailMs?: number;
}) {
  const leadBytes = Math.round((sampleRate * leadMs) / 1000) * 2;
  const maxTrailBytes = Math.round((sampleRate * maxTrailMs) / 1000) * 2;
  let started = false;
  /** 还没开口时，最近 leadMs 的静音（开口时放在最前面） */
  let lead: Uint8Array = new Uint8Array(0);
  /** 开口之后，最后一个响的采样后面扣着没发的部分 */
  let held: Uint8Array[] = [];
  let heldBytes = 0;

  const loudIndexes = (bytes: Uint8Array): { first: number; last: number } => {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let first = -1;
    let last = -1;
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      const v = view.getInt16(i, true);
      if (v > threshold || v < -threshold) {
        if (first < 0) first = i;
        last = i;
      }
    }
    return { first, last };
  };

  const concat = (parts: Uint8Array[], total: number): Uint8Array => {
    const out = new Uint8Array(total);
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  };

  return {
    push(bytes: Uint8Array): Uint8Array {
      if (!bytes.length) return bytes;
      const { first, last } = loudIndexes(bytes);
      if (!started) {
        if (first < 0) {
          // 还在开头的静音里：只留最后 leadMs
          const joined = concat([lead, bytes], lead.length + bytes.length);
          lead = joined.subarray(Math.max(0, joined.length - leadBytes));
          return new Uint8Array(0);
        }
        started = true;
        const pre = concat([lead, bytes.subarray(0, first)], lead.length + first);
        lead = new Uint8Array(0);
        const keepPre = pre.subarray(Math.max(0, pre.length - leadBytes));
        const body = bytes.subarray(first, last + 2);
        const tail = bytes.subarray(last + 2);
        held = tail.length ? [tail] : [];
        heldBytes = tail.length;
        return concat([keepPre, body], keepPre.length + body.length);
      }
      if (last < 0) {
        // 整块都静：先扣着，等后面响了再说
        held.push(bytes);
        heldBytes += bytes.length;
        return new Uint8Array(0);
      }
      // 后面又响了：扣着的是句中停顿，原样放出
      const body = bytes.subarray(0, last + 2);
      const tail = bytes.subarray(last + 2);
      const out = concat([...held, body], heldBytes + body.length);
      held = tail.length ? [tail] : [];
      heldBytes = tail.length;
      return out;
    },
    /** 流结束：扣着的尾巴只放出 maxTrailMs；从头到尾都没出声就什么都不放 */
    flush(): Uint8Array {
      if (!started) return new Uint8Array(0);
      const tail = concat(held, heldBytes);
      held = [];
      heldBytes = 0;
      return tail.subarray(0, Math.min(tail.length, maxTrailBytes));
    },
  };
}

/** 裸 PCM16LE 单声道 → 带 44 字节头的 WAV（iOS 回退播放、调试落盘用） */
export function pcm16ToWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const out = new Uint8Array(44 + pcm.length);
  const view = new DataView(out.buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) out[offset + i] = text.charCodeAt(i);
  };
  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}
