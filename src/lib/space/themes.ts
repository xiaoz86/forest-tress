/**
 * 个人空间的风格系统。
 *
 * 每套主题都落在同样的四个维度上，取值 -2…2。画像给出一个人在这四个维度上的位置，
 * 风格测试再校准一次，两者都能直接和主题比距离——所以推荐是算出来的、可解释的，
 * 「为什么像你」能落到具体哪一维、引用哪一句原话，而不是让模型直接吐一个主题名。
 *
 * 这个文件客户端、服务端都会用，不能引入任何服务端依赖。
 */

export type DimensionKey = 'warmth' | 'energy' | 'texture' | 'density';
export type StyleVector = Record<DimensionKey, number>;

export const DIMENSIONS: { key: DimensionKey; low: string; high: string }[] = [
  { key: 'warmth', low: '清冷', high: '温暖' },
  { key: 'energy', low: '安静', high: '明亮有活力' },
  { key: 'texture', low: '利落现代', high: '人文手作' },
  { key: 'density', low: '疏朗留白', high: '丰盈饱满' },
];

export type ThemeTokens = {
  bg: string;
  surface: string;
  ink: string;
  inkSoft: string;
  /** 只用于线和装饰；小字用 meta */
  muted: string;
  /** 小字颜色，对 bg ≥ 4.5:1 */
  meta: string;
  accent: string;
  accentInk: string;
  /** 强调色用作小字、链接、按钮底时的深一档（原 accent 在浅底上做字不够清楚） */
  accentText: string;
  accentSoft: string;
  line: string;
  headFont: string;
  bodyFont: string;
  headWeight: number;
  radius: string;
  /** 章与章之间的呼吸感，疏朗的主题更大 */
  gap: string;
  /** 正文行宽 */
  measure: string;

  // ── 首屏：照片在上（桌面在右），文字在一张「纸幅」上 ──
  /** 纸幅深还是浅：深纸幅配什么照片都稳 */
  cover: 'dark' | 'light';
  sheet: string;
  sheetInk: string;
  sheetSoft: string;
  /** 照片的边缘：羽化 / 拱门 / 相纸 / 雾 / 硬边 */
  edge: 'feather' | 'arch' | 'print' | 'fog' | 'rule';
  /** 移动端照片溶进纸幅的高度 */
  fade: string;
  photoFilter: string;
  photoTint: string;
  /** 桌面左侧「同一张照片的模糊版」的不透明度 */
  amb: number;
  /** 照片还没到时的底色 */
  coverBase: string;
  /** 没有照片时的画面 */
  art: string;
  /** 没有照片时，名字首字水印 */
  glyph: string;
  glyphOpacity: number;
  coverAlign: 'left' | 'center';
  nameTrack: string;
  nameScale: number;

  // ── 往下 ──
  /** 「那一幕」满幅色块 */
  band: string;
  bandInk: string;
  /** 尾声 */
  back: string;
  backInk: string;
  /** 每章第一段正文放大一档（导语段） */
  lede: boolean;
  numerals: 'latin' | 'han';
};

export type SpaceTheme = {
  id: string;
  name: string;
  temperament: string;
  blurb: string;
  vector: StyleVector;
  tokens: ThemeTokens;
};

export const SERIF = "'EB Garamond', 'Noto Serif SC', 'Songti SC', 'STSong', serif";
export const SANS = "'Manrope', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif";

export const THEMES: SpaceTheme[] = [
  {
    id: 'forest',
    name: '林间米白',
    temperament: '自然温暖',
    blurb: '米白的纸、森林的绿、宋体的标题。像走进一片安静的林子。',
    vector: { warmth: 2, energy: 0, texture: 1, density: -1 },
    tokens: {
      bg: '#f5f1e8', surface: '#fbf9f4', ink: '#1e3528', inkSoft: '#46574b', muted: '#8a917f', meta: '#646b5b',
      accent: '#2f513d', accentInk: '#f5f1e8', accentText: '#2f513d', accentSoft: '#e4eadb', line: '#e1dccd',
      headFont: SERIF, bodyFont: SANS, headWeight: 500, radius: '16px', gap: '88px', measure: '34em',
      cover: 'dark', sheet: '#1e3528', sheetInk: '#f5f1e8', sheetSoft: '#c9d2c4',
      edge: 'feather', fade: '56px', photoFilter: 'saturate(.92) contrast(1.02)', photoTint: 'none', amb: 0.25,
      coverBase: '#2a4435', art: 'radial-gradient(120% 90% at 80% 20%, #3d6a4f, #1e3528 55%, #14261b)',
      glyph: '#f5f1e8', glyphOpacity: 0.1, coverAlign: 'left', nameTrack: '0.02em', nameScale: 1,
      band: '#2f513d', bandInk: '#f5f1e8', back: '#1e3528', backInk: '#f5f1e8', lede: true, numerals: 'latin',
    },
  },
  {
    id: 'bloom',
    name: '晨光花园',
    temperament: '明亮活力',
    blurb: '奶油底色上的珊瑚与向日葵，圆润、饱满、有笑意。',
    vector: { warmth: 1, energy: 2, texture: 0, density: 1 },
    tokens: {
      bg: '#fff8ee', surface: '#ffffff', ink: '#3a2a22', inkSoft: '#6b5448', muted: '#a8948a', meta: '#796b63',
      accent: '#d9745a', accentInk: '#ffffff', accentText: '#b84f36', accentSoft: '#fde6d4', line: '#f2e2d2',
      headFont: SANS, bodyFont: SANS, headWeight: 700, radius: '24px', gap: '64px', measure: '32em',
      cover: 'light', sheet: '#fff8ee', sheetInk: '#3a2a22', sheetSoft: '#6b5448',
      edge: 'arch', fade: '40px', photoFilter: 'saturate(1.06) brightness(1.03)',
      photoTint: 'radial-gradient(60% 50% at 88% 8%, rgb(255 190 120 / 0.35), transparent 70%)', amb: 0.1,
      coverBase: '#fde6d4',
      art: 'radial-gradient(42% 36% at 72% 30%, #ffd9a8, transparent 70%), radial-gradient(46% 40% at 28% 74%, #fbc4b0, transparent 70%), #fff8ee',
      glyph: '#d9745a', glyphOpacity: 0.16, coverAlign: 'left', nameTrack: '-0.01em', nameScale: 1.05,
      band: '#fde6d4', bandInk: '#3a2a22', back: '#3a2a22', backInk: '#fff8ee', lede: false, numerals: 'latin',
    },
  },
  {
    id: 'ink',
    name: '墨与留白',
    temperament: '安静人文',
    blurb: '大面积留白，细线，墨色的衬线字。话不多，每一句都有分量。',
    vector: { warmth: 0, energy: -2, texture: 2, density: -2 },
    tokens: {
      bg: '#fafaf7', surface: '#fafaf7', ink: '#1c1c1a', inkSoft: '#4a4a45', muted: '#9a9a92', meta: '#6f6f69',
      accent: '#3d4a3f', accentInk: '#fafaf7', accentText: '#3d4a3f', accentSoft: '#eceee8', line: '#dcdcd4',
      headFont: SERIF, bodyFont: SERIF, headWeight: 400, radius: '2px', gap: '112px', measure: '30em',
      cover: 'light', sheet: '#fafaf7', sheetInk: '#1c1c1a', sheetSoft: '#4a4a45',
      edge: 'print', fade: '0px', photoFilter: 'grayscale(1) contrast(1.06)', photoTint: 'none', amb: 0.1,
      coverBase: '#e9e9e4',
      art: 'linear-gradient(90deg, transparent calc(62% - 0.5px), #dcdcd4 calc(62% - 0.5px), #dcdcd4 calc(62% + 0.5px), transparent calc(62% + 0.5px)), #f3f3ef',
      glyph: '#1c1c1a', glyphOpacity: 0.06, coverAlign: 'left', nameTrack: '0.08em', nameScale: 0.86,
      band: '#1c1c1a', bandInk: '#fafaf7', back: '#1c1c1a', backInk: '#fafaf7', lede: false, numerals: 'han',
    },
  },
  {
    id: 'mist',
    name: '晨雾湖面',
    temperament: '清透宁静',
    blurb: '雾一样的灰绿与湖水蓝，轻、透、慢，适合向内的人。',
    vector: { warmth: -1, energy: -1, texture: 0, density: -1 },
    tokens: {
      bg: '#f0f4f3', surface: '#f8fbfa', ink: '#22313a', inkSoft: '#4c5d66', muted: '#8fa0a5', meta: '#647073',
      accent: '#4f7c82', accentInk: '#f8fbfa', accentText: '#477075', accentSoft: '#dde9e8', line: '#d6e1df',
      headFont: SANS, bodyFont: SANS, headWeight: 300, radius: '14px', gap: '88px', measure: '32em',
      cover: 'light', sheet: '#eef3f2', sheetInk: '#22313a', sheetSoft: '#3f4f57',
      edge: 'fog', fade: '88px', photoFilter: 'saturate(.7) brightness(1.04)', photoTint: 'rgb(240 244 243 / 0.18)', amb: 0.1,
      coverBase: '#dde9e8', art: 'linear-gradient(180deg, #f0f4f3, #dde9e8 55%, #c9dcdc 56%, #dfeaea)',
      glyph: '#4f7c82', glyphOpacity: 0.12, coverAlign: 'center', nameTrack: '0.06em', nameScale: 1,
      band: '#dde9e8', bandInk: '#22313a', back: '#dde9e8', backInk: '#22313a', lede: false, numerals: 'latin',
    },
  },
  {
    id: 'clay',
    name: '陶土手作',
    temperament: '大地手作',
    blurb: '陶土色、橄榄绿、带温度的衬线字，像一张手写的信。',
    vector: { warmth: 2, energy: 1, texture: 2, density: 1 },
    tokens: {
      bg: '#f3eadf', surface: '#faf4ec', ink: '#3b2a20', inkSoft: '#66503f', muted: '#a38f7c', meta: '#726457',
      accent: '#b5643c', accentInk: '#faf4ec', accentText: '#9a5533', accentSoft: '#efd9c5', line: '#e3d3c1',
      headFont: SERIF, bodyFont: SANS, headWeight: 600, radius: '10px', gap: '72px', measure: '32em',
      cover: 'dark', sheet: '#3a271c', sheetInk: '#faf4ec', sheetSoft: '#dcc8b4',
      edge: 'feather', fade: '64px', photoFilter: 'sepia(.14) saturate(.92)', photoTint: 'rgb(181 100 60 / 0.10)', amb: 0.25,
      coverBase: '#5a3c2b', art: 'linear-gradient(160deg, #7a4a30, #3b2a20)',
      glyph: '#faf4ec', glyphOpacity: 0.12, coverAlign: 'left', nameTrack: '0.01em', nameScale: 1,
      band: '#9a5533', bandInk: '#faf4ec', back: '#7a3f22', backInk: '#faf4ec', lede: true, numerals: 'latin',
    },
  },
  {
    // 不是「专业 = 冷色」：v2 §7.3 说视觉负责温暖、内容负责专业。这套只是更利落，底色仍是暖白
    id: 'line',
    name: '清晰线条',
    temperament: '清晰利落',
    blurb: '暖白底、干净的网格、利落的字。清楚地告诉别人你做什么、怎么找你。',
    vector: { warmth: 0, energy: 1, texture: -2, density: 0 },
    tokens: {
      bg: '#fbfaf6', surface: '#f3f2ec', ink: '#20292b', inkSoft: '#4c5658', muted: '#949a95', meta: '#6b6f6b',
      accent: '#2f5d5a', accentInk: '#fbfaf6', accentText: '#2f5d5a', accentSoft: '#e3ebe6', line: '#e4e2da',
      headFont: SANS, bodyFont: SANS, headWeight: 600, radius: '6px', gap: '72px', measure: '36em',
      cover: 'light', sheet: '#fbfaf6', sheetInk: '#20292b', sheetSoft: '#4c5658',
      edge: 'rule', fade: '0px', photoFilter: 'none', photoTint: 'none', amb: 0.1,
      coverBase: '#e4e2da',
      art: 'repeating-linear-gradient(90deg, rgb(32 41 43 / 0.06) 0 1px, transparent 1px calc(100% / 12)), #f6f5f0',
      glyph: '#20292b', glyphOpacity: 0.35, coverAlign: 'left', nameTrack: '-0.02em', nameScale: 1,
      band: '#20292b', bandInk: '#fbfaf6', back: '#20292b', backInk: '#fbfaf6', lede: false, numerals: 'latin',
    },
  },
];

export const DEFAULT_THEME_ID = 'forest';

export function getTheme(id: string | null | undefined): SpaceTheme | null {
  return THEMES.find(t => t.id === id) ?? null;
}

/** 维度权重：温度和能量是第一眼的感受，质感和密度次之 */
const WEIGHT: StyleVector = { warmth: 1, energy: 1, texture: 0.8, density: 0.8 };
const MAX_DIST = Math.sqrt(DIMENSIONS.reduce((s, d) => s + WEIGHT[d.key] * 16, 0));

export function themeDistance(a: StyleVector, b: StyleVector): number {
  return Math.sqrt(DIMENSIONS.reduce((s, d) => s + WEIGHT[d.key] * (a[d.key] - b[d.key]) ** 2, 0));
}

export type RankedTheme = { theme: SpaceTheme; match: number };

export function rankThemes(v: StyleVector): RankedTheme[] {
  return THEMES.map(theme => ({
    theme,
    match: Math.round(100 * (1 - themeDistance(v, theme.vector) / MAX_DIST)),
  })).sort((x, y) => y.match - x.match);
}

export const ZERO: StyleVector = { warmth: 0, energy: 0, texture: 0, density: 0 };

/**
 * 画像给底，测试来校准。测试答过的维度按 6:4 混合——
 * 画像是从一个人写下的整段文字里读出来的，比一次二选一更稳，但本人的直觉该有分量。
 */
export function blendVector(portrait: StyleVector | null, test: Partial<StyleVector>): StyleVector {
  const base = portrait ?? ZERO;
  const out = { ...base };
  for (const d of DIMENSIONS) {
    const t = test[d.key];
    if (typeof t === 'number') out[d.key] = portrait ? 0.6 * base[d.key] + 0.4 * t : t;
  }
  return out;
}

/** 看图兜底：挑中的几套主题取平均，就是这个人的位置 */
export function vectorFromPicks(ids: string[]): StyleVector | null {
  const picked = ids.map(getTheme).filter((t): t is SpaceTheme => !!t);
  if (!picked.length) return null;
  const out = { ...ZERO };
  for (const d of DIMENSIONS) out[d.key] = picked.reduce((s, t) => s + t.vector[d.key], 0) / picked.length;
  return out;
}

export function dimensionWord(key: DimensionKey, value: number): string {
  const d = DIMENSIONS.find(x => x.key === key)!;
  return value > 0 ? d.high : value < 0 ? d.low : '';
}

/**
 * 风格测试：每一题只改一个维度，其余都一样——
 * 这样一个人选左还是右，才能明确归到那一维，而不是被别的差异带偏。
 * lowFirst 交替，免得「总选左边」的习惯被读成某一端的偏好。
 */
export const TEST_PAIRS: { key: DimensionKey; question: string; lowFirst: boolean }[] = [
  { key: 'warmth', question: '哪一张的颜色更像你？', lowFirst: true },
  { key: 'energy', question: '哪一张的语气更像你？', lowFirst: false },
  { key: 'texture', question: '哪一张的质感更像你？', lowFirst: true },
  { key: 'density', question: '哪一张的节奏更像你？', lowFirst: false },
];

/** 测试用的变体：以一套中性的底为基础，只把指定维度推到一端 */
const TEST_BASE: ThemeTokens = {
  bg: '#f6f4ef', surface: '#fcfbf8', ink: '#2b3230', inkSoft: '#56605c', muted: '#949b95', meta: '#6c736e',
  accent: '#56705f', accentInk: '#fcfbf8', accentText: '#56705f', accentSoft: '#e5ebe3', line: '#e2e0d8',
  headFont: SERIF, bodyFont: SANS, headWeight: 500, radius: '12px', gap: '72px', measure: '32em',
  cover: 'light', sheet: '#f6f4ef', sheetInk: '#2b3230', sheetSoft: '#56605c',
  edge: 'feather', fade: '32px', photoFilter: 'none', photoTint: 'none', amb: 0,
  coverBase: '#e5ebe3', art: 'linear-gradient(160deg, #e5ebe3, #d3dbd1)',
  glyph: '#56705f', glyphOpacity: 0.14, coverAlign: 'left', nameTrack: '0.02em', nameScale: 1,
  band: '#56705f', bandInk: '#fcfbf8', back: '#2b3230', backInk: '#f6f4ef', lede: false, numerals: 'latin',
};

export function testVariant(key: DimensionKey, side: 'low' | 'high'): ThemeTokens {
  const t = { ...TEST_BASE };
  if (key === 'warmth') {
    Object.assign(t, side === 'high'
      ? { bg: '#f6ecdc', surface: '#fbf4e8', accent: '#a8683f', accentSoft: '#f0dcc4', line: '#ead9c2', ink: '#3a2c22' }
      : { bg: '#eef2f4', surface: '#f7fafb', accent: '#4c6e82', accentSoft: '#dce6ec', line: '#d9e2e7', ink: '#243039' });
  }
  // 语气只动强调色的饱和度和字重（色相不变，字体不变——字体是质感那一题的杠杆）
  if (key === 'energy') {
    Object.assign(t, side === 'high'
      ? { accent: '#3f8a52', accentSoft: '#d6ecd8', headWeight: 700 }
      : { accent: '#7f8c84', accentSoft: '#eceeea', headWeight: 300 });
  }
  // 质感只动字体族和圆角（字重保持底的 500——字重是语气那一题的杠杆）
  if (key === 'texture') {
    Object.assign(t, side === 'high'
      ? { headFont: SERIF, bodyFont: SERIF, radius: '18px' }
      : { headFont: SANS, bodyFont: SANS, radius: '3px' });
  }
  if (key === 'density') {
    Object.assign(t, side === 'high' ? { gap: '40px' } : { gap: '120px' });
  }
  // 纸幅、按钮、无图底跟着变过的底色走，迷你封面上才看得出这一题的差别
  // 按钮底用深一档的颜色（12px 的白字压在浅强调色上看不清），强调色本身只作装饰
  const deeper: Record<string, string> = {
    '#a8683f': '#8a5230', '#4c6e82': '#3f5d6e', '#3f8a52': '#2f6e40', '#7f8c84': '#5f6b64', '#56705f': '#4a6252',
  };
  return {
    ...t, sheet: t.bg, sheetInk: t.ink, accentText: deeper[t.accent] ?? t.accent,
    coverBase: t.accentSoft, art: `linear-gradient(160deg, ${t.accentSoft}, ${t.line})`, glyph: t.accent,
  };
}

/** #rrggbb → 「r g b」，给 rgb(var(--x) / α) 用（不用 color-mix：安卓微信的老内核不一定认） */
function rgbTriplet(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  return m ? `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}` : '0 0 0';
}

export function tokensToStyle(t: ThemeTokens): Record<string, string> {
  return {
    '--sp-bg': t.bg,
    '--bg-rgb': rgbTriplet(t.bg),
    '--sp-surface': t.surface,
    '--sp-ink': t.ink,
    '--sp-ink-soft': t.inkSoft,
    '--sp-muted': t.muted,
    '--sp-meta': t.meta,
    '--sp-accent': t.accent,
    '--sp-accent-ink': t.accentInk,
    '--sp-accent-text': t.accentText,
    '--sp-accent-soft': t.accentSoft,
    '--sp-line': t.line,
    '--sp-head': t.headFont,
    '--sp-body': t.bodyFont,
    '--sp-head-weight': String(t.headWeight),
    '--sp-radius': t.radius,
    // 按钮跟着圆角走：圆角 ≥ 14px 的主题按钮是胶囊形，其余和卡片同一个圆角（6 套主题原来的按钮正好都落在这条规则上）
    '--sp-btn-radius': parseFloat(t.radius) >= 14 ? '999px' : t.radius,
    '--sp-gap': t.gap,
    '--sp-measure': t.measure,
    '--sv': rgbTriplet(t.sheet),
    '--sp-sheet-ink': t.sheetInk,
    '--sp-sheet-soft': t.sheetSoft,
    '--sp-fade': t.fade,
    '--sp-photo-filter': t.photoFilter,
    '--sp-photo-tint': t.photoTint,
    '--sp-amb': String(t.amb),
    '--sp-cover-base': t.coverBase,
    '--sp-art': t.art,
    '--sp-glyph': t.glyph,
    '--sp-glyph-op': String(t.glyphOpacity),
    '--sp-name-track': t.nameTrack,
    '--sp-name-scale': String(t.nameScale),
    '--sp-band': t.band,
    '--sp-band-ink': t.bandInk,
    '--sp-back': t.back,
    '--sp-back-ink': t.backInk,
  };
}
