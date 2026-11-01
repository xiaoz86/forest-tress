import assert from 'node:assert/strict';
import test from 'node:test';
import { DashscopeError, getDashscopeConfig } from '../src/lib/dashscope.ts';
import {
  bailianTtsGainDb,
  bailianTtsInstruction,
  createTtsSseParser,
  DEFAULT_TTS_INSTRUCTION,
  resolveBailianVoice,
  streamTtsPcm,
} from '../src/lib/dashscopeTts.ts';
import { createPcmAligner, createPcmLeveler, createPcmSilenceTrimmer } from '../src/lib/wavPcm.ts';

const CONFIG = getDashscopeConfig({ DASHSCOPE_API_KEY: 'sk-test', DASHSCOPE_WORKSPACE_ID: 'ws-test' })!;

/** 仿真实上游：data 是多行缩进的 JSON，每行都带 data: 前缀 */
function sseEvent(id: number, payload: unknown, { event = 'result', status = 200 } = {}): string {
  const lines = JSON.stringify(payload, null, 2).split('\n').map(line => `data:${line}`);
  return [`id:${id}`, `event:${event}`, `:HTTP_STATUS/${status}`, ...lines, '', ''].join('\n');
}

function audioEvent(id: number, bytes: number[], type = 'sentence-synthesis'): string {
  return sseEvent(id, {
    output: { type, audio: { data: Buffer.from(bytes).toString('base64'), id: 'audio_x' }, finish_reason: 'null' },
    request_id: 'r',
  });
}

function splitEvery(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

const SAMPLE_SSE =
  sseEvent(1, { output: { type: 'sentence-begin', audio: { data: '' } } }) +
  audioEvent(2, [1, 2, 3, 4, 5]) +
  audioEvent(3, [6, 7, 8, 9, 10, 11, 12]) +
  sseEvent(4, {
    output: { type: 'sentence-end', audio: { data: '' } },
    usage: { input_tokens: 5, output_tokens: 14, characters: 8 },
  });

test('SSE 解析：跨块切开（切在 base64 中间、切在空行中间）也能还原', () => {
  for (const size of [1, 3, 7, 64, 10_000]) {
    const parser = createTtsSseParser();
    const events = [...splitEvery(SAMPLE_SSE, size).flatMap(part => parser.push(part)), ...parser.flush()];
    const audio = events.flatMap(e => (e.kind === 'audio' ? [...e.pcm] : []));
    assert.deepEqual(audio, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], `size=${size}`);
    const usage = events.find(e => e.kind === 'usage');
    assert.deepEqual(usage?.kind === 'usage' && usage.usage, { input_tokens: 5, output_tokens: 14, characters: 8 });
  }
});

test('SSE 解析：CRLF 换行、最后一个事件没有空行', () => {
  const parser = createTtsSseParser();
  const crlf = audioEvent(1, [1, 2]).replace(/\n/g, '\r\n').replace(/(\r\n)+$/, '');
  const events = [...parser.push(crlf.slice(0, 20)), ...parser.push(crlf.slice(20)), ...parser.flush()];
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'audio');
});

test('SSE 解析：错误事件带 code / message / 状态码', () => {
  const parser = createTtsSseParser();
  const events = parser.push(
    sseEvent(1, { code: 'Throttling.RateQuota', message: 'Requests rate limit exceeded', request_id: 'r' }, { event: 'error', status: 429 }),
  );
  assert.deepEqual(events, [
    { kind: 'error', code: 'Throttling.RateQuota', message: 'Requests rate limit exceeded', status: 429 },
  ]);
});

test('PCM 对齐：落单的字节留到下一块，交出去的都是偶数长度', () => {
  const aligner = createPcmAligner();
  const parts = [[1, 2, 3], [4], [5, 6, 7, 8, 9], [10]].map(p => aligner.push(new Uint8Array(p)));
  for (const part of parts) assert.equal(part.length % 2, 0);
  assert.deepEqual(parts.flatMap(p => [...p]), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  aligner.push(new Uint8Array([11]));
  assert.equal(aligner.flush(), 1);
  assert.equal(aligner.flush(), 0);
});

test('语气和音色：白名单映射，任意字符串不透传', () => {
  assert.equal(bailianTtsInstruction('soft', {}), DEFAULT_TTS_INSTRUCTION);
  assert.equal(bailianTtsInstruction('soft', { DASHSCOPE_TTS_INSTRUCTION: '慢一点' }), '慢一点');
  assert.notEqual(bailianTtsInstruction('steady', { DASHSCOPE_TTS_INSTRUCTION: '慢一点' }), '慢一点');
  const env = { DASHSCOPE_TTS_VOICE_FEMALE: 'vf', DASHSCOPE_TTS_VOICE_MALE: 'vm' };
  assert.equal(resolveBailianVoice('female', env), 'vf');
  assert.equal(resolveBailianVoice('male', env), 'vm');
  assert.equal(resolveBailianVoice('longanhuan_v3.1', env), 'vf');
  assert.equal(resolveBailianVoice('male', {}), null);
});

async function withFetch<T>(impl: typeof fetch, run: () => Promise<T>): Promise<T> {
  const previous = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await run();
  } finally {
    globalThis.fetch = previous;
  }
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array[]> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return chunks;
    chunks.push(value);
  }
}

test('streamTtsPcm：请求体和请求头对，跨块 SSE 还原成偶数长度的 PCM 块', async () => {
  let seen: { url: string; headers: Headers; body: Record<string, unknown> } | null = null;
  const encoder = new TextEncoder();
  let done: { audioBytes: number } | null = null;
  const responseTimes: number[] = [];
  const result = await withFetch(
    async (input, init) => {
      seen = {
        url: String(input),
        headers: new Headers(init?.headers),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      };
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            for (const part of splitEvery(SAMPLE_SSE, 11)) controller.enqueue(encoder.encode(part));
            controller.close();
          },
        }),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      );
    },
    async () => {
      const { stream, firstAudioMs } = await streamTtsPcm({
        text: '嗯，我在。',
        voice: 'vf',
        instruction: '慢一点',
        config: CONFIG,
        onHeaders: elapsedMs => responseTimes.push(elapsedMs),
        onDone: info => {
          done = info;
        },
      });
      assert.ok(firstAudioMs >= 0);
      return readAll(stream);
    },
  );

  assert.ok(seen);
  assert.equal(responseTimes.length, 1);
  assert.ok(responseTimes[0] >= 0);
  const request = seen as { url: string; headers: Headers; body: Record<string, unknown> };
  assert.equal(request.url, 'https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer');
  assert.equal(request.headers.get('X-DashScope-SSE'), 'enable');
  assert.equal(request.headers.get('Connection'), 'close');
  assert.equal(request.headers.get('Authorization'), 'Bearer sk-test');
  assert.deepEqual(request.body, {
    model: 'qwen-audio-3.1-tts-flash',
    input: { text: '嗯，我在。', voice: 'vf', format: 'pcm', sample_rate: 24000, instruction: '慢一点' },
  });
  for (const chunk of result) assert.equal(chunk.length % 2, 0);
  assert.deepEqual(result.flatMap(c => [...c]), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(done, { audioBytes: 12, usage: { input_tokens: 5, output_tokens: 14, characters: 8 }, cancelled: false });
});

test('streamTtsPcm：第一块音频之前出错 → 直接抛，调用方还能换 SiliconFlow', async () => {
  const cases: [Response, string][] = [
    [new Response(JSON.stringify({ code: 'AllocationQuota.FreeTierOnly', message: 'x' }), { status: 403 }), 'quota'],
    [new Response(JSON.stringify({ code: 'InvalidApiKey', message: 'x' }), { status: 401 }), 'auth'],
    [new Response('', { status: 500 }), 'upstream'],
    [
      new Response(sseEvent(1, { code: 'Throttling.RateQuota', message: 'x' }, { event: 'error', status: 429 }), {
        status: 200,
      }),
      'rate',
    ],
    [new Response(sseEvent(1, { output: { type: 'sentence-end', audio: { data: '' } } }), { status: 200 }), 'upstream'],
  ];
  for (const [response, kind] of cases) {
    await assert.rejects(
      withFetch(async () => response, () => streamTtsPcm({ text: '好。', voice: 'vf', config: CONFIG })),
      (err: unknown) => err instanceof DashscopeError && err.kind === kind,
      kind,
    );
  }
});

test('streamTtsPcm：迟迟没有第一块音频就超时', async () => {
  await assert.rejects(
    withFetch(
      async (_input, init) =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason));
            },
          }),
          { status: 200 },
        ),
      () => streamTtsPcm({ text: '好。', voice: 'vf', config: CONFIG, firstAudioTimeoutMs: 100 }),
    ),
    (err: unknown) => err instanceof DashscopeError && err.kind === 'timeout',
  );
});

test('streamTtsPcm：下游取消时中止上游请求', async () => {
  let upstreamSignal: AbortSignal | undefined;
  const encoder = new TextEncoder();
  await withFetch(
    async (_input, init) => {
      upstreamSignal = init?.signal ?? undefined;
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(audioEvent(1, [1, 2, 3, 4])));
            // 不关闭：模拟还在合成
          },
        }),
        { status: 200 },
      );
    },
    async () => {
      const { stream } = await streamTtsPcm({ text: '好。', voice: 'vf', config: CONFIG });
      const reader = stream.getReader();
      const first = await reader.read();
      assert.deepEqual([...(first.value ?? [])], [1, 2, 3, 4]);
      await reader.cancel();
    },
  );
  assert.equal(upstreamSignal?.aborted, true);
});

// ── 首尾静音裁剪 ──────────────────────────────────────────────

/** 造一段 PCM16LE：[静音毫秒, 有声毫秒, 静音毫秒, …] 交替，有声段用 1000 幅度的方波 */
function pcmPattern(sampleRate: number, ms: number[]): Uint8Array {
  const total = ms.reduce((n, m) => n + Math.round((sampleRate * m) / 1000), 0);
  const out = new Uint8Array(total * 2);
  const view = new DataView(out.buffer);
  let at = 0;
  ms.forEach((m, i) => {
    const n = Math.round((sampleRate * m) / 1000);
    for (let k = 0; k < n; k += 1) view.setInt16((at + k) * 2, i % 2 === 1 ? (k % 2 ? 1000 : -1000) : 0, true);
    at += n;
  });
  return out;
}

/** 按任意块大小喂给裁剪器，拼回输出 */
function runTrimmer(pcm: Uint8Array, chunk: number, opts = {}): Uint8Array {
  const trimmer = createPcmSilenceTrimmer({ sampleRate: 24_000, ...opts });
  const parts: Uint8Array[] = [];
  for (let i = 0; i < pcm.length; i += chunk) parts.push(trimmer.push(pcm.subarray(i, i + chunk)));
  parts.push(trimmer.flush());
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const ms = (bytes: Uint8Array) => (bytes.length / 2 / 24_000) * 1000;

test('静音裁剪：开头 1.2 秒静音只留 60ms 起音，结尾 0.7 秒只留 350ms，句中 0.4 秒停顿原样保留', () => {
  // 静 1200 / 声 500 / 静 400 / 声 300 / 静 700
  const pcm = pcmPattern(24_000, [1200, 500, 400, 300, 700]);
  for (const chunk of [2, 480, 4_800, 7_777 * 2, pcm.length]) {
    const out = runTrimmer(pcm, chunk);
    assert.equal(out.length % 2, 0, `块大小 ${chunk}：输出必须偶数长度`);
    assert.ok(Math.abs(ms(out) - (60 + 500 + 400 + 300 + 350)) < 1, `块大小 ${chunk}：时长 ${ms(out)}ms`);
    // 第一个非零采样正好在 60ms 处
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    let first = -1;
    for (let i = 0; i < out.length; i += 2) if (view.getInt16(i, true) !== 0) { first = i; break; }
    assert.equal(first / 2, 24_000 * 0.06);
  }
});

test('静音裁剪：开头静音不足 60ms 时一点不多也一点不少；全程静音什么都不出', () => {
  const short = pcmPattern(24_000, [20, 300, 100]);
  assert.ok(Math.abs(ms(runTrimmer(short, 960)) - (20 + 300 + 100)) < 1);
  assert.equal(runTrimmer(pcmPattern(24_000, [800]), 960).length, 0);
});

test('静音裁剪：低于阈值的轻声不算出声，超过阈值的才算', () => {
  const trimmer = createPcmSilenceTrimmer({ sampleRate: 24_000, threshold: 328 });
  const quiet = new Uint8Array(4_800);
  new DataView(quiet.buffer).setInt16(100, 200, true);
  assert.equal(trimmer.push(quiet).length, 0);
  const loud = new Uint8Array(4_800);
  new DataView(loud.buffer).setInt16(100, 2000, true);
  assert.ok(trimmer.push(loud).length > 0);
});

// ── 响度均衡 ──────────────────────────────────────────────

function sinePcm(amplitude: number, ms: number, sampleRate = 24_000): Uint8Array {
  const n = Math.round((sampleRate * ms) / 1000);
  const out = new Uint8Array(n * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < n; i += 1) view.setInt16(i * 2, Math.round(Math.sin((2 * Math.PI * 220 * i) / sampleRate) * amplitude * 32767), true);
  return out;
}
const peakOf = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0;
  for (let i = 0; i < bytes.length; i += 2) p = Math.max(p, Math.abs(view.getInt16(i, true)));
  return p;
};

test('响度均衡：gainDb 为 0 原样返回；轻声按增益放大（+6 dB ≈ ×2）', () => {
  const quiet = sinePcm(0.05, 300);
  assert.equal(createPcmLeveler({ sampleRate: 24_000, gainDb: 0 }).push(quiet), quiet);
  const out = createPcmLeveler({ sampleRate: 24_000, gainDb: 6 }).push(quiet);
  const ratio = peakOf(out) / peakOf(quiet);
  assert.ok(ratio > 1.95 && ratio < 2.05, `放大倍数 ${ratio}`);
});

test('响度均衡：响的地方永远不超过 −1 dBFS，不会削波', () => {
  const loud = sinePcm(0.95, 500);
  const out = createPcmLeveler({ sampleRate: 24_000, gainDb: 12 }).push(loud);
  assert.ok(peakOf(out) <= Math.round(10 ** (-1 / 20) * 32767), `峰值 ${peakOf(out)}`);
  assert.equal(out.length, loud.length);
});

test('响度均衡：按任意块大小处理，结果和一次处理完全一样（状态跨块保留）', () => {
  const pcm = new Uint8Array([...sinePcm(0.9, 200), ...sinePcm(0.1, 300), ...sinePcm(0.95, 100)]);
  const whole = createPcmLeveler({ sampleRate: 24_000, gainDb: 6 }).push(pcm);
  for (const chunk of [2, 482, 4_800, 9_998]) {
    const leveler = createPcmLeveler({ sampleRate: 24_000, gainDb: 6 });
    const parts: number[] = [];
    for (let i = 0; i < pcm.length; i += chunk) parts.push(...leveler.push(pcm.subarray(i, i + chunk)));
    assert.deepEqual(Uint8Array.from(parts), whole, `块大小 ${chunk}`);
  }
});

test('响度提升：默认女声、男声均 +7；可以用环境变量调，限制在 0–12，写错了用默认', () => {
  assert.equal(bailianTtsGainDb('female', {}), 7);
  assert.equal(bailianTtsGainDb('male', {}), 7);
  assert.equal(bailianTtsGainDb('anything', {}), 7);
  assert.equal(bailianTtsGainDb('female', { DASHSCOPE_TTS_GAIN_DB_FEMALE: '8' }), 8);
  assert.equal(bailianTtsGainDb('male', { DASHSCOPE_TTS_GAIN_DB_MALE: '20' }), 12);
  assert.equal(bailianTtsGainDb('male', { DASHSCOPE_TTS_GAIN_DB_MALE: '-3' }), 0);
  assert.equal(bailianTtsGainDb('female', { DASHSCOPE_TTS_GAIN_DB_FEMALE: 'abc' }), 7);
  assert.equal(bailianTtsGainDb('male', { DASHSCOPE_TTS_GAIN_DB_MALE: 'abc' }), 7);
});
