import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getSpeechSigningSecret,
  signSpeech,
  SPEECH_SIGN_TTL_SECONDS,
  verifySpeech,
} from '../src/lib/philCoachSpeechSign.ts';

const SECRET = 'test-secret-0123456789abcdef';
const NOW = Date.UTC(2026, 9, 27, 12, 0, 0);

test('签出来的句子能验过', () => {
  const { exp, sig } = signSpeech('你慢慢说，不着急。', 'soft', SECRET, { now: NOW });
  assert.equal(exp, Math.floor(NOW / 1000) + SPEECH_SIGN_TTL_SECONDS);
  assert.equal(verifySpeech({ text: '你慢慢说，不着急。', tone: 'soft', exp, sig }, SECRET, NOW), 'ok');
});

test('改一个字、换语气、改有效期、换密钥都验不过', () => {
  const { exp, sig } = signSpeech('你慢慢说，不着急。', 'soft', SECRET, { now: NOW });
  assert.equal(verifySpeech({ text: '你慢慢说，不要急。', tone: 'soft', exp, sig }, SECRET, NOW), 'invalid');
  assert.equal(verifySpeech({ text: '你慢慢说，不着急。', tone: 'steady', exp, sig }, SECRET, NOW), 'invalid');
  assert.equal(verifySpeech({ text: '你慢慢说，不着急。', tone: 'soft', exp: exp + 60, sig }, SECRET, NOW), 'invalid');
  assert.equal(
    verifySpeech({ text: '你慢慢说，不着急。', tone: 'soft', exp, sig }, 'another-secret-0123456789', NOW),
    'invalid',
  );
});

test('过期的签名返回 expired', () => {
  const { exp, sig } = signSpeech('好。', 'soft', SECRET, { now: NOW });
  const later = NOW + (SPEECH_SIGN_TTL_SECONDS + 1) * 1000;
  assert.equal(verifySpeech({ text: '好。', tone: 'soft', exp, sig }, SECRET, later), 'expired');
});

test('有效期远在未来的签名不认（只可能是密钥泄露后自己签的）', () => {
  const { exp, sig } = signSpeech('好。', 'soft', SECRET, { now: NOW, ttlSeconds: 24 * 3600 });
  assert.equal(verifySpeech({ text: '好。', tone: 'soft', exp, sig }, SECRET, NOW), 'invalid');
});

test('类型不对、语气不在白名单、超长文本都直接拒', () => {
  const { exp, sig } = signSpeech('好。', 'soft', SECRET, { now: NOW });
  assert.equal(verifySpeech({ text: 123, tone: 'soft', exp, sig }, SECRET, NOW), 'invalid');
  assert.equal(verifySpeech({ text: '好。', tone: 'angry', exp, sig }, SECRET, NOW), 'invalid');
  assert.equal(verifySpeech({ text: '好。', tone: 'soft', exp: String(exp), sig }, SECRET, NOW), 'invalid');
  assert.equal(verifySpeech({ text: '好。', tone: 'soft', exp, sig: '' }, SECRET, NOW), 'invalid');
  const long = '字'.repeat(201);
  const signedLong = signSpeech(long, 'soft', SECRET, { now: NOW });
  assert.equal(verifySpeech({ text: long, tone: 'soft', ...signedLong }, SECRET, NOW), 'invalid');
});

test('签名密钥：专门配的优先；否则从上游 Key 派生，且不等于 Key 本身；都没有返回 null', () => {
  assert.equal(getSpeechSigningSecret({}), null);
  assert.equal(
    getSpeechSigningSecret({ PHIL_COACH_SPEECH_SIGNING_SECRET: 'explicit-secret-123456' }),
    'explicit-secret-123456',
  );
  const derived = getSpeechSigningSecret({ DASHSCOPE_API_KEY: 'sk-abc' });
  assert.ok(derived && derived !== 'sk-abc');
  assert.equal(getSpeechSigningSecret({ DASHSCOPE_API_KEY: 'sk-abc' }), derived);
  assert.ok(getSpeechSigningSecret({ SILICONFLOW_API_KEY: 'sf-abc' }));
  // 太短的专用密钥不算数，回落到派生
  assert.equal(getSpeechSigningSecret({ PHIL_COACH_SPEECH_SIGNING_SECRET: 'short', DASHSCOPE_API_KEY: 'sk-abc' }), derived);
});
