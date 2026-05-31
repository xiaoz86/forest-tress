import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { isAdminId } from '@/lib/admin';
import {
  DEFAULT_MEDITATION_CONTENT,
  MEDITATION_CONTENT_ID,
  normalizeMeditationContent,
} from '@/lib/meditations';

export const runtime = 'nodejs';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ content: DEFAULT_MEDITATION_CONTENT });
  }

  const sb = createClient(supabaseUrl, serviceKey);
  const { data } = await sb
    .from('meditation_content')
    .select('payload')
    .eq('id', MEDITATION_CONTENT_ID)
    .maybeSingle();

  return NextResponse.json({
    content: normalizeMeditationContent(data?.payload || DEFAULT_MEDITATION_CONTENT),
  });
}

export async function PATCH(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'supabase-not-configured' }, { status: 500 });
  }

  const cookieStore = await cookies();
  const memberId = cookieStore.get('nf_member')?.value;
  if (!isAdminId(memberId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad-json' }, { status: 400 });
  }

  const content = normalizeMeditationContent(body);
  const sb = createClient(supabaseUrl, serviceKey);
  const { error } = await sb
    .from('meditation_content')
    .upsert({
      id: MEDITATION_CONTENT_ID,
      payload: content,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    return NextResponse.json(
      { error: 'db-update-failed', detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ content });
}
