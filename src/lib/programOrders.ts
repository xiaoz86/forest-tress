import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

/**
 * 陪伴营的开通申请。
 *
 * 第一版不接商户号：钱走支付宝个人收款码，网站只管开权限。
 * 用户点解锁 → 建一条 pending 单 → 扫码付款 → 回来传一张付款截图
 * → 权限当场先开 → 主理人对着收款记录核一眼，确认或驳回。
 *
 * code（四位短号）留着：付款备注已经不要求填了，但它仍是这张单在看板上
 * 一眼能认的短名字，邮件里也带着它直接定位到那一行。
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
  /**
   * 用户点「我付好了」并传上截图的时刻。到这一刻权限就先开了，主理人事后核对。
   * 个人收款码没有回调，服务器无从知道钱到没到；与其让每个人付完干等，
   * 不如先给，核对不上再撤。
   */
  claimedAt: string | null;
  /** 有没有截图可看。对象路径不下发给浏览器——桶是私有的，给了也只是误导。 */
  hasProof: boolean;
  /**
   * 主理人处理过这个人这一单（确认或驳回）。重新申请时这条痕迹不清除，
   * 「先开后审」就只给第一次：被驳回过的人再传截图，得等人确认。
   * 否则驳回等于没有——传张图、被驳回、再传一张，权限自己就回来了。
   */
  judgedBefore: boolean;
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

/** 同一会员的同一系列始终用同一个主键，让并发双击由数据库原子去重。 */
function stableOrderId(memberId: string, programId: string): string {
  const hex = createHash('sha256')
    .update(`nearby-forest/program-order/${memberId}/${programId}`)
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
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
    claimedAt: row.claimed_at ? String(row.claimed_at) : null,
    hasProof: Boolean(row.proof_path),
    judgedBefore: Boolean(row.confirmed_at),
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

  // 口令只在 pending 之间唯一（库里是部分唯一索引），撞了就换一个重试。
  // 一张被驳回的单直接重置，不无限堆新行。
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const values = {
      member_id: memberId,
      program_id: programId,
      code: randomCode(),
      amount_cents: amountCents,
      status: 'pending',
      note: '',
      created_at: new Date().toISOString(),
      // 重新申请就是一张新单：上一轮的截图和「我付好了」不能顺延过来，
      // 否则被驳回的人一点重新申请，权限又自己开回去了。
      claimed_at: null,
      proof_path: '',
    };
    const query = existing
      ? // 注意这里不重置 confirmed_at / confirmed_by：它们是「这个人这一单
        // 已经被处理过一次」的唯一痕迹，先开后审据此只给第一次。
        sb.from('program_orders').update(values).eq('id', existing.id).eq('status', 'rejected')
      : sb.from('program_orders').insert({
          id: stableOrderId(memberId, programId),
          ...values,
          confirmed_at: null,
          confirmed_by: null,
        });
    const { data, error } = await query.select('*').maybeSingle();
    if (!error && data) return { ok: true, order: toOrder(data), created: true };

    // 另一个请求已经先建好同一张单，直接返回它。
    const concurrent = await findLatestOrder(memberId, programId);
    if (concurrent && concurrent.status !== 'rejected') {
      return { ok: true, order: concurrent, created: false };
    }

    // 23505 = 口令撞了，换一个再来；其他错误直接放弃。
    if (error && error.code !== '23505') {
      console.error('[program-orders] insert failed', error.message);
      return { ok: false, reason: 'failed' };
    }
  }
  return { ok: false, reason: 'failed' };
}

function orderRank(o: ProgramOrder): number {
  if (o.status === 'pending' && o.claimedAt) return 2;
  if (o.status === 'pending') return 1;
  return 0;
}

/** 主理人看板：待核对的排前面，其余按时间倒序 */
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
    // 传了截图的排最前：那些人已经在听了，等着你去收款记录里核对。
    // 只点过解锁、还没付款的次之，已结的沉底。
    .sort((a, b) => orderRank(b) - orderRank(a));
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

/** 单据 + 是谁 + 截图在桶里的路径。只在服务端用。 */
export type OrderDetail = AdminOrder & { proofPath: string };

export async function getOrderById(orderId: string): Promise<OrderDetail | null> {
  const sb = client();
  if (!sb || !orderId) return null;
  const { data, error } = await sb
    .from('program_orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();
  if (error || !data) return null;

  const memberId = String(data.member_id);
  const { data: card } = await sb
    .from('node_cards')
    .select('name')
    .eq('id', memberId)
    .maybeSingle();

  return {
    ...toOrder(data),
    memberId,
    memberName: String(card?.name || '') || '（已删除的节点）',
    proofPath: String(data.proof_path || ''),
  };
}

/**
 * 记下「我付好了」，并挂上那张截图。
 *
 * 条件写死在 where 里（本人 + 仍是待确认），所以别人的单、已经结掉的单
 * 都改不动——这一步等于把权限先开出去，判断不能只放在调用方。
 */
export async function attachProof(
  orderId: string,
  memberId: string,
  proofPath: string,
): Promise<ProgramOrder | null> {
  const sb = client();
  if (!sb || !orderId || !memberId || !proofPath) return null;
  const { data, error } = await sb
    .from('program_orders')
    .update({ claimed_at: new Date().toISOString(), proof_path: proofPath })
    .eq('id', orderId)
    .eq('member_id', memberId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();
  if (error) {
    console.error('[program-orders] attach proof failed', error.message);
    return null;
  }
  return data ? toOrder(data) : null;
}
