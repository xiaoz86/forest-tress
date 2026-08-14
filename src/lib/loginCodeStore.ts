/**
 * 验证码的签发与核销。
 *
 * 登录（/api/login + /api/login/code）和注册（/api/join）都用这一份。
 * 两处各写一遍的话，早晚有一边改了闸门另一边没改——而这是认证逻辑，
 * 走岔的代价不是不一致，是有一条路松了。
 */
import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CODE_MAX_ATTEMPTS, CODE_TTL_MS, codeMatches, generateCode, hashCode } from '@/lib/loginCode';

export type IssuedCode =
  | { ok: true; code: string }
  | { ok: false; reason: 'no-secret' | 'db' | 'cooldown' };

const ISSUE_COOLDOWN_MS = 60 * 1000;

/**
 * 每个邮箱固定占用 login_codes 里的一行。
 *
 * 这不是认证秘密，只是把邮箱稳定映射成合法 UUID。固定主键让数据库本身成为
 * 跨 Vercel 实例的互斥锁：两个实例同时发码时，只有一个能插入/更新成功。
 */
function codeSlotId(email: string): string {
  const hex = createHash('sha256')
    .update(`nearby-forest:login-code:${email.trim().toLowerCase()}`)
    .digest('hex')
    .slice(0, 32)
    .split('');
  hex[12] = '5';
  hex[16] = ['8', '9', 'a', 'b'][parseInt(hex[16], 16) % 4];
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

/**
 * 签发一个新码。
 *
 * 先原子占用这个邮箱的固定槽位，再把旧版随机 id 的未用码作废：
 * 永远只有最新那个能用，也不会因多实例并发发出两封不同验证码。
 */
export async function issueCode(
  sb: SupabaseClient,
  email: string,
  nodeId: string | null,
): Promise<IssuedCode> {
  const code = generateCode();
  const codeHash = hashCode(email, code);
  if (!codeHash) return { ok: false, reason: 'no-secret' };

  const now = new Date();
  const slotId = codeSlotId(email);
  const row = {
    email,
    node_id: nodeId,
    code_hash: codeHash,
    expires_at: new Date(now.getTime() + CODE_TTL_MS).toISOString(),
    attempts: 0,
    consumed_at: null,
    created_at: now.toISOString(),
  };

  // 旧行只有满 60 秒才允许原子更新。并发更新会由 Postgres 行锁串行化；
  // 后到的那次重新检查 created_at 后匹配不到，因此不会再发第二封。
  const cutoff = new Date(now.getTime() - ISSUE_COOLDOWN_MS).toISOString();
  const { data: updated, error: updateError } = await sb
    .from('login_codes')
    .update(row)
    .eq('id', slotId)
    .lt('created_at', cutoff)
    .select('id')
    .maybeSingle();
  if (updateError) {
    console.error('[loginCode] cannot refresh code slot', updateError.message);
    return { ok: false, reason: 'db' };
  }

  if (!updated) {
    const { error: insertError } = await sb.from('login_codes').insert({ id: slotId, ...row });
    if (insertError) {
      // 固定主键已存在 = 另一实例刚发过，按冷却处理，不再发邮件。
      if (insertError.code === '23505') return { ok: false, reason: 'cooldown' };
      console.error('[loginCode] cannot create code slot', insertError.message);
      return { ok: false, reason: 'db' };
    }
  }

  // 兼容部署前生成的随机 id 记录；新码成功占位后再把旧码全部作废。
  const { error: invalidateError } = await sb
    .from('login_codes')
    .update({ consumed_at: now.toISOString() })
    .eq('email', email)
    .neq('id', slotId)
    .is('consumed_at', null);
  if (invalidateError) {
    console.error('[loginCode] cannot invalidate older codes', invalidateError.message);
  }
  return { ok: true, code };
}

/**
 * 先抢下一次尝试额度，抢到了才允许去比对。
 *
 * 这个顺序是要害。原来是「读 attempts → 判断够不够 → 比对 → 事后加一」，
 * 判断用的是比对之前读到的那个值：并发进来的一批全部读到 0，全部通过闸门，
 * 全部被真实比对。计数最后确实涨到 5、行也确实作废了，但那是事后记账——
 * 这一批里没有任何一个被拦下。也就是说一个码到底能被猜多少次，
 * 取决于攻击者的并发度，而不是那个 5。
 *
 * 「每次错都记上」和「记满就不再比对」是两件事。上一版只做到了前者。
 *
 * 这里改成占位：只有 attempts 还等于我刚读到的值、且行还没作废时才写得进去。
 * 抢到 = 这一次尝试归我，可以比对；抢不到就重读再试，满了直接拒，
 * 连比对都不做。撞车的各自重试，于是每一次比对都实打实占掉一个名额。
 *
 * 第 5 次占位当场把行作废，不等下一次请求进来才发现——少给一个来回的空子。
 * 注意 code_hash 是在这之前就读出来的，所以第 5 次如果填的是正确的码，
 * 照样能登录成功，不会被自己作废掉。
 *
 * 重试封顶 8 次，抢不到就当满了——宁可拒错，不可放过。
 */
type Claim = 'ok' | 'exhausted' | 'gone';

async function claimAttempt(sb: SupabaseClient, id: string): Promise<Claim> {
  for (let i = 0; i < 8; i++) {
    const { data: row } = await sb
      .from('login_codes')
      .select('attempts, consumed_at')
      .eq('id', id)
      .maybeSingle();
    if (!row) return 'gone';
    if (row.consumed_at) return 'gone';

    const current = row.attempts ?? 0;
    if (current >= CODE_MAX_ATTEMPTS) return 'exhausted';

    const next = current + 1;
    const { data: won } = await sb
      .from('login_codes')
      .update({
        attempts: next,
        ...(next >= CODE_MAX_ATTEMPTS ? { consumed_at: new Date().toISOString() } : {}),
      })
      .eq('id', id)
      .eq('attempts', current)
      .is('consumed_at', null)
      .select('attempts')
      .maybeSingle();
    if (won) return 'ok';
  }
  return 'exhausted';
}

export type ConsumeResult =
  | { ok: true; nodeId: string | null }
  /** 失败原因只用于服务端日志。对外一律回同一句，不然就把「这个邮箱注册过没有」漏出去了。 */
  | { ok: false; reason: 'none' | 'expired' | 'exhausted' | 'mismatch' };

/** 核销一个码：对上了就作废并返回它绑定的成员（可能为 null，表示当时还不是成员）。 */
export async function consumeCode(
  sb: SupabaseClient,
  email: string,
  code: string,
): Promise<ConsumeResult> {
  const { data: row, error } = await sb
    .from('login_codes')
    .select('id, node_id, code_hash, expires_at, attempts')
    .eq('email', email)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !row) return { ok: false, reason: 'none' };

  const invalidate = () =>
    sb.from('login_codes').update({ consumed_at: new Date().toISOString() }).eq('id', row.id);

  // 过期的直接作废，不给它继续被猜的机会
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await invalidate();
    return { ok: false, reason: 'expired' };
  }

  /**
   * 闸门必须落在比对之前：先原子抢下一个尝试名额，抢不到就连比都不比。
   * 上面 select 出来的 row.attempts 是个快照，拿它做判断在并发下等于没判断。
   */
  const claim = await claimAttempt(sb, row.id as string);
  if (claim !== 'ok') {
    if (claim === 'exhausted') await invalidate();
    return { ok: false, reason: claim === 'exhausted' ? 'exhausted' : 'none' };
  }

  if (!codeMatches(email, code, row.code_hash)) {
    return { ok: false, reason: 'mismatch' };
  }

  await invalidate();
  return { ok: true, nodeId: (row.node_id as string | null) ?? null };
}
