import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bytesToBase64,
  createDownsampler,
  createPacketizer,
  createRealtimeAsrSession,
  realtimeVoiceResult,
  type RealtimeFailReason,
  type RealtimeSocketLike,
} from '../src/lib/voiceRealtime.ts';
import { normalizeVoiceAnalysis } from '../src/lib/philCoachVoice.ts';

// —— 重采样、分包、base64 ——

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function signal(length: number, rate: number): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) out[i] = 0.6 * Math.sin((2 * Math.PI * 220 * i) / rate);
  return out;
}

test('下采样 48k → 16k：恒定信号保持幅度，长度是三分之一', () => {
  const ds = createDownsampler(48_000);
  const input = new Float32Array(4_800).fill(0.5);
  const bytes = concat([ds.push(input), ds.flush()]);
  assert.equal(bytes.length, 1_600 * 2);
  const view = new DataView(bytes.buffer);
  assert.equal(view.getInt16(0, true), Math.trunc(0.5 * 0x7fff));
  assert.equal(view.getInt16(bytes.length - 2, true), Math.trunc(0.5 * 0x7fff));
});

test('下采样：44.1k 这种非整数倍，怎么切块输出都和一次性处理完全一样', () => {
  const input = signal(44_100, 44_100);
  const whole = createDownsampler(44_100);
  const expected = concat([whole.push(input), whole.flush()]);
  assert.equal(expected.length / 2, 16_000);

  const chunked = createDownsampler(44_100);
  const parts: Uint8Array[] = [];
  let offset = 0;
  const sizes = [1, 4096, 3, 777, 4096, 2, 10_000];
  for (let i = 0; offset < input.length; i += 1) {
    const size = sizes[i % sizes.length];
    parts.push(chunked.push(input.subarray(offset, offset + size)));
    offset += size;
  }
  parts.push(chunked.flush());
  assert.deepEqual([...concat(parts)], [...expected]);
});

test('下采样：16k 原样通过；收尾时不够一个区间的尾巴也交出来', () => {
  const same = createDownsampler(16_000);
  assert.equal(same.push(new Float32Array(10).fill(-1)).length, 20);
  const ds = createDownsampler(48_000);
  assert.equal(ds.push(new Float32Array(4)).length, 2);   // 4 个输入只够一个完整区间（3 个）
  assert.equal(ds.flush().length, 2);                       // 剩下 1 个也算一个样本
  assert.equal(ds.flush().length, 0);
});

test('分包：凑满 3200 字节一包，零头留到下一次，flush 交出最后不满的一包', () => {
  const p = createPacketizer(3_200);
  assert.deepEqual(p.push(new Uint8Array(1_000)).map(x => x.length), []);
  assert.deepEqual(p.push(new Uint8Array(6_000)).map(x => x.length), [3_200, 3_200]);
  assert.equal(p.flush()?.length, 600);
  assert.equal(p.flush(), null);
});

test('base64：和 Node 的实现一致（含超过一次 fromCharCode 上限的长度）', () => {
  const bytes = new Uint8Array(70_001);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 31 + 7) & 0xff;
  assert.equal(bytesToBase64(bytes), Buffer.from(bytes).toString('base64'));
  assert.equal(bytesToBase64(new Uint8Array(0)), '');
});

test('定稿 → voiceContext：直接发模式按情绪生成（neutral 不生成），听写不生成，空结果交给整段上传', () => {
  const direct = realtimeVoiceResult({ transcript: ' 我最近有点累 ', emotion: 'sad', language: 'zh' }, true);
  assert.equal(direct?.text, '我最近有点累');
  assert.equal(direct?.voiceContext?.emotion, '低落');
  assert.equal(direct?.voiceContext?.emotionConfidence, 0.5);
  assert.deepEqual(normalizeVoiceAnalysis(direct?.voiceContext), direct?.voiceContext);
  assert.equal(realtimeVoiceResult({ transcript: '还好', emotion: 'neutral', language: 'zh' }, true)?.voiceContext, null);
  assert.equal(realtimeVoiceResult({ transcript: '还好', emotion: 'sad', language: 'zh' }, false)?.voiceContext, null);
  assert.equal(realtimeVoiceResult({ transcript: '  ', emotion: 'sad', language: 'zh' }, true), null);
  assert.equal(realtimeVoiceResult(null, true), null);
});

// —— 会话：假的令牌接口和假的 WebSocket ——

class FakeSocket implements RealtimeSocketLike {
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  closed = false;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.closed = true;
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  emit(event: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
  types() {
    return this.sent.map(m => m.type);
  }
  audioBytes() {
    return this.sent
      .filter(m => m.type === 'input_audio_buffer.append')
      .reduce((n, m) => n + Buffer.from(String(m.audio), 'base64').length, 0);
  }
}

const tick = async (n = 4) => {
  for (let i = 0; i < n; i += 1) await new Promise(resolve => setImmediate(resolve));
};

function setup(options: {
  url?: string | null;
  getUrl?: (signal: AbortSignal) => Promise<string | null>;
  connectTimeoutMs?: number;
  finishTimeoutMs?: number;
  language?: string | null;
} = {}) {
  const socket = new FakeSocket();
  const captions: string[] = [];
  const fails: RealtimeFailReason[] = [];
  const opened: string[] = [];
  const session = createRealtimeAsrSession({
    getUrl: options.getUrl ?? (async () => ('url' in options ? options.url ?? null : 'wss://ws-test.example/realtime?api_key=st-x')),
    openSocket: url => {
      opened.push(url);
      return socket;
    },
    onCaption: text => captions.push(text),
    onFail: reason => fails.push(reason),
    ...('language' in options ? { language: options.language } : {}),
    connectTimeoutMs: options.connectTimeoutMs ?? 2_000,
    finishTimeoutMs: options.finishTimeoutMs ?? 2_000,
  });
  return { session, socket, captions, fails, opened };
}

test('直连：连上之前采到的音频先攒着，session.updated 后按顺序补推；字幕 = text + stash；停止后 commit + finish 拿到定稿', async () => {
  const { session, socket, captions, fails, opened } = setup();
  // 开录就有声音，这时令牌还没回来
  session.push(new Float32Array(12_000).fill(0.1), 48_000);   // 0.25 秒
  await tick();
  assert.equal(opened.length, 1);
  socket.open();
  assert.deepEqual(socket.sent[0], {
    type: 'session.update',
    session: {
      input_audio_format: 'pcm',
      sample_rate: 16_000,
      input_audio_transcription: { language: 'zh' },
      turn_detection: null,
    },
  });
  assert.equal(socket.sent.length, 1, 'ready 之前不推音频');
  socket.emit({ type: 'session.updated', session: {} });
  // 0.25 秒 = 8000 字节：满两包补推出去，1600 字节的零头留到下一次
  assert.deepEqual(socket.types().slice(1), ['input_audio_buffer.append', 'input_audio_buffer.append']);
  assert.equal(socket.audioBytes(), 6_400);

  socket.emit({ type: 'conversation.item.input_audio_transcription.text', text: '今天', stash: '想' });
  socket.emit({ type: 'conversation.item.input_audio_transcription.text', text: '今天想聊', stash: '聊' });
  assert.deepEqual(captions, ['今天想', '今天想聊聊']);

  const result = session.finish();
  // 尾巴推完才 commit，然后 finish
  const types = socket.types();
  assert.deepEqual(types.slice(-2), ['input_audio_buffer.commit', 'session.finish']);
  assert.equal(socket.audioBytes(), 8_000);

  socket.emit({
    type: 'conversation.item.input_audio_transcription.completed',
    transcript: '今天想聊聊。',
    emotion: 'sad',
    language: 'zh',
  });
  socket.emit({ type: 'session.finished' });
  assert.deepEqual(await result, { transcript: '今天想聊聊。', emotion: 'sad', language: 'zh' });
  // 百炼不会自己断，也不回关闭帧：拿到结果就自己关
  assert.equal(socket.closed, true);
  assert.deepEqual(fails, []);
  assert.equal(session.failed, false);
});

test('直连：停止时还没 ready，等 ready 了再一口气补推、commit', async () => {
  const { session, socket } = setup();
  await tick();
  session.push(new Float32Array(9_600).fill(0.2), 48_000);   // 3200 个 16k 样本 = 6400 字节
  const result = session.finish();
  assert.equal(socket.sent.length, 0);
  socket.open();
  socket.emit({ type: 'session.updated' });
  assert.deepEqual(socket.types(), [
    'session.update',
    'input_audio_buffer.append',
    'input_audio_buffer.append',
    'input_audio_buffer.commit',
    'session.finish',
  ]);
  assert.equal(socket.audioBytes(), 6_400);
  socket.emit({ type: 'conversation.item.input_audio_transcription.completed', transcript: '好', emotion: 'neutral' });
  // session.finished 没来也只多等一小会儿
  assert.equal((await result)?.transcript, '好');
});

test('直连：拿不到令牌 → 立刻报失败（组件接回原来的字幕），定稿返回 null 走整段上传', async () => {
  const { session, fails, opened } = setup({ url: null });
  await tick();
  assert.deepEqual(fails, ['token']);
  assert.equal(opened.length, 0);
  assert.equal(session.failed, true);
  assert.equal(await session.finish(), null);
});

test('直连：录音中服务端报错 → 报失败、断开，之后的音频不再推', async () => {
  const { session, socket, fails } = setup();
  await tick();
  socket.open();
  socket.emit({ type: 'session.updated' });
  socket.emit({ type: 'error', error: { code: 'InvalidParameter', message: 'x' } });
  assert.deepEqual(fails, ['server-error']);
  assert.equal(socket.closed, true);
  const before = socket.sent.length;
  session.push(new Float32Array(48_000), 48_000);
  assert.equal(socket.sent.length, before);
  assert.equal(await session.finish(), null);
});

test('直连：连上之后意外断开（录音中）→ 报失败', async () => {
  const { socket, fails } = setup();
  await tick();
  socket.open();
  socket.onclose?.({});
  assert.deepEqual(fails, ['closed']);
});

test('直连：迟迟不 ready → 到点认输，令牌请求也一并中止', async () => {
  let tokenSignal: AbortSignal | null = null;
  const { fails } = setup({
    connectTimeoutMs: 30,
    getUrl: signal => {
      tokenSignal = signal;
      return new Promise(() => {});
    },
  });
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.deepEqual(fails, ['connect-timeout']);
  assert.equal((tokenSignal as AbortSignal | null)?.aborted, true);
});

test('直连：停止后等不到 completed → 3 秒（这里缩短）后返回 null，不再报录音中失败', async () => {
  const { session, socket, fails } = setup({ finishTimeoutMs: 40 });
  await tick();
  socket.open();
  socket.emit({ type: 'session.updated' });
  session.push(new Float32Array(4_800), 48_000);
  const startedAt = Date.now();
  assert.equal(await session.finish(), null);
  assert.ok(Date.now() - startedAt >= 30);
  assert.equal(socket.closed, true);
  assert.deepEqual(fails, []);
});

test('直连：收尾时 completed 到了、连接随即断开，也算成功', async () => {
  const { session, socket } = setup();
  await tick();
  socket.open();
  socket.emit({ type: 'session.updated' });
  const result = session.finish();
  socket.emit({ type: 'conversation.item.input_audio_transcription.completed', transcript: '嗯', emotion: 'happy' });
  socket.onclose?.({});
  assert.deepEqual(await result, { transcript: '嗯', emotion: 'happy', language: null });
});

test('直连：取消不触发失败回调，定稿返回 null', async () => {
  const { session, socket, fails } = setup();
  await tick();
  socket.open();
  session.cancel();
  assert.equal(socket.closed, true);
  assert.deepEqual(fails, []);
  assert.equal(await session.finish(), null);
});

test('直连：英文界面不传语种（模型自己判断，说中文不会被翻成英文）', async () => {
  const { socket } = setup({ language: null });
  await tick();
  socket.open();
  assert.deepEqual(socket.sent[0], {
    type: 'session.update',
    session: { input_audio_format: 'pcm', sample_rate: 16_000, turn_detection: null },
  });
});

test('直连：会话记着最后一版字幕，坏了也留着（录满自动停、整段上传又失败时拿它兜底）', async () => {
  const { session, socket } = setup();
  await tick();
  socket.open();
  socket.emit({ type: 'session.updated', session: {} });
  assert.equal(session.caption, '');
  socket.emit({ type: 'conversation.item.input_audio_transcription.text', text: '我想说', stash: '的是' });
  assert.equal(session.caption, '我想说的是');
  socket.onclose?.({});
  assert.equal(session.failed, true);
  assert.equal(session.caption, '我想说的是');
});
