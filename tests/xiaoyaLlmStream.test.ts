import assert from 'node:assert/strict';
import test from 'node:test';
import { createChatCompletionStream } from '../src/lib/llm.ts';

test('OpenAI-compatible SSE 被转换为纯文本增量且忽略 reasoning', async () => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.DEEPSEEK_API_KEY = 'test-key';

  const encoder = new TextEncoder();
  globalThis.fetch = async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"secret","content":"你'));
      controller.enqueue(encoder.encode('好"}}]}\n\ndata: {"choices":[{"delta":{"content":"，小芽"}}]}\n\n'));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  }), { status: 200 });

  try {
    const stream = await createChatCompletionStream({
      messages: [{ role: 'user', content: '你好' }],
      timeoutMs: 1000,
    });
    assert.ok(stream);
    const chunks: string[] = [];
    for await (const chunk of stream.chunks) chunks.push(chunk);
    assert.deepEqual(chunks, ['你好', '，小芽']);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  }
});

test('没有尾换行的最后一个 data 事件仍会被解析', async () => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.DEEPSEEK_API_KEY = 'test-key';
  const encoder = new TextEncoder();
  globalThis.fetch = async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"最后一片叶子"}}]}'));
      controller.close();
    },
  }), { status: 200 });

  try {
    const stream = await createChatCompletionStream({
      messages: [{ role: 'user', content: '继续' }],
      timeoutMs: 1000,
    });
    assert.ok(stream);
    const chunks: string[] = [];
    for await (const chunk of stream.chunks) chunks.push(chunk);
    assert.deepEqual(chunks, ['最后一片叶子']);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  }
});
