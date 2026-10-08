/**
 * 风格共创：在选定的主题上，本人再拨几个旋钮。
 *
 * 一句话调风格、二选一、「再来一版」、「这不像我」——都只能拨这里定义的旋钮，每个旋钮只有几档；
 * 强调色可以是任意颜色，但先收进一个可用的范围（不太灰、不太艳、不太浅、不太深）。
 * 颜色一变，墨色、首屏纸幅、色块、尾声跟着重算，最后统一过一遍对比度：字对底不到 4.5:1 就加深（深底上提亮）。
 * 所以无论谁来拨、怎么拨，都做不出看不清的页面。
 *
 * 每一档都标了它在审美四维上的倾向（lean）：「再安静一点」能落到具体哪几个旋钮、往哪边拨一格，
 * 二选一和「再来一版」也按这个人的位置挑候选——而不是随机乱换。
 *
 * 这个文件客户端、服务端都会用，不能引入任何服务端依赖。
 */
import { DIMENSIONS, SANS, SERIF, type DimensionKey, type SpaceTheme, type StyleVector, type ThemeTokens } from './themes';

// ═════════════ 颜色 ═════════════

type RGB = [number, number, number];
type HSL = [number, number, number];

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export function parseHex(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex(c: RGB): string {
  return '#' + c.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
}

function rgbToHsl([r, g, b]: RGB): HSL {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb([h, s, l]: HSL): RGB {
  const hh = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(hh + 1 / 3) * 255, f(hh) * 255, f(hh - 1 / 3) * 255];
}

export function hsl(hex: string): HSL {
  return rgbToHsl(parseHex(hex) ?? [0, 0, 0]);
}

export function fromHsl(h: number, s: number, l: number): string {
  return toHex(hslToRgb([h, clamp(s, 0, 1), clamp(l, 0, 1)]));
}

function luminance(hex: string): number {
  const [r, g, b] = (parseHex(hex) ?? [0, 0, 0]).map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 对比度 */
export function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** a 往 b 走 t（0…1） */
export function mix(a: string, b: string, t: number): string {
  const x = parseHex(a) ?? [0, 0, 0];
  const y = parseHex(b) ?? [0, 0, 0];
  return toHex([0, 1, 2].map(i => x[i] + (y[i] - x[i]) * t) as RGB);
}

/** 字色对每一个底都要 ≥ min：浅底上往深走，深底上往浅走，色相不变 */
function ensure(fg: string, bgs: string[], min = 4.5): string {
  const ok = (c: string) => bgs.every(b => contrast(c, b) >= min);
  if (ok(fg)) return fg;
  const light = bgs.reduce((s, b) => s + luminance(b), 0) / bgs.length > 0.18;
  const [h, s, l0] = hsl(fg);
  for (let i = 1; i <= 60; i++) {
    const l = l0 + (light ? -0.02 : 0.02) * i;
    if (l < 0 || l > 1) break;
    const c = fromHsl(h, s, l);
    if (ok(c)) return c;
  }
  return light ? '#000000' : '#ffffff';
}

/** 字色对这些底都 ≥ min（默认 4.5:1）：不够就往深（深底上往浅）挪，色相不变。给页面外的组件（创造者卡片）用 */
export function readable(fg: string, bgs: string[], min = 4.5): string {
  return ensure(fg, bgs, min);
}

/**
 * 任意颜色收进强调色能用的范围：灰就让它灰，彩色的饱和度和深浅都有上下限。
 * 已经在范围里的原样返回（只统一成小写）：来回换算会差一两个色值，存一次漂一点，面板也会误以为「没保存」。
 */
export function usableAccent(hex: string): string | null {
  const c = parseHex(hex);
  if (!c) return null;
  const [h, s, l] = hsl(hex);
  const s2 = s < 0.14 ? s : clamp(s, 0.14, 0.64);
  const l2 = clamp(l, 0.22, 0.62);
  return s2 === s && l2 === l ? toHex(c) : fromHsl(h, s2, l2);
}

/** 给颜色起个名字：照片里取的、AI 给的，没有现成的名字 */
export function colorName(hex: string): string {
  const [h, s, l] = hsl(hex);
  const tone = l < 0.32 ? '深' : l > 0.5 ? '浅' : '';
  if (s < 0.1) return `${tone}灰`;
  const name = h < 15 || h >= 340 ? '红' : h < 40 ? '橙' : h < 65 ? '黄' : h < 160 ? '绿' : h < 200 ? '青' : h < 255 ? '蓝' : h < 290 ? '紫' : '玫红';
  return `${tone}${s < 0.3 ? '灰' : ''}${name}`;
}

// ═════════════ 旋钮 ═════════════

export const PAPERS = [
  { id: 'mist', name: '雾蓝', bg: '#f0f4f3', surface: '#f8fbfa', line: '#d6e1df', warmth: -1.5 },
  { id: 'stone', name: '石灰', bg: '#f1f1ee', surface: '#f8f8f6', line: '#dddcd5', warmth: -0.5 },
  { id: 'white', name: '纸白', bg: '#fafaf7', surface: '#f2f2ed', line: '#dcdcd4', warmth: 0 },
  { id: 'linen', name: '米白', bg: '#f5f1e8', surface: '#fbf9f4', line: '#e1dccd', warmth: 1 },
  { id: 'cream', name: '奶油', bg: '#fff8ee', surface: '#ffffff', line: '#f2e2d2', warmth: 1.4 },
  { id: 'sand', name: '陶土', bg: '#f3eadf', surface: '#faf4ec', line: '#e3d3c1', warmth: 2 },
] as const;
export type PaperId = (typeof PAPERS)[number]['id'];

export const ACCENTS = [
  { hex: '#2f513d', name: '森绿' },
  { hex: '#5b7250', name: '苔绿' },
  { hex: '#2f5d5a', name: '松石' },
  { hex: '#4f7c82', name: '湖蓝' },
  { hex: '#3d5a80', name: '靛青' },
  { hex: '#6c5a8e', name: '紫藤' },
  { hex: '#8a3b4a', name: '酒红' },
  { hex: '#d9745a', name: '珊瑚' },
  { hex: '#b5643c', name: '陶土' },
  { hex: '#a87a2c', name: '赭黄' },
  { hex: '#4a4f4c', name: '墨灰' },
];

/** 一个颜色在「温度」「能量」上的倾向：暖色相更暖，越鲜越亮越有活力 */
export function accentLean(hex: string): Partial<StyleVector> {
  const [h, s, l] = hsl(hex);
  const warmth = s < 0.08 ? 0 : h < 65 || h >= 330 ? 2 : h < 165 ? 0.5 : h < 265 ? -1.5 : 0;
  const energy = clamp((s - 0.3) * 5 + (l - 0.38) * 4, -2, 2);
  return { warmth, energy: Math.round(energy * 10) / 10 };
}

export type TypeSet = 'sans' | 'serif-sans' | 'serif';
export type PhotoLook = 'natural' | 'soft' | 'vivid' | 'warm' | 'cool' | 'mono';
export type Edge = ThemeTokens['edge'];

export type Knobs = {
  accent?: string;
  paper?: PaperId;
  type?: TypeSet;
  weight?: number;
  space?: number;
  radius?: number;
  photo?: PhotoLook;
  edge?: Edge;
  cover?: 'dark' | 'light';
  align?: 'left' | 'center';
  lede?: boolean;
};
export type KnobKey = keyof Knobs;
export type KnobValue = string | number | boolean;

export type KnobOption = { value: KnobValue; label: string; lean: Partial<StyleVector> };
export type KnobDef = {
  key: KnobKey;
  label: string;
  /** 二选一时问的那句话 */
  question: string;
  /** 这个旋钮影响哪几维（写回画像、挑候选都看它） */
  dims: DimensionKey[];
  options: KnobOption[];
};

export const KNOB_ORDER: KnobKey[] = ['accent', 'paper', 'type', 'weight', 'space', 'radius', 'photo', 'edge', 'cover', 'align', 'lede'];

export const KNOBS: Record<KnobKey, KnobDef> = {
  accent: {
    key: 'accent', label: '强调色', question: '哪个颜色更像你？', dims: ['warmth', 'energy'],
    options: ACCENTS.map(a => ({ value: a.hex, label: a.name, lean: accentLean(a.hex) })),
  },
  paper: {
    key: 'paper', label: '纸色', question: '哪种纸更像你？', dims: ['warmth'],
    options: PAPERS.map(p => ({ value: p.id, label: p.name, lean: { warmth: p.warmth } })),
  },
  type: {
    key: 'type', label: '字体', question: '哪种字更像你？', dims: ['texture'],
    options: [
      { value: 'sans', label: '全用黑体', lean: { texture: -1.5 } },
      { value: 'serif-sans', label: '宋体标题 + 黑体正文', lean: { texture: 0.8 } },
      { value: 'serif', label: '全用宋体', lean: { texture: 2 } },
    ],
  },
  weight: {
    key: 'weight', label: '标题字重', question: '标题要多重？', dims: ['energy'],
    options: [
      { value: 300, label: '细', lean: { energy: -2 } },
      { value: 400, label: '常规', lean: { energy: -1 } },
      { value: 500, label: '适中', lean: { energy: 0 } },
      { value: 600, label: '半粗', lean: { energy: 1 } },
      { value: 700, label: '粗', lean: { energy: 2 } },
    ],
  },
  space: {
    key: 'space', label: '留白', question: '哪种节奏更像你？', dims: ['density'],
    options: [
      { value: 56, label: '紧凑', lean: { density: 2 } },
      { value: 72, label: '适中', lean: { density: 0.5 } },
      { value: 88, label: '舒展', lean: { density: -1 } },
      { value: 104, label: '疏朗', lean: { density: -1.5 } },
      { value: 120, label: '很疏朗', lean: { density: -2 } },
    ],
  },
  radius: {
    key: 'radius', label: '圆角', question: '边角要多圆？', dims: ['energy'],
    options: [
      { value: 2, label: '方正', lean: { energy: -1 } },
      { value: 6, label: '微圆', lean: { energy: -0.5 } },
      { value: 12, label: '圆润', lean: { energy: 0.3 } },
      { value: 18, label: '更圆', lean: { energy: 1 } },
      { value: 24, label: '很圆', lean: { energy: 2 } },
    ],
  },
  photo: {
    key: 'photo', label: '照片', question: '照片怎么处理更像你？', dims: ['warmth', 'energy'],
    options: [
      { value: 'natural', label: '原样', lean: { energy: 0.5 } },
      { value: 'soft', label: '柔和', lean: { energy: -1 } },
      { value: 'vivid', label: '鲜亮', lean: { energy: 2 } },
      { value: 'warm', label: '暖调', lean: { warmth: 1.5 } },
      { value: 'cool', label: '清冷', lean: { warmth: -1.5, energy: -1 } },
      { value: 'mono', label: '黑白', lean: { energy: -1.5 } },
    ],
  },
  edge: {
    key: 'edge', label: '照片边缘', question: '照片的边缘，哪个更像你？', dims: ['texture', 'energy'],
    options: [
      { value: 'rule', label: '硬边', lean: { texture: -2 } },
      { value: 'arch', label: '拱门', lean: { texture: -1.2, energy: 1.5 } },
      { value: 'fog', label: '雾', lean: { texture: 1, energy: -1 } },
      { value: 'feather', label: '羽化', lean: { texture: 1 } },
      { value: 'print', label: '相纸', lean: { texture: 2 } },
    ],
  },
  cover: {
    key: 'cover', label: '首屏', question: '首屏深一点，还是浅一点？', dims: ['energy'],
    options: [
      { value: 'dark', label: '深色纸幅', lean: { energy: -1 } },
      { value: 'light', label: '浅色纸幅', lean: { energy: 1 } },
    ],
  },
  align: {
    key: 'align', label: '首屏对齐', question: '首屏的字靠左还是居中？', dims: [],
    options: [
      { value: 'left', label: '靠左', lean: {} },
      { value: 'center', label: '居中', lean: {} },
    ],
  },
  lede: {
    key: 'lede', label: '导语段', question: '每章第一段要不要放大一档？', dims: ['texture'],
    options: [
      { value: true, label: '放大', lean: { texture: 1 } },
      { value: false, label: '不放大', lean: { texture: -0.5 } },
    ],
  },
};

const PHOTO: Record<PhotoLook, { filter: string; tint: string }> = {
  natural: { filter: 'none', tint: 'none' },
  soft: { filter: 'saturate(.9) brightness(1.03)', tint: 'none' },
  vivid: { filter: 'saturate(1.1) contrast(1.03)', tint: 'none' },
  warm: { filter: 'sepia(.14) saturate(.94)', tint: 'rgb(181 110 60 / 0.10)' },
  cool: { filter: 'saturate(.72) brightness(1.04)', tint: 'rgb(226 236 238 / 0.18)' },
  mono: { filter: 'grayscale(1) contrast(1.06)', tint: 'none' },
};
/** 手机上照片溶进纸幅的高度，跟着边缘走 */
const FADE: Record<Edge, string> = { feather: '56px', arch: '40px', print: '0px', fog: '88px', rule: '0px' };

function photoLookOf(filter: string): PhotoLook {
  if (/grayscale/.test(filter)) return 'mono';
  if (/sepia/.test(filter)) return 'warm';
  if (filter === 'none') return 'natural';
  const m = /saturate\(([\d.]+)\)/.exec(filter);
  const sat = m ? parseFloat(m[1]) : 1;
  return sat < 0.8 ? 'cool' : sat > 1.02 ? 'vivid' : 'soft';
}

function nearest(values: number[], x: number): number {
  return values.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
}

function nearestPaper(bg: string): PaperId {
  const c = parseHex(bg) ?? [0, 0, 0];
  const d = (p: string) => { const q = parseHex(p)!; return (q[0] - c[0]) ** 2 + (q[1] - c[1]) ** 2 + (q[2] - c[2]) ** 2; };
  return PAPERS.reduce((a, b) => (d(b.bg) < d(a.bg) ? b : a)).id;
}

const numbers = (key: KnobKey) => KNOBS[key].options.map(o => o.value as number);

/** 一套主题本来落在每个旋钮的哪一档 */
export function themeKnobs(t: ThemeTokens): Required<Knobs> {
  return {
    accent: t.accent,
    paper: nearestPaper(t.bg),
    type: t.bodyFont === SERIF ? 'serif' : t.headFont === SERIF ? 'serif-sans' : 'sans',
    weight: nearest(numbers('weight'), t.headWeight),
    space: nearest(numbers('space'), parseFloat(t.gap)),
    radius: nearest(numbers('radius'), parseFloat(t.radius)),
    photo: photoLookOf(t.photoFilter),
    edge: t.edge,
    cover: t.cover,
    align: t.coverAlign,
    lede: t.lede,
  };
}

/**
 * 这一档是不是就是主题本来的样子——要精确相等。晨光花园的留白是 64px，不在任何一档上：
 * 「紧凑」56px 对它来说是真的改动，不能因为「最接近」就当成原样丢掉（那样这一档永远选不上）。
 */
export function sameAsTheme(t: ThemeTokens, key: KnobKey, value: KnobValue): boolean {
  switch (key) {
    case 'space': return parseFloat(t.gap) === value;
    case 'radius': return parseFloat(t.radius) === value;
    case 'weight': return t.headWeight === value;
    case 'accent': {
      // 差一两个色值（「再安静一点」又「更有精神」，来回换算的误差）也算原样，免得出现一处看不见的「改了 1 处」
      const a = parseHex(t.accent);
      const b = parseHex(String(value));
      return !!a && !!b && a.every((x, i) => Math.abs(x - b[i]) <= 2);
    }
    case 'paper': return PAPERS.find(p => p.id === value)?.bg === t.bg;
    case 'photo': return PHOTO[value as PhotoLook]?.filter === t.photoFilter && PHOTO[value as PhotoLook]?.tint === t.photoTint;
    default: return themeKnobs(t)[key] === value;
  }
}

/** 只留下和主题本来不一样的旋钮（服务端存之前、客户端改完之后都过一遍） */
export function ownDiff(t: ThemeTokens, raw: Knobs): Knobs {
  const out: Record<string, KnobValue> = {};
  for (const [k, v] of Object.entries(cleanKnobs(raw)) as [KnobKey, KnobValue][]) if (!sameAsTheme(t, k, v)) out[k] = v;
  return out as Knobs;
}

/**
 * 主题本来的值，数值类旋钮取精确值：晨光花园的留白就是 64，不往「紧凑」56 凑。
 * 拨旋钮（说一句、二选一、再来一版）从这里出发；「·原」标在最近那一档上用 themeKnobs。
 */
export function themeExact(t: ThemeTokens): Required<Knobs> {
  return { ...themeKnobs(t), space: parseFloat(t.gap), radius: parseFloat(t.radius), weight: t.headWeight };
}

/** 只留下认得的旋钮和允许的档位；强调色收进可用范围。服务端存之前、客户端用之前都过一遍 */
export function cleanKnobs(raw: unknown): Knobs {
  const out: Record<string, KnobValue> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;
  for (const key of KNOB_ORDER) {
    const v = r[key];
    if (v === undefined || v === null) continue;
    if (key === 'accent') {
      const a = typeof v === 'string' ? usableAccent(v) : null;
      if (a) out.accent = a;
      continue;
    }
    const opt = KNOBS[key].options.find(o => o.value === v);
    if (opt) out[key] = opt.value;
  }
  return out as Knobs;
}

/** 离哪个预设色最近、有多近（< 1 几乎看不出差别，< 1.6 算「近似」） */
export function nearestAccent(hex: string): { name: string; hex: string; d: number } {
  const [h, s, l] = hsl(hex);
  let best = { name: ACCENTS[0].name, hex: ACCENTS[0].hex, d: Infinity };
  // 彩度越低，色相差越看不出来（两种很深的绿看着差不多）：色相差按两者的彩度打折
  const chroma = (sx: number, lx: number) => sx * (1 - Math.abs(2 * lx - 1));
  for (const a of ACCENTS) {
    const [ah, as, al] = hsl(a.hex);
    const dh = Math.min(Math.abs(h - ah), 360 - Math.abs(h - ah));
    const weight = Math.min(1, (chroma(s, l) + chroma(as, al)) / 2 / 0.25);
    const d = (dh / 15) * weight + Math.abs(s - as) / 0.3 + Math.abs(l - al) / 0.15;
    if (d < best.d) best = { name: a.name, hex: a.hex, d };
  }
  return best;
}

/**
 * 强调色的名字：预设色叫它自己的名字；在预设色上挪过一点的叫「近陶土」——
 * 比给一个新名字（「橙」「浅橙」）清楚，也不会出现「淡一点（陶土 → 橙）」这种听起来反而更艳的说法。
 */
export function accentName(hex: string): string {
  const exact = ACCENTS.find(a => a.hex === hex.toLowerCase());
  if (exact) return exact.name;
  const near = nearestAccent(hex);
  return near.d < 1.6 ? `近${near.name}` : colorName(hex);
}

export function optionLabel(key: KnobKey, value: KnobValue): string {
  if (key === 'accent') return accentName(String(value));
  // 不在档位上的数值（主题本来的 64px）：直接报数
  if (typeof value === 'number' && !KNOBS[key].options.some(o => o.value === value)) {
    return key === 'weight' ? String(value) : `${value}px`;
  }
  return KNOBS[key].options.find(o => o.value === value)?.label ?? String(value);
}

function leanOf(key: KnobKey, value: KnobValue): Partial<StyleVector> {
  if (key === 'accent') return accentLean(String(value));
  const opt = KNOBS[key].options.find(o => o.value === value);
  if (opt) return opt.lean;
  // 主题本来的值落在两档之间（晨光花园的留白 64）：按两边插值，「再紧凑一点」才知道该往 56 走
  if (typeof value === 'number') {
    const opts = KNOBS[key].options.filter(o => typeof o.value === 'number')
      .sort((a, b) => (a.value as number) - (b.value as number));
    if (!opts.length) return {};
    let lo = opts[0];
    let hi = opts[opts.length - 1];
    for (const o of opts) {
      if ((o.value as number) <= value) lo = o;
      if ((o.value as number) >= value) { hi = o; break; }
    }
    const span = (hi.value as number) - (lo.value as number);
    const f = span ? (value - (lo.value as number)) / span : 0;
    const out: Partial<StyleVector> = {};
    for (const d of KNOBS[key].dims) out[d] = (lo.lean[d] ?? 0) * (1 - f) + (hi.lean[d] ?? 0) * f;
    return out;
  }
  return {};
}

// ═════════════ 叠到主题上 ═════════════

export type Applied = { tokens: ThemeTokens; notes: string[] };

export function applyTune(base: ThemeTokens, raw: Knobs): Applied {
  const k = cleanKnobs(raw);
  const t: ThemeTokens = { ...base };
  const notes = new Set<string>();

  if (k.type) {
    t.headFont = k.type === 'sans' ? SANS : SERIF;
    t.bodyFont = k.type === 'serif' ? SERIF : SANS;
  }
  if (k.weight) t.headWeight = k.weight;
  if (k.space) t.gap = `${k.space}px`;
  if (k.radius !== undefined) t.radius = `${k.radius}px`;
  if (k.photo) {
    t.photoFilter = PHOTO[k.photo].filter;
    t.photoTint = PHOTO[k.photo].tint;
  }
  if (k.edge) {
    t.edge = k.edge;
    t.fade = FADE[k.edge];
  }
  if (k.align) t.coverAlign = k.align;
  if (k.lede !== undefined) t.lede = k.lede;

  if (!k.paper && !k.accent && !k.cover) return { tokens: t, notes: [] };

  // ── 颜色：纸、强调色、首屏深浅，任何一个变了，派生的颜色一起重算 ──
  if (k.paper) {
    const p = PAPERS.find(x => x.id === k.paper)!;
    t.bg = p.bg;
    t.surface = p.surface;
    t.line = p.line;
  }
  const [hue, sat, accL] = hsl(k.accent ?? base.accent);
  const baseSat = hsl(base.accent)[1];
  // 强调色换了色系（陶土 → 湖蓝），主题里照着原色调的那些暖光、褐色滤镜就不再合适
  const familyChanged = !!k.accent && sat >= 0.08 && baseSat >= 0.08 && family(hue) !== family(hsl(base.accent)[0]);
  // 强调色收素得厉害（清冷连点几下）：暖调的照片滤镜也该一起收
  const muted = !!k.accent && baseSat > 0.05 && sat < baseSat * 0.6;
  /** 一个颜色的「彩度」（HSL 下 ≈ s·(1−|2l−1|)）：同样的饱和度，越接近中间亮度越艳 */
  const chromaOf = (s0: number, l0: number) => s0 * (1 - Math.abs(2 * l0 - 1));
  /**
   * 墨色、深色纸幅、深色尾声，本来都是强调色压到很深的那一档：跟着强调色换色相，深浅不变；
   * 强调色收素了，它们也按同样的比例收素（只往下收：强调色更艳时不跟着艳，免得正文变成彩色）。
   * 强调色几乎成了灰，就不换色相——只是一起变灰，不会跳回原主题的色相。
   */
  const follow = (like: string, kind: 'ink' | 'deep') => {
    if (!k.accent) return like;
    const [h, s, l] = hsl(like);
    if (s < 0.04) return like;
    const ratio = baseSat > 0.05 ? Math.min(1, sat / baseSat) : 1;
    let s2 = s * ratio;
    // 色相挪得多（灰蓝 → 紫、绿 → 珊瑚）：墨色只带一点新色相——紫、酒红、绿在同样的饱和度下
    // 比原来的灰蓝艳得多，正文会读成彩色。按实际挪了多少度判断，比按色系分界稳（紫藤 263° 就在冷色那条线内侧）
    if (kind === 'ink' && sat >= 0.08) {
      const shift = Math.min(Math.abs(hue - h), 360 - Math.abs(hue - h));
      if (shift > 30) s2 *= 0.6;
    }
    // 深色块（尾声、深色纸幅）不比强调色更艳：它们往往比强调色亮一点，同样的饱和度看着更跳
    if (kind === 'deep') {
      const room = 1 - Math.abs(2 * l - 1);
      if (room > 0) s2 = Math.min(s2, chromaOf(sat, accL) / room);
    }
    return fromHsl(sat >= 0.08 ? hue : h, s2, l);
  };
  if (k.accent) {
    t.accent = k.accent;
    for (const key of ['ink', 'inkSoft', 'meta', 'muted'] as const) t[key] = follow(base[key], 'ink');
  }
  const dark = (like: string) => follow(like, 'deep');
  const light = luminance(t.surface) >= luminance(t.bg) ? t.surface : t.bg;

  t.accentSoft = mix(t.bg, t.accent, 0.14);
  t.accentInk = light;
  t.accentText = ensure(t.accent, [t.bg, t.surface, t.accentSoft, t.accentInk]);
  if (k.accent && contrast(t.accent, t.bg) < 4.5) notes.add('强调色做字、做按钮底时，用的是深一档的同一个颜色');

  // 色块和尾声：原来用的是哪个颜色，就换成新的那个
  const paint = (c: string): [string, string] => {
    if (c === base.accent || c === base.accentText) return [t.accentText, t.accentInk];
    if (c === base.accentSoft) return [t.accentSoft, t.ink];
    if (c === base.ink) return [t.ink, light];
    if (c === base.bg) return [t.bg, t.ink];
    return [dark(c), light];
  };
  [t.band, t.bandInk] = paint(base.band);
  [t.back, t.backInk] = paint(base.back);

  // 主题自带的照片色调（晨光花园右上角的暖光、陶土手作的陶土色罩、褐色滤镜）是照着原来的配色调的。没单独选「照片」时：
  // 强调色换了色系、或者纸换成冷的，暖光和褐色滤镜去掉；同一色系里挪一挪（再温暖一点）就留着——
  // 单色的罩换成新的强调色（雾一样的浅罩换成新纸色），透明度不变
  const coolPaper = !!k.paper && (PAPERS.find(x => x.id === k.paper)?.warmth ?? 0) < 0;
  if (!k.photo && (familyChanged || coolPaper || muted) && /sepia/.test(base.photoFilter)) t.photoFilter = PHOTO.soft.filter;
  if (!k.photo && base.photoTint !== 'none' && (k.accent || k.paper)) {
    if (/gradient/.test(base.photoTint)) {
      if (familyChanged || coolPaper) t.photoTint = 'none';
    } else {
      const m = /rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)/.exec(base.photoTint);
      if (m) {
        const haze = contrast(toHex([+m[1], +m[2], +m[3]]), base.bg) < 1.15;
        const c = parseHex(haze ? t.bg : t.accent)!;
        t.photoTint = `rgb(${c.join(' ')} / ${m[4]})`;
      }
    }
  }

  const cover = k.cover ?? base.cover;
  t.cover = cover;
  if (cover === 'dark') {
    t.sheet = base.cover === 'dark' ? dark(base.sheet) : fromHsl(hue, Math.min(sat, 0.32), 0.16);
    t.sheetInk = light;
    t.sheetSoft = mix(t.sheet, light, 0.72);
    if (base.cover !== 'dark' || k.accent) {
      t.coverBase = mix(t.sheet, t.accent, 0.35);
      t.art = `radial-gradient(120% 90% at 80% 20%, ${mix(t.accent, t.sheet, 0.25)}, ${t.sheet} 55%, ${mix(t.sheet, '#000000', 0.3)})`;
      t.glyph = light;
      // 实心字 0.1 就够；清晰线条的名字是描边字（space.css），太淡就只剩几根细线
      t.glyphOpacity = base.glyphOpacity >= 0.2 ? 0.3 : 0.1;
      t.amb = 0.25;
    }
  } else {
    t.sheet = base.cover === 'light' && !k.paper ? base.sheet : t.bg;
    t.sheetInk = t.ink;
    t.sheetSoft = t.inkSoft;
    t.coverBase = t.accentSoft;
    // 没照片时的画面：浅色主题的原画是照着原纸、原色画的（晨光花园的桃色光斑、晨雾的湖面）——换纸、换色系才换掉
    if (base.cover !== 'light' || k.paper || familyChanged) t.art = `linear-gradient(160deg, ${t.accentSoft}, ${t.line})`;
    t.glyph = t.accent;
    t.glyphOpacity = base.cover === 'light' ? base.glyphOpacity : 0.14;
    t.amb = 0.1;
  }

  // ── 对比度兜底：字对它可能压着的每一种底都要 ≥ 4.5:1 ──
  const papers = [t.bg, t.surface, t.accentSoft];
  const fix = (key: 'ink' | 'inkSoft' | 'meta' | 'sheetSoft', bgs: string[], note: string) => {
    const v = ensure(t[key], bgs);
    if (v !== t[key]) {
      notes.add(note);
      t[key] = v;
    }
  };
  fix('ink', papers, '正文颜色加深了一点');
  fix('inkSoft', papers, '次要文字加深了一点，保证看得清');
  fix('meta', [t.bg, t.surface], '小字加深了一点，保证看得清');
  t.accentText = ensure(t.accentText, [...papers, t.accentInk]);
  t.sheetInk = ensure(t.sheetInk, [t.sheet]);
  fix('sheetSoft', [t.sheet], '首屏的小字调了一点深浅，保证看得清');
  t.bandInk = ensure(t.bandInk, [t.band]);
  t.backInk = ensure(t.backInk, [t.back]);
  if (t.sheetInk === t.ink && t.cover === 'light') t.sheetSoft = ensure(t.inkSoft, [t.sheet]);

  return { tokens: t, notes: [...notes] };
}

/** 这些字和底，对比度都要 ≥ 4.5:1（面板上给本人看一眼） */
export function contrastReport(t: ThemeTokens): { label: string; ratio: number }[] {
  const pairs: [string, string, string][] = [
    ['正文', t.ink, t.bg],
    ['次要文字', t.inkSoft, t.bg],
    ['小字', t.meta, t.bg],
    ['服务区的小字', t.meta, t.surface],
    // 最后一页换了一种纸（accentSoft），那里的小标题用的是次要文字色（space.css .sp-last）
    ['最后一页的字', t.inkSoft, t.accentSoft],
    ['强调色的字', t.accentText, t.bg],
    ['按钮', t.accentInk, t.accentText],
    ['首屏的字', t.sheetInk, t.sheet],
    ['首屏的小字', t.sheetSoft, t.sheet],
    ['色块', t.bandInk, t.band],
    ['尾声', t.backInk, t.back],
  ];
  return pairs.map(([label, a, b]) => ({ label, ratio: Math.floor(contrast(a, b) * 10) / 10 }));
}

// ═════════════ 记录 ═════════════

/** 「这不像我」和一句话调风格里说过的话：写回画像的审美四维 */
export type FeelNote = { at: string; block: string; said: string; dim: DimensionKey; dir: 1 | -1 };

export type Tune = {
  /** 这组微调是在哪一套主题上调的：换了主题就不套用 */
  base: string;
  knobs: Knobs;
  /** 本人锁住的旋钮：「再来一版」、二选一都不动它们 */
  locks: KnobKey[];
  /** 本人亲口说过的偏好，累加到画像的四维上（每维 ±1.5 封顶） */
  feel: Partial<StyleVector>;
  notes: FeelNote[];
  updatedAt: string;
};

export const FEEL_STEP = 0.5;
export const FEEL_MAX = 1.5;

export function addFeel(feel: Partial<StyleVector>, notes: Pick<FeelNote, 'dim' | 'dir'>[]): Partial<StyleVector> {
  const out = { ...feel };
  for (const n of notes) out[n.dim] = clamp((out[n.dim] ?? 0) + FEEL_STEP * n.dir, -FEEL_MAX, FEEL_MAX);
  return out;
}

export function withFeel(v: StyleVector, feel?: Partial<StyleVector>): StyleVector {
  if (!feel) return v;
  const out = { ...v };
  for (const d of DIMENSIONS) out[d.key] = clamp(v[d.key] + (feel[d.key] ?? 0), -2, 2);
  return out;
}

/** 访客看到的主题：存下的微调只套在调它的那一套上 */
export function tunedTheme(theme: SpaceTheme, tune: Tune | null | undefined): SpaceTheme {
  if (!tune || tune.base !== theme.id || !Object.keys(tune.knobs).length) return theme;
  return { ...theme, tokens: applyTune(theme.tokens, tune.knobs).tokens };
}

// ═════════════ 往某一维拨一格 ═════════════

/** why：带方向的一整句（「更安静：标题字重从…」）；what：只说改了什么（拼进「改了：…」里用） */
export type Change = { key: KnobKey; value: KnobValue; why: string; what: string };

export const DIR_WORD: Record<DimensionKey, [string, string]> = {
  warmth: ['更清冷', '更温暖'],
  energy: ['更安静', '更有精神'],
  texture: ['更利落', '更有人文感'],
  density: ['更疏朗', '更饱满'],
};

/** 每一维先拨哪几个旋钮：最明显、最不伤整体的先来 */
const PRIORITY: Record<DimensionKey, KnobKey[]> = {
  warmth: ['paper', 'accent', 'photo'],
  energy: ['weight', 'accent', 'photo', 'radius', 'cover'],
  texture: ['type', 'edge', 'lede'],
  density: ['space'],
};

/** 强调色不在固定的几档里挑，而是在色环上挪一点：暖往橙走，冷往蓝走；精神往鲜走，安静往灰走 */
type Family = 'warm' | 'green' | 'cool' | 'purple';
function family(h: number): Family {
  return h < 65 || h >= 330 ? 'warm' : h < 165 ? 'green' : h < 265 ? 'cool' : 'purple';
}

/**
 * 强调色往某一维挪一点，但不出它自己的色系。
 * 不能按色环最短路走：陶土（色相 20 左右）往蓝（205）走，最短路是倒着穿过红和品红——
 * 要「清冷一点」却得到一个更热闹的玫红。所以暖色要清冷就收素（降饱和），蓝要温暖就往青绿靠、也收一点；
 * 绿、紫在自己的色系里往冷暖两头走。「浓 / 淡」只动饱和度，深浅反向带一点（浓 = 更饱和、略深）。
 */
function shiftAccent(hex: string, dim: DimensionKey, dir: 1 | -1): string | null {
  const [h0, s, l] = hsl(hex);
  if (s < 0.08) return null; // 灰：没有冷暖、浓淡可挪，交给别的旋钮
  let h = h0;
  let s2 = s;
  let l2 = l;
  if (dim === 'warmth') {
    const fam = family(h0);
    // 暖色系跨 0°：330–360 记成负数，免得在色系里挪的时候绕一圈
    const hn = fam === 'warm' && h0 >= 330 ? h0 - 360 : h0;
    const move = (target: number, max: number) => hn + clamp(target - hn, -max, max);
    if (fam === 'warm') {
      if (dir > 0) { h = move(25, 12); s2 = s + 0.08; }
      else { s2 = s - 0.14; l2 = l - 0.02; }
    } else if (fam === 'green') {
      h = move(dir > 0 ? 70 : 160, 20);
    } else if (fam === 'cool') {
      if (dir > 0) { h = move(175, 18); s2 = s - 0.06; }
      else h = move(215, 18);
    } else {
      h = move(dir > 0 ? 325 : 270, 20);
    }
  } else if (dim === 'energy') {
    s2 = s + 0.12 * dir;
    l2 = l - 0.02 * dir;
  } else {
    return null;
  }
  const u = usableAccent(fromHsl(h, s2, l2));
  if (!u) return null;
  // 挪不动了（碰到范围边界）就算没变
  const [uh, us, ul] = hsl(u);
  const dh = Math.min(Math.abs(uh - h0), 360 - Math.abs(uh - h0));
  return dh > 3 || Math.abs(us - s) > 0.04 || Math.abs(ul - l) > 0.015 ? u : null;
}

/** 强调色挪一下，用人话说是哪种挪法 */
function accentMove(hex: string, dim: DimensionKey, dir: 1 | -1): string {
  if (dim === 'energy') return dir > 0 ? '浓一点' : '淡一点';
  if (dir > 0) return '往暖里挪一点';
  return family(hsl(hex)[0]) === 'warm' ? '收素一点' : '往冷里挪一点';
}

/** 在一个旋钮上，朝这一维的 dir 方向挪最近的一格 */
function stepKnob(key: KnobKey, cur: KnobValue, dim: DimensionKey, dir: 1 | -1): KnobValue | null {
  if (key === 'accent') return shiftAccent(String(cur), dim, dir);
  const here = leanOf(key, cur)[dim] ?? 0;
  const ahead = KNOBS[key].options
    .filter(o => o.value !== cur && ((o.lean[dim] ?? 0) - here) * dir > 0.01)
    .sort((a, b) => Math.abs((a.lean[dim] ?? 0) - here) - Math.abs((b.lean[dim] ?? 0) - here));
  return ahead[0]?.value ?? null;
}

export function nudge(
  dim: DimensionKey, dir: 1 | -1, eff: Required<Knobs>,
  opts: { locks?: KnobKey[]; only?: KnobKey[]; max?: number } = {},
): Change[] {
  const out: Change[] = [];
  const keys = opts.only ?? PRIORITY[dim];
  for (const key of keys) {
    if (out.length >= (opts.max ?? 2)) break;
    if (opts.locks?.includes(key)) continue;
    const cur = eff[key];
    const next = stepKnob(key, cur, dim, dir);
    if (next === null) continue;
    // 强调色是在原色上挪一点：只说怎么挪。报新名字反而误导（「近陶土 → 近陶土」看着像没变，「→ 近赭黄」看着像换了色）
    const what = key === 'accent'
      ? `强调色${accentMove(String(cur), dim, dir)}`
      : `${KNOBS[key].label}从「${optionLabel(key, cur)}」换成「${optionLabel(key, next)}」`;
    out.push({ key, value: next, why: `${DIR_WORD[dim][dir > 0 ? 1 : 0]}：${what}`, what });
  }
  return out;
}

/** 一句话里的几个常见说法：不用等 AI，直接拨 */
export const QUICK: { label: string; dim: DimensionKey; dir: 1 | -1 }[] = [
  { label: '再安静一点', dim: 'energy', dir: -1 },
  { label: '更有精神', dim: 'energy', dir: 1 },
  { label: '再温暖一点', dim: 'warmth', dir: 1 },
  { label: '清冷一点', dim: 'warmth', dir: -1 },
  { label: '更有书卷气', dim: 'texture', dir: 1 },
  { label: '更利落', dim: 'texture', dir: -1 },
  { label: '多留点白', dim: 'density', dir: -1 },
  { label: '更饱满', dim: 'density', dir: 1 },
];

// ═════════════ 按这个人的位置挑候选 ═════════════

/** 一个档位离这个人有多远：只看这个旋钮管的那几维 */
function distance(key: KnobKey, value: KnobValue, v: StyleVector): number {
  const lean = leanOf(key, value);
  return KNOBS[key].dims.reduce((s, d) => s + ((lean[d] ?? 0) - v[d]) ** 2, 0);
}

function candidates(key: KnobKey, extraAccents: string[]): KnobValue[] {
  if (key !== 'accent') return KNOBS[key].options.map(o => o.value);
  return [...extraAccents, ...ACCENTS.map(a => a.hex)];
}

function hueGap(a: string, b: string): number {
  const d = Math.abs(hsl(a)[0] - hsl(b)[0]) % 360;
  return Math.min(d, 360 - d);
}

/** 再来一版：没锁的旋钮里挑三四个换掉，越贴近这个人的档位越容易被挑中 */
export function remix(
  eff: Required<Knobs>, locks: KnobKey[], v: StyleVector, extraAccents: string[] = [], rand: () => number = Math.random,
): Knobs {
  const free = KNOB_ORDER.filter(k => !locks.includes(k) && k !== 'align');
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [free[i], free[j]] = [free[j], free[i]];
  }
  const out: Knobs = {};
  for (const key of free.slice(0, Math.min(4, free.length))) {
    const pool = candidates(key, extraAccents).filter(c => c !== eff[key]
      && (key !== 'accent' || hueGap(String(c), String(eff.accent)) > 20));
    if (!pool.length) continue;
    const weights = pool.map(c => Math.exp(-0.6 * distance(key, c, v)));
    let r = rand() * weights.reduce((a, b) => a + b, 0);
    let pick = pool[pool.length - 1];
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) { pick = pool[i]; break; }
    }
    (out as Record<string, KnobValue>)[key] = pick;
  }
  return out;
}

// ═════════════ 二选一 ═════════════

export type Round = { key: KnobKey; a: KnobValue; b: KnobValue; question: string };
export type RoundResult = { key: KnobKey; a: KnobValue; b: KnobValue; pick: 'a' | 'b' | 'same' };

export const CALIBRATE_ORDER: KnobKey[] = ['accent', 'paper', 'type', 'space', 'weight', 'photo', 'edge', 'cover'];
export const MAX_ROUNDS = 8;

/**
 * 一轮只动一个旋钮，其余不动——和风格测试一样，选了哪边才能明确归到这一个变量上。
 * A 永远是现在的样子，B 是离这个人最近的另一档；本人选了 B，同一个旋钮再往同一方向试一格，
 * 像验光一样收敛。最多 8 轮。
 */
export function nextRound(
  eff: Required<Knobs>, locks: KnobKey[], v: StyleVector, done: RoundResult[], extraAccents: string[] = [],
): Round | null {
  if (done.length >= MAX_ROUNDS) return null;
  const make = (key: KnobKey, b: KnobValue): Round => ({ key, a: eff[key], b, question: KNOBS[key].question });

  // 刚选了 B：同一个旋钮再往前一格（只对有先后顺序的旋钮，而且每个旋钮最多问两次）
  const last = done[done.length - 1];
  const orderly: KnobKey[] = ['paper', 'type', 'weight', 'space', 'radius'];
  if (last?.pick === 'b' && orderly.includes(last.key) && !locks.includes(last.key)
    && eff[last.key] === last.b && done.filter(r => r.key === last.key).length < 2) {
    const values = KNOBS[last.key].options.map(o => o.value);
    // A 可能是两档之间的原值（64）：数值类按大小定方向，其余按档位顺序
    const step = typeof last.a === 'number' && typeof last.b === 'number'
      ? Math.sign(last.b - last.a)
      : Math.sign(values.indexOf(last.b) - values.indexOf(last.a));
    const further = values[values.indexOf(last.b) + step];
    if (step && further !== undefined && further !== eff[last.key]) return make(last.key, further);
  }

  for (const key of CALIBRATE_ORDER) {
    if (locks.includes(key) || done.some(r => r.key === key)) continue;
    const a = eff[key];
    let b: KnobValue | undefined;
    if (key === 'accent') {
      // 先试从照片里取的颜色，再按这个人的位置挑一个色相明显不同的
      b = candidates(key, extraAccents)
        .filter(c => hueGap(String(c), String(a)) > 30 || Math.abs(hsl(String(c))[2] - hsl(String(a))[2]) > 0.15)
        .sort((x, y) => (extraAccents.includes(String(y)) ? 1 : 0) - (extraAccents.includes(String(x)) ? 1 : 0)
          || distance(key, x, v) - distance(key, y, v))[0];
    } else if (orderly.includes(key)) {
      const values = KNOBS[key].options.map(o => o.value);
      const i = values.indexOf(a);
      // 主题本来的值落在两档之间：两边最近的那两档就是它的邻居
      const around: KnobValue[] = i >= 0
        ? [values[i - 1], values[i + 1]].filter((x): x is KnobValue => x !== undefined)
        : typeof a === 'number'
          ? [Math.max(...(values as number[]).filter(x => x < a)), Math.min(...(values as number[]).filter(x => x > a))].filter(Number.isFinite)
          : [];
      b = around.sort((x, y) => distance(key, x, v) - distance(key, y, v))[0];
    } else {
      b = KNOBS[key].options.map(o => o.value).filter(x => x !== a)
        .sort((x, y) => distance(key, x, v) - distance(key, y, v))[0];
    }
    // A、B 一样就不用比了（比如刚在细调里把这一个旋钮拨到了 B）
    if (b !== undefined && b !== a) return make(key, b);
  }
  return null;
}

// ═════════════ 这不像我 ═════════════

/** 一个具体问题的一个回答：往某一维拨一格（可以限定只拨哪几个旋钮），或者直接定一档 */
export type NotMeAnswer = {
  label: string;
  dim?: DimensionKey;
  dir?: 1 | -1;
  only?: KnobKey[];
  set?: Knobs;
};
export type NotMeTopic = { label: string; question: string; answers: NotMeAnswer[] };

export const NOTME_TOPICS: Record<string, NotMeTopic> = {
  color: {
    label: '颜色', question: '颜色想往哪边走？',
    answers: [
      { label: '更暖一点', dim: 'warmth', dir: 1, only: ['paper', 'accent'] },
      { label: '更冷一点', dim: 'warmth', dir: -1, only: ['paper', 'accent'] },
      { label: '更浓一点', dim: 'energy', dir: 1, only: ['accent'] },
      { label: '更淡一点', dim: 'energy', dir: -1, only: ['accent'] },
    ],
  },
  type: {
    label: '字', question: '字想要什么感觉？',
    answers: [
      { label: '更有书卷气', dim: 'texture', dir: 1, only: ['type'] },
      { label: '更利落', dim: 'texture', dir: -1, only: ['type'] },
      { label: '标题轻一点', dim: 'energy', dir: -1, only: ['weight'] },
      { label: '标题更有分量', dim: 'energy', dir: 1, only: ['weight'] },
    ],
  },
  space: {
    label: '疏密', question: '想要更空，还是更满？',
    answers: [
      { label: '多留点白', dim: 'density', dir: -1, only: ['space'] },
      { label: '再紧凑一点', dim: 'density', dir: 1, only: ['space'] },
    ],
  },
  photo: {
    label: '照片', question: '照片想怎么处理？',
    answers: [
      { label: '保持原样', set: { photo: 'natural' } },
      { label: '柔和一点', dim: 'energy', dir: -1, set: { photo: 'soft' } },
      { label: '暖一点', dim: 'warmth', dir: 1, set: { photo: 'warm' } },
      { label: '黑白', dim: 'energy', dir: -1, set: { photo: 'mono' } },
      { label: '边缘柔一点', dim: 'texture', dir: 1, set: { edge: 'feather' } },
      { label: '边缘利落些', dim: 'texture', dir: -1, set: { edge: 'rule' } },
    ],
  },
  cover: {
    label: '首屏深浅', question: '首屏想要深一点，还是浅一点？',
    answers: [
      { label: '浅色，更轻', dim: 'energy', dir: 1, set: { cover: 'light' } },
      { label: '深色，更沉稳', dim: 'energy', dir: -1, set: { cover: 'dark' } },
      { label: '字居中', set: { align: 'center' } },
      { label: '字靠左', set: { align: 'left' } },
    ],
  },
};

export const NOTME_BLOCKS: Record<string, { label: string; topics: string[] }> = {
  cover: { label: '首屏', topics: ['photo', 'cover', 'type', 'color'] },
  knowing: { label: '「我这个人」', topics: ['color', 'type', 'space'] },
  path: { label: '「走过的路」', topics: ['type', 'space', 'color'] },
  offer: { label: '「一起做点什么」', topics: ['color', 'space', 'type'] },
  seed: { label: '最后一页', topics: ['color', 'type', 'space'] },
  end: { label: '尾声', topics: ['color', 'type'] },
};
