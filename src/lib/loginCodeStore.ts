/**
 * 验证码的签发与核销。
 *
 * 登录（/api/login + /api/login/code）和注册（/api/join）都用这一份。
 * 两处各写一遍的话，早晚有一边改了闸门另一边没改——而这是认证逻辑，
 * 走岔的代价不是不一致，是有一条路松了。
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { CODE_MAX_ATTEMPTS, CODE_TTL_MS, codeMatches, generateCode, hashCode } from '@/lib/loginCode';

export type IssuedCode = { ok: true; code: string } | { ok: false; reason: 'no-secret' | 'db' };

/**
 * 签发一个新码。
 *
 * 先把这个邮箱之前没用掉的全部作废：永远只有最新那个能用。
 * 不作废的话，攻击者可以攒一堆码来提高蒙中的概率。
 */
export async function issueCode(
  sb: SupabaseClient,
  email: string,
  nodeId: string | null,
): Promise<IssuedCode> {
  const code = generateCode();
  const codeHash = hashCode(email, code);
  if (!codeHash) return { ok: false, reason: 'no-secret' };

  await sb
    .from('login_codes')
    .update({ consumed_at: new Date().toISOString() })
    .eq('email', email)
    .is('consumed_at', null);

  const { error } = await sb.from('login_codes').insert({
    email,
    node_id: nodeId,
    code_hash: codeHash,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  if (error) {
    console.error('[loginCode] cannot store code', error.message);
    return { ok: false, reason: 'db' };
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
