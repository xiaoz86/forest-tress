/**
 * 服务端主动连出去的最小 WebSocket 客户端（RFC 6455，只做文本/二进制帧、分片、ping/pong、关闭）。
 *
 * 为什么不用 Node 自带的全局 WebSocket（undici）：2026-10-27 用真实 Key 实测，
 * 百炼实时识别在 session.finished 之后既不主动断开，也不回应我们的关闭帧——
 * undici 的 WebSocket 会一直停在 CLOSING，底下的 TCP 连接 90 秒后还开着，而且标准 API 没有办法强制断开。
 * 每次转写漏一条连接，Fluid compute 的实例会一直攒下去。这里自己管 socket：
 * 发完关闭帧等一小会儿，对方不理就直接销毁。
 *
 * 顺带解决了另一个不确定：Vercel 上的 Node 版本的全局 WebSocket 支不支持自定义请求头，没核实过；
 * 这个实现只用 node:https 的 upgrade，哪个 Node 版本都一样。
 * 握手失败时还能拿到 HTTP 状态码（401/403/429），错误分类更准。
 *
 * 接口贴着浏览器 WebSocket 的子集（open / message / error / close 事件、send、close），
 * 调用方的写法不用变。只在服务端用；不写 TS 参数属性、枚举这类 node --test 剥不掉的语法。
 */
import { createHash, randomBytes } from 'node:crypto';
import { request as httpRequest, type ClientRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { Socket } from 'node:net';

const HANDSHAKE_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
/** 单条消息上限：识别结果都是几百字节的 JSON，16MB 只是防御 */
const MAX_MESSAGE_BYTES = 16 * 1024 * 1024;

export const WS_CONNECTING = 0;
export const WS_OPEN = 1;
export const WS_CLOSING = 2;
export const WS_CLOSED = 3;

const OP_CONTINUATION = 0x0;
const OP_TEXT = 0x1;
const OP_BINARY = 0x2;
const OP_CLOSE = 0x8;
const OP_PING = 0x9;
const OP_PONG = 0xa;

// —— 帧编解码（纯函数，测试里的假服务器也用它） ——

/** 编一帧。客户端发出的帧必须带掩码（mask 传 4 字节）；服务端发出的不带（传 null） */
export function encodeFrame(opcode: number, payload: Uint8Array, mask: Uint8Array | null, fin = true): Buffer {
  const length = payload.length;
  const lengthBytes = length < 126 ? 0 : length < 65_536 ? 2 : 8;
  const header = Buffer.alloc(2 + lengthBytes + (mask ? 4 : 0));
  header[0] = (fin ? 0x80 : 0) | opcode;
  const maskBit = mask ? 0x80 : 0;
  if (lengthBytes === 0) {
    header[1] = maskBit | length;
  } else if (lengthBytes === 2) {
    header[1] = maskBit | 126;
    header.writeUInt16BE(length, 2);
  } else {
    header[1] = maskBit | 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  if (!mask) return Buffer.concat([header, payload]);
  header.set(mask, 2 + lengthBytes);
  const body = Buffer.allocUnsafe(length);
  for (let i = 0; i < length; i += 1) body[i] = payload[i] ^ mask[i & 3];
  return Buffer.concat([header, body]);
}

export type Frame = { fin: boolean; opcode: number; payload: Buffer };

/**
 * 字节流 → 帧。TCP 块可能切在帧头、长度字段或载荷的任何位置，攒够一帧才交出去。
 * 带掩码的帧（客户端发来的）顺手解掉掩码。超过上限的帧报错。
 */
export function createFrameParser(maxFrameBytes = MAX_MESSAGE_BYTES) {
  let buffer: Buffer = Buffer.alloc(0);
  return {
    push(chunk: Uint8Array): Frame[] {
      buffer = buffer.length ? Buffer.concat([buffer, chunk]) : Buffer.from(chunk);
      const frames: Frame[] = [];
      for (;;) {
        if (buffer.length < 2) break;
        const fin = (buffer[0] & 0x80) !== 0;
        const opcode = buffer[0] & 0x0f;
        const masked = (buffer[1] & 0x80) !== 0;
        let length = buffer[1] & 0x7f;
        let offset = 2;
        if (length === 126) {
          if (buffer.length < 4) break;
          length = buffer.readUInt16BE(2);
          offset = 4;
        } else if (length === 127) {
          if (buffer.length < 10) break;
          const big = buffer.readBigUInt64BE(2);
          if (big > BigInt(maxFrameBytes)) throw new Error('frame-too-large');
          length = Number(big);
          offset = 10;
        }
        if (length > maxFrameBytes) throw new Error('frame-too-large');
        const start = offset + (masked ? 4 : 0);
        if (buffer.length < start + length) break;
        let payload = buffer.subarray(start, start + length);
        if (masked) {
          const mask = buffer.subarray(offset, offset + 4);
          payload = Buffer.from(payload);
          for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i & 3];
        } else {
          payload = Buffer.from(payload);
        }
        buffer = buffer.subarray(start + length);
        frames.push({ fin, opcode, payload });
      }
      return frames;
    },
  };
}

// —— 事件 ——

/** 握手或连接出错；status 是握手时对方回的 HTTP 状态码（有的话） */
export class OutboundSocketErrorEvent extends Event {
  readonly status?: number;
  readonly reason: string;
  constructor(reason: string, status?: number) {
    super('error');
    this.reason = reason;
    this.status = status;
  }
}

export class OutboundSocketCloseEvent extends Event {
  readonly code: number;
  readonly wasClean: boolean;
  constructor(code: number, wasClean: boolean) {
    super('close');
    this.code = code;
    this.wasClean = wasClean;
  }
}

export type OutboundWebSocketOptions = {
  headers?: Record<string, string>;
  /** 发出关闭帧后等对方多久，不理就直接销毁连接 */
  closeGraceMs?: number;
};

export class OutboundWebSocket extends EventTarget {
  readyState: number = WS_CONNECTING;

  #request: ClientRequest;
  #socket: Socket | null = null;
  #parser = createFrameParser();
  #fragments: Buffer[] = [];
  #fragmentOpcode = 0;
  #fragmentBytes = 0;
  #closeGraceMs: number;
  #graceTimer: ReturnType<typeof setTimeout> | null = null;
  #closeSent = false;
  #finalized = false;

  constructor(url: string, { headers = {}, closeGraceMs = 500 }: OutboundWebSocketOptions = {}) {
    super();
    const target = new URL(url);
    const secure = target.protocol === 'wss:';
    if (!secure && target.protocol !== 'ws:') throw new TypeError('outbound websocket: unsupported protocol');
    this.#closeGraceMs = closeGraceMs;

    const key = randomBytes(16).toString('base64');
    const expectedAccept = createHash('sha1').update(key + HANDSHAKE_GUID).digest('base64');
    const request = secure ? httpsRequest : httpRequest;
    this.#request = request({
      hostname: target.hostname.replace(/^\[|\]$/g, ''),
      port: target.port || (secure ? 443 : 80),
      path: `${target.pathname || '/'}${target.search}`,
      method: 'GET',
      // 一条 WebSocket 一个独立连接，不进连接池
      agent: false,
      headers: {
        ...headers,
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13',
      },
    });

    this.#request.on('upgrade', (res: IncomingMessage, socket: Socket, head: Buffer) => {
      if (this.readyState !== WS_CONNECTING) {
        socket.destroy();
        return;
      }
      // 没请求任何扩展（比如压缩），对方也不该开；accept 对不上就不是一次合规的握手
      if (res.headers['sec-websocket-accept'] !== expectedAccept || res.headers['sec-websocket-extensions']) {
        socket.destroy();
        this.#fail('bad-handshake', res.statusCode);
        return;
      }
      this.#socket = socket;
      socket.setNoDelay(true);
      socket.on('data', chunk => this.#onData(chunk));
      socket.on('end', () => {
        // 对方半关闭：我们也关
        if (!socket.destroyed) socket.end();
      });
      socket.on('close', () => this.#finalize(this.#closeSent ? 1000 : 1006, this.#closeSent));
      socket.on('error', () => {
        // 随后必有 close
      });
      this.readyState = WS_OPEN;
      this.dispatchEvent(new Event('open'));
      // 握手响应后面紧跟着的帧：等调用方挂好 message 监听再交
      if (head.length) setImmediate(() => this.#onData(head));
    });

    this.#request.on('response', (res: IncomingMessage) => {
      // 不是 101：鉴权失败、限流、地址不对
      res.resume();
      this.#fail('unexpected-response', res.statusCode);
    });
    this.#request.on('error', () => this.#fail('connect-failed'));
    this.#request.end();
  }

  send(data: string | Uint8Array): void {
    if (this.readyState === WS_CONNECTING) throw new Error('outbound websocket: still connecting');
    if (this.readyState !== WS_OPEN || !this.#socket) return;
    const payload = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
    this.#write(typeof data === 'string' ? OP_TEXT : OP_BINARY, payload);
  }

  /**
   * 关闭：发关闭帧、半关闭 TCP，最多再等 closeGraceMs 就销毁。
   * 百炼不回关闭帧也不断开，所以这里不能像标准 WebSocket 那样一直等下去。
   */
  close(code = 1000, reason = ''): void {
    if (this.readyState === WS_CLOSING || this.readyState === WS_CLOSED) return;
    if (this.readyState === WS_CONNECTING) {
      this.readyState = WS_CLOSED;
      this.#request.destroy();
      this.#finalize(1006, false);
      return;
    }
    this.readyState = WS_CLOSING;
    this.#sendClose(code, reason);
    const socket = this.#socket;
    if (socket) {
      socket.end();
      this.#graceTimer = setTimeout(() => socket.destroy(), this.#closeGraceMs);
      this.#graceTimer.unref?.();
    }
  }

  #write(opcode: number, payload: Uint8Array): void {
    this.#socket?.write(encodeFrame(opcode, payload, randomBytes(4)));
  }

  #sendClose(code: number, reason: string): void {
    if (this.#closeSent || !this.#socket || this.#socket.destroyed) return;
    this.#closeSent = true;
    const reasonBytes = Buffer.from(reason, 'utf8').subarray(0, 123);
    const payload = Buffer.alloc(2 + reasonBytes.length);
    payload.writeUInt16BE(code, 0);
    payload.set(reasonBytes, 2);
    this.#write(OP_CLOSE, payload);
  }

  #onData(chunk: Buffer): void {
    let frames: Frame[];
    try {
      frames = this.#parser.push(chunk);
    } catch {
      this.#protocolError();
      return;
    }
    for (const frame of frames) {
      if (this.#finalized) return;
      this.#onFrame(frame);
    }
  }

  #onFrame({ fin, opcode, payload }: Frame): void {
    switch (opcode) {
      case OP_PING:
        if (this.readyState === WS_OPEN) this.#write(OP_PONG, payload);
        return;
      case OP_PONG:
        return;
      case OP_CLOSE: {
        // 对方先关：回一个关闭帧，然后断开
        const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1005;
        this.readyState = WS_CLOSING;
        this.#sendClose(code === 1005 ? 1000 : code, '');
        this.#socket?.end();
        const socket = this.#socket;
        if (socket && !this.#graceTimer) {
          this.#graceTimer = setTimeout(() => socket.destroy(), this.#closeGraceMs);
          this.#graceTimer.unref?.();
        }
        return;
      }
      case OP_TEXT:
      case OP_BINARY:
        if (this.#fragments.length) {
          this.#protocolError();
          return;
        }
        if (fin) {
          this.#deliver(opcode, payload);
        } else {
          this.#fragmentOpcode = opcode;
          this.#fragments = [payload];
          this.#fragmentBytes = payload.length;
        }
        return;
      case OP_CONTINUATION:
        if (!this.#fragments.length) {
          this.#protocolError();
          return;
        }
        this.#fragments.push(payload);
        this.#fragmentBytes += payload.length;
        if (this.#fragmentBytes > MAX_MESSAGE_BYTES) {
          this.#protocolError();
          return;
        }
        if (fin) {
          const joined = Buffer.concat(this.#fragments);
          this.#fragments = [];
          this.#fragmentBytes = 0;
          this.#deliver(this.#fragmentOpcode, joined);
        }
        return;
      default:
        this.#protocolError();
    }
  }

  #deliver(opcode: number, payload: Buffer): void {
    // 调用了 close() 之后不再往外交消息，和浏览器 WebSocket 一样
    if (this.readyState !== WS_OPEN) return;
    const data = opcode === OP_TEXT ? payload.toString('utf8') : new Uint8Array(payload);
    this.dispatchEvent(new MessageEvent('message', { data }));
  }

  #protocolError(): void {
    if (this.readyState === WS_OPEN) this.#sendClose(1002, '');
    this.#socket?.destroy();
    this.#fail('protocol-error');
  }

  #fail(reason: string, status?: number): void {
    if (this.#finalized) return;
    this.readyState = WS_CLOSED;
    this.#request.destroy();
    this.#socket?.destroy();
    this.dispatchEvent(new OutboundSocketErrorEvent(reason, status));
    this.#finalize(1006, false);
  }

  #finalize(code: number, wasClean: boolean): void {
    if (this.#finalized) return;
    this.#finalized = true;
    this.readyState = WS_CLOSED;
    if (this.#graceTimer) clearTimeout(this.#graceTimer);
    this.#socket?.destroy();
    this.dispatchEvent(new OutboundSocketCloseEvent(code, wasClean));
  }
}
