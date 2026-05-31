import { createClient } from '@supabase/supabase-js';

export type TrackMood = 'settle' | 'listen' | 'ground';

export type MeditationCategory = {
  id: string;
  label: string;
};

export type MeditationTrack = {
  id: string;
  title: string;
  intention: string;
  duration: string;
  stage: string;
  categoryId: string;
  mood: TrackMood;
  audioUrl?: string;
};

export type MeditationContent = {
  eyebrow: string;
  title: string;
  description: string;
  note: string;
  categories: MeditationCategory[];
  tracks: MeditationTrack[];
};

export const MEDITATION_CONTENT_ID = 'forest-breath';

export const DEFAULT_MEDITATION_CONTENT: MeditationContent = {
  eyebrow: '林间呼吸',
  title: '好状态，\n从一段呼吸开始',
  description:
    '一段呼吸，一次停顿，一个还不急着回答的问题。声音会慢慢放在这里，像夜色里一条安静的小径。',
  note: '慢慢听见',
  categories: [
    { id: 'recommended', label: '推荐' },
    { id: 'breath', label: '呼吸' },
    { id: 'self', label: '看见' },
    { id: 'transition', label: '转场' },
  ],
  tracks: [
    {
      id: 'settle-breath',
      title: '安顿呼吸',
      intention: '从外面的节奏回到身体，让呼吸重新变得清晰。',
      duration: '8 分钟',
      stage: '初入林间',
      categoryId: 'breath',
      mood: 'settle',
    },
    {
      id: 'see-yourself',
      title: '看见此刻的自己',
      intention: '带着一个温柔的问题，听见内在真正关心的事。',
      duration: '12 分钟',
      stage: '自我探索',
      categoryId: 'self',
      mood: 'listen',
    },
    {
      id: 'transition-anxiety',
      title: '转型期的焦虑',
      intention: '给正在变化中的自己一点空间，重新感到脚下有地。',
      duration: '10 分钟',
      stage: '职业与生命转场',
      categoryId: 'transition',
      mood: 'ground',
    },
  ],
};

const MOODS: TrackMood[] = ['settle', 'listen', 'ground'];

function cleanText(value: unknown, fallback: string, max: number): string {
  if (typeof value !== 'string') return fallback;
  const text = value.trim();
  return (text || fallback).slice(0, max);
}

function cleanId(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const id = value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return id || fallback;
}

export function normalizeMeditationContent(input: unknown): MeditationContent {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const fallback = DEFAULT_MEDITATION_CONTENT;
  const categoriesRaw = Array.isArray(raw.categories) ? raw.categories : fallback.categories;
  const categories: MeditationCategory[] = [];
  for (const item of categoriesRaw) {
    const r = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const id = cleanId(r.id, `category-${categories.length + 1}`);
    const label = cleanText(r.label, fallback.categories[categories.length]?.label || '分类', 16);
    if (categories.some(c => c.id === id)) continue;
    categories.push({ id, label });
    if (categories.length >= 8) break;
  }
  if (categories.length === 0) categories.push(...fallback.categories);
  const categoryIds = new Set(categories.map(c => c.id));

  const tracksRaw = Array.isArray(raw.tracks) ? raw.tracks : fallback.tracks;
  const tracks: MeditationTrack[] = [];
  for (const item of tracksRaw) {
    const r = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const fallbackTrack = fallback.tracks[tracks.length] || fallback.tracks[0];
    const id = cleanId(r.id, `track-${tracks.length + 1}`);
    if (tracks.some(t => t.id === id)) continue;
    const categoryId = cleanId(r.categoryId, fallbackTrack.categoryId);
    const moodRaw = typeof r.mood === 'string' && MOODS.includes(r.mood as TrackMood)
      ? (r.mood as TrackMood)
      : fallbackTrack.mood;
    const audioUrl = typeof r.audioUrl === 'string' && /^https?:\/\//i.test(r.audioUrl.trim())
      ? r.audioUrl.trim().slice(0, 800)
      : undefined;
    tracks.push({
      id,
      title: cleanText(r.title, fallbackTrack.title, 60),
      intention: cleanText(r.intention, fallbackTrack.intention, 180),
      duration: cleanText(r.duration, fallbackTrack.duration, 24),
      stage: cleanText(r.stage, fallbackTrack.stage, 24),
      categoryId: categoryIds.has(categoryId) ? categoryId : categories[0].id,
      mood: moodRaw,
      ...(audioUrl ? { audioUrl } : {}),
    });
    if (tracks.length >= 24) break;
  }

  return {
    eyebrow: cleanText(raw.eyebrow, fallback.eyebrow, 24),
    title: cleanText(raw.title, fallback.title, 48),
    description: cleanText(raw.description, fallback.description, 260),
    note: cleanText(raw.note, fallback.note, 24),
    categories,
    tracks,
  };
}

export function getTracksForCategory(
  content: MeditationContent,
  categoryId: string,
): MeditationTrack[] {
  if (!categoryId || categoryId === 'recommended') return content.tracks;
  return content.tracks.filter(track => track.categoryId === categoryId);
}

export function getMeditationCategory(
  content: MeditationContent,
  categoryId: string,
): MeditationCategory {
  return content.categories.find(c => c.id === categoryId) || content.categories[0];
}

export async function fetchMeditationContent(): Promise<MeditationContent> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return DEFAULT_MEDITATION_CONTENT;

  const sb = createClient(supabaseUrl, serviceKey);
  const { data, error } = await sb
    .from('meditation_content')
    .select('payload')
    .eq('id', MEDITATION_CONTENT_ID)
    .maybeSingle();
  if (error || !data?.payload) return DEFAULT_MEDITATION_CONTENT;
  return normalizeMeditationContent(data.payload);
}
