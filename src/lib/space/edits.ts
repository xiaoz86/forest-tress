/**
 * 个人空间的「编辑记录」：本人对 AI 起稿做了什么（确认、改写、隐藏），以及只属于网站的内容
 * （服务单的细节、章节顺序、首屏照片焦点、最近在读/在听/在学、一个生命故事）。
 *
 * 原则（v2 §7.2「最后一切可改；重新生成不覆盖手动修改过的部分」）：
 *   编辑记录优先。确认过、改过、隐藏过的块以编辑记录为准；没动过的块才显示 AI 起稿。
 *   所以重新生成画像时，只有「还没动过」的块会换成新的起稿。
 *
 * 前后端都能用，不引任何服务端依赖（类型从 portrait.ts 引入，编译后会被擦掉）。
 */
import type { SpaceDraft, WorkKind } from './portrait';

export type DraftBlock = 'tagline' | 'roles' | 'values' | 'services' | 'works';

export const DRAFT_BLOCK_LABEL: Record<DraftBlock, string> = {
  tagline: '一句话介绍',
  roles: '身份标签',
  values: '我在意的',
  services: '服务单',
  works: '作品分组',
};

/** ai：AI 起稿、还没确认；confirmed：本人确认过（存了一份快照）；edited：本人改过；hidden：本人不要；none：没有这一块 */
export type BlockMark = 'ai' | 'confirmed' | 'edited' | 'hidden' | 'none';

type Kept<T> = { state: 'confirmed' | 'edited'; value: T } | { state: 'hidden' };

export type ServiceFormat = '线上' | '线下' | '线上线下' | '未说明';

export type ServiceItem = {
  id: string;
  title: string;
  desc: string;
  format: ServiceFormat;
  /** 时长，自由填写：「60 分钟」「一个下午」 */
  duration: string;
  /** 一般什么时候能约：「周末下午」「工作日晚上」 */
  availability: string;
  /** 价格，自由填写；默认不公开（v2 §7.4「价格可选，默认不显示」） */
  price: string;
  showPrice: boolean;
};

export type LearningKind = 'read' | 'listen' | 'watch' | 'learn';

export const LEARNING_KIND_LABEL: Record<LearningKind, string> = {
  read: '在读',
  listen: '在听',
  watch: '在看',
  learn: '在学',
};

export type LearningItem = { id: string; kind: LearningKind; title: string; note: string; url: string };

export type ValueEntry = { text: string; quote: string | null };

export type ChapterKey = 'knowing' | 'path' | 'offer';
export const DEFAULT_ORDER: ChapterKey[] = ['knowing', 'path', 'offer'];
export const CHAPTER_LABEL: Record<ChapterKey, string> = {
  knowing: '我这个人',
  path: '走过的路',
  offer: '一起做点什么',
};

export type SpaceEdits = {
  tagline?: Kept<string>;
  roles?: Kept<string[]>;
  values?: Kept<ValueEntry[]>;
  services?: Kept<ServiceItem[]>;
  works?: Kept<Record<string, WorkKind>>;
  /** 中间三章的顺序；种子（最后一页）和尾声永远在最后 */
  order?: ChapterKey[];
  /** 首屏照片的焦点（0–100 的百分比），手机和桌面的裁切都跟着它 */
  cover?: { x: number; y: number };
  learning?: LearningItem[];
  /** 一个对我很重要的生命故事（放在种子层，可见性跟「心里的种子」一样） */
  story?: string;
  updatedAt?: string;
};

export const LIMITS_EDIT = {
  tagline: 40,
  role: 16,
  roles: 6,
  value: 30,
  values: 6,
  serviceTitle: 20,
  serviceDesc: 120,
  serviceShort: 30,
  services: 12,
  learningTitle: 40,
  learningNote: 60,
  learning: 8,
  story: 800,
} as const;

/** AI 服务单 → 可编辑的服务条目（没有的细节留空，本人补） */
export function servicesFromDraft(draft: SpaceDraft | null): ServiceItem[] {
  return (draft?.services ?? []).map((s, i) => ({
    id: `ai-${i}`,
    title: s.title,
    desc: s.desc,
    format: (['线上', '线下', '线上线下'].includes(s.format) ? s.format : '未说明') as ServiceFormat,
    duration: '',
    availability: '',
    price: '',
    showPrice: false,
  }));
}

export type Effective = {
  tagline: string;
  roles: string[];
  values: ValueEntry[];
  services: ServiceItem[];
  worksSplit: Record<string, WorkKind>;
  marks: Record<DraftBlock, BlockMark>;
  /** 还有 AI 起稿、本人还没确认 / 改过 / 隐藏的块 */
  pending: DraftBlock[];
};

function pick<T>(kept: Kept<T> | undefined, ai: T, hasAi: boolean, empty: T): { value: T; mark: BlockMark } {
  if (kept?.state === 'hidden') return { value: empty, mark: 'hidden' };
  if (kept) return { value: kept.value, mark: kept.state };
  return hasAi ? { value: ai, mark: 'ai' } : { value: empty, mark: 'none' };
}

/** 把 AI 起稿和本人的编辑合成一份「现在网站上显示的」 */
export function effectiveDraft(draft: SpaceDraft | null, edits: SpaceEdits | undefined): Effective {
  const e = edits ?? {};
  const aiValues: ValueEntry[] = (draft?.values ?? []).map(v => ({ text: v.text, quote: v.quote?.text ?? null }));
  const aiServices = servicesFromDraft(draft);
  const aiWorks = draft?.worksSplit ?? {};
  const tagline = pick(e.tagline, draft?.tagline?.trim() || '', !!draft?.tagline?.trim(), '');
  const roles = pick(e.roles, draft?.roles ?? [], !!draft?.roles?.length, []);
  const values = pick(e.values, aiValues, aiValues.length > 0, []);
  const services = pick(e.services, aiServices, aiServices.length > 0, []);
  const works = pick(e.works, aiWorks, Object.keys(aiWorks).length > 0, {});
  const marks: Record<DraftBlock, BlockMark> = {
    tagline: tagline.mark, roles: roles.mark, values: values.mark, services: services.mark, works: works.mark,
  };
  return {
    tagline: tagline.value,
    roles: roles.value,
    values: values.value,
    services: services.value,
    // 分组改过也只覆盖改过的那几件，其余还按 AI 的
    worksSplit: works.mark === 'hidden' ? {} : { ...aiWorks, ...(e.works && e.works.state !== 'hidden' ? e.works.value : {}) },
    marks,
    pending: (Object.keys(marks) as DraftBlock[]).filter(k => marks[k] === 'ai'),
  };
}

export function chapterOrder(edits: SpaceEdits | undefined): ChapterKey[] {
  const o = (edits?.order ?? []).filter((k): k is ChapterKey => DEFAULT_ORDER.includes(k as ChapterKey));
  const seen = new Set<ChapterKey>();
  const out: ChapterKey[] = [];
  for (const k of [...o, ...DEFAULT_ORDER]) if (!seen.has(k)) { seen.add(k); out.push(k); }
  return out;
}

/** 服务条目下面那一行小字：形式 · 时长 · 可约时间 · 价格（价格公开时） */
export function serviceMeta(s: ServiceItem): string {
  return [
    s.format !== '未说明' ? s.format : '',
    s.duration.trim(),
    s.availability.trim(),
    s.showPrice && s.price.trim() ? s.price.trim() : '',
  ].filter(Boolean).join(' · ');
}
