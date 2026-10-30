import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import test from 'node:test';
import { DashscopeError, openDashscopeSocket } from '../src/lib/dashscope.ts';
import {
  createFrameParser,
  encodeFrame,
  OutboundWebSocket,
  WS_CLOSED,
  WS_OPEN,
  type Frame,
} from '../src/lib/outboundWebSocket.ts';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

type Peer = {
  socket: Socket;
  request: IncomingMessage;
  frames: Frame[];
  sendText(text: string, fin?: boolean, opcode?: number): void;
  /** 收到客户端的 FIN（http 服务端的 socket 允许半开，收到 FIN 也不会自己关） */
  ended: Promise<void>;
};

/**
 * 一个最小的 WebSocket 服务端，扮演百炼。
 * onPeer 拿到每个连上来的客户端；mode 决定握手怎么回。
 */
async function withServer(
  mode: 'ok' | 'reject-401' | 'hang',
  onPeer: (peer: Peer) => void,
  run: (url: string) => Promise<void>,
) {
  const server: Server = createServer((_req, res) => {
    res.statusCode = 404;
    res.end();
  });
  const sockets = new Set<Socket>();
  server.on('connection', s => sockets.add(s));
  server.on('upgrade', (request: IncomingMessage, socket: Socket) => {
    if (mode === 'hang') return;
    if (mode === 'reject-401') {
      socket.end('HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
      return;
    }
    const accept = createHash('sha1').update(`${request.headers['sec-websocket-key']}${GUID}`).digest('base64');
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    const parser = createFrameParser();
    const peer: Peer = {
      socket,
      request,
      frames: [],
      sendText(text, fin = true, opcode = 0x1) {
        socket.write(encodeFrame(opcode, Buffer.from(text), null, fin));
      },
      ended: new Promise(resolve => socket.on('end', () => resolve())),
    };
    socket.on('data', chunk => {
      for (const frame of parser.push(chunk)) {
        peer.frames.push(frame);
        // 扮演百炼：不回关闭帧、也不主动断开
      }
    });
    socket.on('error', () => {});
    onPeer(peer);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await run(`ws://127.0.0.1:${port}/api-ws/v1/realtime?model=m`);
  } finally {
    for (const s of sockets) s.destroy();
    await new Promise(resolve => server.close(resolve));
  }
}

function nextEvent(target: EventTarget, type: string, timeoutMs = 2000): Promise<Event> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${type} event`)), timeoutMs);
    target.addEventListener(
      type,
      event => {
        clearTimeout(timer);
        resolve(event);
      },
      { once: true },
    );
  });
}

test('帧编解码：三种长度编码、掩码、跨块', () => {
  for (const size of [5, 300, 70_000]) {
    const payload = Buffer.alloc(size, 7);
    const masked = encodeFrame(0x1, payload, Buffer.from([1, 2, 3, 4]));
    const parser = createFrameParser();
    const frames: Frame[] = [];
    for (let i = 0; i < masked.length; i += 1000) frames.push(...parser.push(masked.subarray(i, i + 1000)));
    assert.equal(frames.length, 1);
    assert.equal(frames[0].opcode, 0x1);
    assert.equal(frames[0].fin, true);
    assert.deepEqual(frames[0].payload, payload);
  }
});

test('握手带上自定义请求头；收发文本、分片消息、ping 自动回 pong', async () => {
  let peer!: Peer;
  await withServer(
    'ok',
    p => {
      peer = p;
    },
    async url => {
      const ws = new OutboundWebSocket(url, { headers: { Authorization: 'Bearer sk-test' } });
      await nextEvent(ws, 'open');
      assert.equal(ws.readyState, WS_OPEN);
      assert.equal(peer.request.headers.authorization, 'Bearer sk-test');
      assert.equal(peer.request.url, '/api-ws/v1/realtime?model=m');

      const messages: string[] = [];
      ws.addEventListener('message', event => messages.push((event as MessageEvent).data as string));

      ws.send(JSON.stringify({ type: 'session.update' }));
      peer.sendText('{"type":"session.updated"}');
      const long = 'x'.repeat(70_000);
      peer.sendText(long);
      // 分片：一条消息拆成三帧
      peer.sendText('你好', false, 0x1);
      peer.sendText('，', false, 0x0);
      peer.sendText('世界', true, 0x0);
      peer.socket.write(encodeFrame(0x9, Buffer.from('p'), null));
      await new Promise(resolve => setTimeout(resolve, 100));

      assert.deepEqual(messages, ['{"type":"session.updated"}', long, '你好，世界']);
      const fromClient = peer.frames.map(f => ({ opcode: f.opcode, text: f.payload.toString() }));
      assert.deepEqual(fromClient, [
        { opcode: 0x1, text: '{"type":"session.update"}' },
        { opcode: 0xa, text: 'p' },
      ]);
      ws.close();
    },
  );
});

test('对方不回关闭帧也不断开（百炼就是这样）：close() 之后照样把连接销毁', async () => {
  let peer!: Peer;
  await withServer(
    'ok',
    p => {
      peer = p;
    },
    async url => {
      const ws = new OutboundWebSocket(url, { closeGraceMs: 100 });
      await nextEvent(ws, 'open');
      const closed = nextEvent(ws, 'close');
      const startedAt = Date.now();
      ws.close();
      // 客户端这边的 TCP 真的关了（close 事件只在 socket 销毁后才发），服务端收到了 FIN
      await closed;
      await peer.ended;
      assert.ok(Date.now() - startedAt < 1500);
      assert.equal(ws.readyState, WS_CLOSED);
      // 关闭帧发出去了（code 1000）
      const closeFrame = peer.frames.find(f => f.opcode === 0x8);
      assert.equal(closeFrame?.payload.readUInt16BE(0), 1000);
    },
  );
});

test('握手被拒（401）：error 事件带状态码，openDashscopeSocket 归成 auth', async () => {
  await withServer('reject-401', () => {}, async url => {
    await assert.rejects(
      openDashscopeSocket(url, { headers: { Authorization: 'Bearer bad' }, timeoutMs: 2000 }),
      (err: unknown) => err instanceof DashscopeError && err.kind === 'auth' && err.status === 401,
    );
  });
});

test('握手一直没回：超时报 timeout，连接也被销毁', async () => {
  await withServer('hang', () => {}, async url => {
    await assert.rejects(
      openDashscopeSocket(url, { timeoutMs: 150 }),
      (err: unknown) => err instanceof DashscopeError && err.kind === 'timeout',
    );
  });
});

test('openDashscopeSocket 被中止（用户打断）：报 aborted', async () => {
  await withServer('hang', () => {}, async url => {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 20);
    await assert.rejects(
      openDashscopeSocket(url, { timeoutMs: 2000, signal: ctrl.signal }),
      (err: unknown) => err instanceof DashscopeError && err.kind === 'aborted',
    );
  });
});
