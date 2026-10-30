/**
 * 阿里云百炼（DashScope）的公共底座：配置、临时令牌、错误分类、出站 WebSocket。
 *
 * 只在服务端用——长期 Key 只从这里读，绝不进前端包。这里故意不 `import 'server-only'`：
 * 那个包在 node --test 下会直接抛错，纯函数（错误分类、熔断）就测不了了。
 * 前端要复用的识别事件归约放在 lib/asrEvents.ts（纯函数，不引这个文件）。
 *
 * 日志纪律：只记错误类别、状态码、耗时。不打印 Key、st- 令牌、音频或 base64。
 */
import { OutboundWebSocket } from './outboundWebSocket.ts';

export const DEFAULT_DASHSCOPE_REGION = 'cn-beijing';
export const DEFAULT_ASR_MODEL = 'qwen3-asr-flash-realtime';
export const DEFAULT_TTS_MODEL = 'qwen-audio-3.1-tts-flash';

type Env = Record<string, string | undefined>;

export type DashscopeConfig = {
  apiKey: string;
  workspaceId: string;
  region: string;
  /** 业务空间专属域名，形如 ws-xxxx.cn-beijing.maas.aliyuncs.com */
  host: string;
  asrModel: string;
  ttsModel: string;
};

/**
 * 业务空间 ID 和地域会被拼进域名，所以只放行字母、数字和连字符——
 * 环境变量写错（多了斜杠、空格、整段 URL）时宁可当作「没配」，
 * 也不能拼出一个指向别处的地址，把 Key 发过去。
 */
const HOST_LABEL = /^[a-z0-9][a-z0-9-]{0,62}$/i;

export function getDashscopeConfig(env: Env = process.env): DashscopeConfig | null {
  const apiKey = env.DASHSCOPE_API_KEY?.trim();
  const workspaceId = env.DASHSCOPE_WORKSPACE_ID?.trim();
  if (!apiKey || !workspaceId || !HOST_LABEL.test(workspaceId)) return null;
  const region = env.DASHSCOPE_REGION?.trim() || DEFAULT_DASHSCOPE_REGION;
  if (!HOST_LABEL.test(region)) return null;
  return {
    apiKey,
    workspaceId,
    region,
    host: `${workspaceId}.${region}.maas.aliyuncs.com`,
    asrModel: env.DASHSCOPE_ASR_MODEL?.trim() || DEFAULT_ASR_MODEL,
    ttsModel: env.DASHSCOPE_TTS_MODEL?.trim() || DEFAULT_TTS_MODEL,
  };
}

/**
 * 浏览器直连识别专用的那把 Key（签 st- 临时令牌只用它）。
 *
 * 为什么不能用主 Key 签：st- 令牌继承签发 Key 的全部权限，而令牌是要交到浏览器手里的。
 * 2026-10-28 实测，主 Key 签出的令牌能直接调 TTS 合成任意文字（用复刻的真人嗓音），
 * 也能列出业务空间里的复刻音色（按文档还能删）——/speak 的签名和对话闸门全被绕过。
 * 所以直连要另开一个业务空间，里面只开通 qwen3-asr-flash-realtime，在那里建 Key：
 * 令牌落到谁手里，能做的也只有「识别一段音频」。
 *
 * 两个都要配；和主 Key、主业务空间相同的话等于没隔离，按没配处理（直连自动关掉，
 * 识别退回整段上传 /voice，用户无感）。地域和模型跟主配置走。
 */
export function getDashscopeDirectAsrConfig(env: Env = process.env): DashscopeConfig | null {
  const main = getDashscopeConfig(env);
  if (!main) return null;
  const apiKey = env.DASHSCOPE_ASR_DIRECT_API_KEY?.trim();
  const workspaceId = env.DASHSCOPE_ASR_DIRECT_WORKSPACE_ID?.trim();
  if (!apiKey || !workspaceId || !HOST_LABEL.test(workspaceId)) return null;
  if (apiKey === main.apiKey || workspaceId === main.workspaceId) return null;
  return {
    ...main,
    apiKey,
    workspaceId,
    host: `${workspaceId}.${main.region}.maas.aliyuncs.com`,
  };
}

/** 实时识别的 WebSocket 地址；带上 st- 临时令牌就是给浏览器直连用的那一条 */
export function buildAsrRealtimeUrl(config: DashscopeConfig, tempToken?: string): string {
  const base = `wss://${config.host}/api-ws/v1/realtime?model=${encodeURIComponent(config.asrModel)}`;
  return tempToken ? `${base}&api_key=${encodeURIComponent(tempToken)}` : base;
}

export function ttsEndpoint(config: DashscopeConfig): string {
  return `https://${config.host}/api/v1/services/audio/tts/SpeechSynthesizer`;
}

/**
 * 临时令牌只在公共域名上签发（业务空间域名没有这个接口），按地域分两个。
 * 北京之外目前只有新加坡；认不出的地域按北京处理，签不出来自然会报错降级。
 */
function tokenEndpoint(region: string): string {
  const origin = region === 'ap-southeast-1'
    ? 'https://dashscope-intl.aliyuncs.com'
    : 'https://dashscope.aliyuncs.com';
  return `${origin}/api/v1/tokens`;
}

// —— 错误分类 ——

/**
 * 上游失败归成四类，降级逻辑只看类别：
 * - auth：Key 错、权限没开（ASR 类模型要在业务空间里逐个开通）
 * - quota：免费额度用完（未实名账号会返回 AllocationQuota.FreeTierOnly）或欠费
 * - rate：限流（ASR RPM 1200、TTS RPM 180，都是账号级共用）
 * - upstream：其余一切——超时、5xx、握手失败、协议意外
 * 另有三种本地原因：timeout、aborted（用户打断）、not-configured（没配 Key）。
 */
export type DashscopeErrorKind =
  | 'auth'
  | 'quota'
  | 'rate'
  | 'upstream'
  | 'timeout'
  | 'aborted'
  | 'not-configured';

export class DashscopeError extends Error {
  readonly kind: DashscopeErrorKind;
  readonly status?: number;
  readonly code?: string;

  constructor(kind: DashscopeErrorKind, detail?: { status?: number; code?: string; message?: string }) {
    // message 只放类别和上游错误码，不放上游原文——原文偶尔会回显请求参数
    super(`dashscope ${kind}${detail?.code ? ` ${detail.code}` : ''}${detail?.status ? ` (${detail.status})` : ''}`);
    this.name = 'DashscopeError';
    this.kind = kind;
    this.status = detail?.status;
    this.code = detail?.code;
  }
}

export function classifyDashscopeError(input: {
  status?: number;
  code?: string;
  message?: string;
}): 'auth' | 'quota' | 'rate' | 'upstream' {
  const code = (input.code || '').toLowerCase();
  const message = (input.message || '').toLowerCase();
  // 额度要先判：FreeTierOnly 是 403，按状态码走会被误归成 auth
  if (
    code.includes('freetieronly') ||
    code.includes('allocationquota') ||
    code.includes('arrearage') ||
    code.includes('quotaexhausted') ||
    message.includes('free tier') ||
    message.includes('arrearage')
  ) {
    return 'quota';
  }
  if (
    input.status === 429 ||
    code.includes('throttling') ||
    code.includes('ratequota') ||
    code.includes('ratelimit') ||
    message.includes('rate limit')
  ) {
    return 'rate';
  }
  if (
    input.status === 401 ||
    input.status === 403 ||
    code.includes('invalidapikey') ||
    code.includes('unauthorized') ||
    code.includes('accessdenied') ||
    code.includes('modelnotactivated') ||
    code.includes('unauthenticated')
  ) {
    return 'auth';
  }
  return 'upstream';
}

/** 任意异常 → DashscopeError；中止和超时单独认出来，别和上游故障混在一起计入熔断 */
export function toDashscopeError(err: unknown, signal?: AbortSignal): DashscopeError {
  if (err instanceof DashscopeError) return err;
  if (signal?.aborted) {
    const reason = signal.reason as { name?: string } | undefined;
    return new DashscopeError(reason?.name === 'TimeoutError' ? 'timeout' : 'aborted');
  }
  const name = (err as { name?: string } | null)?.name;
  if (name === 'TimeoutError') return new DashscopeError('timeout');
  if (name === 'AbortError') return new DashscopeError('aborted');
  return new DashscopeError('upstream');
}

/** 合并多个中止信号（用户打断 + 超时）；Node 20+ 有 AbortSignal.any，没有就手动接 */
export function anySignal(signals: (AbortSignal | undefined)[]): AbortSignal {
  const list = signals.filter((s): s is AbortSignal => Boolean(s));
  const any = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (any) return any(list);
  const ctrl = new AbortController();
  for (const s of list) {
    if (s.aborted) {
      ctrl.abort(s.reason);
      break;
    }
    s.addEventListener('abort', () => ctrl.abort(s.reason), { once: true });
  }
  return ctrl.signal;
}

// —— 临时令牌 ——

/**
 * 签一个 st- 临时令牌（默认 60 秒；实测请求更短也会给约 60 秒，所以别指望靠缩短有效期限权）。
 * 它继承签发 Key 的全部权限，所以 config 必须是 getDashscopeDirectAsrConfig() 的那把——
 * 只开通了实时识别的专用空间，绝不能用主 Key（原因见那个函数的注释）。
 *
 * 浏览器直连的用法（URL 参数 api_key=st-…）不在官方文档里，是 2026-10-26 实测可用的；
 * 前端那边任何一步失败都会退回整段上传，所以这条路断了用户也无感。
 */
export async function createDashscopeTempToken(
  config: DashscopeConfig,
  { expireInSeconds = 60, timeoutMs = 4_000, signal }: { expireInSeconds?: number; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<string> {
  const seconds = Math.max(1, Math.min(1800, Math.round(expireInSeconds)));
  const combined = anySignal([signal, AbortSignal.timeout(timeoutMs)]);
  let res: Response;
  try {
    res = await fetch(`${tokenEndpoint(config.region)}?expire_in_seconds=${seconds}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: combined,
    });
  } catch (err) {
    throw toDashscopeError(err, combined);
  }
  const json = (await res.json().catch(() => ({}))) as { token?: unknown; code?: string; message?: string };
  if (!res.ok || typeof json.token !== 'string' || !json.token.startsWith('st-')) {
    throw new DashscopeError(classifyDashscopeError({ status: res.status, code: json.code, message: json.message }), {
      status: res.status,
      code: json.code,
    });
  }
  return json.token;
}

// —— 出站 WebSocket ——

/** 转写会话用到的那一小撮 WebSocket 接口；测试里可以换成假的 */
export type RealtimeSocket = {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener: EventTarget['addEventListener'];
  removeEventListener: EventTarget['removeEventListener'];
};

export type RealtimeSocketFactory = (url: string, headers: Record<string, string>) => RealtimeSocket;

/**
 * 默认用自己的出站 WebSocket（lib/outboundWebSocket），不用 Node 的全局 WebSocket：
 * 百炼在 session.finished 之后不断开、也不回关闭帧，标准 WebSocket 会一直挂在 CLOSING、漏一条 TCP 连接。
 */
export const defaultRealtimeSocketFactory: RealtimeSocketFactory = (url, headers) =>
  new OutboundWebSocket(url, { headers });

/**
 * 从函数内部主动连出去的 WebSocket（Vercel 接不了入站 WS，但出站没问题）。
 * 鉴权放在握手请求头里（浏览器 API 做不到，所以浏览器那边用 st- 临时令牌，见 voice/token 路由）。
 * 握手被拒时能拿到 HTTP 状态码：401/403 归 auth，429 归 rate，其余 upstream。
 */
export function openDashscopeSocket(
  url: string,
  {
    headers = {},
    signal,
    timeoutMs = 5_000,
    socketFactory = defaultRealtimeSocketFactory,
  }: {
    headers?: Record<string, string>;
    signal?: AbortSignal;
    timeoutMs?: number;
    socketFactory?: RealtimeSocketFactory;
  } = {},
): Promise<RealtimeSocket> {
  if (signal?.aborted) return Promise.reject(toDashscopeError(signal.reason, signal));

  return new Promise<RealtimeSocket>((resolve, reject) => {
    let ws: RealtimeSocket;
    try {
      ws = socketFactory(url, headers);
    } catch {
      reject(new DashscopeError('upstream', { code: 'ws-construct' }));
      return;
    }
    let settled = false;
    const finish = (err: DashscopeError | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      ws.removeEventListener('open', onOpen);
      ws.removeEventListener('error', onError);
      ws.removeEventListener('close', onClose);
      if (err) {
        try { ws.close(); } catch { /* 已经断了 */ }
        reject(err);
      } else {
        resolve(ws);
      }
    };
    const onOpen = () => finish(null);
    const onError = (event: Event) => {
      const status = (event as { status?: number }).status;
      const kind = status ? classifyDashscopeError({ status }) : 'upstream';
      finish(new DashscopeError(kind, { status, code: 'ws-handshake' }));
    };
    const onClose = () => finish(new DashscopeError('upstream', { code: 'ws-handshake' }));
    const onAbort = () => finish(toDashscopeError(signal?.reason, signal));
    const timer = setTimeout(() => finish(new DashscopeError('timeout')), timeoutMs);
    ws.addEventListener('open', onOpen);
    ws.addEventListener('error', onError);
    ws.addEventListener('close', onClose);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

// —— 熔断 ——

/**
 * 同一实例上连续失败几次就先别试了：每次都等一个超时再降级，
 * 等于让每个用户都替上游的故障多等几秒。冷却期过后放一个请求去探路。
 * 只数上游自己的失败——用户打断（aborted）不算。
 */
export function createCircuitBreaker({ threshold = 3, coolDownMs = 60_000 } = {}) {
  let failures = 0;
  let openUntil = 0;
  return {
    isOpen(now = Date.now()): boolean {
      return now < openUntil;
    },
    success(): void {
      failures = 0;
      openUntil = 0;
    },
    failure(now = Date.now()): void {
      failures += 1;
      if (failures >= threshold) {
        openUntil = now + coolDownMs;
        failures = 0;
      }
    },
  };
}
