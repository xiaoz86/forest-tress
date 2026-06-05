import { createClient } from '@supabase/supabase-js';

export type TrackMood = 'forest' | 'daily' | 'emotion' | 'care' | 'healing' | 'body' | 'kindness';

export type MeditationCategory = {
  id: string;
  label: string;
  description?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  mood?: TrackMood;
  sourceNote?: string;
  featureNote?: string;
  benefits?: string[];
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
  title: '走入正念，\n把注意力带回当下',
  description:
    '从走入正念开始，正念生活、情绪、自我关怀和内在自由，会成为几条慢慢展开的小径。每一段声音，都带人回到此刻。',
  note: '五条小径',
  categories: [
    {
      id: 'walk-in',
      label: '走入正念',
      description: '从暂停、放松和感官唤醒开始，先把注意力轻轻带回当下。',
      heroTitle: '走入正念',
      heroSubtitle: '从一段暂停，回到身心的现场',
      mood: 'forest',
    },
    {
      id: 'mindful-life',
      label: '正念生活',
      description: '把日常里的片刻，变成可以练习觉察的小路。',
      heroTitle: '正念生活',
      heroSubtitle: '在普通一天里，慢慢醒来',
      mood: 'daily',
    },
    {
      id: 'emotion',
      label: '正念与情绪',
      description: '在焦虑、压力和波动里，学习先看见情绪，再温柔地安放它。',
      heroTitle: '正念与情绪',
      heroSubtitle: '让情绪被看见，也被放下',
      mood: 'emotion',
    },
    {
      id: 'self-care',
      label: '自我关怀',
      description: '源自 Kristin Neff 等人发展出的正念自我关怀取向，把正念、慈心和自我友善放进可收听的练习里。它不急着修正自己，而是帮助人在困难时刻重新靠近自己。',
      heroTitle: '自我关怀',
      heroSubtitle: '与世界和自己和解，向幸福和快乐慢慢靠近',
      mood: 'care',
      sourceNote:
        '自我关怀并不是纵容自己，而是在压力、挫败或情绪翻涌时，仍然愿意以理解和善意回应自己。这个模块参考 Kristin Neff 等人发展出的正念自我关怀取向，把正念觉察、共同人性和自我友善，转化成可以反复收听的练习。',
      featureNote:
        '这里的声音从慈心、身体觉察和温柔提问进入：先让身体松下来，再看见内在正在发生什么，慢慢练习把关爱自己的力量带回日常关系里。',
      benefits: [
        '与世界和自己和解',
        '拥抱幸福和快乐',
        '减压放松',
        '培育幸福',
        '管理情绪',
        '悦纳自己',
        '增进情商',
        '改善关系',
        '收获关爱自己的力量',
      ],
    },
    {
      id: 'inner-freedom',
      label: '疗愈和内在自由',
      description: '让压抑、紧绷和旧有模式慢慢松动，给内在多一点空间。',
      heroTitle: '疗愈和内在自由',
      heroSubtitle: '在松动里，重新获得空间',
      mood: 'healing',
    },
  ],
  tracks: [
    {
      id: 'pause-into-now',
      title: '暂停进入当下',
      intention: '给自己一次短暂停靠，先把呼吸、身体和眼前的环境听见。',
      duration: '13 分钟',
      stage: '走入正念',
      categoryId: 'walk-in',
      mood: 'forest',
    },
    {
      id: 'mindful-senses',
      title: '活在当下的感官唤醒',
      intention: '透过感官回到此刻，让看见、听见和触碰重新变得清晰。',
      duration: '11 分钟',
      stage: '走入正念',
      categoryId: 'walk-in',
      mood: 'daily',
    },
    {
      id: 'conscious-relaxation',
      title: '有意识放松',
      intention: '从身体的松开进入正念，把紧绷一点点放下。',
      duration: '13 分钟',
      stage: '走入正念',
      categoryId: 'walk-in',
      mood: 'healing',
    },
    {
      id: 'self-compassion-10',
      title: '10 分钟自我关怀',
      intention: '以更温柔的语气靠近自己，给内在一个可以停留的位置。',
      duration: '11 分钟',
      stage: '走入正念',
      categoryId: 'walk-in',
      mood: 'care',
    },
  ],
};

const MOODS: TrackMood[] = ['forest', 'daily', 'emotion', 'care', 'healing', 'body', 'kindness'];

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

function cleanList(value: unknown, fallback: string[], maxItems: number, maxText: number): string[] {
  const items = Array.isArray(value) ? value : fallback;
  return items
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim().slice(0, maxText))
    .filter(Boolean)
    .slice(0, maxItems);
}

export function normalizeMeditationContent(input: unknown): MeditationContent {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const fallback = DEFAULT_MEDITATION_CONTENT;
  const categoriesRaw = Array.isArray(raw.categories) ? raw.categories : fallback.categories;
  const categories: MeditationCategory[] = [];
  for (const item of categoriesRaw) {
    const r = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const id = cleanId(r.id, `category-${categories.length + 1}`);
    const fallbackCategory = fallback.categories.find(c => c.id === id)
      || fallback.categories[categories.length]
      || fallback.categories[0];
    const label = cleanText(r.label, fallbackCategory.label, 16);
    const mood = typeof r.mood === 'string' && MOODS.includes(r.mood as TrackMood)
      ? (r.mood as TrackMood)
      : fallbackCategory.mood || 'forest';
    if (categories.some(c => c.id === id)) continue;
    categories.push({
      id,
      label,
      description: cleanText(r.description, fallbackCategory.description || '', 140),
      heroTitle: cleanText(r.heroTitle, fallbackCategory.heroTitle || label, 24),
      heroSubtitle: cleanText(r.heroSubtitle, fallbackCategory.heroSubtitle || fallbackCategory.description || '', 64),
      mood,
      sourceNote: cleanText(r.sourceNote, fallbackCategory.sourceNote || '', 320),
      featureNote: cleanText(r.featureNote, fallbackCategory.featureNote || '', 260),
      benefits: cleanList(r.benefits, fallbackCategory.benefits || [], 12, 18),
    });
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
