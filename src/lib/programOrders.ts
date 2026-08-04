import { createClient } from '@supabase/supabase-js';

/**
 * 陪伴营的开通申请。
 *
 * 第一版不接商户号：钱走微信/支付宝收款码，网站只管开权限。
 * 用户点解锁 → 建一条 pending 单并拿到四位口令 → 付款时把口令写进备注
 * → 主理人对着收款记录搜口令 → 一键置为 paid。
 *
 * 将来接了支付，改的只是「谁把 status 写成 paid」，表结构不动。
 */

// 去掉了 0/O 和 1/I/L：手输备注时最容易错的就是这几个，
// 而错一个字符就配不上账，整套对账机制就白做了。
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LEN = 4;

export type OrderStatus = 'pending' | 'paid' | 'rejected';

export type ProgramOrder = {
  id: string;
  programId: string;
  code: string;
  status: OrderStatus;
  amountCents: number;
  note: string;
  createdAt: string;
};

/** 给主理人看的，比上面多了「是谁」 */
export type AdminOrder = ProgramOrder & {
  memberId: string;
  memberName: string;
};

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function randomCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LEN; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

function toOrder(row: Record<string, unknown>): ProgramOrder {
  return {
    id: String(row.id),
    programId: String(row.program_id),
    code: String(row.code),
    status: String(row.status) as OrderStatus,
    amountCents: Number(row.amount_cents) || 0,
    note: String(row.note || ''),
    createdAt: String(row.created_at),
  };
}

/** 这个人在这个营上的最新一单（不管什么状态） */
export async function findLatestOrder(
  memberId: string,
  programId: string,
): Promise<ProgramOrder | null> {
  const sb = client();
  if (!sb || !memberId) return null;
  const { data, error } = await sb
    .from('program_orders')
    .select('*')
    .eq('member_id', memberId)
    .eq('program_id', programId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return toOrder(data);
}

export type EnsureResult =
  | { ok: true; order: ProgramOrder; created: boolean }
  | { ok: false; reason: 'not-configured' | 'failed' };

/**
 * 取这个人当前的开通申请；没有就建一条。
 *
 * 关键在于「已有 pending 就直接返回」：每进一次页面换一个口令的话，
 * 用户备注里写的是旧的，主理人在后台搜不到——这套对账当场就废了。
 */
export async function ensureOrder(
  memberId: string,
  programId: string,
  amountCents: number,
): Promise<EnsureResult> {
  const sb = client();
  if (!sb) return { ok: false, reason: 'not-configured' };

  const existing = await findLatestOrder(memberId, programId);
  if (existing && existing.status !== 'rejected') {
    return { ok: true, order: existing, created: false };
  }

  // 口令只在 pending 之间唯一（库里是部分唯一索引），撞了就换一个重试
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await sb
      .from('program_orders')
      .insert({
        member_id: memberId,
        program_id: programId,
        code: randomCode(),
        amount_cents: amountCents,
      })
      .select('*')
      .single();
    if (!error && data) return { ok: true, order: toOrder(data), created: true };
    // 23505 = unique_violation，换个口令再来；其他错误直接放弃
    if (error && error.code !== '23505') {
      console.error('[program-orders] insert failed', error.message);
      return { ok: false, reason: 'failed' };
    }
  }
  return { ok: false, reason: 'failed' };
}

/** 主理人看板：待确认的排前面，其余按时间倒序 */
export async function listOrders(limit = 100): Promise<AdminOrder[]> {
  const sb = client();
  if (!sb) return [];
  const { data, error } = await sb
    .from('program_orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];

  const ids = [...new Set(data.map(r => String(r.member_id)))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: cards } = await sb.from('node_cards').select('id,name').in('id', ids);
    (cards || []).forEach(c => names.set(String(c.id), String(c.name || '')));
  }

  return data
    .map(row => ({
      ...toOrder(row),
      memberId: String(row.member_id),
      memberName: names.get(String(row.member_id)) || '（已删除的节点）',
    }))
    .sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending'));
}

export async function setOrderStatus(
  orderId: string,
  status: Exclude<OrderStatus, 'pending'>,
  adminId: string,
  note = '',
): Promise<boolean> {
  const sb = client();
  if (!sb) return false;
  const { error } = await sb
    .from('program_orders')
    .update({
      status,
      note,
      confirmed_at: new Date().toISOString(),
      confirmed_by: adminId,
    })
    .eq('id', orderId);
  if (error) console.error('[program-orders] update failed', error.message);
  return !error;
}
