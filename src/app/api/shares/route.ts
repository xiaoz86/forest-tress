import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { isAdminId } from '@/lib/admin';
import { getAuthenticatedMemberId } from '@/lib/session';
import {
  DEFAULT_SHARE_CONTENT,
  SHARE_CONTENT_ID,
  getPublishedShares,
  normalizeShareContent,
} from '@/lib/shares';

export const runtime = 'nodejs';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ content: DEFAULT_SHARE_CONTENT });
  }

  const sb = createClient(supabaseUrl, serviceKey);
  const { data } = await sb
    .from('share_content')
    .select('payload')
    .eq('id', SHARE_CONTENT_ID)
    .maybeSingle();

  const content = normalizeShareContent(data?.payload || DEFAULT_SHARE_CONTENT);
  return NextResponse.json({
    content: { ...content, shares: getPublishedShares(content) },
  });
}

export async function PATCH(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'supabase-not-configured' }, { status: 500 });
  }

  const memberId = await getAuthenticatedMemberId();
  if (!isAdminId(memberId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad-json' }, { status: 400 });
  }

  const content = normalizeShareContent(body);
  const sb = createClient(supabaseUrl, serviceKey);
  const { error } = await sb
    .from('share_content')
    .upsert({
      id: SHARE_CONTENT_ID,
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
