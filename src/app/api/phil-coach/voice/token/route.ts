import { NextResponse } from 'next/server';
import {
  buildAsrRealtimeUrl,
  createDashscopeTempToken,
  DashscopeError,
  getDashscopeConfig,
  getDashscopeDirectAsrConfig,
} from '@/lib/dashscope';
import { clientIp, createMemoryRateLimiter } from '@/lib/memoryRateLimit';
import { getVoiceTicketSecret, verifyVoiceTicket } from '@/lib/philCoachVoiceTicket';
import { resolveVoiceStack } from '@/lib/voiceStack';

export const runtime = 'nodejs';
export const maxDuration = 10;

/**
 * 浏览器直连百炼实时识别用的一次性地址。
 *
 * Vercel 接不了入站 WebSocket，浏览器的 WebSocket 又设不了 Authorization 头，
 * 所以由这里用长期 Key 换一个 60 秒的 st- 临时令牌，拼进 wss 地址的 api_key 参数交给前端。
 * 这种传法不在官方文档里（2026-10-26 实测可用）——前端拿不到、连不上、出错、超时，
 * 都会立刻退回整段上传 /api/phil-coach/voice，用户无感。
 *
 * 令牌继承签发 Key 的全部权限，而它是要交到浏览器手里的——谁都能从这里拿到。
 * 所以这里只用「只开通了实时识别」的专用 Key 签（DASHSCOPE_ASR_DIRECT_*，见
 * lib/dashscope 的 getDashscopeDirectAsrConfig）：没配就整条路关掉（404），绝不退回用主 Key 签。
 * 主 Key 签的令牌实测能直接调 TTS 合成任意文字、能列复刻音色，等于绕过 /speak 的签名。
 *
 * 门槛三道，都在签令牌之前：
 * - 同源：Origin（没有就看 Referer）必须是本站或本机——挡别的网页在用户浏览器里替它要令牌；
 * - 进门票：/phil-coach 页面渲染时签的、绑 IP 的票（lib/philCoachVoiceTicket）——
 *   脚本得先像真访客一样打开页面；
 * - 按 IP 限流。
 * 发出去的只有令牌和专用空间的域名；任何长期 Key 都不出服务端。
 */

const TOKEN_TTL_SECONDS = 60;
// 一段录音一个令牌：五分钟二十段，正常对话碰不到
const isRateLimited = createMemoryRateLimiter({ max: 20, windowMs: 5 * 60 * 1000 });

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };
const MAX_BODY_BYTES = 1_024;

function isLocalHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.localhost')
  );
}

/**
 * 同源：Origin（没有就看 Referer）必须是本站或本机。
 * 这挡不住自己伪造请求头的脚本（那种由进门票和限流兜底），挡的是别的网页在用户浏览器里替它要令牌。
 */
function isSameOrigin(request: Request): boolean {
  const raw = request.headers.get('origin') || request.headers.get('referer');
  if (!raw || raw === 'null') return false;
  let source: URL;
  try {
    source = new URL(raw);
  } catch {
    return false;
  }
  if (isLocalHost(source.hostname)) return true;

  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (host && source.host === host) return true;
  const site = process.env.SITE_ORIGIN?.trim();
  if (site) {
    try {
      if (new URL(site).origin === source.origin) return true;
    } catch {
      // SITE_ORIGIN 写错了就当没配
    }
  }
  return false;
}

export async function POST(request: Request) {
  const stack = resolveVoiceStack(process.env);
  if (!getDashscopeConfig()) {
    return NextResponse.json({ error: 'asr-not-configured' }, { status: 503, headers: NO_STORE });
  }
  // asrDirect 已经要求专用 Key 配齐；这里再取一次是为了拿它来签，主 Key 一律不碰
  const direct = stack.asr === 'bailian' && stack.asrDirect ? getDashscopeDirectAsrConfig() : null;
  const ticketSecret = getVoiceTicketSecret();
  if (!direct || !ticketSecret) {
    return NextResponse.json({ error: 'direct-asr-off' }, { status: 404, headers: NO_STORE });
  }
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: NO_STORE });
  }
  const ip = clientIp(request);
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'too-many' }, { status: 429, headers: NO_STORE });
  }

  let ticket: unknown = null;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'too-large' }, { status: 413, headers: NO_STORE });
    }
    ticket = (JSON.parse(raw) as { ticket?: unknown } | null)?.ticket ?? null;
  } catch {
    ticket = null;
  }
  const verdict = verifyVoiceTicket(ticket, ip, ticketSecret);
  if (verdict !== 'ok') {
    // 过期、换了网络都正常：前端会退回整段上传
    return NextResponse.json(
      { error: verdict === 'expired' ? 'ticket-expired' : 'ticket-invalid' },
      { status: 403, headers: NO_STORE },
    );
  }

  const startedAt = Date.now();
  try {
    const token = await createDashscopeTempToken(direct, {
      expireInSeconds: TOKEN_TTL_SECONDS,
      signal: request.signal,
    });
    return NextResponse.json(
      { url: buildAsrRealtimeUrl(direct, token), expiresInSeconds: TOKEN_TTL_SECONDS },
      { headers: NO_STORE },
    );
  } catch (err) {
    const e = err instanceof DashscopeError ? err : new DashscopeError('upstream');
    // 只记类别、状态码和耗时；令牌和 Key 一律不进日志
    console.warn('[phil-voice] token failed', e.kind, e.status ?? '', e.code ?? '', `${Date.now() - startedAt}ms`);
    return NextResponse.json({ error: 'token-failed' }, { status: 502, headers: NO_STORE });
  }
}
