import type { NodeCard } from '@/lib/supabase';

type Props = { node: NodeCard };

/**
 * 节点卡片：轨道式布局 — 姓名在中心，关键词围绕分布。
 *
 * 关键词来源优先级：keywords (AI 生成) → topics (用户填写) → 规则提取兜底。
 */
export default function CreatorTree({ node }: Props) {
  const name = node.name || '无名之树';
  const tags = buildTagStrip(node, 8);
  const positions = layoutOrbit(tags);

  return (
    <article className="group relative h-full rounded-2xl bg-white border border-moss/15 hover:border-moss/35 shadow-[0_2px_12px_rgba(26,46,26,0.04)] hover:shadow-[0_10px_32px_rgba(26,46,26,0.10)] hover:-translate-y-0.5 transition-all duration-300 overflow-hidden flex flex-col">
      {/* 极简装饰带 + 微型小树 */}
      <div className="relative h-12 bg-gradient-to-br from-warm-cream via-white to-mist/40 border-b border-moss/8">
        <svg
          viewBox="0 0 60 60"
          width="36"
          height="36"
          aria-hidden="true"
          className="absolute right-4 top-2 opacity-70 group-hover:opacity-100 transition-opacity"
        >
          <path d="M30 50 L30 32" stroke="#3d2817" strokeWidth="2" strokeLinecap="round" />
          <circle cx="30" cy="22" r="14" fill="#a8c9a0" opacity="0.55" />
          <circle cx="22" cy="26" r="10" fill="#8fb573" opacity="0.7" />
          <circle cx="36" cy="26" r="10" fill="#8fb573" opacity="0.7" />
          <circle cx="30" cy="14" r="9" fill="#6b8f5e" opacity="0.85" />
        </svg>
      </div>

      {/* 轨道区 */}
      <div className="relative px-2 pt-3 pb-1">
        <OrbitNetwork name={name} city={node.city} positions={positions} />
      </div>

      {/* 底栏：在做 + 展开 */}
      <div className="px-5 pb-4 flex items-end justify-between gap-3 mt-auto">
        <p className="text-[12px] text-text-secondary leading-snug line-clamp-2 flex-1">
          {firstSentence(node.doing, 36)}
        </p>
        <span className="text-[11px] text-text-light group-hover:text-forest-mid transition-colors whitespace-nowrap">
          展开 <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
        </span>
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
  /** 此节点用什么颜色（保持稳定） */
  colorIdx: number;
};

const NODE_COLORS = [
  { bg: '#fde2c4', text: '#a36a3a' }, // coral-soft
  { bg: '#dcecf2', text: '#4a7c9a' }, // sky
  { bg: '#dcebd1', text: '#3d6b3d' }, // leaf
  { bg: '#e3d4ec', text: '#7a5494' }, // purple
  { bg: '#f1e2b8', text: '#8c6f2d' }, // gold
  { bg: '#f4d4d4', text: '#a85856' }, // pink
];

function hashIdx(key: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % mod;
}

/** 把关键词均匀铺在两层轨道上，并加微量角度抖动让构图有机 */
function layoutOrbit(tags: string[]): OrbitPos[] {
  if (tags.length === 0) return [];
  const n = tags.length;
  const baseInner = 92;
  const baseOuter = 118;
  const out: OrbitPos[] = [];
  for (let i = 0; i < n; i++) {
    const baseAngle = (i / n) * Math.PI * 2 - Math.PI / 2; // 从顶部开始顺时针
    const jitter = ((hashIdx(tags[i], 1000) / 1000 - 0.5) * 0.18); // ±0.09 rad
    const angle = baseAngle + jitter;
    // 偶数索引外圈、奇数内圈，形成内外交错的有机感
    const r = i % 2 === 0 ? baseOuter : baseInner;
    out.push({
      kw: tags[i],
      x: CX + Math.cos(angle) * r,
      y: CY + Math.sin(angle) * r,
      colorIdx: hashIdx(tags[i], NODE_COLORS.length),
    });
  }
  return out;
}

function OrbitNetwork({
  name,
  city,
  positions,
}: {
  name: string;
  city?: string | null;
  positions: OrbitPos[];
}) {
  return (
    <div className="relative w-full" style={{ aspectRatio: `${W} / ${H}` }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 w-full h-full"
        aria-label={`${name} 的关键词网络`}
      >
        {/* 同心圆装饰 */}
        <circle cx={CX} cy={CY} r={68} fill="none" stroke="#cfdcc8" strokeWidth="0.6" opacity="0.6" />
        <circle cx={CX} cy={CY} r={96} fill="none" stroke="#cfdcc8" strokeWidth="0.6" opacity="0.5" />
        <circle cx={CX} cy={CY} r={130} fill="none" stroke="#cfdcc8" strokeWidth="0.6" opacity="0.35" />

        {/* 中心 → 关键词 的连线 */}
        {positions.map(p => (
          <line
            key={`l-${p.kw}`}
            x1={CX}
            y1={CY}
            x2={p.x}
            y2={p.y}
            stroke="#a8c9a0"
            strokeWidth="0.5"
            opacity="0.45"
          />
        ))}

        {/* 中心：暗绿圆 + 姓名 + 城市 */}
        <g>
          <circle cx={CX} cy={CY} r={CENTER_R + 3} fill="#1a2e1a" opacity="0.12" />
          <circle cx={CX} cy={CY} r={CENTER_R} fill="#1a3a1a" />
          <text
            x={CX}
            y={city ? CY - 2 : CY + 6}
            textAnchor="middle"
            fontSize="18"
            fontWeight="700"
            fontFamily="ui-serif, Georgia, serif"
            fill="#ffffff"
          >
            {trimName(name)}
          </text>
          {city && (
            <text
              x={CX}
              y={CY + 18}
              textAnchor="middle"
              fontSize="10.5"
              letterSpacing="1.5"
              fill="#a8c9a0"
            >
              {city}
            </text>
          )}
        </g>
      </svg>

      {/* 关键词节点（HTML 层 — 字体渲染更好） */}
      {positions.map(p => {
        const color = NODE_COLORS[p.colorIdx];
        return (
          <span
            key={p.kw}
            className="absolute -translate-x-1/2 -translate-y-1/2 px-2.5 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap shadow-[0_2px_8px_rgba(26,46,26,0.06)]"
            style={{
              left: `${(p.x / W) * 100}%`,
              top: `${(p.y / H) * 100}%`,
              backgroundColor: color.bg,
              color: color.text,
              borderColor: 'rgba(255,255,255,0.7)',
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

/** 中心圆里的姓名长度截断：超过 5 字截到 4 字 + 省略号 */
function trimName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= 5) return trimmed;
  return trimmed.slice(0, 4) + '…';
}

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
