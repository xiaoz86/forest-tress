import { AsyncLocalStorage } from 'node:async_hooks';
import { channel } from 'node:diagnostics_channel';

export type TtsRequestTrace = {
  sendHeadersMs?: number;
  bodySentMs?: number;
  responseHeadersMs?: number;
  requestErrorMs?: number;
  errorCode?: string;
  remoteFamily?: 'IPv4' | 'IPv6';
};

type TraceContext = { started: number; trace: TtsRequestTrace; request?: object; active: boolean };
type RequestEvent = { request?: object; socket?: { remoteFamily?: string }; error?: { code?: unknown } };
const current = new AsyncLocalStorage<TraceContext>();
const requests = new WeakMap<object, TraceContext>();

channel('undici:request:create').subscribe(message => {
  const { request } = message as RequestEvent;
  const context = current.getStore();
  if (!context?.active || context.request || !request) return;
  context.request = request;
  requests.set(request, context);
});

function observe(name: string, record: (trace: TtsRequestTrace, elapsed: number, event: RequestEvent) => void) {
  channel(name).subscribe(message => {
    const event = message as RequestEvent;
    const context = event.request && requests.get(event.request);
    if (context?.active) record(context.trace, Date.now() - context.started, event);
  });
}

observe('undici:client:sendHeaders', (trace, elapsed, event) => {
  trace.sendHeadersMs ??= elapsed;
  const family = event.socket?.remoteFamily;
  if (family === 'IPv4' || family === 'IPv6') trace.remoteFamily = family;
});
observe('undici:request:bodySent', (trace, elapsed) => { trace.bodySentMs ??= elapsed; });
observe('undici:request:headers', (trace, elapsed) => { trace.responseHeadersMs ??= elapsed; });
observe('undici:request:error', (trace, elapsed, event) => {
  trace.requestErrorMs ??= elapsed;
  const code = event.error?.code;
  if (typeof code === 'string' && /^(?:UND_ERR_[A-Z_]+|E[A-Z]+|ABORT_ERR)$/.test(code)) trace.errorCode = code;
});

/** 仅跟踪 run 内第一个出站请求；不保留 URL、请求头、正文、具体 IP 或错误消息。 */
export async function traceTtsRequest<T>(
  run: () => Promise<T>,
  onTrace: (trace: TtsRequestTrace) => void,
): Promise<T> {
  const context: TraceContext = { started: Date.now(), trace: {}, active: true };
  try {
    return await current.run(context, run);
  } finally {
    context.active = false;
    if (context.request) requests.delete(context.request);
    onTrace({ ...context.trace });
  }
}
