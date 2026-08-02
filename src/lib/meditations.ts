import { createClient } from '@supabase/supabase-js';

export type TrackMood =
  | 'forest' | 'daily' | 'emotion' | 'care' | 'healing' | 'body' | 'kindness' | 'sleep';

/**
 * 声音的形态，决定这个分类用哪套版式渲染：
 * - guided  按主题浏览，随时挑一段（原来的样子）
 * - program 有阶段、按周解锁、要付费的陪伴营
 * - ambient 没有引导的纯声音，可循环
 * 这是给代码看的，用户在侧栏看到的始终是状态名（「改善睡眠」而不是「陪伴营」）。
 */
export type MeditationKind = 'guided' | 'program' | 'ambient';

export type ProgramPhase = {
  id: string;
  label: string;
  /** 1 | 2 | 3，决定解锁次序 */
  order: number;
  /** 上一周听完几段才开这一周。七段全听完太苛刻——漏一段就永远卡住。 */
  unlockAfter: number;
  description?: string;
  mood?: TrackMood;
};

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
  /** 缺省 guided，老数据不带这个字段也能正常跑 */
  kind?: MeditationKind;
  subtitle?: string;
  /** 卖点金句，program 版式里是最大的一块字 */
  highlight?: string;
  coverUrl?: string;
  teacherName?: string;
  teacherCredential?: string;
  phases?: ProgramPhase[];
  /** 免费试听前几段 */
  freeCount?: number;
  priceCents?: number;
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
  /** program 里的第几段（1–21）：定序，也用来划免费线 */
  seq?: number;
  phaseId?: string;
  /** ambient：可以一直循环放着 */
  loopable?: boolean;
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

/**
 * 21 天睡眠陪伴营的曲目，标题按 Wendy 给的 D01–D21 原样录入。
 * intention 和 duration 先留空，等音频传上来再补——这里不替她编文案。
 */
const SLEEP_PROGRAM_TITLES = [
  '觉察呼吸',
  '聆听身体',
  '身体扫描',
  '深呼吸 + 身体放松',
  '深度放松练习 · 腹式呼吸，缓解焦虑紧张',
  '深度放松练习 · 渐进式肌肉放松，快速缓解焦虑紧张',
  '正念行走',
  '接受一切',
  '应对焦虑的正念静坐冥想',
  '日常身心放松与获得平静的静观冥想',
  '活在当下，喜悦醒来',
  '花草静观冥想，打开五感，看见自己，看见世界',
  '无选择的自我觉知练习',
  '积极自我肯定，创造自信美好的一天',
  '全然自我接纳',
  '让自己放下，与失去和平共处',
  '告别过去',
  '创造现实',
  '湖畔意象松弛法冥想',
  '正念自我关爱冥想',
  '感恩冥想，带着喜悦心醒来',
];

function buildSleepProgramTracks(): MeditationTrack[] {
  return SLEEP_PROGRAM_TITLES.map((title, i) => {
    const seq = i + 1;
    const week = seq <= 7 ? 1 : seq <= 14 ? 2 : 3;
    return {
      id: `sleep-d${String(seq).padStart(2, '0')}`,
      title,
      intention: '',
      duration: '',
      stage: `第${['一', '二', '三'][week - 1]}周`,
      categoryId: 'sleep',
      mood: 'sleep' as TrackMood,
      seq,
      phaseId: `sleep-w${week}`,
    };
  });
}

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
    {
      id: 'sleep',
      label: '改善睡眠',
      kind: 'program',
      description: '21 天，从呼吸与放松开始，慢慢走到接纳与自我关爱。',
      heroTitle: '21 天睡眠陪伴营',
      subtitle: '以睡眠修心，活出生命好状态',
      highlight: '失眠要解决的不是睡的问题，而是醒的生命状态',
      mood: 'sleep',
      teacherName: 'Wendy',
      teacherCredential: 'GGSC 认证 MMTCP 正念冥想教师 · 师从 Jack Kornfield · 12 年践行',
      freeCount: 3,
      priceCents: 6800,
      phases: [
        { id: 'sleep-w1', label: '第一周 · 呼吸与身心放松', order: 1, unlockAfter: 0, mood: 'sleep' },
        { id: 'sleep-w2', label: '第二周 · 回归内心平静', order: 2, unlockAfter: 5, mood: 'healing' },
        { id: 'sleep-w3', label: '第三周 · 接纳与自我关爱', order: 3, unlockAfter: 5, mood: 'care' },
      ],
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
    ...buildSleepProgramTracks(),
  ],
};

const MOODS: TrackMood[] = [
  'forest', 'daily', 'emotion', 'care', 'healing', 'body', 'kindness', 'sleep',
];
const KINDS: MeditationKind[] = ['guided', 'program', 'ambient'];

function cleanText(value: unknown, fallback: string, max: number): string {
  if (typeof value !== 'string') return fallback;
  const text = value.trim();
  return (text || fallback).slice(0, max);
}

/**
 * 和 cleanText 的区别：允许清空。
 * 陪伴营的 intention / duration 一开始就是空的，用 cleanText 会被回退成
 * 兜底曲目的文案——那就等于凭空替人写了 21 段简介。
 */
function cleanOptional(value: unknown, fallback: string, max: number): string {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, max);
}

function cleanInt(value: unknown, fallback: number | undefined, min: number, max: number) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
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

function normalizePhases(value: unknown, fallback?: ProgramPhase[]): ProgramPhase[] | undefined {
  if (!Array.isArray(value)) return fallback;
  const phases: ProgramPhase[] = [];
  for (const item of value) {
    const r = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const id = cleanId(r.id, `phase-${phases.length + 1}`);
    if (phases.some(p => p.id === id)) continue;
    phases.push({
      id,
      label: cleanText(r.label, `第 ${phases.length + 1} 阶段`, 32),
      order: cleanInt(r.order, phases.length + 1, 1, 99) as number,
      unlockAfter: cleanInt(r.unlockAfter, 5, 0, 99) as number,
      description: cleanOptional(r.description, '', 140),
      mood: typeof r.mood === 'string' && MOODS.includes(r.mood as TrackMood)
        ? (r.mood as TrackMood)
        : undefined,
    });
    if (phases.length >= 12) break;
  }
  return phases.length ? phases.sort((a, b) => a.order - b.order) : fallback;
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
    const kind = typeof r.kind === 'string' && KINDS.includes(r.kind as MeditationKind)
      ? (r.kind as MeditationKind)
      : fallbackCategory.kind || 'guided';
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
      kind,
      subtitle: cleanOptional(r.subtitle, fallbackCategory.subtitle || '', 64),
      highlight: cleanOptional(r.highlight, fallbackCategory.highlight || '', 120),
      coverUrl: cleanOptional(r.coverUrl, fallbackCategory.coverUrl || '', 800),
      teacherName: cleanOptional(r.teacherName, fallbackCategory.teacherName || '', 24),
      teacherCredential: cleanOptional(r.teacherCredential, fallbackCategory.teacherCredential || '', 160),
      phases: normalizePhases(r.phases, fallbackCategory.phases),
      freeCount: cleanInt(r.freeCount, fallbackCategory.freeCount, 0, 99),
      priceCents: cleanInt(r.priceCents, fallbackCategory.priceCents, 0, 10_000_00),
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
    const seq = cleanInt(r.seq, undefined, 1, 999);
    const phaseId = typeof r.phaseId === 'string' ? cleanId(r.phaseId, '') : '';
    tracks.push({
      id,
      title: cleanText(r.title, fallbackTrack.title, 60),
      // intention / duration 允许为空：陪伴营的 21 段一开始就没有这两项
      intention: cleanOptional(r.intention, fallbackTrack.intention, 180),
      duration: cleanOptional(r.duration, fallbackTrack.duration, 24),
      stage: cleanText(r.stage, fallbackTrack.stage, 24),
      categoryId: categoryIds.has(categoryId) ? categoryId : categories[0].id,
      mood: moodRaw,
      ...(audioUrl ? { audioUrl } : {}),
      ...(seq === undefined ? {} : { seq }),
      ...(phaseId ? { phaseId } : {}),
      ...(r.loopable === true ? { loopable: true } : {}),
    });
    if (tracks.length >= 64) break;
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

/**
 * 一段音频对当前这个人来说处于什么状态。
 * 两道门是独立的：付费门管「有没有资格」，阶段门管「进度到没到」，
 * 付了钱也仍然要一周一周走——这是陪伴营和「买一堆音频」的区别。
 */
export type ProgramTrackState =
  | 'free'           // 免费试听
  | 'unlocked'       // 已付费且阶段已开
  | 'locked-paywall' // 没付费
  | 'locked-phase';  // 付了钱，但这一周还没轮到

export type ProgramPhaseView = {
  phase: ProgramPhase;
  tracks: { track: MeditationTrack; state: ProgramTrackState; done: boolean }[];
  unlocked: boolean;
  doneCount: number;
  /** 还差几段才开下一周；已经是最后一周或已达标时为 0 */
  remainingToNext: number;
};

export type ProgramView = {
  phases: ProgramPhaseView[];
  total: number;
  doneCount: number;
  /** 当前该看哪一周：第一个没走完的已解锁阶段 */
  activePhaseId: string;
  paid: boolean;
  freeCount: number;
};

export function isPlayable(state: ProgramTrackState): boolean {
  return state === 'free' || state === 'unlocked';
}

export function buildProgramView(
  content: MeditationContent,
  category: MeditationCategory,
  opts: { listened: string[]; paid: boolean },
): ProgramView {
  const listened = new Set(opts.listened);
  const freeCount = category.freeCount ?? 0;
  const phases = (category.phases || []).slice().sort((a, b) => a.order - b.order);
  const all = content.tracks
    .filter(t => t.categoryId === category.id)
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));

  const views: ProgramPhaseView[] = [];
  let prevDone = 0;
  let prevUnlocked = true;

  phases.forEach((phase, i) => {
    // 第一周永远是开的；之后每一周要等上一周听够 unlockAfter 段。
    // 上一周本身没解锁的话，后面的自然也开不了。
    const unlocked = i === 0 || (prevUnlocked && prevDone >= phase.unlockAfter);
    const inPhase = all.filter(t => t.phaseId === phase.id);
    const tracks = inPhase.map(track => {
      const free = (track.seq ?? 0) <= freeCount;
      let state: ProgramTrackState;
      if (free) state = 'free';
      else if (!opts.paid) state = 'locked-paywall';
      else if (!unlocked) state = 'locked-phase';
      else state = 'unlocked';
      return { track, state, done: listened.has(track.id) };
    });
    const doneCount = tracks.filter(t => t.done).length;
    const next = phases[i + 1];
    views.push({
      phase,
      tracks,
      unlocked,
      doneCount,
      remainingToNext: next ? Math.max(0, next.unlockAfter - doneCount) : 0,
    });
    prevDone = doneCount;
    prevUnlocked = unlocked;
  });

  const active = views.find(v => v.unlocked && v.doneCount < v.tracks.length)
    || [...views].reverse().find(v => v.unlocked)
    || views[0];

  return {
    phases: views,
    total: all.length,
    doneCount: all.filter(t => listened.has(t.id)).length,
    activePhaseId: active?.phase.id || '',
    paid: opts.paid,
    freeCount,
  };
}

/**
 * 把没买的那些段落的音频地址从返回给浏览器的数据里删掉。
 *
 * 只在前端画个锁是挡不住人的——整份 content 会随 RSC 一起发到浏览器，
 * 查看源码就能拿到全部 mp3 地址。所以过滤必须发生在服务端。
 *
 * 注意这里只管付费门，不管阶段门：进度存在浏览器本地，服务端不知道谁走到第几周。
 * 这是有意的——付费门是安全边界，阶段门只是给已经付过钱的人定节奏的，
 * 就算有人翻出地址跳到第三周，也只是打乱了自己的节奏，没有收入损失。
 */
export function stripLockedAudio(
  content: MeditationContent,
  paidCategoryIds: Set<string>,
): MeditationContent {
  const programs = new Map(
    content.categories.filter(c => c.kind === 'program').map(c => [c.id, c]),
  );
  if (programs.size === 0) return content;

  return {
    ...content,
    tracks: content.tracks.map(track => {
      const category = programs.get(track.categoryId);
      if (!category) return track;
      if (paidCategoryIds.has(category.id)) return track;
      if ((track.seq ?? 0) <= (category.freeCount ?? 0)) return track;
      if (!track.audioUrl) return track;
      const rest = { ...track };
      delete rest.audioUrl;
      return rest;
    }),
  };
}

/** 这个人买过哪些陪伴营。没登录就是空集。 */
export async function fetchPaidPrograms(memberId: string): Promise<Set<string>> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!memberId || !supabaseUrl || !serviceKey) return new Set();

  const sb = createClient(supabaseUrl, serviceKey);
  const { data, error } = await sb
    .from('program_orders')
    .select('program_id')
    .eq('member_id', memberId)
    .eq('status', 'paid');
  if (error || !data) return new Set();
  return new Set(data.map(row => String(row.program_id)));
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
