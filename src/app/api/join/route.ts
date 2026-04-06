import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

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

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json(
      { error: 'Failed to submit' },
      { status: 500 }
    );
  }
}
