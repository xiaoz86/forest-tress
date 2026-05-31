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
 * 未配置 RESEND_API_KEY 时静默跳过（方便本地开发和渐进上线）。
 * 失败时只 console.error，不抛错，确保不影响主流程。
 */
export async function notifyNewNode(node: NodeCard): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log('[notify] RESEND_API_KEY not set, skipping email notification');
    return;
  }

  const recipients = getRecipients();
  if (recipients.length === 0) {
    console.log('[notify] no recipients configured, skipping');
    return;
  }

  const from = process.env.NOTIFY_FROM?.trim() || '附近森林 <onboarding@resend.dev>';
  const subject = `🌱 新成员加入 · ${node.name || '无名之树'}${node.city ? ` (${node.city})` : ''}`;

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
        html: buildHtml(node),
        text: buildText(node),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[notify] Resend API error', res.status, body);
    } else {
      console.log('[notify] email sent to', recipients.join(','));
    }
  } catch (err) {
    console.error('[notify] send failed', err);
  }
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
 * 未配置 RESEND_API_KEY 或 email 为空时静默跳过。
 */
export async function notifyWelcome(
  node: NodeCard,
  magicLink: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log('[notify] RESEND_API_KEY not set, skipping welcome email');
    return;
  }
  const to = (node.email || '').trim();
  if (!to) {
    console.log('[notify] new member has no email, skipping welcome');
    return;
  }
  if (!node.id) return;

  const from = process.env.NOTIFY_FROM?.trim() || '附近森林 <onboarding@resend.dev>';
  const profileUrl = `${getSiteOrigin()}/creators/${node.id}`;
  const subject = `🌱 欢迎加入附近森林`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html: buildWelcomeHtml(node, profileUrl, magicLink),
        text: buildWelcomeText(node, profileUrl, magicLink),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[notify] welcome Resend non-200', res.status, body);
    }
  } catch (err) {
    console.error('[notify] welcome send failed', err);
  }
}

/**
 * 用户在 /login 页面输入邮箱重新申请登录链接时调用。
 * `node` 是按邮箱查到的成员节点。
 */
export async function notifyLoginLink(
  node: NodeCard,
  magicLink: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log('[notify] RESEND_API_KEY not set, skipping login link');
    return;
  }
  const to = (node.email || '').trim();
  if (!to) return;
  if (!node.id) return;

  const from = process.env.NOTIFY_FROM?.trim() || '附近森林 <onboarding@resend.dev>';
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

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[notify] login Resend non-200', res.status, body);
    }
  } catch (err) {
    console.error('[notify] login send failed', err);
  }
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
