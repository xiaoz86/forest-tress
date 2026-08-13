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

  // 错满即作废：一个码只给 5 次机会，剩下的 99.999% 空间就不用猜了
  if ((row.attempts ?? 0) >= CODE_MAX_ATTEMPTS) {
    await invalidate();
    return { ok: false, reason: 'exhausted' };
  }

  if (!codeMatches(email, code, row.code_hash)) {
    await sb
      .from('login_codes')
      .update({ attempts: (row.attempts ?? 0) + 1 })
      .eq('id', row.id);
    return { ok: false, reason: 'mismatch' };
  }

  await invalidate();
  return { ok: true, nodeId: (row.node_id as string | null) ?? null };
}
