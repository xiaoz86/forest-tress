import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getVoiceTicketSecret,
  issueVoiceTicket,
  ticketIpKey,
  verifyVoiceTicket,
  VOICE_TICKET_TTL_SECONDS,
} from '../src/lib/philCoachVoiceTicket.ts';
import { getSpeechSigningSecret } from '../src/lib/philCoachSpeechSign.ts';
import { clientIpFromHeaders, createUseCounter } from '../src/lib/memoryRateLimit.ts';

const SECRET = 'ticket-secret-for-tests-0123456789';
const NOW = 1_800_000_000_000;

test('进门票：同一个 IP、有效期内验得过', () => {
  const ticket = issueVoiceTicket('203.0.113.7', SECRET, { now: NOW });
  assert.match(ticket, /^vt1\.\d+\.[A-Za-z0-9_-]+$/);
  assert.equal(verifyVoiceTicket(ticket, '203.0.113.7', SECRET, NOW + 60_000), 'ok');
});

test('进门票：换了 IP、改了过期时间、换了密钥、乱写的，一律 invalid', () => {
  const ticket = issueVoiceTicket('203.0.113.7', SECRET, { now: NOW });
  assert.equal(verifyVoiceTicket(ticket, '203.0.113.8', SECRET, NOW), 'invalid');
  const [v, exp, sig] = ticket.split('.');
  assert.equal(verifyVoiceTicket(`${v}.${Number(exp) + 3600}.${sig}`, '203.0.113.7', SECRET, NOW), 'invalid');
  assert.equal(verifyVoiceTicket(ticket, '203.0.113.7', `${SECRET}x`, NOW), 'invalid');
  for (const bad of [null, undefined, '', 42, 'vt1', 'vt1.abc.def', `vt2.${exp}.${sig}`, `${ticket}.extra`, 'x'.repeat(500)]) {
    assert.equal(verifyVoiceTicket(bad, '203.0.113.7', SECRET, NOW), 'invalid', String(bad).slice(0, 20));
  }
});

test('进门票：过期是 expired；签名对但 exp 远在未来（只可能是密钥泄露后自签）是 invalid', () => {
  const ticket = issueVoiceTicket('203.0.113.7', SECRET, { now: NOW });
  assert.equal(
    verifyVoiceTicket(ticket, '203.0.113.7', SECRET, NOW + (VOICE_TICKET_TTL_SECONDS + 1) * 1000),
    'expired',
  );
  const forged = issueVoiceTicket('203.0.113.7', SECRET, { now: NOW, ttlSeconds: 30 * 24 * 3600 });
  assert.equal(verifyVoiceTicket(forged, '203.0.113.7', SECRET, NOW), 'invalid');
});

test('进门票绑 IP：IPv6 绑 /64（隐私地址轮换不作废），IPv4 映射地址按 IPv4 算', () => {
  assert.equal(ticketIpKey('2001:db8:1:2:aaaa::1'), ticketIpKey('2001:db8:1:2:bbbb:cccc:dddd:eeee'));
  assert.notEqual(ticketIpKey('2001:db8:1:2::1'), ticketIpKey('2001:db8:1:3::1'));
  assert.equal(ticketIpKey('2001:0DB8:0001:0002::1'), ticketIpKey('2001:db8:1:2::9'));
  assert.equal(ticketIpKey('::ffff:203.0.113.7'), '203.0.113.7');
  assert.equal(ticketIpKey('[2001:db8:1:2::1]'), ticketIpKey('2001:db8:1:2::2'));
  assert.equal(ticketIpKey('unknown'), 'unknown');
  const ticket = issueVoiceTicket('2001:db8:1:2:aaaa::1', SECRET, { now: NOW });
  assert.equal(verifyVoiceTicket(ticket, '2001:db8:1:2:ffff::2', SECRET, NOW), 'ok');
  assert.equal(verifyVoiceTicket(ticket, '2001:db8:9:9::1', SECRET, NOW), 'invalid');
});

test('票的密钥和朗读签名的密钥不是同一把；什么 Key 都没配就没有票', () => {
  const env = { DASHSCOPE_API_KEY: 'sk-test' };
  const ticketSecret = getVoiceTicketSecret(env);
  assert.ok(ticketSecret);
  assert.notEqual(ticketSecret, getSpeechSigningSecret(env));
  assert.ok(!ticketSecret.includes('sk-test'));
  assert.equal(getVoiceTicketSecret({}), null);
});

test('页面和路由取 IP 的办法一致：x-forwarded-for 的第一个，其次 x-real-ip', () => {
  const headers = (h: Record<string, string>) => ({ get: (name: string) => h[name] ?? null });
  assert.equal(clientIpFromHeaders(headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })), '203.0.113.7');
  assert.equal(clientIpFromHeaders(headers({ 'x-real-ip': '198.51.100.2' })), '198.51.100.2');
  assert.equal(clientIpFromHeaders(headers({})), 'unknown');
});

test('/speak 的签名使用次数：上限之内放行，超了拒绝；过期后重新计', () => {
  const overLimit = createUseCounter({ max: 3 });
  const exp = NOW + 600_000;
  assert.deepEqual([1, 2, 3, 4, 5].map(() => overLimit('sig-a', exp, NOW)), [false, false, false, true, true]);
  assert.equal(overLimit('sig-b', exp, NOW), false, '别的签名各数各的');
  assert.equal(overLimit('sig-a', NOW + 700_000, exp + 1), false, '原来那条过期了，重新计');
});
