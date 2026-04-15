import type { NodeCard } from '@/lib/supabase';

type Props = { node: NodeCard };

// 首字母 + 根据名字稳定取色
const gradients = [
  'from-coral-soft to-warmth',
  'from-sky to-[#a5cce0]',
  'from-leaf to-sage',
  'from-[#b088c9] to-[#d4b4e8]',
  'from-gold to-gold-light',
];

function hashPick<T>(key: string, list: T[]): T {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}

function firstChar(name: string): string {
  return (name || '').trim().charAt(0) || '·';
}

function hashSeed(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h;
}

// 稳定的伪随机
function rand(seed: number, i: number): number {
  const n = Math.sin((seed + i * 9301 + 49297) * 0.0001) * 43758.5453;
  return n - Math.floor(n);
}

type Circle = { x: number; y: number; r: number };

// 在椭圆区域内生成致密叶丛点
function buildFoliage(
  seed: number,
  offset: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  density = 0.18,
): Circle[] {
  const count = Math.max(12, Math.round(rx * ry * density));
  const out: Circle[] = [];
  for (let i = 0; i < count; i++) {
    const a = rand(seed, offset + i * 3) * Math.PI * 2;
    const r = Math.sqrt(rand(seed, offset + i * 3 + 1));
    const x = cx + Math.cos(a) * r * rx;
    const y = cy + Math.sin(a) * r * ry;
    const sz = 5 + rand(seed, offset + i * 3 + 2) * 5;
    out.push({ x, y, r: sz });
  }
  return out;
}

export default function CreatorTree({ node }: Props) {
  const name = node.name || '无名之树';
  const initial = firstChar(name);
  const gradient = hashPick(name, gradients);
  const seed = hashSeed(name);

  // 内容区块（供卡片下半部分渲染）
  const branches = [
    { label: '在做', text: node.doing },
    { label: '作品', text: node.product },
    { label: '擅长', text: node.experience },
  ].filter(b => b.text && b.text.trim());

  const gid = `gid-${seed}`;

  // 生成多个叶丛（主冠 + 左右 + 顶部），让轮廓不规则
  // 基于 seed 的微小偏移让每棵树不完全一样
  const seedOffX = (rand(seed, 0) - 0.5) * 16;
  const seedOffY = (rand(seed, 1) - 0.5) * 8;

  // 整个画布 300×340，主树位于 (150, 140) 附近
  // 多个叶丛中心
  const clusters = [
    { cx: 150 + seedOffX * 0.3, cy: 110 + seedOffY, rx: 100, ry: 80, start: 10 },
    { cx: 85 + seedOffX, cy: 130, rx: 55, ry: 50, start: 500 },
    { cx: 215 + seedOffX * -1, cy: 135, rx: 60, ry: 52, start: 1000 },
    { cx: 150, cy: 55, rx: 55, ry: 35, start: 1500 },
    { cx: 110, cy: 170 + seedOffY, rx: 45, ry: 40, start: 2000 },
    { cx: 190, cy: 175, rx: 48, ry: 42, start: 2500 },
  ];

  // 每个叶丛生成多层（深→浅）
  const leavesBack: Circle[] = [];
  const leavesMid: Circle[] = [];
  const leavesFront: Circle[] = [];
  const leavesHighlight: Circle[] = [];
  clusters.forEach(c => {
    leavesBack.push(...buildFoliage(seed, c.start, c.cx, c.cy + 4, c.rx, c.ry, 0.08));
    leavesMid.push(...buildFoliage(seed, c.start + 100, c.cx + 2, c.cy, c.rx * 0.92, c.ry * 0.92, 0.12));
    leavesFront.push(...buildFoliage(seed, c.start + 200, c.cx - 2, c.cy - 3, c.rx * 0.75, c.ry * 0.75, 0.12));
    leavesHighlight.push(...buildFoliage(seed, c.start + 300, c.cx + 3, c.cy - 6, c.rx * 0.5, c.ry * 0.5, 0.08));
  });

  return (
    <article className="group relative rounded-3xl overflow-hidden border border-moss/20 shadow-[0_6px_28px_rgba(26,46,26,0.08)] hover:shadow-[0_16px_48px_rgba(26,46,26,0.15)] hover:-translate-y-1 transition-all duration-300 flex flex-col bg-warm-cream">
      {/* SVG 场景：天空 + 远山 + 树 + 草地 */}
      <div className="relative">
        <svg viewBox="0 0 300 340" width="100%" aria-hidden="true" className="block">
          <defs>
            {/* 天空渐变 */}
            <linearGradient id={`${gid}-sky`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#b6d8eb" />
              <stop offset="60%" stopColor="#d6e8ee" />
              <stop offset="100%" stopColor="#e8efe0" />
            </linearGradient>
            {/* 草地渐变 */}
            <linearGradient id={`${gid}-grass`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8fb573" />
              <stop offset="50%" stopColor="#6b8f5e" />
              <stop offset="100%" stopColor="#4a7c4a" />
            </linearGradient>
            {/* 树干渐变 */}
            <linearGradient id={`${gid}-trunk`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#3d2817" />
              <stop offset="50%" stopColor="#6b4a2b" />
              <stop offset="100%" stopColor="#2a1a0f" />
            </linearGradient>
          </defs>

          {/* 天空 */}
          <rect width="300" height="260" fill={`url(#${gid}-sky)`} />
          {/* 几朵云 */}
          <g opacity="0.7">
            <ellipse cx="50" cy="40" rx="22" ry="6" fill="#ffffff" />
            <ellipse cx="60" cy="38" rx="18" ry="5" fill="#ffffff" />
            <ellipse cx="250" cy="55" rx="25" ry="7" fill="#ffffff" />
            <ellipse cx="260" cy="52" rx="18" ry="5" fill="#ffffff" />
          </g>
          {/* 远山 */}
          <path
            d="M 0 220 Q 50 200 100 210 T 180 205 T 260 215 T 300 210 L 300 260 L 0 260 Z"
            fill="#8ba8b8"
            opacity="0.4"
          />
          <path
            d="M 0 230 Q 60 215 120 225 T 220 220 T 300 228 L 300 260 L 0 260 Z"
            fill="#6b8f5e"
            opacity="0.5"
          />
          {/* 草地 */}
          <rect y="258" width="300" height="82" fill={`url(#${gid}-grass)`} />
          {/* 草地上的草叶 */}
          <g stroke="#3d5a2d" strokeWidth="1" opacity="0.4">
            {Array.from({ length: 30 }).map((_, i) => {
              const x = (i * 11 + rand(seed, i + 60) * 5) % 300;
              const y = 260 + rand(seed, i + 70) * 75;
              return <line key={i} x1={x} y1={y} x2={x + 0.5} y2={y - 3 - rand(seed, i + 80) * 3} />;
            })}
          </g>

          {/* 树干 - 主干从草地伸到叶冠中心 */}
          <path
            d="M 144 278
               C 142 250, 148 220, 145 190
               C 142 160, 152 130, 150 105
               L 156 105
               C 158 130, 168 160, 162 190
               C 160 220, 166 250, 162 278
               Z"
            fill={`url(#${gid}-trunk)`}
          />
          {/* 树干高光 */}
          <path
            d="M 145 275 C 144 240, 149 180, 151 108"
            stroke="#8b6f47"
            strokeWidth="1"
            strokeLinecap="round"
            fill="none"
            opacity="0.5"
          />
          {/* 树干纹理暗线 */}
          <path
            d="M 156 270 C 157 235, 160 180, 158 115"
            stroke="#1a0e07"
            strokeWidth="1"
            strokeLinecap="round"
            fill="none"
            opacity="0.6"
          />

          {/* 主枝分叉 */}
          {/* 左大枝 */}
          <path
            d="M 150 150 Q 115 135 80 125 Q 60 120 42 118"
            stroke="#3d2817"
            strokeWidth="5"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M 80 125 Q 70 105 62 85"
            stroke="#3d2817"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
          {/* 右大枝 */}
          <path
            d="M 152 140 Q 190 128 225 118 Q 245 112 265 108"
            stroke="#3d2817"
            strokeWidth="5"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M 225 118 Q 235 98 240 80"
            stroke="#3d2817"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
          {/* 顶部主枝 */}
          <path
            d="M 153 110 Q 150 85 153 60 Q 155 40 160 28"
            stroke="#3d2817"
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M 153 90 Q 135 75 120 65"
            stroke="#3d2817"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M 153 90 Q 170 75 185 65"
            stroke="#3d2817"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />

          {/* 叶丛 — 四层堆叠 */}
          {/* 后排最深 */}
          <g fill="#2d4a2d">
            {leavesBack.map((c, i) => (
              <circle key={`lb-${i}`} cx={c.x} cy={c.y} r={c.r * 1.15} />
            ))}
          </g>
          {/* 中层 */}
          <g fill="#4a7c4a">
            {leavesMid.map((c, i) => (
              <circle key={`lm-${i}`} cx={c.x} cy={c.y} r={c.r * 1.05} />
            ))}
          </g>
          {/* 前层亮 */}
          <g fill="#6b8f5e">
            {leavesFront.map((c, i) => (
              <circle key={`lf-${i}`} cx={c.x} cy={c.y} r={c.r * 0.95} />
            ))}
          </g>
          {/* 高光点 */}
          <g fill="#8fb573">
            {leavesHighlight.map((c, i) => (
              <circle key={`lh-${i}`} cx={c.x} cy={c.y} r={c.r * 0.55} />
            ))}
          </g>
          <g fill="#a8c9a0" opacity="0.7">
            {leavesHighlight.slice(0, leavesHighlight.length / 3).map((c, i) => (
              <circle key={`ls-${i}`} cx={c.x - 1} cy={c.y - 1} r={c.r * 0.3} />
            ))}
          </g>

          {/* 树下阴影 */}
          <ellipse cx="150" cy="285" rx="55" ry="4" fill="#1a0e07" opacity="0.25" />
        </svg>
      </div>

      {/* 信息区 */}
      <div className="p-6 flex flex-col flex-1">
        {/* 姓名 + 首字母头像 */}
        <div className="flex items-center gap-3 mb-5">
          <div
            className={`flex-shrink-0 w-11 h-11 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-serif font-bold text-lg shadow-[0_3px_10px_rgba(26,46,26,0.2)]`}
          >
            {initial}
          </div>
          <div className="min-w-0">
            <h3 className="font-serif text-xl font-bold text-forest-deep leading-tight truncate">{name}</h3>
            {node.city && (
              <p className="text-xs text-text-light tracking-wider mt-0.5">{node.city}</p>
            )}
          </div>
        </div>

        {/* 在做 / 作品 / 擅长 */}
        <div className="space-y-3 flex-1">
          {branches.map(b => (
            <div key={b.label}>
              <div className="text-[10px] font-semibold tracking-widest text-moss uppercase mb-1">
                {b.label}
              </div>
              <p className="text-sm text-text-secondary leading-relaxed line-clamp-3">{b.text}</p>
            </div>
          ))}
          {node.offer && node.offer.trim() && (
            <div>
              <div className="text-[10px] font-semibold tracking-widest text-moss uppercase mb-1">
                可以提供
              </div>
              <p className="text-sm text-text-secondary leading-relaxed line-clamp-2">{node.offer}</p>
            </div>
          )}
          {node.seeking && node.seeking.trim() && (
            <div>
              <div className="text-[10px] font-semibold tracking-widest text-coral uppercase mb-1">
                寻找
              </div>
              <p className="text-sm text-text-secondary leading-relaxed line-clamp-2">{node.seeking}</p>
            </div>
          )}
        </div>

        {/* 关注议题 chip */}
        {(node.topics || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-mist/60">
            {(node.topics || []).map(topic => (
              <span
                key={topic}
                className="inline-block px-2.5 py-0.5 bg-love-pink/10 border border-love-pink/20 rounded-full text-[11px] text-coral font-medium"
              >
                {topic}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
