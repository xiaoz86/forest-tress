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

// 用 hash 生成稳定的"随机"偏移，让每棵树看起来不完全一样
function hashSeed(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h;
}
function jitter(seed: number, i: number, range: number): number {
  const n = Math.sin((seed + i * 1234) * 0.01) * 43758.5453;
  return (n - Math.floor(n) - 0.5) * 2 * range;
}

export default function CreatorTree({ node }: Props) {
  const name = node.name || '无名之树';
  const initial = firstChar(name);
  const gradient = hashPick(name, gradients);
  const seed = hashSeed(name);

  // 树枝数量 = 核心内容字段数（doing / product / experience 非空）
  const branches = [
    { label: '在做', text: node.doing },
    { label: '作品', text: node.product },
    { label: '擅长', text: node.experience },
  ].filter(b => b.text && b.text.trim());

  // 树根数量 = topics 数（1-5）
  const rootCount = Math.min(Math.max((node.topics || []).length, 1), 5);
  const branchCount = Math.max(branches.length, 2);

  // 弯曲树枝路径：从树干中段延伸出去，末端向上微翘
  const branchPaths = Array.from({ length: branchCount }).map((_, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const t = (i + 0.5) / branchCount;
    const startY = 150 - t * 40; // 110 → 150 区间，越往下越早
    const len = 30 + (i % 2) * 8 + jitter(seed, i, 6);
    const endX = 100 + side * len;
    const endY = startY - 18 - jitter(seed, i + 7, 4);
    // 贝塞尔控制点让枝条向下再翘起来
    const cp1x = 100 + side * len * 0.4;
    const cp1y = startY - 4;
    const cp2x = 100 + side * len * 0.8;
    const cp2y = startY - 10;
    return {
      d: `M 100 ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`,
      endX,
      endY,
      side,
    };
  });

  // 树根：从底部弯曲向外延伸
  const roots = Array.from({ length: rootCount }).map((_, i) => {
    const spread = (i - (rootCount - 1) / 2) * (14 + jitter(seed, i + 11, 2));
    const endX = 100 + spread;
    const endY = 206 + Math.abs(spread) * 0.15;
    const midX = 100 + spread * 0.5;
    const midY = 200;
    return `M 100 192 Q ${midX} ${midY} ${endX} ${endY}`;
  });

  // 唯一的 gradient id（避免同页多棵树 id 冲突）
  const gid = `gid-${seed}`;

  return (
    <article className="group relative bg-warm-cream rounded-3xl p-6 border border-moss/15 shadow-[0_4px_24px_rgba(26,46,26,0.04)] hover:shadow-[0_12px_40px_rgba(26,46,26,0.08)] hover:-translate-y-1 transition-all duration-300 flex flex-col">
      {/* SVG Tree */}
      <div className="relative flex justify-center mb-4">
        <svg viewBox="0 0 200 220" width="200" height="220" aria-hidden="true">
          <defs>
            {/* 树干渐变 */}
            <linearGradient id={`${gid}-trunk`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#6b4a2b" />
              <stop offset="50%" stopColor="#8b6f47" />
              <stop offset="100%" stopColor="#5c4033" />
            </linearGradient>
            {/* 叶冠径向渐变 */}
            <radialGradient id={`${gid}-crown`} cx="0.4" cy="0.4" r="0.7">
              <stop offset="0%" stopColor="#a8c9a0" />
              <stop offset="50%" stopColor="#8fb573" />
              <stop offset="100%" stopColor="#4a7c4a" />
            </radialGradient>
            {/* 土地阴影 */}
            <radialGradient id={`${gid}-ground`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0%" stopColor="#5c4033" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#5c4033" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* 土地阴影 */}
          <ellipse cx="100" cy="205" rx="55" ry="5" fill={`url(#${gid}-ground)`} />

          {/* 树根 */}
          {roots.map((d, i) => (
            <path
              key={`root-${i}`}
              d={d}
              stroke="#6b4a2b"
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
              opacity="0.55"
            />
          ))}

          {/* 树干 — 用 path 画出有弧度、略带锥形的树干 */}
          <path
            d="M 92 200
               C 90 180, 94 160, 92 140
               C 90 120, 95 100, 98 82
               L 102 82
               C 105 100, 110 120, 108 140
               C 106 160, 110 180, 108 200
               Z"
            fill={`url(#${gid}-trunk)`}
          />
          {/* 树干高光 */}
          <path
            d="M 93 198 C 92 170, 94 130, 97 85"
            stroke="#c9a784"
            strokeWidth="1"
            strokeLinecap="round"
            fill="none"
            opacity="0.35"
          />

          {/* 树枝 */}
          {branchPaths.map((b, i) => (
            <g key={`branch-${i}`}>
              <path
                d={b.d}
                stroke="#6b4a2b"
                strokeWidth="3"
                strokeLinecap="round"
                fill="none"
              />
              {/* 枝条末端的叶丛：3-4 个叠加椭圆 */}
              <g>
                <ellipse
                  cx={b.endX - b.side * 2}
                  cy={b.endY + 2}
                  rx="11"
                  ry="9"
                  fill="#4a7c4a"
                  opacity="0.85"
                />
                <ellipse
                  cx={b.endX}
                  cy={b.endY}
                  rx="10"
                  ry="8"
                  fill="#6b8f5e"
                />
                <ellipse
                  cx={b.endX + b.side * 2}
                  cy={b.endY - 2}
                  rx="8"
                  ry="6"
                  fill="#8fb573"
                />
                <ellipse
                  cx={b.endX + b.side * 3}
                  cy={b.endY - 4}
                  rx="4"
                  ry="3"
                  fill="#a8c9a0"
                />
              </g>
            </g>
          ))}

          {/* 主叶冠 — 多层椭圆叠加 */}
          <g>
            {/* 后排深色 */}
            <ellipse cx="82" cy="60" rx="22" ry="18" fill="#4a7c4a" opacity="0.85" />
            <ellipse cx="118" cy="62" rx="22" ry="18" fill="#4a7c4a" opacity="0.85" />
            <ellipse cx="100" cy="50" rx="26" ry="22" fill="#4a7c4a" opacity="0.9" />
            {/* 中层 */}
            <ellipse cx="86" cy="56" rx="18" ry="15" fill="#6b8f5e" />
            <ellipse cx="114" cy="58" rx="18" ry="15" fill="#6b8f5e" />
            <ellipse cx="100" cy="46" rx="22" ry="18" fill={`url(#${gid}-crown)`} />
            {/* 前层高光 */}
            <ellipse cx="92" cy="50" rx="10" ry="8" fill="#8fb573" />
            <ellipse cx="108" cy="52" rx="10" ry="8" fill="#8fb573" />
            <ellipse cx="100" cy="42" rx="12" ry="9" fill="#a8c9a0" />
            {/* 点缀 */}
            <circle cx="95" cy="40" r="3" fill="#d4e4cf" opacity="0.7" />
            <circle cx="106" cy="48" r="2" fill="#d4e4cf" opacity="0.7" />
          </g>
        </svg>
        {/* 姓名首字母头像 — 悬浮在叶冠上方 */}
        <div
          className={`absolute top-0 left-1/2 -translate-x-1/2 w-11 h-11 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-serif font-bold text-lg shadow-[0_4px_14px_rgba(26,46,26,0.25)] ring-[3px] ring-warm-cream`}
        >
          {initial}
        </div>
      </div>

      {/* 人物基础信息 */}
      <div className="text-center mb-4">
        <h3 className="font-serif text-xl font-bold text-forest-deep leading-tight">{name}</h3>
        {node.city && (
          <p className="text-xs text-text-light tracking-wider mt-1">{node.city}</p>
        )}
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
        {/* 可以提供 */}
        {node.offer && node.offer.trim() && (
          <div>
            <div className="text-[10px] font-semibold tracking-widest text-moss uppercase mb-1">
              可以提供
            </div>
            <p className="text-sm text-text-secondary leading-relaxed line-clamp-2">{node.offer}</p>
          </div>
        )}
        {/* 寻找 */}
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
    </article>
  );
}
