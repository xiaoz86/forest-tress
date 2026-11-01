import assert from 'node:assert/strict';
import test from 'node:test';
import { createNdjsonDecoder, encodeNdjson, readNdjson } from '../src/lib/ndjson.ts';
import {
  createReplyEventStream,
  createSpeechSigner,
  deterministicReplyStream,
  type PhilStreamEvent,
} from '../src/lib/philCoachStream.ts';
import { verifySpeech } from '../src/lib/philCoachSpeechSign.ts';

const SECRET = 'test-secret-0123456789abcdef';

function bytesStream(parts: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });
}

async function collect<T>(stream: ReadableStream<Uint8Array>): Promise<T[]> {
  const out: T[] = [];
  for await (const event of readNdjson<T>(stream)) out.push(event);
  return out;
}

async function* fromArray(parts: string[], { failAfter }: { failAfter?: number } = {}): AsyncGenerator<string> {
  for (let i = 0; i < parts.length; i += 1) {
    if (failAfter !== undefined && i >= failAfter) throw new Error('upstream broke');
    await Promise.resolve();
    yield parts[i];
  }
}

// —— NDJSON 读取 ——

test('NDJSON 读取：切在一行中间、切在汉字的 UTF-8 字节中间都能还原', async () => {
  const events = [
    { type: 'meta', requestId: 'r1', speak: true },
    { type: 'delta', text: '你好，这是一段中文回复。' },
    { type: 'done', requestId: 'r1', reply: '你好，这是一段中文回复。' },
  ];
  const all = new Uint8Array(events.flatMap(e => [...encodeNdjson(e)]));
  for (const size of [1, 2, 5, 13, all.length]) {
    const parts: Uint8Array[] = [];
    for (let i = 0; i < all.length; i += size) parts.push(all.subarray(i, i + size));
    assert.deepEqual(await collect(bytesStream(parts)), events, `size=${size}`);
  }
});

test('NDJSON 读取：最后一行没有换行、空行和坏行跳过', async () => {
  const text = '{"a":1}\n\n not json \n{"b":2}';
  assert.deepEqual(await collect(bytesStream([new TextEncoder().encode(text)])), [{ a: 1 }, { b: 2 }]);
  const decoder = createNdjsonDecoder();
  assert.deepEqual(decoder.push('{"x":'), []);
  assert.deepEqual(decoder.push('1}\n{"y"'), [{ x: 1 }]);
  assert.deepEqual(decoder.flush(), []);
});

// —— 回复事件流 ——

test('回复流：meta → delta… → sentence（签名能验过）→ done，顺序和内容都对', async () => {
  const deltas = ['刚才还沉沉的，', '这会儿忽然亮了一下。', '中间发生了', '什么？'];
  let cancelled = false;
  let settled: { outcome: string; sentences: number } | null = null;
  const stream = createReplyEventStream({
    requestId: 'req-1',
    chunks: fromArray(deltas),
    cancel: () => {
      cancelled = true;
    },
    signer: createSpeechSigner(SECRET),
    onSettled: info => {
      settled = info;
    },
  });
  const events = await collect<PhilStreamEvent>(stream);

  assert.deepEqual(events[0], { type: 'meta', requestId: 'req-1', speak: true });
  assert.deepEqual(
    events.filter(e => e.type === 'delta').map(e => (e as { text: string }).text),
    deltas,
  );
  const sentences = events.filter((e): e is Extract<PhilStreamEvent, { type: 'sentence' }> => e.type === 'sentence');
  assert.deepEqual(sentences.map(s => s.text), ['刚才还沉沉的，这会儿忽然亮了一下。', '中间发生了什么？']);
  assert.deepEqual(sentences.map(s => s.index), [0, 1]);
  for (const s of sentences) {
    assert.equal(s.tone, 'soft');
    assert.equal(verifySpeech(s, SECRET), 'ok');
  }
  // 第一段在第二个 delta 之后、回复结束之前就发出来了
  const firstSentenceAt = events.findIndex(e => e.type === 'sentence');
  const lastDeltaAt = events.map(e => e.type).lastIndexOf('delta');
  assert.ok(firstSentenceAt < lastDeltaAt);
  assert.deepEqual(events.at(-1), { type: 'done', requestId: 'req-1', reply: deltas.join('') });
  assert.equal(cancelled, false);
  assert.deepEqual(settled && { outcome: (settled as { outcome: string }).outcome, sentences: (settled as { sentences: number }).sentences }, {
    outcome: 'done',
    sentences: 2,
  });
});

test('回复流：没有签名密钥时照样流文字，只是不发 sentence', async () => {
  const events = await collect<PhilStreamEvent>(
    createReplyEventStream({ requestId: 'r', chunks: fromArray(['好的。', '我在。']), cancel: () => {}, signer: null }),
  );
  assert.deepEqual(events.map(e => e.type), ['meta', 'delta', 'delta', 'done']);
  assert.equal((events[0] as { speak: boolean }).speak, false);
});

test('长首句仍在生成时，已签名的第一分句就能开始合成，气泡原文保持完整', async () => {
  const prefix = '这几天你一直独自撑着很多事，';
  const tail = '没有人可以商量，也没有人替你的班。我们可以慢慢说。';
  const events = await collect<PhilStreamEvent>(createReplyEventStream({
    requestId: 'early-clause', chunks: fromArray([prefix, tail]), cancel() {}, signer: createSpeechSigner(SECRET),
  }));
  const sentenceAt = events.findIndex(e => e.type === 'sentence');
  const tailAt = events.findIndex(e => e.type === 'delta' && e.text === tail);
  assert.ok(sentenceAt < tailAt, '第一分句不等长句后半段');
  const first = events[sentenceAt] as Extract<PhilStreamEvent, { type: 'sentence' }>;
  assert.equal(first.text, prefix.slice(0, -1));
  assert.equal(verifySpeech(first, SECRET), 'ok');
  assert.deepEqual(events.at(-1), { type: 'done', requestId: 'early-clause', reply: prefix + tail });
});

test('回复流：模型中途断了 → 以 error 事件结束；一个字都没写也算失败', async () => {
  const broken = await collect<PhilStreamEvent>(
    createReplyEventStream({
      requestId: 'r',
      chunks: fromArray(['好的。', '我在', '这儿。'], { failAfter: 2 }),
      cancel: () => {},
      signer: createSpeechSigner(SECRET),
    }),
  );
  assert.deepEqual(broken.at(-1), { type: 'error', requestId: 'r', code: 'llm-failed' });
  assert.ok(!broken.some(e => e.type === 'done'));

  const empty = await collect<PhilStreamEvent>(
    createReplyEventStream({ requestId: 'r', chunks: fromArray(['  ', '\n']), cancel: () => {}, signer: null }),
  );
  assert.deepEqual(empty.map(e => e.type), ['meta', 'delta', 'delta', 'error']);
});

test('回复流：前端断开（流被取消）时中止上游', async () => {
  let cancelled = false;
  async function* slow(): AsyncGenerator<string> {
    yield '第一句话说完了。';
    await new Promise(resolve => setTimeout(resolve, 50));
    yield '不该被读到。';
  }
  const stream = createReplyEventStream({
    requestId: 'r',
    chunks: slow(),
    cancel: () => {
      cancelled = true;
    },
    signer: null,
  });
  const reader = stream.getReader();
  await reader.read();
  await reader.cancel();
  assert.equal(cancelled, true);
});

test('回复流：请求被中止（signal）时中止上游', async () => {
  let cancelled = false;
  const ctrl = new AbortController();
  async function* waiting(): AsyncGenerator<string> {
    yield '嗯。';
    await new Promise(resolve => setTimeout(resolve, 30));
    throw new Error('aborted upstream');
  }
  const stream = createReplyEventStream({
    requestId: 'r',
    chunks: waiting(),
    cancel: () => {
      cancelled = true;
    },
    signer: null,
    signal: ctrl.signal,
  });
  setTimeout(() => ctrl.abort(), 5);
  const events = await collect<PhilStreamEvent>(stream);
  assert.equal(cancelled, true);
  // 中止之后不再往外写 error
  assert.ok(!events.some(e => e.type === 'error'));
});

test('确定性回复（危机词）：一条 delta、签名段、一条 done，不调模型', async () => {
  const reply = '我听见你现在真的很难受。先别一个人扛着，请立刻联系身边可信任的人，或拨打当地急救/危机援助电话。';
  const events = await collect<PhilStreamEvent>(
    deterministicReplyStream({ requestId: 'r', reply, signer: createSpeechSigner(SECRET), tone: 'steady' }),
  );
  assert.deepEqual(events[0], { type: 'meta', requestId: 'r', speak: true });
  assert.deepEqual(events[1], { type: 'delta', text: reply });
  const sentences = events.filter((e): e is Extract<PhilStreamEvent, { type: 'sentence' }> => e.type === 'sentence');
  assert.ok(sentences.length >= 1);
  assert.equal(sentences.map(s => s.text).join(''), reply);
  for (const s of sentences) {
    assert.equal(s.tone, 'steady');
    assert.equal(verifySpeech(s, SECRET), 'ok');
  }
  assert.deepEqual(events.at(-1), { type: 'done', requestId: 'r', reply });
});
