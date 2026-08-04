import type { NodeCard } from './supabase';
import type { ShareEntry } from './shares';

// 默认收件人（主理人）。可通过 NOTIFY_EMAILS 环境变量覆盖，逗号分隔支持多个。
const DEFAULT_RECIPIENTS = ['1826741794@qq.com'];

function getRecipients(): string[] {
  const raw = process.env.NOTIFY_EMAILS?.trim();
  if (!raw) return DEFAULT_RECIPIENTS;
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

export type EmailSendResult =
  | { ok: true; id: string | null }
  | {
      ok: false;
      reason: 'not-configured' | 'skipped' | 'provider-error' | 'network-error';
      status?: number;
    };

type CriticalEmailKind = 'new-node' | 'welcome' | 'login-link' | 'unlock-claim';

type ResendMessage = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
};

const EMAIL_TIMEOUT_MS = 8_000;
const EMAIL_MAX_ATTEMPTS = 2;

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function retryDelayMs(response: Response | null, attempt: number): number {
  const resetAfter = Number(
    response?.headers.get('ratelimit-reset') || response?.headers.get('retry-after'),
  );
  if (Number.isFinite(resetAfter) && resetAfter > 0) {
    return Math.min(resetAfter * 1_000, 2_000);
  }
  return 350 * (attempt + 1);
}

/**
 * 发送关键事务邮件。等待 Resend 接受请求，并对网络错误、429 和 5xx
 * 做一次带幂等键的安全重试，避免函数返回后请求被中断或重复发信。
 */
async function sendCriticalEmail(
  kind: CriticalEmailKind,
  message: ResendMessage,
  idempotencyKey: string,
): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[notify] critical email skipped: RESEND_API_KEY not set', { kind });
    return { ok: false, reason: 'not-configured' };
  }
  if (!message.from) {
    console.error('[notify] critical email skipped: NOTIFY_FROM not set', { kind });
    return { ok: false, reason: 'not-configured' };
  }

  for (let attempt = 0; attempt < EMAIL_MAX_ATTEMPTS; attempt += 1) {
    let response: Response | null = null;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
      });

      const body = (await response.json().catch(() => null)) as
        | { id?: unknown; name?: unknown; type?: unknown; message?: unknown }
        | null;

      if (response.ok) {
        const id = typeof body?.id === 'string' ? body.id : null;
        console.log('[notify] Resend accepted critical email', { kind, id });
        return { ok: true, id };
      }

      const errorType = String(body?.name || body?.type || 'unknown');
      const errorMessage = typeof body?.message === 'string'
        ? body.message.slice(0, 300)
        : undefined;
      const retryable =
        (response.status === 429 && errorType === 'rate_limit_exceeded') ||
        response.status >= 500 ||
        (response.status === 409 && errorType === 'concurrent_idempotent_requests');

      if (retryable && attempt + 1 < EMAIL_MAX_ATTEMPTS) {
        console.warn('[notify] transient Resend error, retrying', {
          kind,
          status: response.status,
          errorType,
          errorMessage,
          attempt: attempt + 1,
        });
        await wait(retryDelayMs(response, attempt));
        continue;
      }

      console.error('[notify] Resend rejected critical email', {
        kind,
        status: response.status,
        errorType,
        errorMessage,
      });
      return { ok: false, reason: 'provider-error', status: response.status };
    } catch (err) {
      if (attempt + 1 < EMAIL_MAX_ATTEMPTS) {
        console.warn('[notify] email request failed, retrying', {
          kind,
          error: err instanceof Error ? err.name : 'unknown',
          attempt: attempt + 1,
        });
        await wait(retryDelayMs(response, attempt));
        continue;
      }

      console.error('[notify] critical email request failed', {
        kind,
        error: err instanceof Error ? err.name : 'unknown',
      });
      return { ok: false, reason: 'network-error' };
    }
  }

  return { ok: false, reason: 'network-error' };
}

/** 站点根 URL，用于在邮件里生成绝对链接。 */
export function getSiteOrigin(): string {
  const env = process.env.SITE_ORIGIN?.trim() || process.env.NEXT_PUBLIC_SITE_ORIGIN?.trim();
  if (env) return env.replace(/\/+$/, '');
  return 'https://nearby-forest.club';
}

function escape(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function row(label: string, value: string | null | undefined): string {
  if (!value || !value.trim()) return '';
  return `
    <tr>
      <td style="padding:10px 14px;background:#faf8f2;border-bottom:1px solid #e8ecd8;font-size:13px;color:#6b8f5e;font-weight:600;width:110px;vertical-align:top;white-space:nowrap;">${label}</td>
      <td style="padding:10px 14px;background:#fff;border-bottom:1px solid #e8ecd8;font-size:14px;color:#2a2a2a;line-height:1.7;">${escape(value)}</td>
    </tr>`;
}

function buildHtml(node: NodeCard): string {
  const topics = (node.topics || []).join('、');
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>新成员加入 · 附近森林</title></head>
<body style="margin:0;padding:24px;background:#f0f5ec;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(26,46,26,0.08);">
    <div style="padding:28px 32px;background:linear-gradient(135deg,#2d4a2d,#4a7c4a);color:#fff;">
      <div style="font-size:13px;opacity:0.75;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">附近森林 · 新成员</div>
      <h1 style="margin:0;font-size:22px;font-weight:700;">🌱 ${escape(node.name)} 加入了森林</h1>
      ${node.city ? `<div style="margin-top:6px;font-size:14px;opacity:0.85;">${escape(node.city)}</div>` : ''}
    </div>
    <table style="width:100%;border-collapse:collapse;">
      ${row('名字', node.name)}
      ${row('城市', node.city)}
      ${row('在做', node.doing)}
      ${topics ? row('关注议题', topics) : ''}
      ${row('经验与独特性', node.experience)}
      ${row('可以提供', node.offer)}
      ${row('寻找的连接', node.seeking)}
      ${row('产品/项目', node.product)}
      ${row('微信号', node.wechat)}
      ${row('邮箱', node.email)}
    </table>
    <div style="padding:20px 32px;background:#faf8f2;font-size:12px;color:#8a8a8a;text-align:center;">
      请尽快联系 TA，欢迎加入社区群。<br>
      这封邮件由 nearby-forest.club 自动发送。
    </div>
  </div>
</body>
</html>`;
}

function buildText(node: NodeCard): string {
  const lines = [
    `附近森林 · 新成员加入`,
    `─────────────────────`,
    `名字：${node.name || ''}`,
    node.city ? `城市：${node.city}` : '',
    node.doing ? `在做：${node.doing}` : '',
    node.topics?.length ? `关注议题：${node.topics.join('、')}` : '',
    node.experience ? `经验与独特性：${node.experience}` : '',
    node.offer ? `可以提供：${node.offer}` : '',
    node.seeking ? `寻找的连接：${node.seeking}` : '',
    node.product ? `产品/项目：${node.product}` : '',
    node.wechat ? `微信号：${node.wechat}` : '',
    node.email ? `邮箱：${node.email}` : '',
    ``,
    `请尽快联系 TA，欢迎加入社区群。`,
  ];
  return lines.filter(Boolean).join('\n');
}

/**
 * 通知主理人有新节点加入。
 * 返回 Resend 是否接受请求，让调用方可以等待并记录结果。
 */
export async function notifyNewNode(node: NodeCard): Promise<EmailSendResult> {
  const recipients = getRecipients();
  if (recipients.length === 0) {
    console.error('[notify] no recipients configured for new-node email');
    return { ok: false, reason: 'skipped' };
  }

  const from = process.env.NOTIFY_FROM?.trim() || '';
  const subject = `🌱 新成员加入 · ${node.name || '无名之树'}${node.city ? ` (${node.city})` : ''}`;
  const eventId = node.id || crypto.randomUUID();

  return sendCriticalEmail(
    'new-node',
    {
      from,
      to: recipients,
      subject,
      html: buildHtml(node),
      text: buildText(node),
    },
    `new-node/${eventId}`,
  );
}

// ──────────────────────────────────────────────────────────────────
// 给新成员本人发的「欢迎 + 登录入口」邮件
// ──────────────────────────────────────────────────────────────────

function buildWelcomeHtml(node: NodeCard, profileUrl: string, magicLink: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>欢迎加入附近森林</title></head>
<body style="margin:0;padding:24px;background:#f0f5ec;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(26,46,26,0.08);">
    <div style="padding:32px 32px 20px;background:linear-gradient(135deg,#2d4a2d,#4a7c4a);color:#fff;">
      <div style="font-size:13px;opacity:0.75;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">附近森林 · Welcome</div>
      <h1 style="margin:0;font-size:22px;font-weight:700;">🌱 ${escape(node.name)}，你已成为森林的一棵树</h1>
    </div>
    <div style="padding:24px 32px 8px;color:#2a2a2a;font-size:14px;line-height:1.8;">
      <p style="margin:0 0 12px;">这是你专属的个人页：</p>
      <p style="margin:0 0 18px;"><a href="${profileUrl}" style="color:#2d4a2d;font-weight:600;text-decoration:underline;">${profileUrl}</a></p>
      <p style="margin:0 0 12px;">下面这条「登录链接」可以让你随时回到个人页编辑信息、查看 AI 为你生成的连接推荐：</p>
      <p style="margin:18px 0;text-align:center;">
        <a href="${magicLink}"
           style="display:inline-block;padding:12px 28px;background:#2d4a2d;color:#fff;text-decoration:none;border-radius:999px;font-weight:600;font-size:14px;">
          点击登录我的节点
        </a>
      </p>
      <p style="margin:0 0 6px;font-size:12px;color:#8a8a8a;">链接 7 天内有效。如未点击就过期，可随时回到 nearby-forest.club/login 重新获取。</p>
    </div>
    <div style="padding:18px 32px 24px;background:#faf8f2;font-size:12px;color:#8a8a8a;text-align:center;">
      这封邮件由 nearby-forest.club 自动发送。
    </div>
  </div>
</body>
</html>`;
}

function buildWelcomeText(node: NodeCard, profileUrl: string, magicLink: string): string {
  return [
    `欢迎加入附近森林，${node.name || ''}。`,
    `─────────────────────`,
    `你的个人页：${profileUrl}`,
    `登录链接（7 天内有效）：${magicLink}`,
    ``,
    `点击登录链接即可回到个人页继续编辑信息、查看 AI 推荐。`,
    `如链接过期，可在 nearby-forest.club/login 重新获取。`,
  ].join('\n');
}

/**
 * 给新成员本人发欢迎邮件 + 登录链接（magic link）。
 * 返回 Resend 是否接受请求。
 */
export async function notifyWelcome(
  node: NodeCard,
  magicLink: string,
): Promise<EmailSendResult> {
  const to = (node.email || '').trim();
  if (!to) {
    console.error('[notify] new member has no email, skipping welcome');
    return { ok: false, reason: 'skipped' };
  }
  if (!node.id) return { ok: false, reason: 'skipped' };

  const from = process.env.NOTIFY_FROM?.trim() || '';
  const profileUrl = `${getSiteOrigin()}/creators/${node.id}`;
  const subject = `🌱 欢迎加入附近森林`;

  return sendCriticalEmail(
    'welcome',
    {
      from,
      to: [to],
      subject,
      html: buildWelcomeHtml(node, profileUrl, magicLink),
      text: buildWelcomeText(node, profileUrl, magicLink),
    },
    `welcome/${node.id}`,
  );
}

/**
 * 用户在 /login 页面输入邮箱重新申请登录链接时调用。
 * `node` 是按邮箱查到的成员节点。
 */
export async function notifyLoginLink(
  node: NodeCard,
  magicLink: string,
): Promise<EmailSendResult> {
  const to = (node.email || '').trim();
  if (!to) return { ok: false, reason: 'skipped' };
  if (!node.id) return { ok: false, reason: 'skipped' };

  const from = process.env.NOTIFY_FROM?.trim() || '';
  const profileUrl = `${getSiteOrigin()}/creators/${node.id}`;
  const subject = `🔐 你的附近森林登录链接`;

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f0f5ec;font-family:-apple-system,'PingFang SC',sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:28px 32px;box-shadow:0 4px 20px rgba(26,46,26,0.06);">
    <h2 style="margin:0 0 12px;font-size:18px;color:#2d4a2d;">登录到你的节点</h2>
    <p style="font-size:14px;color:#2a2a2a;line-height:1.8;margin:0 0 18px;">点击下方按钮，即可登录到 ${escape(node.name)} 的个人页。</p>
    <p style="text-align:center;margin:18px 0;">
      <a href="${magicLink}" style="display:inline-block;padding:12px 28px;background:#2d4a2d;color:#fff;text-decoration:none;border-radius:999px;font-weight:600;font-size:14px;">点击登录</a>
    </p>
    <p style="font-size:12px;color:#8a8a8a;margin:0 0 4px;">链接 7 天内有效。如果不是你本人申请，请忽略。</p>
    <p style="font-size:12px;color:#8a8a8a;margin:0;">个人页：<a href="${profileUrl}" style="color:#2d4a2d;">${profileUrl}</a></p>
  </div>
</body></html>`;

  const text = [
    `登录到你的节点（附近森林）`,
    `点击下方链接即可登录（7 天内有效）：`,
    magicLink,
    ``,
    `如果不是你本人申请，请忽略此邮件。`,
    `个人页：${profileUrl}`,
  ].join('\n');

  return sendCriticalEmail(
    'login-link',
    { from, to: [to], subject, html, text },
    `login-link/${node.id}/${Math.floor(Date.now() / 60_000)}`,
  );
}

// ──────────────────────────────────────────────────────────────────
// 有温度的超级个体上传林间分享后，通知创始人团队审核
// ──────────────────────────────────────────────────────────────────

function buildShareSubmissionHtml(node: NodeCard, share: ShareEntry, reviewUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>新的林间分享待审核</title></head>
<body style="margin:0;padding:24px;background:#f0f5ec;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(26,46,26,0.08);">
    <div style="padding:28px 32px;background:linear-gradient(135deg,#2d4a2d,#4a7c4a);color:#fff;">
      <div style="font-size:13px;opacity:0.75;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">附近森林 · 林间分享</div>
      <h1 style="margin:0;font-size:22px;font-weight:700;">有新的分享待审核</h1>
      <div style="margin-top:8px;font-size:14px;opacity:0.85;">${escape(node.name)} 上传了「${escape(share.title)}」</div>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      ${row('分享者', node.name)}
      ${row('标题', share.title)}
      ${row('问题', share.question)}
      ${row('简述', share.summary)}
      ${row('补充', share.note)}
      ${row('标签', share.tags.join('、'))}
      ${row('格式', share.mediaKind)}
    </table>
    <div style="padding:22px 32px;background:#faf8f2;font-size:13px;color:#5a5a5a;line-height:1.8;">
      <p style="margin:0 0 14px;">请进入后台审核，确认是否发布到林间分享页。</p>
      <p style="margin:0;"><a href="${reviewUrl}" style="color:#2d4a2d;font-weight:600;text-decoration:underline;">${reviewUrl}</a></p>
    </div>
  </div>
</body>
</html>`;
}

function buildShareSubmissionText(node: NodeCard, share: ShareEntry, reviewUrl: string): string {
  return [
    `附近森林 · 新的林间分享待审核`,
    `─────────────────────`,
    `分享者：${node.name || ''}`,
    `标题：${share.title}`,
    share.question ? `问题：${share.question}` : '',
    share.summary ? `简述：${share.summary}` : '',
    share.note ? `补充：${share.note}` : '',
    share.tags.length ? `标签：${share.tags.join('、')}` : '',
    `格式：${share.mediaKind}`,
    ``,
    `审核入口：${reviewUrl}`,
  ].filter(Boolean).join('\n');
}

export async function notifyShareSubmission(
  node: NodeCard,
  share: ShareEntry,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log('[notify] RESEND_API_KEY not set, skipping share submission notification');
    return;
  }

  const recipients = getRecipients();
  if (recipients.length === 0) {
    console.log('[notify] no recipients configured, skipping share submission notification');
    return;
  }

  const from = process.env.NOTIFY_FROM?.trim() || '附近森林 <onboarding@resend.dev>';
  const reviewUrl = `${getSiteOrigin()}/shares/admin`;
  const subject = `新的林间分享待审核 · ${share.title}`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: recipients,
        subject,
        html: buildShareSubmissionHtml(node, share, reviewUrl),
        text: buildShareSubmissionText(node, share, reviewUrl),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[notify] share submission Resend non-200', res.status, body);
    }
  } catch (err) {
    console.error('[notify] share submission send failed', err);
  }
}

// ──────────────────────────────────────────────────────────────────
// phil-coach 反馈 / 真人教练咨询，通知主理人
// ──────────────────────────────────────────────────────────────────

export async function notifyPhilFeedback(params: {
  kind: 'feedback' | 'coach-inquiry';
  message: string;
  contact?: string;
  nodeName?: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log('[notify] RESEND_API_KEY not set, skipping phil feedback');
    return;
  }
  // 反馈通知除主理人外，另抄送 wendy；可用 PHIL_FEEDBACK_EMAILS 覆盖整份名单
  const override = process.env.PHIL_FEEDBACK_EMAILS?.trim();
  const recipients = override
    ? override.split(',').map(s => s.trim()).filter(Boolean)
    : Array.from(new Set([...getRecipients(), 'wendyjhwu@hotmail.com']));
  if (recipients.length === 0) return;

  const from = process.env.NOTIFY_FROM?.trim() || '附近森林 <onboarding@resend.dev>';
  const isInquiry = params.kind === 'coach-inquiry';
  const subject = isInquiry
    ? '🌱 有人想咨询真人教练陪伴（phil-coach）'
    : '💬 phil-coach 收到一条模块反馈';

  const lines = [
    isInquiry ? '类型：咨询真人教练陪伴' : '类型：模块体验反馈',
    params.nodeName ? `来自：${params.nodeName}（注册成员）` : '来自：访客',
    params.contact ? `联系方式：${params.contact}` : '联系方式：未留',
    '',
    '留言：',
    params.message,
  ];
  const text = lines.join('\n');
  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f0f5ec;font-family:-apple-system,'PingFang SC',sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:26px 30px;box-shadow:0 4px 20px rgba(26,46,26,0.06);">
    <h2 style="margin:0 0 14px;font-size:17px;color:#2d4a2d;">${isInquiry ? '🌱 有人想咨询真人教练陪伴' : '💬 phil-coach 模块反馈'}</h2>
    <p style="font-size:13px;color:#6b8f5e;margin:0 0 4px;">${params.nodeName ? `来自：${escape(params.nodeName)}（注册成员）` : '来自：访客'}</p>
    <p style="font-size:13px;color:#6b8f5e;margin:0 0 14px;">联系方式：${escape(params.contact || '未留')}</p>
    <div style="padding:14px 16px;background:#faf8f2;border-radius:10px;font-size:14px;color:#2a2a2a;line-height:1.8;white-space:pre-wrap;">${escape(params.message)}</div>
  </div>
</body></html>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: recipients, subject, html, text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[notify] phil feedback Resend non-200', res.status, body);
    }
  } catch (err) {
    console.error('[notify] phil feedback send failed', err);
  }
}

// ──────────────────────────────────────────────────────────────────
// phil-coach 轻登记：有人留下称呼+微信，通知主理人加微信拉群
// ──────────────────────────────────────────────────────────────────

export async function notifyPhilGuest(params: {
  name: string;
  contact: string;
  source?: string;
  approveUrl?: string;
  /** true = 免费期满的续期申请（点同一个通过按钮即续 3 个月） */
  renewal?: boolean;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log('[notify] RESEND_API_KEY not set, skipping guest notification');
    return;
  }
  // 与反馈通知同名单：主理人 + wendy；可用 PHIL_FEEDBACK_EMAILS 覆盖
  const override = process.env.PHIL_FEEDBACK_EMAILS?.trim();
  const recipients = override
    ? override.split(',').map(s => s.trim()).filter(Boolean)
    : Array.from(new Set([...getRecipients(), 'wendyjhwu@hotmail.com']));
  if (recipients.length === 0) return;

  const from = process.env.NOTIFY_FROM?.trim() || '附近森林 <onboarding@resend.dev>';
  const subject = params.renewal
    ? `🌿 ${params.name} 申请续期 phil-coach（免费期已满，点击续 3 个月）`
    : `🌿 ${params.name} 登记使用 phil-coach（待你点击通过）`;
  const text = [
    params.renewal
      ? `老朋友的免费 3 个月用满了，申请续期：`
      : `有新朋友登记使用 phil-coach，等待开通：`,
    `称呼：${params.name}`,
    `微信/联系方式：${params.contact}`,
    params.source ? `来源：${params.source}` : `来源：页面直接登记`,
    ``,
    params.approveUrl
      ? `点击通过开通（点完 ta 才能继续使用）：\n${params.approveUrl}`
      : `（审核链接生成失败：请在 Supabase 中将该记录 status 改为 approved）`,
    ``,
    `通过后：加 ta 微信 → 问候 + 拉入附近森林社群。`,
  ].join('\n');
  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f0f5ec;font-family:-apple-system,'PingFang SC',sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:26px 30px;box-shadow:0 4px 20px rgba(26,46,26,0.06);">
    <h2 style="margin:0 0 14px;font-size:17px;color:#2d4a2d;">${params.renewal ? '🌿 老朋友申请续期 phil-coach（免费期已满）' : '🌿 新朋友登记使用 phil-coach'}</h2>
    <p style="font-size:14px;color:#2a2a2a;margin:0 0 6px;">称呼：<strong>${escape(params.name)}</strong></p>
    <p style="font-size:14px;color:#2a2a2a;margin:0 0 6px;">微信/联系方式：<strong>${escape(params.contact)}</strong></p>
    <p style="font-size:13px;color:#6b8f5e;margin:0 0 16px;">${params.source ? `来源：${escape(params.source)}` : '来源：页面直接登记'}</p>
    ${
      params.approveUrl
        ? `<p style="text-align:center;margin:20px 0;">
      <a href="${params.approveUrl}" style="display:inline-block;padding:12px 28px;background:#2d4a2d;color:#fff;text-decoration:none;border-radius:999px;font-weight:600;font-size:14px;">✓ 通过开通</a>
    </p>
    <p style="font-size:12px;color:#8a8a8a;margin:0 0 12px;text-align:center;">点击后 ta 才能继续使用；你或 Wendy 任一人点即可，重复点击无害。</p>`
        : `<p style="font-size:13px;color:#c0392b;margin:0 0 12px;">审核链接生成失败：请在 Supabase 中把该记录 status 改为 approved。</p>`
    }
    <p style="font-size:13px;color:#8a8a8a;margin:0;">通过后：加 ta 微信 → 问候 + 拉入附近森林社群。</p>
  </div>
</body></html>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: recipients, subject, html, text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[notify] guest Resend non-200', res.status, body);
    }
  } catch (err) {
    console.error('[notify] guest send failed', err);
  }
}

/**
 * 有人点了「我已完成付款」。
 *
 * 这封信是整套人工核对的关键：个人收款码没有回调，主理人不看后台
 * 就永远不知道有人在等。用户那边已经先放行了，所以这封信要的不是
 * 「快去开通」，而是「去收款记录里核一下这个口令」。
 */
export async function notifyUnlockClaim(params: {
  memberName: string;
  code: string;
  programLabel: string;
  amountYuan: number;
  boardUrl: string;
  /** 付款截图的直链。放进邮件是为了不用先开看板就能核对。 */
  proofUrl?: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log('[notify] RESEND_API_KEY not set, skipping unlock claim notification');
    return;
  }
  const override = process.env.PHIL_FEEDBACK_EMAILS?.trim();
  const recipients = override
    ? override.split(',').map(s => s.trim()).filter(Boolean)
    : Array.from(new Set([...getRecipients(), 'wendyjhwu@hotmail.com']));
  if (recipients.length === 0) return;

  const from = process.env.NOTIFY_FROM?.trim() || '附近森林 <onboarding@resend.dev>';
  const text = [
    `${params.memberName} 说已经付款，${params.programLabel} 已经先开给 ta 了。`,
    ``,
    `请到支付宝收款记录里核对这一笔：`,
    `  备注口令：${params.code}`,
    `  金额：¥${params.amountYuan}`,
    ``,
    params.proofUrl ? `ta 传的付款截图：\n${params.proofUrl}\n` : `（这一单没有截图）\n`,
    `注意截图不构成凭证——伪造工具满地都是，仍要以收款记录为准。`,
    ``,
    `核对上就在看板点「已收到款」；找不到这笔就点「驳回」，权限会立刻收回。`,
    params.boardUrl,
  ].join('\n');

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f0f5ec;font-family:-apple-system,'PingFang SC',sans-serif;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;">
  <p style="margin:0 0 18px;font-size:15px;color:#243229;line-height:1.8;">
    <strong>${escape(params.memberName)}</strong> 说已经付款，${escape(params.programLabel)} 已经先开给 ta 了。
  </p>
  <div style="background:#f0f5ec;border-radius:12px;padding:18px;margin-bottom:18px;">
    <div style="font-size:12px;color:#5c675f;margin-bottom:6px;">支付宝收款记录里找这个备注</div>
    <div style="font-size:30px;font-weight:700;letter-spacing:4px;color:#243229;font-family:ui-monospace,Menlo,monospace;">${escape(params.code)}</div>
    <div style="font-size:13px;color:#5c675f;margin-top:8px;">金额 ¥${params.amountYuan}</div>
  </div>
  <p style="margin:0 0 6px;font-size:13.5px;color:#5c675f;line-height:1.8;">
    核对上就点「已收到款」；找不到这笔就点「驳回」，权限会立刻收回。
  </p>
  <p style="margin:0 0 20px;font-size:12px;color:#8a9690;line-height:1.7;">
    截图不构成凭证——伪造工具满地都是。仍以支付宝收款记录为准。
  </p>
  <a href="${escape(params.boardUrl)}" style="display:inline-block;background:#2f513d;color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-size:14px;font-weight:600;">
    打开开通确认
  </a>
  ${params.proofUrl ? `<a href="${escape(params.proofUrl)}" style="display:inline-block;margin-left:10px;border:1px solid #d5ddd2;color:#2f513d;text-decoration:none;padding:11px 20px;border-radius:999px;font-size:14px;font-weight:600;">看付款截图</a>` : ''}
</div>
</body></html>`;

  await sendCriticalEmail(
    'unlock-claim',
    { from, to: recipients, subject: `💰 ${params.memberName} 已付款 · 口令 ${params.code}`, text, html },
    // 同一单只发一次：用户手抖多点几下不该把主理人邮箱刷屏
    `unlock-claim-${params.code}`,
  );
}
