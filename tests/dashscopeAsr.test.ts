import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAsrRealtimeUrl,
  classifyDashscopeError,
  createCircuitBreaker,
  DashscopeError,
  getDashscopeConfig,
} from '../src/lib/dashscope.ts';
import {
  asrCaption,
  asrLanguageForLocale,
  buildAsrSessionUpdate,
  initialAsrState,
  reduceAsrEvent,
  transcribePcmRealtime,
} from '../src/lib/dashscopeAsr.ts';
import { asrEmotionToVoiceAnalysis, normalizeVoiceAnalysis } from '../src/lib/philCoachVoice.ts';
import { pcm16ToWav, wavToPcm16kMono } from '../src/lib/wavPcm.ts';

const CONFIG = getDashscopeConfig({ DASHSCOPE_API_KEY: 'sk-test', DASHSCOPE_WORKSPACE_ID: 'ws-test' })!;

// —— 事件归约 ——

test('中间结果：字幕 = text（已确定）+ stash（未确定）', () => {
  let state = initialAsrState();
  state = reduceAsrEvent(state, { type: 'session.updated', session: {} });
  assert.equal(state.phase, 'ready');
  state = reduceAsrEvent(state, {
    type: 'conversation.item.input_audio_transcription.text',
    text: '今天',
    stash: '想聊',
  });
  assert.equal(asrCaption(state), '今天想聊');
  state = reduceAsrEvent(state, {
    type: 'conversation.item.input_audio_transcription.text',
    text: '今天想聊聊',
    stash: '工作',
    emotion: 'neutral',
  });
  assert.equal(asrCaption(state), '今天想聊聊工作');
  assert.equal(state.completed, false);
});

test('completed：定稿接到 committed，清掉中间结果，带上语种和情绪', () => {
  let state = initialAsrState();
  state = reduceAsrEvent(state, { type: 'conversation.item.input_audio_transcription.text', text: '今天', stash: '想' });
  state = reduceAsrEvent(state, {
    type: 'conversation.item.input_audio_transcription.completed',
    transcript: '今天想聊聊工作。',
    language: 'zh',
    emotion: 'Sad',
  });
  assert.equal(state.committed, '今天想聊聊工作。');
  assert.equal(state.text, '');
  assert.equal(state.stash, '');
  assert.equal(state.completed, true);
  assert.equal(state.language, 'zh');
  assert.equal(state.emotion, 'sad');
  assert.equal(asrCaption(state), '今天想聊聊工作。');

  // server_vad 下会有多条 completed，依次接上
  state = reduceAsrEvent(state, { type: 'conversation.item.input_audio_transcription.completed', transcript: '还有家里的事。' });
  assert.equal(state.committed, '今天想聊聊工作。还有家里的事。');
  assert.equal(state.emotion, 'sad');

  state = reduceAsrEvent(state, { type: 'session.finished' });
  assert.equal(state.finished, true);
  assert.equal(state.phase, 'done');
});

test('failed 和 error 事件：标记失败，错误码保留', () => {
  const failed = reduceAsrEvent(initialAsrState(), {
    type: 'conversation.item.input_audio_transcription.failed',
    error: { code: 'InternalError', message: 'x' },
  });
  assert.equal(failed.phase, 'failed');
  assert.equal(failed.error?.code, 'InternalError');

  const error = reduceAsrEvent(initialAsrState(), {
    type: 'error',
    error: { type: 'invalid_request_error', code: 'AllocationQuota.FreeTierOnly', message: 'free tier' },
  });
  assert.equal(error.phase, 'failed');
  assert.equal(error.error?.code, 'AllocationQuota.FreeTierOnly');
  // 失败之后的 session.finished 不能把状态改回 done
  assert.equal(reduceAsrEvent(error, { type: 'session.finished' }).phase, 'failed');
});

test('认不出的事件原样返回同一个对象', () => {
  const state = initialAsrState();
  assert.equal(reduceAsrEvent(state, { type: 'input_audio_buffer.committed' }), state);
  assert.equal(reduceAsrEvent(state, null), state);
  assert.equal(reduceAsrEvent(state, 'garbage'), state);
});

test('session.update：Manual 模式（turn_detection: null），16k PCM', () => {
  assert.deepEqual(buildAsrSessionUpdate('zh'), {
    type: 'session.update',
    session: {
      input_audio_format: 'pcm',
      sample_rate: 16000,
      input_audio_transcription: { language: 'zh' },
      turn_detection: null,
    },
  });
});

test('识别语种跟着界面：中文界面 zh；英文界面不传（传 en 会把说的中文翻成英文）', () => {
  assert.equal(asrLanguageForLocale('zh'), 'zh');
  assert.equal(asrLanguageForLocale(undefined), 'zh');
  assert.equal(asrLanguageForLocale('en'), null);
  assert.deepEqual(buildAsrSessionUpdate(null), {
    type: 'session.update',
    session: { input_audio_format: 'pcm', sample_rate: 16000, turn_detection: null },
  });
  assert.equal(JSON.stringify(buildAsrSessionUpdate(asrLanguageForLocale('en'))).includes('language'), false);
});

// —— 情绪映射 ——

test('情绪映射：neutral 和认不出的不生成观察', () => {
  assert.equal(asrEmotionToVoiceAnalysis('今天还好。', 'neutral'), null);
  assert.equal(asrEmotionToVoiceAnalysis('今天还好。', null), null);
  assert.equal(asrEmotionToVoiceAnalysis('今天还好。', 'bored'), null);
  // 没有转写也不生成（normalizeVoiceAnalysis 会丢）
  assert.equal(asrEmotionToVoiceAnalysis('', 'sad'), null);
});

test('情绪映射：结果能原样通过 normalizeVoiceAnalysis，置信度固定 0.5、不猜需要', () => {
  const analysis = asrEmotionToVoiceAnalysis('这几天一直睡不好。', 'SAD');
  assert.deepEqual(analysis, {
    transcript: '这几天一直睡不好。',
    emotion: '低落',
    emotionConfidence: 0.5,
    speechSignals: [],
    implicitNeed: '',
    implicitNeedConfidence: 0,
  });
  assert.deepEqual(normalizeVoiceAnalysis(analysis), analysis);
  for (const [raw, label] of [
    ['surprised', '惊讶'],
    ['happy', '轻快'],
    ['angry', '恼火'],
    ['fearful', '不安'],
    ['disgusted', '反感'],
  ]) {
    assert.equal(asrEmotionToVoiceAnalysis('嗯。', raw)?.emotion, label);
  }
});

// —— 配置与错误分类 ——

test('配置：业务空间域名和 wss 地址；临时令牌放在 api_key 参数', () => {
  assert.equal(CONFIG.host, 'ws-test.cn-beijing.maas.aliyuncs.com');
  assert.equal(buildAsrRealtimeUrl(CONFIG), 'wss://ws-test.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime?model=qwen3-asr-flash-realtime');
  assert.equal(
    buildAsrRealtimeUrl(CONFIG, 'st-abc'),
    'wss://ws-test.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime?model=qwen3-asr-flash-realtime&api_key=st-abc',
  );
  assert.equal(getDashscopeConfig({ DASHSCOPE_API_KEY: 'sk' }), null);
  assert.equal(getDashscopeConfig({ DASHSCOPE_API_KEY: 'sk', DASHSCOPE_WORKSPACE_ID: 'a.b' }), null);
});

test('错误分类：额度先于鉴权判（FreeTierOnly 是 403）', () => {
  assert.equal(classifyDashscopeError({ status: 403, code: 'AllocationQuota.FreeTierOnly' }), 'quota');
  assert.equal(classifyDashscopeError({ status: 400, code: 'Arrearage' }), 'quota');
  assert.equal(classifyDashscopeError({ status: 429 }), 'rate');
  assert.equal(classifyDashscopeError({ code: 'Throttling.RateQuota' }), 'rate');
  assert.equal(classifyDashscopeError({ status: 401, code: 'InvalidApiKey' }), 'auth');
  assert.equal(classifyDashscopeError({ status: 403 }), 'auth');
  assert.equal(classifyDashscopeError({ status: 500, code: 'InternalError' }), 'upstream');
});

test('熔断：连续失败到阈值才打开，冷却后放行，成功清零', () => {
  const breaker = createCircuitBreaker({ threshold: 3, coolDownMs: 1000 });
  breaker.failure(0);
  breaker.failure(0);
  assert.equal(breaker.isOpen(0), false);
  breaker.failure(0);
  assert.equal(breaker.isOpen(500), true);
  assert.equal(breaker.isOpen(1000), false);
  breaker.failure(2000);
  breaker.success();
  breaker.failure(2000);
  breaker.failure(2000);
  assert.equal(breaker.isOpen(2000), false);
});

test('WAV → 裸 PCM：按块表找 data，夹着 LIST 块也行', () => {
  const pcm = new Uint8Array([1, 2, 3, 4, 5, 6]);
  assert.deepEqual(wavToPcm16kMono(pcm16ToWav(pcm, 16000)), pcm);
  // fmt 和 data 之间插一个 LIST 块
  const plain = pcm16ToWav(pcm, 16000);
  const list = new Uint8Array([...'LIST'].map(c => c.charCodeAt(0)).concat([4, 0, 0, 0, 9, 9, 9, 9]));
  const withList = new Uint8Array(plain.length + list.length);
  withList.set(plain.subarray(0, 36));
  withList.set(list, 36);
  withList.set(plain.subarray(36), 36 + list.length);
  assert.deepEqual(wavToPcm16kMono(withList), pcm);
  // 24k 的不收
  assert.equal(wavToPcm16kMono(pcm16ToWav(pcm, 24000)), null);
});

// —— 出站转写（假 WebSocket） ——

type Sent = { type: string; audio?: string };

class FakeSocket extends EventTarget {
  static last: FakeSocket | null = null;
  static script: (socket: FakeSocket, message: Sent) => void = () => {};
  binaryType = 'blob';
  readonly sent: Sent[] = [];
  closed = false;
  readonly url: string;
  readonly init?: { headers?: Record<string, string> };
  constructor(url: string, init?: { headers?: Record<string, string> }) {
    super();
    this.url = url;
    this.init = init;
    FakeSocket.last = this;
    setTimeout(() => this.dispatchEvent(new Event('open')), 0);
  }
  send(data: string) {
    const message = JSON.parse(data) as Sent;
    this.sent.push(message);
    FakeSocket.script(this, message);
  }
  emit(event: unknown) {
    setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(event) })), 0);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    setTimeout(() => this.dispatchEvent(new Event('close')), 0);
  }
}

/** 用假 socket 跑一次转写：script 扮演百炼，按收到的客户端事件回事件 */
function transcribeWithFake(
  script: typeof FakeSocket.script,
  pcm: Uint8Array,
  timeoutMs: number,
) {
  FakeSocket.script = script;
  return transcribePcmRealtime(pcm, {
    config: CONFIG,
    timeoutMs,
    socketFactory: (url, headers) => new FakeSocket(url, { headers }),
  });
}

test('出站转写：带 Authorization 头握手，等 session.updated 再推，100ms 一包，commit + finish 后取 completed', async () => {
  const pcm = new Uint8Array(3200 * 2 + 100); // 0.2 秒多一点
  const result = await transcribeWithFake(
    (socket, message) => {
      if (message.type === 'session.update') socket.emit({ type: 'session.updated', session: {} });
      if (message.type === 'session.finish') {
        socket.emit({ type: 'conversation.item.input_audio_transcription.text', text: '你好', stash: '' });
        socket.emit({
          type: 'conversation.item.input_audio_transcription.completed',
          transcript: '你好。',
          language: 'zh',
          emotion: 'happy',
        });
        // 真实的百炼发完 session.finished 不会自己断开：要我们主动关
        socket.emit({ type: 'session.finished' });
      }
    },
    pcm,
    2000,
  );
  assert.deepEqual(result, { transcript: '你好。', language: 'zh', emotion: 'happy' });

  const socket = FakeSocket.last!;
  assert.equal(socket.url, 'wss://ws-test.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime?model=qwen3-asr-flash-realtime');
  assert.equal(socket.init?.headers?.Authorization, 'Bearer sk-test');
  const types = socket.sent.map(m => m.type);
  assert.deepEqual(types, [
    'session.update',
    'input_audio_buffer.append',
    'input_audio_buffer.append',
    'input_audio_buffer.append',
    'input_audio_buffer.commit',
    'session.finish',
  ]);
  const sizes = socket.sent
    .filter(m => m.type === 'input_audio_buffer.append')
    .map(m => Buffer.from(m.audio!, 'base64').length);
  assert.deepEqual(sizes, [3200, 3200, 100]);
  assert.equal(socket.closed, true);
});

test('出站转写：上游报额度用完 → DashscopeError(quota)，调用方据此落回 SiliconFlow', async () => {
  await assert.rejects(
    transcribeWithFake(
      (socket, message) => {
        if (message.type === 'session.update') {
          socket.emit({ type: 'error', error: { code: 'AllocationQuota.FreeTierOnly', message: 'free tier exhausted' } });
        }
      },
      new Uint8Array(3200),
      2000,
    ),
    (err: unknown) => err instanceof DashscopeError && err.kind === 'quota',
  );
});

test('出站转写：一直不出结果就超时', async () => {
  await assert.rejects(
    transcribeWithFake(() => {}, new Uint8Array(3200), 150),
    (err: unknown) => err instanceof DashscopeError && err.kind === 'timeout',
  );
});

test('出站转写：completed 之后连接断了也算成功（session.finished 没等到）', async () => {
  const result = await transcribeWithFake(
    (socket, message) => {
      if (message.type === 'session.update') socket.emit({ type: 'session.updated' });
      if (message.type === 'session.finish') {
        socket.emit({ type: 'conversation.item.input_audio_transcription.completed', transcript: '嗯。', emotion: 'neutral' });
        setTimeout(() => socket.close(), 5);
      }
    },
    new Uint8Array(3200),
    2000,
  );
  assert.equal(result.transcript, '嗯。');
});
