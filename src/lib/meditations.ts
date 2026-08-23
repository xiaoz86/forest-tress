import { cache } from 'react';
import { createClient } from '@supabase/supabase-js';
import { trDeep } from '@/lib/contentTranslate';
import type { Locale } from '@/lib/locale';

export type TrackMood =
  | 'forest' | 'daily' | 'emotion' | 'care' | 'healing' | 'body' | 'kindness' | 'sleep';

/**
 * 内容的形态，决定这个分类用哪套版式渲染：
 * - guided  按主题浏览，随时挑一段（原来的样子）
 * - program 有阶段、按周解锁、要付费的陪伴营
 * - ambient 没有引导的纯声音，可循环
 * - film    有画面的影像，一支一支放，跟着节气走
 * 这是给代码看的，用户在侧栏看到的始终是状态名（「改善睡眠」而不是「陪伴营」）。
 */
export type MeditationKind = 'guided' | 'program' | 'ambient' | 'film';

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
  /** 收款码图片地址。没配的话解锁面板退回「加主理人微信」那条路。 */
  payQrUrl?: string;
};

export type MeditationTrack = {
  id: string;
  title: string;
  intention: string;
  duration: string;
  stage: string;
  categoryId: string;
  mood: TrackMood;
  /** 私有桶里的对象路径，如 `sleep-d01/1781755411028.mp3`。服务端专用，永不下发。 */
  audioPath?: string;
  /** 老数据：公开桶时代存的完整 URL。只用于迁移和兜底，新上传不再写。 */
  audioUrl?: string;
  /** 下发给浏览器的只有这个布尔值——有没有音频，而不是音频在哪 */
  hasAudio?: boolean;
  /** program 里的第几段（1–21）：定序，也用来划免费线 */
  seq?: number;
  phaseId?: string;
  /** ambient：可以一直循环放着 */
  loopable?: boolean;
  /**
   * film：影片地址。
   *
   * 和音频不一样，这里存的是完整的公开地址，不是对象路径——影像是免费公开的，
   * 没有资格要校验，再套一层 /api/.../stream 去换签名链接只是白白多一次跳转，
   * 还让 CDN 缓存不住。哪天要设门槛，照 audioPath 那套改回来即可。
   */
  videoUrl?: string;
  /** film：封面图。没有的话播放器在点开之前是一块黑的。 */
  posterUrl?: string;
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
    {
      id: 'ambient',
      label: '纯声音',
      kind: 'ambient',
      description: '手碟、颂钵、雨声。没有引导，放着就好。',
      heroTitle: '纯声音',
      heroSubtitle: '没有人说话，只有声音本身',
      mood: 'body',
    },
    {
      // 这一条要和 SOLAR_TERMS_CATEGORY_ID 对上，节气条认的是这个 id
      id: 'solar-terms',
      label: '四时身心',
      kind: 'film',
      description: '一年有二十四次转身。跟着节气，把身与心慢下来一些——该收的时候收，该藏的时候藏。',
      heroTitle: '四时身心',
      heroSubtitle: '顺着时令走，一年有二十四次慢下来的机会',
      mood: 'body',
      sourceNote:
        '静心体会自身己心，感受天地四季变化，花鸟鱼虫浮沉，意气神体互感，远取诸物，近取诸身。答案在这里。\n——《经典中医启蒙》',
      benefits: ['顺应时节', '身心慢下来', '收敛与储藏', '身体感知', '与自然同步'],
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
    // 纯声音的示例条目。名字是 Wendy 点过的三类，音频还没有；
    // 真正入库要走 seed-ambient.mjs，管理页也能自己加。
    {
      id: 'ambient-handpan',
      title: '手碟',
      intention: '金属的余韵一圈圈散开，适合什么都不做的时候',
      duration: '',
      stage: '纯声音',
      categoryId: 'ambient',
      mood: 'body',
      loopable: true,
    },
    {
      id: 'ambient-bowl',
      title: '颂钵',
      intention: '低频的振动，适合入睡时放着',
      duration: '',
      stage: '纯声音',
      categoryId: 'ambient',
      mood: 'healing',
      loopable: true,
    },
    {
      id: 'ambient-rain',
      title: '雨声',
      intention: '没有旋律的雨，把注意力放在别处',
      duration: '',
      stage: '纯声音',
      categoryId: 'ambient',
      mood: 'forest',
      loopable: true,
    },
    // 二十四节气的第一支。seq 是节气序号（立春 1 … 处暑 14 … 大寒 24），
    // 不是「第几支影片」——这样后做的节气插进来时不用重排。
    // 影片地址由 scripts/upload-film.mjs 传完之后写回，这里先留空。
    {
      id: 'solar-chushu',
      // 标题带上这一期的一句话。节气条上的「处暑」来自 solarTerms.ts 那张表，
      // 不受这里影响，所以两边不会打架。
      title: '处暑｜慢下来，开始收藏能量',
      intention: '顺应时节，处暑过后附近森林陪伴大家有意识地让身与心慢下来一些，开始进入能量储藏状态。',
      duration: '16 分钟',
      stage: '秋',
      categoryId: 'solar-terms',
      mood: 'body',
      seq: 14,
    },
  ],
};

const MOODS: TrackMood[] = [
  'forest', 'daily', 'emotion', 'care', 'healing', 'body', 'kindness', 'sleep',
];
const KINDS: MeditationKind[] = ['guided', 'program', 'ambient', 'film'];

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
      payQrUrl: cleanOptional(r.payQrUrl, fallbackCategory.payQrUrl || '', 800),
    });
    // 上限只是防一份坏 payload 把页面撑爆，不是产品限制。
    // 加上影像专题已经是第 6 条小径，8 太贴脸了。
    if (categories.length >= 12) break;
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
    const audioPath = typeof r.audioPath === 'string' && r.audioPath.trim()
      ? r.audioPath.trim().replace(/^\/+/, '').slice(0, 400)
      : undefined;
    // 影像的两个地址：只收 http(s) 的完整地址，别的一律当没填。
    // 存进来的东西会直接进 <video src>，不挡一下的话 javascript: 这类
    // 也能被后台一路写到页面上。
    const videoUrl = typeof r.videoUrl === 'string' && /^https?:\/\//i.test(r.videoUrl.trim())
      ? r.videoUrl.trim().slice(0, 900)
      : undefined;
    const posterUrl = typeof r.posterUrl === 'string' && /^https?:\/\//i.test(r.posterUrl.trim())
      ? r.posterUrl.trim().slice(0, 900)
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
      ...(audioPath ? { audioPath } : {}),
      ...(seq === undefined ? {} : { seq }),
      ...(phaseId ? { phaseId } : {}),
      ...(r.loopable === true ? { loopable: true } : {}),
      ...(videoUrl ? { videoUrl } : {}),
      ...(posterUrl ? { posterUrl } : {}),
    });
    // 二十四节气一支一条，做满就要 24 条；64 会在一年之内顶到。
    if (tracks.length >= 128) break;
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

/** 老数据存的是完整公开 URL，桶转私有后要还原成对象路径 */
export function resolveAudioPath(track: MeditationTrack): string {
  if (track.audioPath) return track.audioPath;
  if (!track.audioUrl) return '';
  const m = track.audioUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/meditations\/(.+?)(?:\?|$)/);
  return m ? decodeURIComponent(m[1]) : '';
}

/**
 * 整理成能安全发给浏览器的样子：把音频「在哪」全部拿掉，只留「有没有」。
 *
 * 浏览器永远拿不到地址——播放一律走 /api/meditations/stream?track=xxx，
 * 由那条路由校验资格后现发一条短时效签名链接。这样即使有人扒源码、
 * 转发链接，拿到的也只是一个会 403 或很快过期的入口。
 */
export function prepareClientContent(
  content: MeditationContent,
  locale: Locale = 'zh',
): MeditationContent {
  const stripped: MeditationContent = {
    ...content,
    tracks: content.tracks.map(track => {
      const rest: MeditationTrack = { ...track, hasAudio: Boolean(resolveAudioPath(track)) };
      delete rest.audioPath;
      delete rest.audioUrl;
      return rest;
    }),
  };
  /*
    分类名、音频标题这些字是主理人在后台填的，存在库里，代码改不了。
    英文界面下按原文查一遍译文表（对照表由 scripts/translate-content.mjs 生成）：
    库里的原文一个字不动，查不到就照旧显示中文。
    id、mood、coverUrl 这些不含中文的字段查表时会原样返回，不用单独排除。
  */
  return trDeep(stripped, locale);
}

/**
 * 这一段对这个人开不开放。stream 路由和前端共用同一套判断。
 *
 * 只管付费门，不管阶段门：进度存在浏览器本地，服务端不知道谁走到第几周。
 * 这是有意的——付费门是安全边界，阶段门只是给已经付过钱的人定节奏的，
 * 就算有人跳到第三周，也只是打乱了自己的节奏，没有收入损失。
 */
export function canAccessTrack(
  content: MeditationContent,
  track: MeditationTrack,
  paidCategoryIds: Set<string>,
): boolean {
  const category = content.categories.find(c => c.id === track.categoryId);
  if (!category || category.kind !== 'program') return true;   // 引导和纯声音都免费
  if (paidCategoryIds.has(category.id)) return true;
  return (track.seq ?? 0) <= (category.freeCount ?? 0);
}

/**
 * 这个人能听哪些陪伴营。没登录就是空集。
 *
 * 两种算数：主理人确认过的（status = paid），以及自己说付了、传了截图、
 * 还没被处理的（pending + claimed_at）。后者是「先开后审」：人转完账
 * 到手机上就能听，主理人对账在后面跟着走；对不上就驳回，权限当场收回。
 *
 * 之所以只能这样：个人收款码没有回调，服务器无从知道钱到没到。
 * 要么让每个付完的人干等主理人醒过来，要么先给、核对不上再撤。
 *
 * 先开后审只给第一次：confirmed_at 非空说明这一单被处理过（多半是驳回过），
 * 那之后再传截图就得等人确认。否则驳回等于没有——传张图、被驳、再传一张，
 * 权限自己就回来了，而每一轮还会给两位主理人各刷一封通知。
 *
 * 代价是一段时间的白听：¥68 的风险有限，而干等的代价是每一单都要付的。
 * 真要收紧，只要把 claimed_at 那一支去掉。
 */
export async function fetchPaidPrograms(memberId: string): Promise<Set<string>> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!memberId || !supabaseUrl || !serviceKey) return new Set();

  const sb = createClient(supabaseUrl, serviceKey);
  const { data, error } = await sb
    .from('program_orders')
    .select('program_id,status,claimed_at,confirmed_at')
    .eq('member_id', memberId)
    .in('status', ['paid', 'pending']);
  if (error || !data) {
    // 查询一坏，所有人当场变成没买过——付费墙立起来，音频 403。
    // 不留这行日志的话，线上只会看到「大家都说听不了」，日志里一片安静。
    if (error) console.error('[meditations] fetchPaidPrograms failed', error.message);
    return new Set();
  }
  return new Set(
    data
      .filter(row => row.status === 'paid' || (row.claimed_at && !row.confirmed_at))
      .map(row => String(row.program_id)),
  );
}

/**
 * 用 cache() 包一层：同一次请求里 generateMetadata 和页面本体都要这份内容，
 * 不包的话一次页面访问要查两遍库。cache 只在一次请求内有效，
 * 不会把内容缓存到下一个访客那里——主理人在后台改完刷新就能看到。
 */
export const fetchMeditationContent = cache(async function fetchMeditationContent(): Promise<MeditationContent> {
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
});
