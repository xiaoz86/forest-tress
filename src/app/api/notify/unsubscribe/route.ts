import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { verifyUnsubscribeToken } from '@/lib/matchNotify';
import type { Locale } from '@/lib/locale';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 关掉「有新成员可能和你同频」这类撮合通知。
 *
 * 为什么分成 GET 和 POST 两步：
 * 邮件客户端和企业网关会**预取**信里的链接做安全扫描。GET 一旦直接改库，
 * 人还没点，退订就已经发生了——而且没有任何迹象，只会表现为「怎么再也收不到了」。
 * 所以 GET 只出一张确认页，真正的动作在 POST。
 *
 * RFC 8058 的一键退订也正是这么规定的：List-Unsubscribe-Post 让 Gmail /
 * Outlook 标题栏那颗「退订」按钮发 POST，同一个端点两边都吃得下。
 *
 * 凭证走链接自带的 HMAC，不要求登录——这封信本来就发给可能很久没回来的人，
 * 逼人先登录等于没有退订。
 */

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const COPY = {
  zh: {
    title: '退订推荐通知',
    confirmLead: '不再接收「有新成员可能和你同频」这类推荐邮件？',
    confirmNote: '验证码、欢迎信这些你自己触发的邮件不受影响，仍会正常收到。',
    confirmBtn: '确认不再接收',
    doneTitle: '已经关掉了',
    doneLead: '之后不会再给你发撮合推荐邮件。',
    doneNote: '想重新打开，登录后在个人页里可以改回来。',
    badTitle: '这条链接用不了',
    badLead: '链接不完整或已失效。如果你想退订，可以直接回复任意一封通知邮件告诉我们。',
    failTitle: '没能保存',
    failLead: '刚才那一下没写进去。请稍后再试一次，或直接回复邮件告诉我们。',
    home: '回到附近森林',
  },
  en: {
    title: 'Unsubscribe',
    confirmLead: 'Stop receiving “someone new might be a match for you” emails?',
    confirmNote:
      'Sign-in codes, welcome letters and anything else you trigger yourself are unaffected.',
    confirmBtn: 'Yes, stop sending these',
    doneTitle: 'Done',
    doneLead: 'You won’t receive match introductions from us again.',
    doneNote: 'To turn them back on, sign in and change it on your own page.',
    badTitle: 'This link doesn’t work',
    badLead:
      'The link is incomplete or has expired. If you want to unsubscribe, just reply to any of our emails and tell us.',
    failTitle: 'Couldn’t save that',
    failLead: 'It didn’t go through. Please try again shortly, or reply to the email and tell us.',
    home: 'Back to Nearby Forest',
  },
};

/** 这个页面不在站点导航里，也不该被索引——它只对着一条一次性链接。 */
function page(
  locale: Locale,
  title: string,
  lead: string,
  note: string,
  form: string,
  status = 200,
): NextResponse {
  const t = COPY[locale];
  const html = `<!DOCTYPE html>
<html lang="${locale === 'en' ? 'en' : 'zh-CN'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${title} · 附近森林</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f0f5ec;
    font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;
    color:#2a2a2a;padding:24px;}
  .card{max-width:460px;width:100%;background:#fff;border-radius:16px;padding:36px 32px;
    box-shadow:0 4px 28px rgba(26,46,26,.08);text-align:center;}
  h1{margin:0 0 14px;font-size:21px;color:#2d4a2d;line-height:1.5;}
  p{margin:0 0 12px;font-size:15px;line-height:1.8;color:#4a4a4a;}
  .note{font-size:13px;color:#8a8a8a;}
  button{margin:18px 0 6px;padding:11px 26px;border:none;border-radius:999px;
    background:#2d4a2d;color:#fff;font-size:15px;font-weight:600;cursor:pointer;
    font-family:inherit;}
  button:hover{background:#3d5f3d;}
  button:focus-visible{outline:2px solid #4a7c4a;outline-offset:3px;}
  a{display:inline-block;margin-top:16px;color:#6b8f5e;font-size:14px;}
</style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${lead}</p>
    ${note ? `<p class="note">${note}</p>` : ''}
    ${form}
    <a href="https://nearby-forest.club">${t.home} →</a>
  </div>
</body>
</html>`;
  return new NextResponse(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** 收件人存下来的语言；读不到就按中文。 */
async function localeOf(memberId: string): Promise<Locale> {
  const client = sb();
  if (!client) return 'zh';
  const { data } = await client
    .from('node_cards')
    .select('locale')
    .eq('id', memberId)
    .maybeSingle();
  return (data as { locale?: string } | null)?.locale === 'en' ? 'en' : 'zh';
}

function readParams(request: NextRequest) {
  const memberId = (request.nextUrl.searchParams.get('m') || '').trim();
  const token = (request.nextUrl.searchParams.get('t') || '').trim();
  return { memberId, token, ok: Boolean(memberId && token) };
}

export async function GET(request: NextRequest) {
  const { memberId, token, ok } = readParams(request);
  if (!ok || !verifyUnsubscribeToken(memberId, token).ok) {
    const t = COPY.zh;
    return page('zh', t.badTitle, t.badLead, '', '', 400);
  }

  const locale = await localeOf(memberId);
  const t = COPY[locale];
  // 动作放在 POST：预取这条 GET 不会误伤任何人
  const form = `<form method="POST" action="${request.nextUrl.pathname}${request.nextUrl.search}">
      <button type="submit">${t.confirmBtn}</button>
    </form>`;
  return page(locale, t.title, t.confirmLead, t.confirmNote, form);
}

export async function POST(request: NextRequest) {
  const { memberId, token, ok } = readParams(request);
  if (!ok || !verifyUnsubscribeToken(memberId, token).ok) {
    const t = COPY.zh;
    return page('zh', t.badTitle, t.badLead, '', '', 400);
  }

  const locale = await localeOf(memberId);
  const t = COPY[locale];
  const client = sb();
  if (!client) return page(locale, t.failTitle, t.failLead, '', '', 500);

  const { error } = await client
    .from('node_cards')
    .update({ notify_matches: false })
    .eq('id', memberId);
  if (error) {
    console.error('[api/notify/unsubscribe] update failed', error.message);
    return page(locale, t.failTitle, t.failLead, '', '', 500);
  }

  return page(locale, t.doneTitle, t.doneLead, t.doneNote, '');
}
