import { createClient } from '@supabase/supabase-js';
import { after, NextRequest, NextResponse } from 'next/server';
import { isAdminId } from '@/lib/admin';
import { getLocale } from '@/lib/locale';
import { matchNodesAI } from '@/lib/match';
import { NODE_LISTED, fetchMatchPool, shouldPromoteToListed } from '@/lib/nodeVisibility';
import { getAuthenticatedMemberId } from '@/lib/session';
import type { NodeCard } from '@/lib/supabase';
import { toRecommendationSnapshot } from '../join/route';

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TEXT_FIELDS = [
  'name',
  'city',
  'doing',
  'experience',
  'offer',
  'seeking',
  'product',
  'wechat',
  'interests',
  'beauty',
  'seed',
] as const;

const LIMITS: Record<string, number> = {
  name: 60,
  city: 60,
  doing: 600,
  experience: 600,
  offer: 600,
  seeking: 600,
  product: 600,
  wechat: 80,
  interests: 240,
  beauty: 800,
  seed: 800,
  email: 200,
};

/**
 * PATCH /api/profile?id=...
 * body: JSON — 每个字段独立可选；未传则保留原值。
 *   text fields:  TEXT_FIELDS 列表
 *   email:  必须合法格式；改邮箱会同时校验唯一
 *   topics: string[]，最多 12 条
 *
 * 仅本人 / 管理员可调用。
 */
export async function PATCH(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'supabase-not-configured' }, { status: 500 });
  }

  const nodeId = request.nextUrl.searchParams.get('id')?.trim();
  if (!nodeId) return NextResponse.json({ error: 'missing-id' }, { status: 400 });

  const memberId = await getAuthenticatedMemberId();
  const isOwner = !!memberId && memberId === nodeId;
  const isAdmin = isAdminId(memberId);
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'bad-json' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  for (const f of TEXT_FIELDS) {
    if (!(f in body)) continue;
    const v = body[f];
    if (typeof v !== 'string') {
      return NextResponse.json({ error: `bad-${f}` }, { status: 400 });
    }
    patch[f] = v.trim().slice(0, LIMITS[f]);
  }
  if ('name' in patch && !(patch.name as string)) {
    return NextResponse.json({ error: 'name-required' }, { status: 400 });
  }

  if ('email' in body) {
    const e = body.email;
    if (typeof e !== 'string' || !EMAIL_RE.test(e.trim())) {
      return NextResponse.json({ error: 'email-invalid' }, { status: 400 });
    }
    patch.email = e.trim().toLowerCase().slice(0, LIMITS.email);
  }

  /**
   * 进不进「附近星空」。和资料字段不同，这是**意愿**，所以：
   * 只认真正的布尔值，不做 truthy 转换——前端传错类型时应该报错，
   * 而不是把一个人静悄悄放回他关掉过的那片天上。
   */
  if ('in_sky' in body) {
    if (typeof body.in_sky !== 'boolean') {
      return NextResponse.json({ error: 'bad-in_sky' }, { status: 400 });
    }
    patch.in_sky = body.in_sky;
  }

  if ('topics' in body) {
    const raw = body.topics;
    if (!Array.isArray(raw)) {
      return NextResponse.json({ error: 'bad-topics' }, { status: 400 });
    }
    const cleaned: string[] = [];
    for (const t of raw) {
      if (typeof t !== 'string') continue;
      const v = t.trim().slice(0, 24);
      if (!v) continue;
      if (cleaned.includes(v)) continue;
      cleaned.push(v);
      if (cleaned.length >= 12) break;
    }
    patch.topics = cleaned;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing-to-update' }, { status: 400 });
  }

  const sb = createClient(supabaseUrl, serviceKey);

  // 邮箱被改 → 校验未被其他成员占用
  if (typeof patch.email === 'string') {
    const { data: dup } = await sb
      .from('node_cards')
      .select('id')
      .ilike('email', patch.email as string)
      .neq('id', nodeId)
      .limit(1);
    if (dup && dup.length > 0) {
      return NextResponse.json({ error: 'email-taken' }, { status: 409 });
    }
  }

  /**
   * 存之前先看这次改动会不会把人送进森林。
   *
   * patch 只带被改过的字段，光看它判断不了「填完没有」——得拿改完之后的整张卡去判。
   * 所以先读一次现状，和 patch 合出结果再问 shouldPromoteToListed。
   */
  const { data: before } = await sb
    .from('node_cards')
    .select('*')
    .eq('id', nodeId)
    .single();
  const merged = { ...(before as NodeCard | null), ...patch } as NodeCard;
  const promoting = shouldPromoteToListed((before as NodeCard | null)?.status, merged);

  const { data, error } = await sb
    .from('node_cards')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
      ...(promoting ? { status: NODE_LISTED } : {}),
    })
    .eq('id', nodeId)
    .select()
    .single();
  if (error) {
    if (/column/i.test(error.message)) {
      return NextResponse.json(
        { error: 'column-missing', detail: error.message },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: 'db-update-failed', detail: error.message },
      { status: 500 },
    );
  }

  /**
   * 刚进森林的人，当场给他算一批同频伙伴。
   *
   * 不补这一下的话，走轻登记进来、后来才把卡填完的人，节点页上那块推荐区是空的——
   * 推荐只在「注册提交那一刻」和「本人手动点重新生成」两个时机生成，
   * draft → listed 不在其中。而他恰恰是最想看看森林里有谁的那个人。
   * 走正常注册的人在提交那一刻就拿到了，两条路不该在这里分叉。
   *
   * 用 after()：算 AI 要几秒，不该让保存按钮在那儿转圈。失败也不影响这次保存，
   * 他仍然可以自己去点「重新生成」。
   */
  if (promoting && data) {
    after(async () => {
      try {
        const pool = await fetchMatchPool(sb, nodeId);
        const matches = await matchNodesAI(data as NodeCard, pool, 3, await getLocale());
        if (matches.length === 0) return;
        await sb
          .from('node_cards')
          .update({
            ai_recommendations: matches.map(toRecommendationSnapshot),
            ai_recommendations_at: new Date().toISOString(),
          })
          .eq('id', nodeId);
      } catch (err) {
        console.error('[api/profile] 进森林后补算推荐失败', err);
      }
    });
  }

  return NextResponse.json({ node: data, promoted: promoting });
}
