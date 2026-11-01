import assert from 'node:assert/strict';
import { channel } from 'node:diagnostics_channel';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { traceTtsRequest, type TtsRequestTrace } from '../src/lib/ttsRequestTrace.ts';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

test('请求诊断：真实 Node fetch 收到响应，报告只有计时与地址族，不含敏感内容', async () => {
  const server = createServer((request, response) => {
    request.resume();
    request.on('end', () => { response.end('ok'); });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  let report: TtsRequestTrace | undefined;
  try {
    const result = await traceTtsRequest(async () => {
      const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/private-text`, {
        method: 'POST', headers: { Authorization: 'Bearer private-key' }, body: 'private-audio-text',
      });
      return response.text();
    }, trace => { report = trace; });
    assert.equal(result, 'ok');
    assert.equal(report?.remoteFamily, 'IPv4');
    for (const key of ['sendHeadersMs', 'bodySentMs', 'responseHeadersMs'] as const) {
      assert.equal(typeof report?.[key], 'number');
      assert.ok(report![key]! >= 0);
    }
    assert.deepEqual(Object.keys(report!).sort(), ['bodySentMs', 'remoteFamily', 'responseHeadersMs', 'sendHeadersMs']);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('请求诊断：并发请求交错事件按 request 身份关联，忽略范围外的请求', async () => {
  const a = {}, b = {}, unrelated = {};
  const releaseA = deferred(), releaseB = deferred();
  const reports: TtsRequestTrace[] = [];
  const run = (request: object, gate: ReturnType<typeof deferred>, index: number) => traceTtsRequest(async () => {
    channel('undici:request:create').publish({ request });
    await gate.promise;
    return index;
  }, trace => { reports[index] = trace; });
  const promiseA = run(a, releaseA, 0);
  const promiseB = run(b, releaseB, 1);
  channel('undici:request:create').publish({ request: unrelated });
  channel('undici:request:error').publish({ request: unrelated, error: { code: 'ECONNRESET' } });
  channel('undici:request:headers').publish({ request: b });
  channel('undici:client:sendHeaders').publish({ request: a, socket: { remoteFamily: 'IPv6', remoteAddress: 'private-address' } });
  channel('undici:request:error').publish({ request: a, error: { code: 'UND_ERR_CONNECT_TIMEOUT', message: 'private-key' } });
  releaseB.resolve();
  releaseA.resolve();
  assert.deepEqual(await Promise.all([promiseA, promiseB]), [0, 1]);
  assert.equal(reports[0].remoteFamily, 'IPv6');
  assert.equal(reports[0].errorCode, 'UND_ERR_CONNECT_TIMEOUT');
  assert.equal(reports[0].responseHeadersMs, undefined);
  assert.equal(typeof reports[1].responseHeadersMs, 'number');
  assert.equal(reports[1].errorCode, undefined);
  assert.equal(reports[1].remoteFamily, undefined);
});

test('请求诊断：失败仍交付报告且保留原异常，结束后迟到事件与异步子任务不再写入', async () => {
  const request = {}, lateRequest = {};
  const gate = deferred();
  const failure = new Error('upstream failed');
  let lateTask: Promise<void> | undefined;
  let report: TtsRequestTrace | undefined;
  await assert.rejects(traceTtsRequest(async () => {
    channel('undici:request:create').publish({ request });
    channel('undici:request:bodySent').publish({ request });
    lateTask = gate.promise.then(() => {
      channel('undici:request:create').publish({ request: lateRequest });
      channel('undici:request:headers').publish({ request: lateRequest });
    });
    throw failure;
  }, trace => { report = trace; }), error => error === failure);
  const snapshot = { ...report };
  channel('undici:request:headers').publish({ request });
  gate.resolve();
  await lateTask;
  assert.deepEqual(report, snapshot);
  let next: TtsRequestTrace | undefined;
  await traceTtsRequest(async () => {
    channel('undici:request:headers').publish({ request });
    channel('undici:request:headers').publish({ request: lateRequest });
  }, trace => { next = trace; });
  assert.deepEqual(next, {});
});

test('请求诊断：不透传错误消息、任意 code 字符串或同一范围内的第二个请求', async () => {
  const request = {}, second = {};
  let report: TtsRequestTrace | undefined;
  await traceTtsRequest(async () => {
    channel('undici:request:create').publish({ request });
    channel('undici:request:create').publish({ request: second });
    channel('undici:request:error').publish({ request, error: { code: 'Bearer secret', message: 'private-text' } });
    channel('undici:request:headers').publish({ request: second });
  }, trace => { report = trace; });
  assert.deepEqual(Object.keys(report!), ['requestErrorMs']);
});
