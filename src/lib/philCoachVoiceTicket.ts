/**
 * 浏览器直连识别的「进门票」：/api/phil-coach/voice/token 只给拿着票的人签 st- 令牌。
 *
 * 为什么要票：那个路由原来只有同源校验，比的是 Origin/Referer 和 Host——两个都是请求头，
 * curl 随手就能伪造；它只挡得住别的网页在用户浏览器里替它要令牌（这一点 CORS 本来就挡了）。
 * 现在票由 /phil-coach 页面在服务端渲染时签好、当 prop 交给组件：想要令牌，
 * 得先像一个真访客那样把页面打开。
 *
 * 票绑定打开页面时的 IP（IPv6 绑 /64 前缀，系统轮换隐私地址时不至于作废），有效期 12 小时。
 * 换了网络、页面开过了夜，票就验不过——前端随之退回整段上传 /voice，用户无感，刷新页面就有新票。
 *
 * 说清楚它挡不住什么：一个先抓页面、再要令牌的脚本。真正的限权在令牌本身——
 * 只用只开通了实时识别的专用 Key 签（见 dashscope.ts 的 getDashscopeDirectAsrConfig），
 * 令牌落到谁手里都只能识别音频。票的作用是把「一行 curl」抬高到「每个 IP 先抓一次页面」，
 * 再加上按 IP 限流，额度不至于被随手刷光。
 *
 * 和对话的三道闸门（访客 8 轮、免费期、薄卡）不是一回事：那几道都按对话轮数判，
 * 开录的那一刻还不知道是第几轮；而且闸门挡的是「回复」，转写出来的字本来就要过对话接口才有回应。
 *
 * 只在服务端用（要读密钥）。纯 node:crypto，不依赖 Next，方便 node --test 直接测。
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { getSpeechSigningSecret } from './philCoachSpeechSign.ts';

type Env = Record<string, string | undefined>;

export const VOICE_TICKET_VERSION = 'vt1';
export const VOICE_TICKET_TTL_SECONDS = 12 * 60 * 60;
const MAX_TICKET_LENGTH = 160;

/**
 * 票的密钥从朗读签名的密钥再派生一把：两边各用各的，
 * 一边被拿去滥用（比如票被批量抓走），不会顺带让另一边的签名也能伪造。
 */
export function getVoiceTicketSecret(env: Env = process.env): string | null {
  const base = getSpeechSigningSecret(env);
  if (!base) return null;
  return createHmac('sha256', base).update('phil-coach-voice-ticket-v1').digest('base64url');
}

/** IPv6 → 前 4 组（/64）。这里只要求「同一个地址每次算出来都一样」，内嵌 IPv4 的写法不必细究 */
function ipv6Prefix(addr: string): string {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(addr);
  if (mapped) return mapped[1];
  const double = addr.indexOf('::');
  const head = (double >= 0 ? addr.slice(0, double) : addr).split(':').filter(Boolean);
  const tail = double >= 0 ? addr.slice(double + 2).split(':').filter(Boolean) : [];
  const fill = double >= 0 ? Array(Math.max(0, 8 - head.length - tail.length)).fill('0') : [];
  const groups = [...head, ...fill, ...tail].slice(0, 4);
  return `${groups.map(g => (parseInt(g, 16) || 0).toString(16)).join(':')}::/64`;
}

/** 绑定用的 IP 键：IPv4 原样；IPv6 取 /64；认不出的（比如本机开发没有转发头时的 unknown）原样 */
export function ticketIpKey(ip: string): string {
  const addr = ip.trim().replace(/^\[|\]$/g, '').split('%')[0];
  if (isIP(addr) === 6) return ipv6Prefix(addr.toLowerCase());
  return addr || 'unknown';
}

function hmac(secret: string, exp: number, ipKey: string): string {
  return createHmac('sha256', secret).update(`${VOICE_TICKET_VERSION}|${exp}|${ipKey}`).digest('base64url');
}

export function issueVoiceTicket(
  ip: string,
  secret: string,
  { now = Date.now(), ttlSeconds = VOICE_TICKET_TTL_SECONDS }: { now?: number; ttlSeconds?: number } = {},
): string {
  const exp = Math.floor(now / 1000) + ttlSeconds;
  return `${VOICE_TICKET_VERSION}.${exp}.${hmac(secret, exp, ticketIpKey(ip))}`;
}

export type VoiceTicketVerdict = 'ok' | 'invalid' | 'expired';

export function verifyVoiceTicket(
  ticket: unknown,
  ip: string,
  secret: string,
  now = Date.now(),
): VoiceTicketVerdict {
  if (typeof ticket !== 'string' || !ticket || ticket.length > MAX_TICKET_LENGTH) return 'invalid';
  const [version, expRaw, sig, extra] = ticket.split('.');
  if (version !== VOICE_TICKET_VERSION || extra !== undefined || !sig || !/^\d{1,12}$/.test(expRaw ?? '')) {
    return 'invalid';
  }
  const exp = Number(expRaw);
  const expected = Buffer.from(hmac(secret, exp, ticketIpKey(ip)));
  const given = Buffer.from(sig);
  // 先比签名再看过期：伪造的、换了 IP 的一律是 invalid
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return 'invalid';
  const nowSec = Math.floor(now / 1000);
  if (exp < nowSec) return 'expired';
  // 签名对、exp 却远在未来：只可能是密钥泄露后自己签的
  if (exp > nowSec + VOICE_TICKET_TTL_SECONDS + 60) return 'invalid';
  return 'ok';
}
