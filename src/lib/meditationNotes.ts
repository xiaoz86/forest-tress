import { createClient } from '@supabase/supabase-js';

/**
 * 听后感悟：每段音频下的公开留言。
 *
 * 这批内容是失眠、焦虑、自我接纳——写感悟等于在公开场合谈自己的状态。
 * 所以匿名不是附加选项，是设计前提：库里留着 author_name 供主理人追溯，
 * 但只要 anonymous 为真，读接口就永不下发它。所有出库数据都必须经过
 * toPublicNote() 这道口，绝不把原始行直接交给浏览器。
 */

import { ANON_LABEL, NOTE_MAX_CHARS, type TrackNote } from './meditationNotesShared';

export { NOTE_MAX_CHARS };
export type { TrackNote };

const TABLE = 'meditation_notes';

type NoteRow = {
  id: string;
  track_id: string;
  member_id: string;
  author_name: string | null;
  anonymous: boolean;
  body: string;
  created_at: string;
};

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/** 唯一的出库口。member_id 和匿名者的真名都在这里被挡掉。 */
function toPublicNote(row: NoteRow, viewerId: string, avatars: Map<string, string>): TrackNote {
  const anon = Boolean(row.anonymous);
  return {
    id: row.id,
    trackId: row.track_id,
    author: anon ? ANON_LABEL : (row.author_name || '森林里的一个人'),
    avatarUrl: anon ? '' : (avatars.get(row.member_id) || ''),
    body: row.body,
    createdAt: row.created_at,
    mine: Boolean(viewerId) && row.member_id === viewerId,
  };
}

export async function fetchTrackNotes(trackId: string, viewerId: string): Promise<TrackNote[]> {
  const sb = client();
  if (!sb || !trackId) return [];

  const { data, error } = await sb
    .from(TABLE)
    .select('id,track_id,member_id,author_name,anonymous,body,created_at')
    .eq('track_id', trackId)
    .eq('status', 'visible')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error || !data) return [];

  const rows = data as NoteRow[];
  // 头像只查实名那些人的，匿名的一律不查——少一次暴露的机会
  const named = [...new Set(rows.filter(r => !r.anonymous).map(r => r.member_id))];
  const avatars = new Map<string, string>();
  if (named.length) {
    const { data: cards } = await sb
      .from('node_cards')
      .select('id,avatar_url')
      .in('id', named);
    (cards || []).forEach(c => avatars.set(String(c.id), String(c.avatar_url || '')));
  }

  return rows.map(r => toPublicNote(r, viewerId, avatars));
}

/** 一次把整个专题所有段落的条数取回来，避免 21 段各发一次请求 */
export async function fetchNoteCounts(trackIds: string[]): Promise<Record<string, number>> {
  const sb = client();
  if (!sb || trackIds.length === 0) return {};

  const { data, error } = await sb
    .from(TABLE)
    .select('track_id')
    .in('track_id', trackIds)
    .eq('status', 'visible')
    .limit(5000);
  if (error || !data) return {};

  const counts: Record<string, number> = {};
  for (const row of data as { track_id: string }[]) {
    counts[row.track_id] = (counts[row.track_id] || 0) + 1;
  }
  return counts;
}

export type CreateNoteResult =
  | { ok: true; note: TrackNote }
  | { ok: false; reason: 'not-configured' | 'empty' | 'too-long' | 'too-many' | 'failed' };

export async function createTrackNote(input: {
  trackId: string;
  programId: string;
  memberId: string;
  body: string;
  anonymous: boolean;
}): Promise<CreateNoteResult> {
  const sb = client();
  if (!sb) return { ok: false, reason: 'not-configured' };

  const body = input.body.trim();
  if (!body) return { ok: false, reason: 'empty' };
  if (body.length > NOTE_MAX_CHARS) return { ok: false, reason: 'too-long' };

  // 同一段下同一个人最多 5 条。感悟不是聊天室，这个上限既挡刷屏，
  // 也留了「过一阵再听、再写一条」的余地。
  const { count } = await sb
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('track_id', input.trackId)
    .eq('member_id', input.memberId)
    .eq('status', 'visible');
  if ((count ?? 0) >= 5) return { ok: false, reason: 'too-many' };

  const { data: card } = await sb
    .from('node_cards')
    .select('name,avatar_url')
    .eq('id', input.memberId)
    .maybeSingle();

  const { data, error } = await sb
    .from(TABLE)
    .insert({
      track_id: input.trackId,
      program_id: input.programId,
      member_id: input.memberId,
      author_name: String(card?.name || ''),
      anonymous: input.anonymous,
      body,
    })
    .select('id,track_id,member_id,author_name,anonymous,body,created_at')
    .single();
  if (error || !data) {
    console.error('[meditation-notes] insert failed', error?.message);
    return { ok: false, reason: 'failed' };
  }

  const avatars = new Map<string, string>();
  if (!input.anonymous) avatars.set(input.memberId, String(card?.avatar_url || ''));
  return { ok: true, note: toPublicNote(data as NoteRow, input.memberId, avatars) };
}

/** 作者可以撤回自己的；主理人可以下架任何一条。都是软删，留痕。 */
export async function hideTrackNote(
  noteId: string,
  memberId: string,
  isAdmin: boolean,
): Promise<boolean> {
  const sb = client();
  if (!sb) return false;

  const q = sb.from(TABLE).update({ status: 'hidden' }).eq('id', noteId);
  const { error } = isAdmin ? await q : await q.eq('member_id', memberId);
  return !error;
}
