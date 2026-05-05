import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { matchNodesAI } from '@/lib/match';
import { generateKeywordsAI } from '@/lib/keywords';
import { notifyNewNode } from '@/lib/notify';
import type { NodeCard } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: 'Supabase is not configured' },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await request.json();
    const baseRow: Record<string, unknown> = {
      name: body.name,
      city: body.city,
      doing: body.doing,
      topics: body.topics,
      experience: body.experience,
      offer: body.offer,
      seeking: body.seeking,
      product: body.product,
      wechat: body.wechat,
      email: body.email,
    };
    const rowWithInterests = { ...baseRow, interests: body.interests || '' };

    let { data, error } = await supabase
      .from('node_cards')
      .insert([rowWithInterests])
      .select();

    // 兼容尚未执行 ALTER TABLE 的库：interests 列缺失时回退
    if (error && /interests/i.test(error.message)) {
      console.warn('[api/join] interests column missing, retrying without it');
      ({ data, error } = await supabase
        .from('node_cards')
        .insert([baseRow])
        .select());
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // 插入成功后，读取其他节点做匹配（优先 AI，失败回落到规则）
    const newNode = (data?.[0] || null) as NodeCard | null;
    let matches: Awaited<ReturnType<typeof matchNodesAI>> = [];
    if (newNode) {
      const { data: allNodes } = await supabase
        .from('node_cards')
        .select('*');
      const others = ((allNodes || []) as NodeCard[]).filter(
        n => n.id !== newNode.id,
      );

      // 并行：AI 匹配 + AI 关键词生成
      const [aiMatches, aiKeywords] = await Promise.all([
        matchNodesAI(newNode, others, 3),
        generateKeywordsAI(newNode, 6),
      ]);
      matches = aiMatches;

      // 关键词写回当前行（keywords 列若不存在则静默忽略，不影响其余流程）
      if (aiKeywords.length > 0 && newNode.id) {
        const { error: updateErr } = await supabase
          .from('node_cards')
          .update({ keywords: aiKeywords })
          .eq('id', newNode.id);
        if (updateErr && !/keywords/i.test(updateErr.message)) {
          console.error('[api/join] keyword save failed', updateErr.message);
        }
      }

      // 通知主理人（fire-and-forget，失败不影响主流程）
      notifyNewNode(newNode).catch(err => {
        console.error('[api/join] notify failed', err);
      });
    }

    const res = NextResponse.json({
      success: true,
      data,
      matches,
      memberId: newNode?.id,
    });

    // 提交成功 → 标记为社区成员，让 /creators/[id] 详情页能看到联系方式 / 跳转链接
    if (newNode?.id) {
      res.cookies.set('nf_member', newNode.id, {
        httpOnly: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 365, // 1 年
      });
    }

    return res;
  } catch {
    return NextResponse.json(
      { error: 'Failed to submit' },
      { status: 500 }
    );
  }
}
