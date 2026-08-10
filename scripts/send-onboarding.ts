/**
 * 发「欢迎来到附近森林」那封长信。
 *
 * 注意 .env.local 里有中文注释，shell 的 source 解析不了，一律用 tsx 读环境文件。
 *
 *   # 只写一个 .html 到本地，什么都不发（先看排版）
 *   npx tsx --tsconfig tsconfig.json scripts/send-onboarding.ts --preview
 *
 *   # 发一封测试。收件人若能对上成员，会带真实登录链接，
 *   # 也就是和新注册的人收到的完全一样
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/send-onboarding.ts --to you@example.com
 *
 *   # 发给全体已注册成员（先列名单，要手敲 SEND 才发）
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/send-onboarding.ts --all
 *
 * 幂等键按「收件人 + 版本」生成：同一个版本重复跑，Resend 不会重复投递。
 * 改了信的内容想重发，把 VERSION 往上加一位。
 */
import { createInterface } from 'node:readline/promises';
import { writeFileSync } from 'node:fs';
import { signLoginToken } from '@/lib/auth';
import type { Locale } from '@/lib/locale';
import {
  buildOnboardingHtml,
  buildOnboardingText,
  onboardingSubject,
} from '@/lib/onboardingEmail';

/**
 * 内容改过就往上加，否则 Resend 的幂等键会挡住重发。
 * v3 = 主理人 2026-08-10 改版（小节重排：PhilCoach 提到 02、AI 撮合降到 06）
 */
const VERSION = 'v3';

/** 群发语言。node_cards 没存语言，默认中文，要发英文加 --locale en */
const LOCALE: Locale = process.argv.includes('en') ? 'en' : 'zh';

const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const val = (f: string) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};

const SITE = process.env.SITE_ORIGIN?.trim() || 'https://nearby-forest.club';

type Member = { id: string; name: string; email: string };

/** 一看就投递不出去的地址 */
const UNDELIVERABLE = /@(test|example)\.(com|org|net)$|@(localhost|invalid)$/i;

/** 被跳过的收件人，跑完要如实报出来，不能静悄悄少发 */
const skipped: string[] = [];

async function fetchMembers(): Promise<Member[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('缺少 Supabase 配置');
  const res = await fetch(`${url}/rest/v1/node_cards?select=id,name,email`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const rows = (await res.json()) as { id: string; name?: string; email?: string }[];
  if (!Array.isArray(rows)) throw new Error(`查询失败：${JSON.stringify(rows).slice(0, 200)}`);
  const seen = new Set<string>();
  const out: Member[] = [];
  for (const r of rows) {
    const email = (r.email || '').trim().toLowerCase();
    // 没邮箱的发不了；同一邮箱只发一次（有人可能建过两张卡）
    if (!email || !email.includes('@') || seen.has(email)) continue;
    // 明显是假域名的跳过：发过去必然硬退信，而硬退信会伤域名信誉——
    // 同一个域名还在发登录魔法链接，那是功能性邮件，不能被这个拖累。
    if (UNDELIVERABLE.test(email)) {
      skipped.push(`${r.name || r.id} <${email}>`);
      continue;
    }
    seen.add(email);
    out.push({ id: r.id, name: (r.name || '').trim(), email });
  }
  return out;
}

function magicLinkFor(memberId: string): string | undefined {
  const signed = signLoginToken(memberId);
  if (!signed.ok) return undefined;
  return `${SITE}/api/login/verify?token=${encodeURIComponent(signed.token)}`;
}

async function send(to: string, name: string, magicLink?: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_FROM?.trim();
  if (!apiKey || !from) throw new Error('缺少 RESEND_API_KEY 或 NOTIFY_FROM');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      // 同一收件人 + 同一版本只投一次
      'Idempotency-Key': `onboarding/${VERSION}/${LOCALE}/${to}`,
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: onboardingSubject(LOCALE),
      html: buildOnboardingHtml(name, LOCALE, magicLink),
      text: buildOnboardingText(name, LOCALE, magicLink),
    }),
  });
  const body = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
  if (res.ok) {
    console.log(`  ✓ ${to}  ${body?.id || ''}`);
    return true;
  }
  console.error(`  ✗ ${to}  ${res.status} ${body?.message || ''}`);
  return false;
}

async function main() {
  // ── 只出预览文件，不发信 ──
  if (has('--preview')) {
    const out = val('--preview-out') || '/tmp/onboarding-preview.html';
    writeFileSync(out, buildOnboardingHtml(LOCALE === 'en' ? 'Rowan' : '小 Z', LOCALE, `${SITE}/api/login/verify?token=DEMO`));
    console.log(`预览已写入 ${out}`);
    console.log(`纯文本 ${buildOnboardingText('小 Z', LOCALE).length} 字`);
    return;
  }

  // ── 单发（测试）──
  const to = val('--to');
  if (to) {
    // 测试信要和新注册的人真正收到的一样，所以能对上成员就带真实登录链接
    const members = await fetchMembers().catch(() => [] as Member[]);
    const me = members.find(m => m.email === to.trim().toLowerCase());
    const link = me ? magicLinkFor(me.id) : undefined;
    console.log(
      `发一封给 ${to}…`,
      me ? `（对上成员「${me.name || me.id}」，带登录链接）` : '（不是成员，不带登录链接）',
    );
    await send(to, val('--name') || me?.name || '', link);
    return;
  }

  // ── 群发 ──
  if (!has('--all')) {
    console.log('用法：--preview | --to <邮箱> | --all');
    process.exitCode = 1;
    return;
  }

  const members = await fetchMembers();
  console.log(`\n共 ${members.length} 位有邮箱的成员：`);
  members.forEach((m, i) => console.log(`  ${i + 1}. ${m.name || '(无名)'}  ${m.email}`));
  if (skipped.length) {
    console.log(`\n跳过 ${skipped.length} 个投递不出去的地址（假域名，硬退信会伤域名信誉）：`);
    skipped.forEach(x => console.log(`  - ${x}`));
  }

  // 群发是不可撤销的对外动作，必须手敲确认
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`\n确认发给以上 ${members.length} 位？敲 SEND 继续，其他任意键取消：`);
  rl.close();
  if (answer.trim() !== 'SEND') {
    console.log('已取消，一封都没发。');
    return;
  }

  let ok = 0;
  for (const m of members) {
    // 群发不带登录链接：这些人早就能登录，开头再放一个「进入我的节点」是多余的
    if (await send(m.email, m.name, undefined)) ok += 1;
    // Resend 免费档限速，放慢一点
    await new Promise(r => setTimeout(r, 600));
  }
  console.log(`\n完成：成功 ${ok} / ${members.length}`);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
