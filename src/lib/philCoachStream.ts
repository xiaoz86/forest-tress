/**
 * /api/phil-coach 的流式回复（NDJSON）。
 *
 * 只有请求头写了 `Accept: application/x-ndjson`、并且开关打开（见 voiceStack.ts）才走这里；
 * 其余请求——包括今天线上所有的前端——仍拿到原来的 JSON，一个字节都不变。
 * 闸门、危机词、限流都在开流之前判定：流一旦开始，就只会是一条正常的回复。
 *
 * 事件（一行一个）：
 *   {"type":"meta","requestId":"…","speak":true}
 *   {"type":"delta","text":"…"}                      文字逐段长出来
 *   {"type":"sentence","index":0,"text":"…","exp":…,"sig":"…","tone":"soft"}
 *                                                    切好、签好名、可以直接交给 /speak 的一段
 *   {"type":"done","requestId":"…","reply":"…"}     完整回复（以它为准写进会话）
 *   {"type":"error","requestId":"…","code":"llm-failed"}
 *
 * sentence 不管前端开没开朗读都会发：签名很便宜，而「打开朗读开关时补念上一条」要用到它们。
 * speak=false 表示这次不会有 sentence（服务端没有可用的 TTS 或签名密钥）。
 */
import { encodeNdjson } from './ndjson.ts';
import { chunkForSpeech, createSpeechChunker, type SpeechChunk } from './philCoachSpeech.ts';
import { signSpeech, type SpeechTone } from './philCoachSpeechSign.ts';
import type { VoiceStack } from './voiceStack.ts';

export const REPLY_STREAM_CONTENT_TYPE = 'application/x-ndjson';

export type PhilStreamEvent =
  | { type: 'meta'; requestId: string; speak: boolean }
  | { type: 'delta'; text: string }
  | { type: 'sentence'; index: number; text: string; exp: number; sig: string; tone: SpeechTone }
  | { type: 'done'; requestId: string; reply: string }
  | { type: 'error'; requestId: string; code: 'llm-failed' };

/** 要流式的前提：前端明确要（Accept 协商），而且开关开着。没配百炼时开关默认是关的。 */
export function wantsReplyStream(accept: string | null, stack: Pick<VoiceStack, 'streamReply'>): boolean {
  return stack.streamReply && Boolean(accept && accept.toLowerCase().includes(REPLY_STREAM_CONTENT_TYPE));
}

export function replyStreamHeaders(requestId: string): HeadersInit {
  return {
    'Content-Type': `${REPLY_STREAM_CONTENT_TYPE}; charset=utf-8`,
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    // 关掉反向代理的缓冲，不然字会攒成一大块才到
    'X-Accel-Buffering': 'no',
    'X-Phil-Request-Id': requestId,
  };
}

export type SpeechSigner = (text: string, tone: SpeechTone) => { exp: number; sig: string };

export function createSpeechSigner(secret: string | null): SpeechSigner | null {
  return secret ? (text, tone) => signSpeech(text, tone, secret) : null;
}

function sentenceEvents(list: SpeechChunk[], signer: SpeechSigner | null, tone: SpeechTone): PhilStreamEvent[] {
  if (!signer) return [];
  return list.map(chunk => {
    const { exp, sig } = signer(chunk.text, tone);
    return { type: 'sentence', index: chunk.index, text: chunk.text, exp, sig, tone };
  });
}

export type ReplyStreamOutcome = {
  outcome: 'done' | 'error' | 'cancelled';
  /** 开流到第一个 delta 的毫秒数；没有 delta 时为 null */
  firstDeltaMs: number | null;
  totalMs: number;
  chars: number;
  sentences: number;
};

/**
 * 把模型的文字增量包成 NDJSON 事件流。
 * 前端断开（流被 cancel）或请求被中止（signal）时，立刻中止上游，不让模型对着空气继续写、继续计费。
 */
export function createReplyEventStream({
  requestId,
  chunks,
  cancel,
  signer,
  tone = 'soft',
  signal,
  onSettled,
}: {
  requestId: string;
  chunks: AsyncIterable<string>;
  cancel: () => void;
  signer: SpeechSigner | null;
  tone?: SpeechTone;
  signal?: AbortSignal;
  onSettled?: (info: ReplyStreamOutcome) => void;
}): ReadableStream<Uint8Array> {
  let cancelled = false;
  const abortUpstream = () => {
    if (cancelled) return;
    cancelled = true;
    cancel();
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const startedAt = Date.now();
      let firstDeltaMs: number | null = null;
      let full = '';
      let outcome: ReplyStreamOutcome['outcome'] = 'done';
      const chunker = createSpeechChunker();
      const send = (event: PhilStreamEvent) => {
        if (!cancelled) controller.enqueue(encodeNdjson(event));
      };

      if (signal?.aborted) abortUpstream();
      else signal?.addEventListener('abort', abortUpstream, { once: true });

      try {
        send({ type: 'meta', requestId, speak: Boolean(signer) });
        for await (const text of chunks) {
          if (cancelled) break;
          if (firstDeltaMs === null) firstDeltaMs = Date.now() - startedAt;
          full += text;
          send({ type: 'delta', text });
          if (signer) for (const event of sentenceEvents(chunker.push(text), signer, tone)) send(event);
        }
        if (cancelled) {
          outcome = 'cancelled';
        } else {
          const reply = full.trim();
          // 一个字都没写出来，和非流式路径的「模型返回空」一样算失败
          if (!reply) throw new Error('empty-reply');
          if (signer) for (const event of sentenceEvents(chunker.flush(), signer, tone)) send(event);
          send({ type: 'done', requestId, reply });
        }
      } catch {
        if (cancelled) {
          outcome = 'cancelled';
        } else {
          outcome = 'error';
          send({ type: 'error', requestId, code: 'llm-failed' });
        }
      } finally {
        signal?.removeEventListener('abort', abortUpstream);
        // 被 signal 中止时流本身还开着，也要关上，不然读的一方会一直挂着
        try {
          controller.close();
        } catch {
          // 已经被下游取消
        }
        onSettled?.({
          outcome,
          firstDeltaMs,
          totalMs: Date.now() - startedAt,
          chars: full.length,
          sentences: chunker.count,
        });
      }
    },
    cancel() {
      abortUpstream();
    },
  });
}

/**
 * 不走模型的确定性回复（危机词）：一条 delta、对应的签名段、一条 done。
 * 和非流式的 JSON 回复是同一段文字，只是换了个装法。
 */
export function deterministicReplyStream({
  requestId,
  reply,
  signer,
  tone = 'steady',
}: {
  requestId: string;
  reply: string;
  signer: SpeechSigner | null;
  tone?: SpeechTone;
}): ReadableStream<Uint8Array> {
  const events: PhilStreamEvent[] = [
    { type: 'meta', requestId, speak: Boolean(signer) },
    { type: 'delta', text: reply },
    ...sentenceEvents(chunkForSpeech(reply), signer, tone),
    { type: 'done', requestId, reply },
  ];
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) controller.enqueue(encodeNdjson(event));
      controller.close();
    },
  });
}
