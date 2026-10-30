import assert from 'node:assert/strict';
import test from 'node:test';
import { LEGACY_VOICE_STACK, resolveVoiceStack } from '../src/lib/voiceStack.ts';
import { wantsReplyStream } from '../src/lib/philCoachStream.ts';
import { getDashscopeDirectAsrConfig } from '../src/lib/dashscope.ts';

const BAILIAN = { DASHSCOPE_API_KEY: 'sk-test', DASHSCOPE_WORKSPACE_ID: 'ws-test123' };
/** 浏览器直连识别专用的那把：另一个业务空间、只开通识别 */
const DIRECT = { DASHSCOPE_ASR_DIRECT_API_KEY: 'sk-asr-only', DASHSCOPE_ASR_DIRECT_WORKSPACE_ID: 'ws-asronly9' };
const VOICES = { DASHSCOPE_TTS_VOICE_FEMALE: 'qwen-audio-3.1-tts-flash-philf-x', DASHSCOPE_TTS_VOICE_MALE: 'qwen-audio-3.1-tts-flash-philm-x' };
const NDJSON = 'application/x-ndjson';

test('没配百炼：全部是今天的旧行为（硬要求）', () => {
  const legacy = { asr: 'siliconflow', asrDirect: false, tts: 'siliconflow', streamReply: false };
  assert.deepEqual(resolveVoiceStack({}), legacy);
  assert.deepEqual(LEGACY_VOICE_STACK, legacy);
  // 只有 SiliconFlow（今天线上的样子）
  assert.deepEqual(
    resolveVoiceStack({ SILICONFLOW_API_KEY: 'sf', PHIL_COACH_TTS_VOICE_FEMALE: 'speech:a', PHIL_COACH_TTS_VOICE_MALE: 'speech:b' }),
    legacy,
  );
  // 只配了一半、或者音色配了 Key 没配
  assert.deepEqual(resolveVoiceStack({ DASHSCOPE_API_KEY: 'sk-test' }), legacy);
  assert.deepEqual(resolveVoiceStack({ DASHSCOPE_WORKSPACE_ID: 'ws-test' }), legacy);
  assert.deepEqual(resolveVoiceStack({ ...VOICES }), legacy);
  // 开关写成 bailian 也没用：没有 Key 就只能是旧行为
  assert.deepEqual(
    resolveVoiceStack({ PHIL_COACH_ASR_PROVIDER: 'bailian', PHIL_COACH_TTS_PROVIDER: 'bailian', PHIL_COACH_ASR_DIRECT: 'auto' }),
    legacy,
  );
});

test('没配百炼时，就算前端要 ndjson 也不流式', () => {
  assert.equal(wantsReplyStream(NDJSON, resolveVoiceStack({})), false);
  assert.equal(wantsReplyStream(NDJSON, resolveVoiceStack({ SILICONFLOW_API_KEY: 'sf' })), false);
});

test('业务空间 ID 写错（带斜杠、整段网址）按没配处理，不拼出指向别处的地址', () => {
  assert.equal(resolveVoiceStack({ DASHSCOPE_API_KEY: 'sk', DASHSCOPE_WORKSPACE_ID: 'evil.com/x' }).asr, 'siliconflow');
  assert.equal(resolveVoiceStack({ DASHSCOPE_API_KEY: 'sk', DASHSCOPE_WORKSPACE_ID: 'https://ws-1' }).asr, 'siliconflow');
});

test('配了百炼 Key 但音色没配齐：听和想换百炼，说还是 SiliconFlow', () => {
  assert.deepEqual(resolveVoiceStack(BAILIAN), {
    asr: 'bailian',
    asrDirect: false,
    tts: 'siliconflow',
    streamReply: true,
  });
  assert.equal(resolveVoiceStack({ ...BAILIAN, DASHSCOPE_TTS_VOICE_FEMALE: 'x' }).tts, 'siliconflow');
});

test('全配齐：全部百炼', () => {
  assert.deepEqual(resolveVoiceStack({ ...BAILIAN, ...VOICES, ...DIRECT }), {
    asr: 'bailian',
    asrDirect: true,
    tts: 'bailian',
    streamReply: true,
  });
});

test('浏览器直连识别只用专用 Key：没配、只配一半、和主 Key / 主空间相同，都不开直连', () => {
  // 令牌要交到浏览器手里，主 Key 签的令牌能调 TTS、能动复刻音色——绝不拿主 Key 顶上
  assert.equal(resolveVoiceStack({ ...BAILIAN, ...VOICES }).asrDirect, false);
  assert.equal(resolveVoiceStack({ ...BAILIAN, DASHSCOPE_ASR_DIRECT_API_KEY: 'sk-asr-only' }).asrDirect, false);
  assert.equal(resolveVoiceStack({ ...BAILIAN, DASHSCOPE_ASR_DIRECT_WORKSPACE_ID: 'ws-asronly9' }).asrDirect, false);
  assert.equal(
    resolveVoiceStack({ ...BAILIAN, DASHSCOPE_ASR_DIRECT_API_KEY: 'sk-test', DASHSCOPE_ASR_DIRECT_WORKSPACE_ID: 'ws-asronly9' }).asrDirect,
    false,
    '和主 Key 相同',
  );
  assert.equal(
    resolveVoiceStack({ ...BAILIAN, DASHSCOPE_ASR_DIRECT_API_KEY: 'sk-asr-only', DASHSCOPE_ASR_DIRECT_WORKSPACE_ID: 'ws-test123' }).asrDirect,
    false,
    '和主业务空间相同（同一个空间里的 Key 权限一样）',
  );
  assert.equal(
    resolveVoiceStack({ ...BAILIAN, DASHSCOPE_ASR_DIRECT_API_KEY: 'sk-asr-only', DASHSCOPE_ASR_DIRECT_WORKSPACE_ID: 'evil.com/x' }).asrDirect,
    false,
  );
  // 只有专用 Key、没有主配置：什么都不换（直连是百炼识别的一部分）
  assert.deepEqual(resolveVoiceStack({ ...DIRECT }), LEGACY_VOICE_STACK);
  assert.equal(resolveVoiceStack({ ...BAILIAN, ...DIRECT }).asrDirect, true);
});

test('专用 Key 的配置：签令牌、拼地址都用专用空间，地域和模型跟主配置走', () => {
  const direct = getDashscopeDirectAsrConfig({ ...BAILIAN, ...DIRECT, DASHSCOPE_ASR_MODEL: 'qwen3-asr-flash-realtime-x' });
  assert.ok(direct);
  assert.equal(direct.apiKey, 'sk-asr-only');
  assert.equal(direct.host, 'ws-asronly9.cn-beijing.maas.aliyuncs.com');
  assert.equal(direct.asrModel, 'qwen3-asr-flash-realtime-x');
  assert.equal(getDashscopeDirectAsrConfig({ ...BAILIAN }), null);
});

test('开关能一键回退，不用删 Key', () => {
  const env = { ...BAILIAN, ...VOICES, ...DIRECT };
  assert.equal(resolveVoiceStack({ ...env, PHIL_COACH_ASR_PROVIDER: 'siliconflow' }).asr, 'siliconflow');
  assert.equal(resolveVoiceStack({ ...env, PHIL_COACH_ASR_PROVIDER: 'siliconflow' }).asrDirect, false);
  assert.equal(resolveVoiceStack({ ...env, PHIL_COACH_ASR_DIRECT: 'off' }).asrDirect, false);
  assert.equal(resolveVoiceStack({ ...env, PHIL_COACH_ASR_DIRECT: 'off' }).asr, 'bailian');
  assert.equal(resolveVoiceStack({ ...env, PHIL_COACH_TTS_PROVIDER: 'SiliconFlow' }).tts, 'siliconflow');
  assert.equal(resolveVoiceStack({ ...env, PHIL_COACH_STREAM_REPLY: 'off' }).streamReply, false);
  assert.deepEqual(
    resolveVoiceStack({
      ...env,
      PHIL_COACH_ASR_PROVIDER: 'siliconflow',
      PHIL_COACH_TTS_PROVIDER: 'siliconflow',
      PHIL_COACH_STREAM_REPLY: 'off',
    }),
    LEGACY_VOICE_STACK,
  );
});

test('流式回复可以单独打开（SiliconFlow 按句朗读也能用）；认不出的值按 auto', () => {
  assert.equal(resolveVoiceStack({ PHIL_COACH_STREAM_REPLY: 'on' }).streamReply, true);
  assert.equal(resolveVoiceStack({ PHIL_COACH_STREAM_REPLY: 'yes' }).streamReply, false);
  assert.equal(resolveVoiceStack({ ...BAILIAN, PHIL_COACH_STREAM_REPLY: 'yes' }).streamReply, true);
});

test('Accept 协商：要明确写了 ndjson 才流', () => {
  const on = { streamReply: true };
  assert.equal(wantsReplyStream(null, on), false);
  assert.equal(wantsReplyStream('*/*', on), false);
  assert.equal(wantsReplyStream('application/json', on), false);
  assert.equal(wantsReplyStream('application/x-ndjson, application/json;q=0.5', on), true);
  assert.equal(wantsReplyStream('Application/X-NDJSON', on), true);
  assert.equal(wantsReplyStream(NDJSON, { streamReply: false }), false);
});

test('结果里不含任何密钥', () => {
  const stack = resolveVoiceStack({ ...BAILIAN, ...VOICES, ...DIRECT, PHIL_COACH_SPEECH_SIGNING_SECRET: 'secret-secret-secret' });
  const serialized = JSON.stringify(stack);
  for (const secret of ['sk-test', 'ws-test123', 'philf', 'philm', 'secret-secret', 'sk-asr-only', 'ws-asronly9']) {
    assert.ok(!serialized.includes(secret), secret);
  }
  assert.deepEqual(Object.keys(stack).sort(), ['asr', 'asrDirect', 'streamReply', 'tts']);
});
