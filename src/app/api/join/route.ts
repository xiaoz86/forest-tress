import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { matchNodes } from '@/lib/match';
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
    const { data, error } = await supabase
      .from('node_cards')
      .insert([
        {
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
        },
      ])
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // 插入成功后，读取其他节点做规则匹配
    const newNode = (data?.[0] || null) as NodeCard | null;
    let matches: ReturnType<typeof matchNodes> = [];
    if (newNode) {
      const { data: allNodes } = await supabase
        .from('node_cards')
        .select('*');
      const others = ((allNodes || []) as NodeCard[]).filter(
        n => n.id !== newNode.id,
      );
      matches = matchNodes(newNode, others, 3);
    }

    return NextResponse.json({ success: true, data, matches });
  } catch {
    return NextResponse.json(
      { error: 'Failed to submit' },
      { status: 500 }
    );
  }
}
