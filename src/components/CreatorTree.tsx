import Image from 'next/image';
import { dict } from '@/i18n';
import type { Locale } from '@/lib/locale';
import type { CreatorLook } from '@/lib/space/creatorLooks';
import { canOptimize } from '@/lib/space/image';
import { glyphOf } from '@/lib/space/story';
import { getTheme, type ThemeTokens } from '@/lib/space/themes';
import { readable } from '@/lib/space/tune';
import type { NodeCard } from '@/lib/supabase';

type Props = { node: NodeCard; locale: Locale; look?: CreatorLook };

/**
 * 节点卡片：轨道式布局 — 照片在中心，关键词围绕分布。
 *
 * 每张卡长成这个人自己空间的样子（look，见 lib/space/creatorLooks.ts）：纸色、强调色、字体、
 * 照片的处理和边缘（羽化 / 拱门 / 相纸 / 硬边 / 雾）、首屏纸幅的颜色，都和他的空间首屏一致。
 * 没有 look（读不到空间）时用林间米白——和空间的默认一样。
 *
 * 关键词来源优先级：keywords (AI 生成) → topics (用户填写) → 规则提取兜底。
 */
export default function CreatorTree({ node, locale, look }: Props) {
  // 服务端组件，字典直接在这儿取。卡上的姓名、城市、关键词是成员自己填的，
  // 一律不翻——只有兜底名、「走近」和读屏描述属于页面框架。
  const t = dict(locale).creators.tree;
  const name = node.name || t.unnamed;
  const tags = buildTagStrip(node, 8);
  const positions = layoutOrbit(tags, frameFor(look?.tokens ?? getTheme('forest')!.tokens));

  const tk = look?.tokens ?? getTheme('forest')!.tokens;
  // HEIC 浏览器大多打不开、也缩不了：和空间首屏一样，当作没有照片
  const photo = node.avatar_url && !/\.(heic|heif)(\?|$)/i.test(node.avatar_url) ? node.avatar_url : null;
  // 卡片圆角跟主题走，但收在 4–16px：一格一格排在一起时不至于一张方一张圆得太跳
  const radius = Math.min(16, Math.max(4, parseFloat(tk.radius) || 8));
  const dark = tk.cover === 'dark';
  const centered = tk.coverAlign === 'center';
  // 底部纸幅的颜色：就是首屏纸幅那几色（themes.ts 保证了字对纸 ≥ 4.5:1）
  const sheet = dark
    ? { bg: tk.sheet, ink: tk.sheetInk, soft: tk.sheetSoft, link: tk.sheetInk }
    : { bg: tk.sheet, ink: tk.sheetInk, soft: tk.inkSoft, link: tk.accentText };

  return (
    <article
      className="group relative h-full border shadow-[0_2px_12px_rgba(26,46,26,0.04)] hover:shadow-[0_10px_32px_rgba(26,46,26,0.10)] hover:-translate-y-0.5 transition-all duration-300 overflow-hidden flex flex-col"
      style={{ background: tk.bg, borderColor: tk.line, borderRadius: radius, fontFamily: tk.bodyFont }}
      data-theme={look?.themeId}
    >
      <div className="h-px w-full" style={{ background: `linear-gradient(to right, transparent, ${tk.accent}, transparent)`, opacity: 0.55 }} />

      {/* 轨道区 */}
      <div className="relative px-2 pt-5 pb-3">
        <OrbitNetwork name={name} positions={positions} networkLabel={t.network(name)}
          tk={tk} photo={photo} focus={look?.focus ?? null} />
      </div>

      {/*
        底部纸幅：和他空间首屏在手机上的样子一样——照片在上，名字和在做的事写在一张纸上。
        深纸幅的主题（林间米白、陶土手作……）这一条就是深色的；浅的主题是一张浅纸，上面描一条线。
      */}
      <div
        className="mt-auto px-5 pt-3.5 pb-4"
        style={{
          background: sheet.bg,
          borderTop: dark ? 'none' : `1px solid ${tk.line}`,
          textAlign: tk.coverAlign === 'center' ? 'center' : 'left',
        }}
      >
        {/* 名字太长只截名字，城市留着（不然一个长名字会把城市整个挤没） */}
        <h3 className={`m-0 flex items-baseline gap-2 min-w-0 text-[18px] leading-tight ${centered ? 'justify-center' : ''}`}
          style={{ fontFamily: tk.headFont, fontWeight: tk.headWeight, letterSpacing: tk.nameTrack, color: sheet.ink }}>
          <span className="truncate" title={name}>{name}</span>
          {node.city && (
            <span className="shrink-0 text-[11px]" style={{ fontFamily: tk.bodyFont, fontWeight: 400, letterSpacing: '0.12em', color: sheet.soft }}>
              {node.city}
            </span>
          )}
        </h3>
        {/* 「在做」固定留两行高：一行和两行的卡并排时，纸幅上沿才对得齐 */}
        <div className={`mt-1.5 flex gap-3 ${centered ? 'flex-col items-center' : 'items-end justify-between'}`}>
          <p className="m-0 text-[12px] leading-[1.4] line-clamp-2 flex-1 min-h-[2.8em]" style={{ color: sheet.soft }}>
            {firstSentence(node.doing, 36)}
          </p>
          <span className="text-[11px] whitespace-nowrap font-medium" style={{ color: sheet.link }}>
            {look?.spaceHref ? t.visitSpace : t.closer} <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
          </span>
        </div>
      </div>
    </article>
  );
}

// ──────────────────────────────────────────────────────────────────
// 轨道网络渲染
// ──────────────────────────────────────────────────────────────────

const W = 360;
const H = 340;
const CX = W / 2;
const CY = H / 2;
const CENTER_R = 54;

type OrbitPos = {
  kw: string;
  x: number;
  y: number;
  /** 外圈的那几个：卡片很窄（小屏手机）时收起来，留下的字才放得大一点 */
  outer: boolean;
};

function hashIdx(key: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % mod;
}

/** 关键词在 360 宽画布上的字号：字号跟着卡片等比缩放（cqw），所以按画布单位算的位置在什么宽度下都成立 */
const CHIP_FONT = 11;
const CHIP_PAD_X = 0.85 * CHIP_FONT;
const CHIP_HALF_H = 10.5;

/** 估一个关键词占多宽（画布单位）：中文一个字一个字号，英文数字大约六成 */
function chipHalfWidth(text: string): number {
  let w = 0;
  for (const ch of text) {
    w += /[⺀-鿿豈-﫿＀-￯]/.test(ch) ? CHIP_FONT
      : /[A-Z]/.test(ch) ? CHIP_FONT * 0.68
      : /\s/.test(ch) ? CHIP_FONT * 0.3
      : CHIP_FONT * 0.58;
  }
  return w / 2 + CHIP_PAD_X + 1;
}

type Box = { x: number; y: number; hw: number; hh: number };
const overlap = (a: Box, b: Box, gap = 4) =>
  Math.abs(a.x - b.x) < a.hw + b.hw + gap && Math.abs(a.y - b.y) < a.hh + b.hh + gap;

/**
 * 把关键词铺在照片四周：每一个都按自己的宽度往外推，推到刚好不碰照片外圈；
 * 再躲开已经放好的那些（往外挪、或者角度偏一点）；还放不下就截短，截到 4 个字仍放不下就不放。
 * 两层交错 + 微量角度抖动，构图仍然是有机的一圈。
 */
function layoutOrbit(tags: string[], frame: { w: number; h: number }): OrbitPos[] {
  if (tags.length === 0) return [];
  const n = tags.length;
  // 照片外圈（光晕）再留 6 的空
  const clear = Math.max(frame.w, frame.h) / 2 + 16;
  const placed: (Box & { kw: string; outer: boolean })[] = [];
  for (let i = 0; i < n; i++) {
    const baseAngle = (i / n) * Math.PI * 2 - Math.PI / 2; // 从顶部开始顺时针
    const jitter = ((hashIdx(tags[i], 1000) / 1000 - 0.5) * 0.18); // ±0.09 rad
    const preferred = i % 2 === 0 ? 122 : 96; // 偶数外圈、奇数内圈
    const chars = [...tags[i]];
    let done = false;
    // 从全文开始试，放不下就一个字一个字截短；本来就短（两三个字）的不截
    for (let len = chars.length; len >= Math.min(4, chars.length) && !done; len--) {
      const kw = len === chars.length ? tags[i] : chars.slice(0, len - 1).join('') + '…';
      const hw = chipHalfWidth(kw);
      for (const dA of [0, 0.14, -0.14, 0.28, -0.28]) {
        const a = baseAngle + jitter + dA;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        // 刚好不碰照片外圈的最小半径（按矩形在这个方向上的投影算）
        const rMin = clear + hw * Math.abs(c) + CHIP_HALF_H * Math.abs(sn);
        // 不出画布的最大半径
        const rMaxX = Math.abs(c) > 1e-3 ? (CX - hw - 3) / Math.abs(c) : Infinity;
        const rMaxY = Math.abs(sn) > 1e-3 ? (CY - CHIP_HALF_H - 3) / Math.abs(sn) : Infinity;
        const rMax = Math.min(rMaxX, rMaxY);
        for (let r = Math.max(preferred, rMin); r <= rMax; r += 6) {
          const box = { x: CX + c * r, y: CY + sn * r, hw, hh: CHIP_HALF_H };
          if (placed.some(p => overlap(p, box))) continue;
          placed.push({ ...box, kw, outer: i % 2 === 0 });
          done = true;
          break;
        }
        if (done) break;
      }
    }
  }
  return placed.map(p => ({ kw: p.kw, x: p.x, y: p.y, outer: p.outer }));
}

/**
 * 照片的相框跟着主题首屏的「照片边缘」走：羽化、雾是柔边的圆，拱门是拱形，相纸是带白边的一张相片，硬边是方的。
 * 返回相框在 360×340 画布里的宽高，和它自己的样式。
 */
function frameFor(tk: ThemeTokens): { w: number; h: number; style: React.CSSProperties; ring: boolean } {
  const d = CENTER_R * 2;
  switch (tk.edge) {
    case 'arch':
      return { w: d * 0.86, h: d * 1.08, ring: false, style: { borderRadius: '999px 999px 10px 10px' } };
    case 'print':
      return {
        w: d * 0.92, h: d * 0.92, ring: false,
        style: { borderRadius: 2, border: '4px solid #fffdf8', boxShadow: '0 4px 14px rgba(0,0,0,0.16)', transform: 'translate(-50%, -50%) rotate(-2deg)' },
      };
    case 'rule':
      return { w: d * 0.9, h: d * 0.9, ring: false, style: { borderRadius: 0, outline: `1px solid ${tk.ink}`, outlineOffset: 3 } };
    case 'fog':
      // 雾：照片化进浅浅的纸色里，不描深色的圈（描了就成了反向的暗角）
      return { w: d, h: d, ring: false, style: { borderRadius: '50%', WebkitMaskImage: 'radial-gradient(circle, #000 55%, transparent 72%)', maskImage: 'radial-gradient(circle, #000 55%, transparent 72%)' } };
    default:
      return { w: d, h: d, ring: true, style: { borderRadius: '50%' } };
  }
}

function OrbitNetwork({
  name,
  positions,
  networkLabel,
  tk,
  photo,
  focus,
}: {
  name: string;
  positions: OrbitPos[];
  networkLabel: string;
  tk: ThemeTokens;
  photo: string | null;
  focus: { x: number; y: number } | null;
}) {
  const dark = tk.cover === 'dark';
  const frame = frameFor(tk);
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  // 首屏的颜色：深纸幅的主题，照片外圈和名牌用纸幅那一色；浅纸幅的主题用强调色描一圈
  const ringColor = dark ? tk.sheet : tk.accent;
  // 强调色的字压在浅强调色上，主题本身只保证了对纸 4.5:1——这里单独再压一档
  const chipSoftInk = readable(tk.accentText, [tk.accentSoft]);
  // 和空间首屏没照片时同一个写法（英文首字母大写）
  const glyph = glyphOf(name) || '·';

  return (
    <div className="relative w-full" style={{ aspectRatio: `${W} / ${H}`, containerType: 'inline-size' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 w-full h-full"
        aria-label={networkLabel}
      >
        {/* 同心圆装饰 */}
        <circle cx={CX} cy={CY} r={68} fill="none" stroke={tk.line} strokeWidth="0.8" opacity="0.9" />
        <circle cx={CX} cy={CY} r={96} fill="none" stroke={tk.line} strokeWidth="0.8" opacity="0.7" />
        <circle cx={CX} cy={CY} r={130} fill="none" stroke={tk.line} strokeWidth="0.8" opacity="0.5" />

        {/* 中心 → 关键词 的连线 */}
        {positions.map(p => (
          <line key={`l-${p.kw}-${p.x}`} className="tree-link" data-ring={p.outer ? 'outer' : 'inner'}
            x1={CX} y1={CY} x2={p.x} y2={p.y} stroke={tk.accent} strokeWidth="0.6" opacity="0.28" />
        ))}

        {/* 照片外面那一圈：首屏的颜色 */}
        <circle cx={CX} cy={CY} r={CENTER_R + 10} fill={tk.accentSoft} opacity="0.8" />
        {frame.ring && <circle cx={CX} cy={CY} r={CENTER_R + 3.5} fill={ringColor} />}
      </svg>

      {/* 照片（没有照片时：首屏没照片时的画面 + 名字的第一个字） */}
      <div
        className="absolute overflow-hidden"
        style={{
          left: pct(CX, W), top: pct(CY, H), width: pct(frame.w, W), height: pct(frame.h, H),
          transform: 'translate(-50%, -50%)',
          background: photo ? tk.coverBase : tk.art,
          ...frame.style,
        }}
        aria-hidden
      >
        {photo ? (
          <Image
            src={photo} alt="" fill sizes="(min-width: 1024px) 120px, (min-width: 768px) 15vw, 30vw" quality={70}
            unoptimized={!canOptimize(photo)} loading="lazy"
            style={{
              objectFit: 'cover',
              objectPosition: focus ? `${focus.x}% ${focus.y}%` : '50% 35%',
              filter: tk.photoFilter,
            }}
          />
        ) : (
          <span
            className="absolute inset-0 grid place-items-center"
            style={{ color: tk.glyph, opacity: Math.max(tk.glyphOpacity, 0.55), fontFamily: tk.headFont, fontSize: 44, fontWeight: tk.headWeight }}
          >
            {glyph}
          </span>
        )}
        {/* 主题自带的照片色调（暖光、色罩） */}
        {photo && tk.photoTint !== 'none' && (
          <span className="absolute inset-0 pointer-events-none" style={{ background: tk.photoTint }} />
        )}
      </div>

      {/* 关键词节点（HTML 层 — 字体渲染更好）：主题的两种调子交替，一张卡一套颜色 */}
      {positions.map((p, i) => {
        const soft = i % 2 === 0;
        return (
          <span
            key={`${i}-${p.kw}`}
            data-ring={p.outer ? 'outer' : 'inner'}
            className="tree-chip absolute -translate-x-1/2 -translate-y-1/2 rounded-full font-medium border whitespace-nowrap shadow-[0_2px_8px_rgba(26,46,26,0.04)]"
            style={{
              left: pct(p.x, W),
              top: pct(p.y, H),
              backgroundColor: soft ? tk.accentSoft : tk.surface,
              color: soft ? chipSoftInk : tk.inkSoft,
              borderColor: soft ? 'transparent' : tk.line,
            }}
          >
            {p.kw}
          </span>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// 工具函数
// ──────────────────────────────────────────────────────────────────

function firstSentence(text: string | null | undefined, max = 40): string {
  if (!text) return '';
  const segments = text
    .split(/[\n。；;]/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !/^(有|无|是|否|没有)[。.\s]?$/.test(s));
  const first = segments[0] || '';
  if (!first) return '';
  return first.length <= max ? first : first.slice(0, max - 1) + '…';
}

const TAG_STRIP_PREFIX =
  /^(在?做|探索|希望|想要?|期待|关心|关注|提供|支持|包括|以及|链接|连接|寻找|要找|想找|认识|参与|相关的?|关于|多年|长期|资深|某种|一些|一名|一个|目前提供|目前|曾经|之前|现在|正在|融合|也是|也|并|更|又|且|从|对|向|为)/;
const TAG_MIN = 2;
const TAG_MAX = 8;

function extractTags(text: string | null | undefined, max = 8): string[] {
  if (!text) return [];
  const cleaned = text
    .replace(/[\d①-⑩]+\s*[年月天小时分钟周岁]/g, ' ')
    .replace(/[\d①-⑩．\.]+\s*/g, ' ')
    .replace(/[「」『』""''#]/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ');
  const segments = cleaned.split(/[、，,；;。!?！？（）()【】\[\]/\\\-—]+/);
  const expanded = segments.flatMap(s => (s.length > TAG_MAX ? s.split(/[与和及或]/) : [s]));
  const out: string[] = [];
  for (let s of expanded) {
    s = s.trim().replace(TAG_STRIP_PREFIX, '').trim();
    if (!s) continue;
    s = s.replace(/(场域?|过程|状态)?(中|里|下)$/, '');
    s = s.replace(/的[一-鿿]{1,5}$/, '');
    s = s.replace(/的$/, '');
    s = s.trim();
    if (s.length < TAG_MIN || s.length > TAG_MAX) continue;
    if (/[的得地了吗呢吧啊呀]$/.test(s)) continue;
    if (/^(其他|等等|更|可|让|为|把|被|然|再|也|年|月|岁|天)/.test(s)) continue;
    if (out.includes(s)) continue;
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * 生成关键词列表，优先用 AI 生成的 keywords，其次用户 topics，最后规则兜底。
 */
function buildTagStrip(node: NodeCard, max = 8): string[] {
  const aiKeywords = (node.keywords || []).map(k => k.trim()).filter(Boolean);
  if (aiKeywords.length >= 3) {
    return aiKeywords.slice(0, max);
  }

  const isDup = (a: string, b: string) =>
    a === b || a.includes(b) || b.includes(a);
  const out: string[] = [];

  const tryPush = (k: string) => {
    if (!k) return;
    if (out.some(o => isDup(o, k))) return;
    out.push(k);
  };

  for (const t of node.topics || []) {
    tryPush(t.trim());
    if (out.length >= max) return out;
  }

  const buckets = [node.doing, node.experience, node.offer, node.product]
    .map(src => extractTags(src, max * 2));
  let progressed = true;
  for (let i = 0; out.length < max && progressed; i++) {
    progressed = false;
    for (const b of buckets) {
      if (i < b.length) {
        progressed = true;
        tryPush(b[i]);
        if (out.length >= max) break;
      }
    }
  }
  return out;
}
