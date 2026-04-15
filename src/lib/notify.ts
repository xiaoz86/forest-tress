import type { NodeCard } from './supabase';

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
