/**
 * NDJSON（一行一个 JSON）的编码和逐行读取。纯函数，前后端共用。
 *
 * 读取时要防两种「跨块」：网络块可能切在一行的中间，也可能切在一个汉字的 UTF-8 字节中间——
 * 前者靠缓冲到换行，后者靠 TextDecoder 的 stream 模式。坏行跳过，不让一行脏数据断掉整条回复。
 */

const encoder = new TextEncoder();

export function encodeNdjson(event: unknown): Uint8Array {
  return encoder.encode(`${JSON.stringify(event)}\n`);
}

/** 文本块 → 完整行解析出的对象；最后一行没有换行时由 flush 交出 */
export function createNdjsonDecoder<T = unknown>() {
  let buffer = '';
  const parse = (line: string, out: T[]) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      out.push(JSON.parse(trimmed) as T);
    } catch {
      // 坏行跳过
    }
  };
  return {
    push(text: string): T[] {
      buffer += text;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      const out: T[] = [];
      for (const line of lines) parse(line, out);
      return out;
    },
    flush(): T[] {
      const out: T[] = [];
      parse(buffer, out);
      buffer = '';
      return out;
    },
  };
}

/** 逐个读出流里的事件；调用方 break 或抛错时会取消底层流 */
export async function* readNdjson<T = unknown>(stream: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const lines = createNdjsonDecoder<T>();
  let finished = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        for (const event of lines.push(decoder.decode())) yield event;
        for (const event of lines.flush()) yield event;
        finished = true;
        return;
      }
      for (const event of lines.push(decoder.decode(value, { stream: true }))) yield event;
    }
  } finally {
    if (!finished) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
