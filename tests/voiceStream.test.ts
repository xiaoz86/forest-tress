import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildReplyRequest,
  concatBytes,
  createElementSink,
  createPlaybackClock,
  createSpeechEngine,
  isReplyStream,
  joinSpeechTexts,
  parseAudioFormat,
  pcm16leToFloat32,
  pickSegmentsToFetch,
  readNdjson,
  type AudioElementLike,
  type SignedSentence,
  type SinkEvents,
  type SpeechEngineState,
  type SpeechSink,
} from '../src/lib/voiceStream.ts';

// —— 纯函数 ——

test('X-Audio-Format：pcm 带采样率、mp3、缺头时看 Content-Type、认不出返回 null', () => {
  assert.deepEqual(parseAudioFormat('pcm_s16le;rate=24000'), { kind: 'pcm', sampleRate: 24000 });
  assert.deepEqual(parseAudioFormat(' PCM_S16LE; rate=16000 '), { kind: 'pcm', sampleRate: 16000 });
  // 采样率缺了或离谱，按百炼的 24k
  assert.deepEqual(parseAudioFormat('pcm_s16le'), { kind: 'pcm', sampleRate: 24000 });
  assert.deepEqual(parseAudioFormat('pcm_s16le;rate=5'), { kind: 'pcm', sampleRate: 24000 });
  assert.deepEqual(parseAudioFormat('mp3'), { kind: 'mp3' });
  assert.deepEqual(parseAudioFormat(null, 'audio/mpeg'), { kind: 'mp3' });
  assert.equal(parseAudioFormat('opus'), null);
  assert.equal(parseAudioFormat(null, 'application/json'), null);
});

test('PCM16LE → Float32：满幅、负满幅、零；落单字节忽略；尊重 byteOffset', () => {
  const bytes = new Uint8Array([0x00, 0x00, 0xff, 0x7f, 0x00, 0x80, 0x01, 0x00, 0x42]);
  const out = pcm16leToFloat32(bytes);
  assert.equal(out.length, 4);
  assert.equal(out[0], 0);
  assert.equal(out[1], 1);
  assert.equal(out[2], -1);
  assert.ok(Math.abs(out[3] - 1 / 0x7fff) < 1e-9);
  // 从中间切出来的视图
  const view = new Uint8Array([9, 0xff, 0x7f]).subarray(1);
  assert.equal(pcm16leToFloat32(view)[0], 1);
});

test('播放时钟：开头先攒约 150ms；排上之后紧接着排，无缝；放空了重新攒', () => {
  const clock = createPlaybackClock({ lead: 0.05, prebuffer: 0.15 });
  assert.equal(clock.starved(0), true);
  assert.equal(clock.shouldFlush(0, 0.1, false), false);   // 不够 150ms，先等
  assert.equal(clock.shouldFlush(0, 0.1, true), true);     // 这一段到头了，有多少放多少
  assert.equal(clock.shouldFlush(0, 0.15, false), true);
  const first = clock.place(1, 0.2);
  assert.equal(first, 1.05);                                // 离现在留一点余量
  assert.equal(clock.starved(1.1), false);
  assert.equal(clock.shouldFlush(1.1, 0.01, false), true);  // 正在放：来一点排一点
  const second = clock.place(1.1, 0.1);
  assert.ok(Math.abs(second - 1.25) < 1e-9);                // 紧接在上一块后面
  assert.ok(Math.abs(clock.endTime() - 1.35) < 1e-9);
  // 时间走过了队尾：断流，重新攒
  assert.equal(clock.starved(1.4), true);
  assert.equal(clock.shouldFlush(1.4, 0.05, false), false);
  assert.equal(clock.place(2, 0.1), 2.05);
  clock.reset();
  assert.equal(clock.starved(0), true);
});

test('预取：从正在放的那段往后，最多两段在路上、最多看两段', () => {
  assert.deepEqual(pickSegmentsToFetch(['queued', 'queued', 'queued', 'queued'], 0), [0, 1]);
  assert.deepEqual(pickSegmentsToFetch(['receiving', 'queued', 'queued', 'queued'], 0), [1]);
  assert.deepEqual(pickSegmentsToFetch(['receiving', 'loading', 'queued'], 0), []);
  assert.deepEqual(pickSegmentsToFetch(['receiving', 'ready', 'queued', 'queued'], 0), [2]);
  // 看得再远也只到 playPos + 2
  assert.deepEqual(pickSegmentsToFetch(['ready', 'ready', 'ready', 'queued'], 0), []);
  assert.deepEqual(pickSegmentsToFetch(['ready', 'ready', 'ready', 'queued'], 1), [3]);
});

test('失败后拼给旧 /tts 的文字：去多余空白、跳过空段、截到 600 字', () => {
  assert.equal(joinSpeechTexts(['嗯，我在。', '  ', '你慢慢说，\n不着急。']), '嗯，我在。 你慢慢说， 不着急。');
  assert.equal(joinSpeechTexts(['a'.repeat(700)]).length, 600);
});

test('没开流式：对话请求的头和体和改造前一个字节都不差', () => {
  const payload = {
    pathId: 'open',
    messages: [{ role: 'user', content: '你好' }],
    voiceContext: { transcript: '你好', emotion: '低落' },
  };
  const legacy = buildReplyRequest(false, payload, true);
  // 改造前的写法原样抄在这里
  assert.deepEqual(legacy.headers, { 'Content-Type': 'application/json' });
  assert.equal(
    legacy.body,
    JSON.stringify({
      pathId: 'open',
      messages: [{ role: 'user', content: '你好' }],
      voiceContext: { transcript: '你好', emotion: '低落' },
    }),
  );
  assert.ok(!('Accept' in legacy.headers));
  assert.ok(!legacy.body.includes('speak'));

  const streaming = buildReplyRequest(true, payload, false);
  assert.match(streaming.headers.Accept, /application\/x-ndjson/);
  assert.equal(JSON.parse(streaming.body).speak, false);
  assert.equal(JSON.parse(streaming.body).pathId, 'open');
});

test('按 content-type 分辨回来的是事件流还是 JSON（闸门 403 仍是 JSON）', () => {
  const ndjson = new Response('{"type":"meta"}\n', {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
  });
  assert.equal(isReplyStream(ndjson), true);
  const json = new Response('{"reply":"嗯"}', { headers: { 'Content-Type': 'application/json' } });
  assert.equal(isReplyStream(json), false);
  const gate = new Response('{"error":"member-required"}', {
    status: 403,
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
  assert.equal(isReplyStream(gate), false);
});

test('前端读 NDJSON：切在行中间、切在汉字中间都能读出完整事件', async () => {
  const text = '{"type":"delta","text":"你好"}\n{"type":"done","reply":"你好"}\n';
  const bytes = new TextEncoder().encode(text);
  // 第二刀切在「好」的 UTF-8 中间
  const cuts = [5, 27, bytes.length];
  let from = 0;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const to of cuts) {
        controller.enqueue(bytes.slice(from, to));
        from = to;
      }
      controller.close();
    },
  });
  const events: unknown[] = [];
  for await (const event of readNdjson(stream)) events.push(event);
  assert.deepEqual(events, [
    { type: 'delta', text: '你好' },
    { type: 'done', reply: '你好' },
  ]);
});

// —— 引擎：用假的 fetch 和假的播放端 ——

const tick = async (n = 6) => {
  for (let i = 0; i < n; i += 1) await new Promise(resolve => setImmediate(resolve));
};

type FetchCall = {
  url: string;
  body: Record<string, unknown>;
  signal: AbortSignal;
  respond(res: Response): void;
  fail(err?: unknown): void;
};

function fakeFetch() {
  const calls: FetchCall[] = [];
  const impl = (url: string, init: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      const signal = init.signal as AbortSignal;
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
      calls.push({
        url,
        body: JSON.parse(String(init.body)),
        signal,
        respond: resolve,
        fail: (err = new TypeError('network')) => reject(err),
      });
    });
  return { calls, impl };
}

function fakeSink() {
  const log: string[] = [];
  const pcm: Uint8Array[] = [];
  let busy = false;
  /** endSegment 交过来、还没「放完」的段数 */
  let pending = 0;
  const sink: SpeechSink = {
    pushPcm(bytes, rate) {
      log.push(`pcm${bytes.length}@${rate}`);
      pcm.push(bytes);
      busy = true;
    },
    pushEncoded(bytes) {
      log.push(`enc${bytes.length}`);
      busy = true;
    },
    endSegment() {
      log.push('end');
      pending += 1;
    },
    pendingSegments: () => pending,
    idle: () => !busy,
    stop() {
      log.push('stop');
      busy = false;
      pending = 0;
    },
  };
  return {
    sink,
    log,
    pcm,
    /** 模拟交过去的都放完了 */
    finishPlaying() {
      busy = false;
      pending = 0;
    },
    /** 模拟最前面那段放完了（后面还有排着的） */
    finishSegment() {
      pending = Math.max(0, pending - 1);
    },
  };
}

/** 可以一块一块往里塞的 PCM 响应 */
function pcmResponse(headers: Record<string, string> = {}) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  const res = new Response(body, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Audio-Format': 'pcm_s16le;rate=24000',
      'X-Voice-Provider': 'bailian',
      ...headers,
    },
  });
  return {
    res,
    push: (bytes: number[]) => controller.enqueue(new Uint8Array(bytes)),
    close: () => controller.close(),
  };
}

function mp3Response(bytes: number[], headers: Record<string, string> = {}) {
  return new Response(new Uint8Array(bytes), {
    headers: { 'Content-Type': 'audio/mpeg', 'X-Audio-Format': 'mp3', 'X-Voice-Provider': 'siliconflow', ...headers },
  });
}

function sentence(index: number, text: string): SignedSentence {
  return { index, text, exp: 1_900_000_000, sig: `sig${index}`, tone: 'soft' };
}

function setup() {
  const fetcher = fakeFetch();
  const out = fakeSink();
  const states: SpeechEngineState[] = [];
  const errors: string[] = [];
  const engine = createSpeechEngine({
    fetchImpl: fetcher.impl,
    pickSink: async () => out.sink,
    onChange: state => states.push(state),
    onError: kind => errors.push(kind),
  });
  return { engine, fetcher, out, states, errors };
}

test('引擎：最多两段同时在路上；后面的先回来也要等前面的放完才轮到它', async () => {
  const { engine, fetcher, out } = setup();
  const id = engine.start('female');
  engine.add(id, { kind: 'signed', sentence: sentence(0, '嗯，我在。') });
  engine.add(id, { kind: 'signed', sentence: sentence(1, '你慢慢说。') });
  engine.add(id, { kind: 'signed', sentence: sentence(2, '不着急。') });
  await tick();
  assert.equal(fetcher.calls.length, 2, '第三段先不发');
  assert.deepEqual(fetcher.calls.map(c => c.url), ['/api/phil-coach/speak', '/api/phil-coach/speak']);
  assert.deepEqual(fetcher.calls[0].body, {
    text: '嗯，我在。',
    exp: 1_900_000_000,
    sig: 'sig0',
    tone: 'soft',
    voice: 'female',
  });

  // 第二段先回来、先收完
  const s1 = pcmResponse();
  fetcher.calls[1].respond(s1.res);
  s1.push([1, 1, 2, 2]);
  s1.close();
  await tick();
  assert.ok(!out.log.some(entry => entry.startsWith('pcm')), '第一段没到之前一个字节都不放');
  assert.equal(fetcher.calls.length, 3, '第二段收完了，第三段可以发了');

  const s0 = pcmResponse();
  fetcher.calls[0].respond(s0.res);
  s0.push([9, 9]);
  await tick();
  assert.deepEqual(out.log.filter(entry => entry !== 'stop'), ['pcm2@24000']);
  s0.close();
  await tick();
  // 第一段收尾，紧接着把攒好的第二段整段交出去
  assert.deepEqual(out.log.filter(entry => entry !== 'stop'), ['pcm2@24000', 'end', 'pcm4@24000', 'end']);
});

test('引擎：PCM 被切成奇数长度的块，交给播放端的每一块都是偶数长度、拼起来一字不差', async () => {
  const { engine, fetcher, out } = setup();
  const id = engine.start('male');
  engine.add(id, { kind: 'signed', sentence: sentence(0, '嗯。') });
  engine.end(id);
  await tick();
  const r = pcmResponse();
  fetcher.calls[0].respond(r.res);
  const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  r.push(original.slice(0, 3));
  r.push(original.slice(3, 7));
  r.push(original.slice(7));
  r.close();
  await tick();
  assert.ok(out.pcm.every(part => part.length % 2 === 0));
  assert.deepEqual([...concatBytes(out.pcm)], original);
  assert.equal(fetcher.calls[0].body.voice, 'male');
});

test('引擎：一段在出声前失败（签名过期 401），这条回复剩下的文字到齐后合成一次旧 /tts', async () => {
  const { engine, fetcher, out, errors } = setup();
  const id = engine.start('female');
  engine.add(id, { kind: 'signed', sentence: sentence(0, '第一句。') });
  engine.add(id, { kind: 'signed', sentence: sentence(1, '第二句。') });
  await tick();
  fetcher.calls[0].respond(new Response('{"error":"expired"}', { status: 401 }));
  await tick();
  assert.equal(fetcher.calls[1].signal.aborted, true, '后面已经在路上的那段也掐掉，嗓音前后一致');
  // 回复还在流：后面来的句子并进去，先不发旧 /tts
  engine.add(id, { kind: 'signed', sentence: sentence(2, '第三句。') });
  await tick();
  assert.equal(fetcher.calls.length, 2);
  engine.end(id);
  await tick();
  assert.equal(fetcher.calls.length, 3);
  assert.equal(fetcher.calls[2].url, '/api/phil-coach/tts');
  assert.deepEqual(fetcher.calls[2].body, { text: '第一句。 第二句。 第三句。', voice: 'female' });
  fetcher.calls[2].respond(mp3Response([1, 2, 3]));
  await tick();
  assert.deepEqual(out.log.filter(entry => entry !== 'stop'), ['enc3', 'end']);
  assert.deepEqual(errors, []);
});

test('引擎：旧 /tts 也失败就静默并报一次错，这条回复结束', async () => {
  const { engine, fetcher, errors, states } = setup();
  const id = engine.start('female');
  engine.add(id, { kind: 'signed', sentence: sentence(0, '第一句。') });
  engine.end(id);
  await tick();
  fetcher.calls[0].respond(new Response('', { status: 502 }));
  await tick();
  fetcher.calls[1].respond(new Response('', { status: 502 }));
  await tick();
  assert.deepEqual(errors, ['unavailable']);
  assert.deepEqual(states.at(-1), { loading: false, speaking: false });
  assert.equal(engine.active, false);
});

test('引擎：服务端换了 SiliconFlow（X-Voice-Fallback），这条回复后面的段都直接要 SiliconFlow', async () => {
  const { engine, fetcher } = setup();
  const id = engine.start('female');
  engine.add(id, { kind: 'signed', sentence: sentence(0, '一。') });
  engine.add(id, { kind: 'signed', sentence: sentence(1, '二。') });
  engine.add(id, { kind: 'signed', sentence: sentence(2, '三。') });
  await tick();
  assert.equal(fetcher.calls[1].body.provider, undefined);
  fetcher.calls[0].respond(mp3Response([1, 2], { 'X-Voice-Fallback': '1' }));
  await tick();
  // 第二段请求发出时还没降级，回来的却是百炼：重要一遍
  const late = pcmResponse();
  fetcher.calls[1].respond(late.res);
  await tick();
  const retried = fetcher.calls.filter(c => c.body.text === '二。');
  assert.equal(retried.length, 2);
  assert.equal(retried[1].body.provider, 'siliconflow');
  const third = fetcher.calls.find(c => c.body.text === '三。');
  assert.equal(third?.body.provider, 'siliconflow');
});

test('引擎：stop 中止所有还在路上的请求，之后来的句子不再发', async () => {
  const { engine, fetcher, out, states } = setup();
  const id = engine.start('female');
  engine.add(id, { kind: 'signed', sentence: sentence(0, '一。') });
  engine.add(id, { kind: 'signed', sentence: sentence(1, '二。') });
  await tick();
  assert.deepEqual(states.at(-1), { loading: true, speaking: false });
  engine.stop();
  assert.ok(fetcher.calls.every(c => c.signal.aborted));
  assert.ok(out.log.includes('stop'));
  engine.add(id, { kind: 'signed', sentence: sentence(2, '三。') });
  engine.end(id);
  await tick();
  assert.equal(fetcher.calls.length, 2);
  assert.deepEqual(states.at(-1), { loading: false, speaking: false });
});

test('引擎：没有签名段时走旧 /tts 整段（打开朗读补念、恢复的对话），放完回到空闲', async () => {
  const { engine, fetcher, out, states } = setup();
  const id = engine.start('male');
  engine.add(id, { kind: 'text', text: '嗯，我在。' });
  engine.end(id);
  await tick();
  assert.equal(fetcher.calls[0].url, '/api/phil-coach/tts');
  assert.deepEqual(fetcher.calls[0].body, { text: '嗯，我在。', voice: 'male' });
  fetcher.calls[0].respond(mp3Response([7, 7, 7, 7]));
  await tick();
  engine.events.sound();
  assert.deepEqual(states.at(-1), { loading: false, speaking: true });
  out.finishPlaying();
  engine.events.drained();
  assert.deepEqual(states.at(-1), { loading: false, speaking: false });
  assert.equal(engine.active, false);
});

test('引擎：新开一条会先停掉上一条', async () => {
  const { engine, fetcher } = setup();
  const first = engine.start('female');
  engine.add(first, { kind: 'signed', sentence: sentence(0, '旧的。') });
  await tick();
  const second = engine.start('female');
  assert.equal(fetcher.calls[0].signal.aborted, true);
  engine.add(first, { kind: 'signed', sentence: sentence(1, '旧的第二句。') });
  engine.add(second, { kind: 'signed', sentence: sentence(0, '新的。') });
  await tick();
  assert.deepEqual(fetcher.calls.map(c => c.body.text), ['旧的。', '新的。']);
});

test('引擎：一段都没有的回复（没开签名）直接结束，不会一直挂着「准备中」', async () => {
  const { engine, states } = setup();
  const id = engine.start('female');
  engine.end(id);
  await tick();
  assert.equal(engine.active, false);
  assert.ok(states.every(s => !s.loading));
});

test('引擎：预取按「正在出声」的那段算——合成比实时快、段一收齐就交给播放端，也不会一口气把整条回复都要过来', async () => {
  const fetched: string[] = [];
  const fetchImpl = async (_url: string, init: RequestInit) => {
    fetched.push(String(JSON.parse(String(init.body)).text));
    // 立刻给一整段（1 秒 PCM）：模拟百炼比实时快好几倍
    return new Response(new Uint8Array(48_000), {
      headers: { 'X-Audio-Format': 'pcm_s16le;rate=24000', 'X-Voice-Provider': 'bailian' },
    });
  };
  const out = fakeSink();
  const engine = createSpeechEngine({
    fetchImpl,
    pickSink: async () => out.sink,
    onChange: () => {},
    onError: () => {},
  });
  const id = engine.start('female');
  for (let i = 0; i < 6; i += 1) engine.add(id, { kind: 'signed', sentence: sentence(i, `s${i}`) });
  engine.end(id);
  await tick(20);
  // 第 0 段还在念：最多往后看两段
  assert.deepEqual(fetched, ['s0', 's1', 's2']);
  assert.equal(out.sink.pendingSegments(), 3);

  // 第 0 段念完了，播放端回报一声：往后再要一段
  out.finishSegment();
  engine.events.advanced();
  await tick(20);
  assert.deepEqual(fetched, ['s0', 's1', 's2', 's3']);

  out.finishSegment();
  out.finishSegment();
  engine.events.advanced();
  await tick(20);
  assert.deepEqual(fetched, ['s0', 's1', 's2', 's3', 's4', 's5']);

  // 被打断：还没要的段一个都不会再发
  engine.stop();
  await tick();
  assert.equal(fetched.length, 6);
});

test('引擎：预取窗口在被打断时省下的钱——念第一段时打断，后面的段没被合成', async () => {
  const fetched: string[] = [];
  const fetchImpl = async (_url: string, init: RequestInit) => {
    fetched.push(String(JSON.parse(String(init.body)).text));
    return new Response(new Uint8Array(4_800), {
      headers: { 'X-Audio-Format': 'pcm_s16le;rate=24000', 'X-Voice-Provider': 'bailian' },
    });
  };
  const out = fakeSink();
  const engine = createSpeechEngine({ fetchImpl, pickSink: async () => out.sink, onChange: () => {}, onError: () => {} });
  const id = engine.start('female');
  for (let i = 0; i < 8; i += 1) engine.add(id, { kind: 'signed', sentence: sentence(i, `s${i}`) });
  await tick(20);
  engine.stop();
  engine.end(id);
  await tick(20);
  assert.deepEqual(fetched, ['s0', 's1', 's2']);
});

// —— <audio> 播放端（老 iOS 走的那条） ——

class FakeAudio implements AudioElementLike {
  src = '';
  played: string[] = [];
  onended: ((event: Event) => void) | null = null;
  onerror: ((event: Event | string) => void) | null = null;
  rejectNext: Error | null = null;
  play() {
    this.played.push(this.src);
    const err = this.rejectNext;
    this.rejectNext = null;
    return err ? Promise.reject(err) : Promise.resolve();
  }
  pause() {}
  removeAttribute() {
    this.src = '';
  }
  end() {
    this.onended?.(new Event('ended'));
  }
  error() {
    this.onerror?.(new Event('error'));
  }
}

function elementSetup() {
  const el = new FakeAudio();
  const log: string[] = [];
  const events: SinkEvents = {
    sound: () => log.push('sound'),
    advanced: () => log.push('advanced'),
    drained: () => log.push('drained'),
    blocked: value => log.push(`blocked:${value}`),
    playError: () => log.push('playError'),
  };
  const sink = createElementSink(el, events);
  const addSegment = (byte: number) => {
    sink.pushEncoded(new Uint8Array([byte, byte, byte]));
    sink.endSegment();
  };
  return { el, log, sink, addSegment };
}

test('<audio>：一段放不出来（onerror）就跳过它接着放下一段，不会一直挂着', async () => {
  const { el, log, sink, addSegment } = elementSetup();
  addSegment(1);
  addSegment(2);
  addSegment(3);
  await tick();
  assert.equal(el.played.length, 1);
  assert.equal(sink.pendingSegments(), 3);
  el.error();
  await tick();
  assert.equal(el.played.length, 2, '第二段接着放');
  assert.equal(sink.pendingSegments(), 2);
  assert.equal(log.filter(e => e === 'playError').length, 1);
  el.end();
  await tick();
  assert.equal(el.played.length, 3);
  assert.ok(log.includes('advanced'));
  el.end();
  await tick();
  assert.equal(sink.idle(), true);
  assert.equal(log.at(-1), 'drained');
});

test('<audio>：play() 被拒（不是自动播放被拦）也跳过这段；自动播放被拦则留着等用户点', async () => {
  const { el, log, sink, addSegment } = elementSetup();
  el.rejectNext = Object.assign(new Error('decode'), { name: 'NotSupportedError' });
  addSegment(1);
  addSegment(2);
  await tick();
  assert.equal(el.played.length, 2, '第一段被拒，直接放第二段');
  assert.deepEqual(log.filter(e => e === 'playError'), ['playError']);

  const blocked = elementSetup();
  blocked.el.rejectNext = Object.assign(new Error('blocked'), { name: 'NotAllowedError' });
  blocked.addSegment(1);
  blocked.addSegment(2);
  await tick();
  assert.equal(blocked.el.played.length, 1);
  assert.ok(blocked.log.includes('blocked:true'));
  assert.equal(blocked.sink.idle(), false);
  void sink;
});

test('引擎 + <audio>：第一段放不出来，后面的照放，放完这条回复就结束（不会一直「准备中」），错误只报一次', async () => {
  const el = new FakeAudio();
  const states: SpeechEngineState[] = [];
  const errors: string[] = [];
  let engine: ReturnType<typeof createSpeechEngine> | null = null;
  const events: SinkEvents = {
    sound: () => engine?.events.sound(),
    advanced: () => engine?.events.advanced(),
    drained: () => engine?.events.drained(),
    blocked: () => {},
    playError: () => engine?.events.playError(),
  };
  const sink = createElementSink(el, events);
  engine = createSpeechEngine({
    fetchImpl: async () => mp3Response([1, 2, 3]),
    pickSink: async () => sink,
    onChange: state => states.push(state),
    onError: kind => errors.push(kind),
  });
  const id = engine.start('female');
  for (let i = 0; i < 3; i += 1) engine.add(id, { kind: 'signed', sentence: sentence(i, `s${i}`) });
  engine.end(id);
  await tick(20);
  el.error();
  await tick(20);
  el.error();   // 第二段也放不出来
  await tick(20);
  el.end();
  await tick(20);
  assert.equal(engine.active, false);
  assert.deepEqual(states.at(-1), { loading: false, speaking: false });
  assert.deepEqual(errors, ['playback']);
});
