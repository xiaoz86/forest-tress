import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { XiaoyaMemberContext } from './types.ts';

const ANONYMOUS_CONTEXT: XiaoyaMemberContext = {
  authenticated: false,
  displayName: '',
  isNewUser: true,
  hasPublishedWork: false,
};

function safeName(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 40) : '';
}

export async function getXiaoyaMemberContext(memberId: string): Promise<XiaoyaMemberContext> {
  if (!memberId) return ANONYMOUS_CONTEXT;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ...ANONYMOUS_CONTEXT, authenticated: true };

  try {
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await client
      .from('node_cards')
      .select('name, doing, topics, works')
      .eq('id', memberId)
      .maybeSingle();
    const works = Array.isArray(data?.works) ? data.works : [];
    const topics = Array.isArray(data?.topics) ? data.topics : [];
    return {
      authenticated: true,
      displayName: safeName(data?.name),
      isNewUser: !(safeName(data?.doing) && topics.length > 0),
      hasPublishedWork: works.length > 0,
    };
  } catch {
    return { ...ANONYMOUS_CONTEXT, authenticated: true };
  }
}

