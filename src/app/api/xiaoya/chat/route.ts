import { NextResponse } from 'next/server';
import { createChatCompletionStream, getLLMConfig, type ChatMessage } from '@/lib/llm';
import { getAuthenticatedMemberId } from '@/lib/session';
import { getXiaoyaFlags } from '@/lib/xiaoya/flags';
import {
  buildXiaoyaKnowledgeContext,
  loadXiaoyaKnowledge,
  retrieveXiaoyaKnowledge,
} from '@/lib/xiaoya/knowledge';
import { getXiaoyaMemberContext } from '@/lib/xiaoya/memberContext';
import { sanitizeXiaoyaPageContext } from '@/lib/xiaoya/pageContext';
import { buildXiaoyaSystemPrompt } from '@/lib/xiaoya/prompt';
import { checkXiaoyaRateLimit } from '@/lib/xiaoya/rateLimit';
import { deterministicSafetyReply, suggestionsForPage } from '@/lib/xiaoya/safety';
import {
  anonymizeXiaoyaActor,
  createXiaoyaRequestId,
  logXiaoyaEvent,
} from '@/lib/xiaoya/telemetry';
import {
  parseXiaoyaMessages,
  XIAOYA_MAX_BODY_BYTES,
  type XiaoyaStreamEvent,
  type XiaoyaSuggestion,
} from '@/lib/xiaoya/types';

export const runtime = 'nodejs';

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const value = forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown';
  return value.replace(/[\u0000-\u001f\s]/g, '').slice(0, 128) || 'unknown';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function encodeEvent(event: XiaoyaStreamEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

function streamHeaders(requestId: string): HeadersInit {
  return {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'X-Accel-Buffering': 'no',
    'X-Xiaoya-Request-Id': requestId,
  };
}

function deterministicResponse(
  requestId: string,
  reply: string,
  suggestions: XiaoyaSuggestion[],
): Response {
  const events: XiaoyaStreamEvent[] = [
    { type: 'meta', requestId, suggestions },
    { type: 'delta', text: reply },
    { type: 'done', requestId, suggestions },
  ];
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) controller.enqueue(encodeEvent(event));
      controller.close();
    },
  }), { headers: streamHeaders(requestId) });
}

function jsonError(error: string, status: number, requestId: string, headers?: HeadersInit): NextResponse {
  return NextResponse.json(
    { error, requestId },
    {
      status,
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Xiaoya-Request-Id': requestId,
        ...headers,
      },
    },
  );
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = createXiaoyaRequestId();
  const flags = getXiaoyaFlags();
  if (!flags.enabled) return jsonError('not_found', 404, requestId);

  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > XIAOYA_MAX_BODY_BYTES) {
    return jsonError('request_too_large', 413, requestId);
  }

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > XIAOYA_MAX_BODY_BYTES) {
      return jsonError('request_too_large', 413, requestId);
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return jsonError('invalid_request', 400, requestId);
    body = parsed;
  } catch {
    return jsonError('invalid_json', 400, requestId);
  }

  const parsedMessages = parseXiaoyaMessages(body.messages);
  if (!parsedMessages.ok) return jsonError(parsedMessages.error, 400, requestId);

  const pageInput = isRecord(body.pageContext)
    ? { ...body.pageContext, locale: body.locale ?? body.pageContext.locale }
    : { locale: body.locale };
  const pageContext = sanitizeXiaoyaPageContext(pageInput);
  const memberId = await getAuthenticatedMemberId();
  const ip = clientIp(request);
  const actorHash = anonymizeXiaoyaActor(memberId ? `member:${memberId}` : `guest:${ip}`);
  const rateLimit = checkXiaoyaRateLimit(ip, memberId);
  if (rateLimit.limited) {
    logXiaoyaEvent('rate_limited', { requestId, actorHash, pageType: pageContext.pageType });
    return jsonError('rate_limited', 429, requestId, {
      'Retry-After': String(rateLimit.retryAfterSeconds),
    });
  }

  const lastUserMessage = parsedMessages.messages.at(-1)?.content || '';
  const safety = deterministicSafetyReply(lastUserMessage, pageContext.locale);
  if (safety) {
    logXiaoyaEvent('deterministic_reply', {
      requestId,
      actorHash,
      pageType: pageContext.pageType,
      durationMs: Date.now() - startedAt,
      safetyKind: safety.kind,
    });
    return deterministicResponse(requestId, safety.reply, safety.suggestions);
  }

  const llmConfig = getLLMConfig();
  if (!llmConfig) {
    logXiaoyaEvent('request_failed', {
      requestId,
      actorHash,
      pageType: pageContext.pageType,
      errorCode: 'llm_not_configured',
    });
    return jsonError('llm_not_configured', 503, requestId);
  }

  const [memberContext, documents] = await Promise.all([
    getXiaoyaMemberContext(memberId),
    flags.ragEnabled ? loadXiaoyaKnowledge() : Promise.resolve([]),
  ]);
  const retrievalQuery = parsedMessages.messages
    .filter(message => message.role === 'user')
    .slice(-2)
    .map(message => message.content)
    .join('\n');
  const retrieved = flags.ragEnabled
    ? retrieveXiaoyaKnowledge(retrievalQuery, pageContext, documents)
    : [];
  const systemPrompt = buildXiaoyaSystemPrompt({
    pageContext,
    memberContext,
    knowledgeContext: buildXiaoyaKnowledgeContext(retrieved),
  });
  const chatMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...parsedMessages.messages,
  ];
  const suggestions = suggestionsForPage(pageContext);
  const upstream = await createChatCompletionStream({
    messages: chatMessages,
    temperature: 0.35,
    maxTokens: 700,
    timeoutMs: 60000,
  });
  if (!upstream) {
    logXiaoyaEvent('request_failed', {
      requestId,
      actorHash,
      pageType: pageContext.pageType,
      provider: llmConfig.provider,
      model: llmConfig.model,
      knowledgeIds: retrieved.map(document => document.id),
      durationMs: Date.now() - startedAt,
      errorCode: 'upstream_unavailable',
    });
    return jsonError('upstream_unavailable', 502, requestId);
  }

  let cancelled = false;
  const output = new ReadableStream<Uint8Array>({
    async start(controller) {
      let emitted = false;
      try {
        controller.enqueue(encodeEvent({ type: 'meta', requestId, suggestions }));
        for await (const text of upstream.chunks) {
          if (cancelled) return;
          emitted = true;
          controller.enqueue(encodeEvent({ type: 'delta', text }));
        }
        if (!emitted) throw new Error('empty_stream');
        if (!cancelled) {
          controller.enqueue(encodeEvent({ type: 'done', requestId, suggestions }));
          controller.close();
        }
        logXiaoyaEvent('request_completed', {
          requestId,
          actorHash,
          pageType: pageContext.pageType,
          provider: upstream.provider,
          model: upstream.model,
          knowledgeIds: retrieved.map(document => document.id),
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        if (!cancelled) {
          const code = error instanceof Error && error.message === 'empty_stream'
            ? 'empty_stream'
            : 'stream_failed';
          controller.enqueue(encodeEvent({
            type: 'error',
            requestId,
            code,
            message: '小芽暂时没有接上，请稍后再试。',
          }));
          controller.close();
          logXiaoyaEvent('request_failed', {
            requestId,
            actorHash,
            pageType: pageContext.pageType,
            provider: upstream.provider,
            model: upstream.model,
            knowledgeIds: retrieved.map(document => document.id),
            durationMs: Date.now() - startedAt,
            errorCode: code,
          });
        }
      }
    },
    cancel() {
      cancelled = true;
      upstream.cancel();
    },
  });

  return new Response(output, { headers: streamHeaders(requestId) });
}
