import { createClient } from '@supabase/supabase-js';
import { after, NextRequest, NextResponse } from 'next/server';
import { normalizeCodeInput } from '@/lib/loginCode';
import { toPublicNodes } from '@/lib/publicNode';
import { consumeCode, issueCode } from '@/lib/loginCodeStore';
import { notifyLoginCode } from '@/lib/notify';
import { matchNodesAI, type MatchedNode } from '@/lib/match';
import { generateKeywordsAI } from '@/lib/keywords';
import { notifyNewNode, notifyWelcome, getSiteOrigin } from '@/lib/notify';
import { getLocale } from '@/lib/locale';
import {
  signLoginToken,
  signMemberSession,
  MEMBER_COOKIE,
  MEMBER_COOKIE_MAX_AGE,
  SESSION_COOKIE,
  VERIFIED_EMAIL_COOKIE,
  verifyVerifiedEmail,
} from '@/lib/auth';
import type { NodeCard, Work, AIRecommendation } from '@/lib/supabase';

const MAX_WORKS_AT_JOIN = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 发码那一步的 IP 限流。
 *
 * 这条路和 /api/login 打的是同一个 issueCode + notifyLoginCode，那边有
 * 10 分钟 10 次的闸，这边一直没有——于是「往任意地址发验证码信」这件事
 * 从这个接口是敞开的。issueCode 自带的 60 秒冷却按邮箱算，挡的是
 * 「同一个地址连着要码」，对「换一批地址接着发」完全不起作用。
 *
 * 被烧的不是收件人，是发信域名：没人要过的验证码信会攒出投诉率和退信率，
 * Resend 的信誉一旦烧掉，全站的登录码都进不去收件箱——而登录没有备用通道，
 * 那就是整体不可用。
 *
 * 只拦发信那一支：填验证码、以及带着凭据的最终提交都不该占这个额度，
 * 否则正常人填一次表就能把自己锁在外面。
 */
const SEND_WINDOW_MS = 10 * 60 * 1000;
const MAX_SENDS_PER_IP = 10;
const sendBuckets = new Map<string, number[]>();

function sendRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (sendBuckets.get(ip) || []).filter(time => now - time < SEND_WINDOW_MS);
  if (recent.length >= MAX_SENDS_PER_IP) {
    sendBuckets.set(ip, recent);
    return true;
  }
  recent.push(now);
  sendBuckets.set(ip, recent);
  // 进程内的 Map，多实例下不精确——这是全站既有取舍（/api/login、
  // /api/login/code 同款）。这里跟着做上限清理，别让它无限涨。
  if (sendBuckets.size > 5000) {
    for (const key of Array.from(sendBuckets.keys()).slice(0, 2500)) sendBuckets.delete(key);
  }
  return false;
}

function makeWorkId(): string {
  return `w_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeWorks(input: unknown): Work[] {
  if (!Array.isArray(input)) return [];
  const out: Work[] = [];
  const now = new Date().toISOString();
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const title = typeof r.title === 'string' ? r.title.trim().slice(0, 80) : '';
    if (!title) continue;
    const desc = typeof r.desc === 'string' ? r.desc.trim().slice(0, 240) : '';
    const urlRaw = typeof r.url === 'string' ? r.url.trim().slice(0, 500) : '';
    const url = urlRaw && /^https?:\/\//i.test(urlRaw) ? urlRaw : '';
    const w: Work = { id: makeWorkId(), title, created_at: now };
    if (desc) w.desc = desc;
    if (url) w.url = url;
    out.push(w);
    if (out.length >= MAX_WORKS_AT_JOIN) break;
  }
  return out;
}

/** 将匹配结果裁剪成可持久化的快照（不含被推荐成员的私密字段）。 */
export function toRecommendationSnapshot(m: MatchedNode): AIRecommendation {
  return {
    id: m.id || '',
    name: m.name || '',
    ...(m.city ? { city: m.city } : {}),
    ...(m.doing ? { doing: m.doing } : {}),
    ...(m.avatar_url ? { avatar_url: m.avatar_url } : {}),
    matchType: m.matchType,
    reasons: Array.isArray(m.reasons) ? m.reasons.slice(0, 5) : [],
    ...(m.aiSummary ? { aiSummary: m.aiSummary } : {}),
    ...(m.aiCoCreate ? { aiCoCreate: m.aiCoCreate } : {}),
  };
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: 'Supabase is not configured' },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await request.json();
    const rawEmail = typeof body.email === 'string' ? body.email.trim() : '';
    if (!rawEmail) {
      return NextResponse.json({ error: 'email-required' }, { status: 400 });
    }
    if (!EMAIL_RE.test(rawEmail)) {
      return NextResponse.json({ error: 'email-invalid' }, { status: 400 });
    }
    const email = rawEmail.toLowerCase();
    const proof = verifyVerifiedEmail(request.cookies.get(VERIFIED_EMAIL_COOKIE)?.value || '');
    const alreadyVerified = proof.ok && proof.email === email;

    // 同邮箱已注册 → 引导去登录
    {
      const { data: existing } = await supabase
        .from('node_cards')
        .select('id, email')
        .ilike('email', email)
        .limit(20);
      const exactMatch = existing?.some(
        row => typeof row.email === 'string' && row.email.trim().toLowerCase() === email,
      );
      if (exactMatch) {
        return NextResponse.json({ error: 'email-taken' }, { status: 409 });
      }
    }

    /**
     * 邮箱验证：走完七步之后还要填一次验证码，验过了才真的建号。
     *
     * 为什么必须有这一步：原来插入成功就当场发会话 cookie，全程不验证邮箱。
     * 而节点详情页把成员的微信号和邮箱发给「登录了的人」——等于任何人
     * 编一个邮箱就能拿到整份通讯录。验证码是把「这个邮箱确实是本人的」
     * 这件事钉死的最轻办法。
     *
     * 第一次提交（没带 code）：发码，回 needCode，前端展开验证码那一步。
     * 第二次提交（带 code）：核销，通过了才往下建号。
     */
    const code = normalizeCodeInput(body.code);
    if (!alreadyVerified && !code) {
      /**
       * 回的仍是 needCode，和正常发码一模一样。
       *
       * 换成 429 会把「这个 IP 发过几封」漏给对方，而且真被限住的人
       * 看到的界面本来也一样——他能做的只有等。信没发出去，
       * 那个码就还是上一个，60 秒后按「重新发送」会真的补一封。
       */
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      if (sendRateLimited(ip)) {
        console.warn('[api/join] code send rate limited');
        return NextResponse.json({ needCode: true });
      }
      const locale = await getLocale();
      after(async () => {
        const issued = await issueCode(supabase, email, null);
        if (!issued.ok) {
          if (issued.reason === 'cooldown') {
            console.log('[api/join] shared email cooldown active');
            return;
          }
          console.error('[api/join] cannot issue code', issued.reason);
          return;
        }
        const delivery = await notifyLoginCode(email, issued.code, locale, 'signup');
        if (!delivery.ok) {
          console.error('[api/join] code email not accepted', delivery.reason);
        }
      });
      return NextResponse.json({ needCode: true });
    }

    if (!alreadyVerified && code) {
      const verdict = await consumeCode(supabase, email, code);
      if (!verdict.ok) {
        return NextResponse.json({ error: 'code-invalid' }, { status: 400 });
      }
    }

    const baseRow: Record<string, unknown> = {
      // 码是刚刚核销掉的，所以这个邮箱确实是本人的
      email_verified_at: new Date().toISOString(),
      name: body.name,
      city: body.city,
      doing: body.doing,
      topics: body.topics,
      experience: body.experience,
      offer: body.offer,
      seeking: body.seeking,
      product: body.product,
      wechat: body.wechat,
      email,
    };
    const rowWithInterests = { ...baseRow, interests: body.interests || '' };
    // wizard 新加：beauty（生命里的美）+ seed（心里的那颗种子）
    const rowWithBeautySeed = {
      ...rowWithInterests,
      beauty: typeof body.beauty === 'string' ? body.beauty.trim() : '',
      seed: typeof body.seed === 'string' ? body.seed.trim() : '',
    };
    const cleanedWorks = sanitizeWorks(body.works);
    const rowWithWorks = cleanedWorks.length > 0
      ? { ...rowWithBeautySeed, works: cleanedWorks }
      : rowWithBeautySeed;

    let { data, error } = await supabase
      .from('node_cards')
      .insert([rowWithWorks])
      .select();

    if (error && /works/i.test(error.message) && /column/i.test(error.message)) {
      console.warn('[api/join] works column missing, retrying without it');
      ({ data, error } = await supabase
        .from('node_cards')
        .insert([rowWithBeautySeed])
        .select());
    }
    if (error && /(beauty|seed)/i.test(error.message) && /column/i.test(error.message)) {
      console.warn('[api/join] beauty/seed column missing, retrying without it');
      ({ data, error } = await supabase
        .from('node_cards')
        .insert([rowWithInterests])
        .select());
    }
    if (error && /interests/i.test(error.message)) {
      console.warn('[api/join] interests column missing, retrying without it');
      ({ data, error } = await supabase
        .from('node_cards')
        .insert([baseRow])
        .select());
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const newNode = (data?.[0] || null) as NodeCard | null;
    let matches: MatchedNode[] = [];
    let welcomeEmailSent = false;
    if (newNode) {
      const signed = signLoginToken(newNode.id || '');
      if (!signed.ok) {
        console.error('[api/join] AUTH_SECRET not set, welcome link not sent');
      }

      // 主理人通知不阻塞注册响应，但由 Next.js 保证函数生命周期持续到发送结束。
      after(async () => {
        const delivery = await notifyNewNode(newNode);
        if (!delivery.ok) {
          console.error('[api/join] host notification not accepted', {
            reason: delivery.reason,
            status: delivery.status,
          });
        }
      });

      if (signed.ok) {
        // 按注册那一刻的语言发信：英文界面注册的人，收到的是英文欢迎信
        const welcomeEmailResult = await notifyWelcome(
          newNode,
          `${getSiteOrigin()}/api/login/verify?token=${encodeURIComponent(signed.token)}`,
          await getLocale(),
        );
        welcomeEmailSent = welcomeEmailResult.ok;
        if (!welcomeEmailResult.ok) {
          console.error('[api/join] welcome email not accepted', {
            reason: welcomeEmailResult.reason,
            status: welcomeEmailResult.status,
          });
        }
      }

      const { data: allNodes } = await supabase
        .from('node_cards')
        .select('*');
      const others = ((allNodes || []) as NodeCard[]).filter(
        n => n.id !== newNode.id,
      );

      const [aiMatches, aiKeywords] = await Promise.all([
        matchNodesAI(newNode, others, 3, await getLocale()),
        generateKeywordsAI(newNode, 6),
      ]);
      matches = aiMatches;

      // 关键词写回
      if (aiKeywords.length > 0 && newNode.id) {
        const { error: updateErr } = await supabase
          .from('node_cards')
          .update({ keywords: aiKeywords })
          .eq('id', newNode.id);
        if (updateErr && !/keywords/i.test(updateErr.message)) {
          console.error('[api/join] keyword save failed', updateErr.message);
        }
      }

      // AI 推荐快照写回（让本人/管理员日后能在个人页看到）
      if (newNode.id && matches.length > 0) {
        const snapshot = matches.map(toRecommendationSnapshot);
        const { error: recErr } = await supabase
          .from('node_cards')
          .update({
            ai_recommendations: snapshot,
            ai_recommendations_at: new Date().toISOString(),
          })
          .eq('id', newNode.id);
        if (recErr && !/ai_recommendations/i.test(recErr.message)) {
          console.error('[api/join] recommendations save failed', recErr.message);
        }
      }
    }

    const res = NextResponse.json({
      success: true,
      data,
      // 别人的卡不带联系方式出门
      matches: toPublicNodes(matches),
      memberId: newNode?.id,
      welcomeEmailSent,
    });

    if (newNode?.id) {
      res.cookies.set(MEMBER_COOKIE, newNode.id, {
        httpOnly: false,
        sameSite: 'lax',
        path: '/',
        maxAge: MEMBER_COOKIE_MAX_AGE,
      });
      const session = signMemberSession(newNode.id);
      if (session.ok) {
        res.cookies.set(SESSION_COOKIE, session.token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: MEMBER_COOKIE_MAX_AGE,
        });
      }
      res.cookies.set(VERIFIED_EMAIL_COOKIE, '', { path: '/', maxAge: 0 });
    }

    return res;
  } catch (err) {
    console.error('[api/join] unexpected error', err);
    return NextResponse.json(
      { error: 'Failed to submit' },
      { status: 500 }
    );
  }
}
