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

// 用 hash 生成稳定的 seed
function hashSeed(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h;
}

// 伪随机（稳定版）— 基于 seed 和索引
function rand(seed: number, i: number): number {
  const n = Math.sin((seed + i * 9301 + 49297) * 0.0001) * 43758.5453;
  return n - Math.floor(n);
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

  // 花朵密度由内容丰富度决定
  const contentRichness = branches.length;
  const blossomCount = 40 + contentRichness * 8 + (node.topics?.length || 0) * 4;

  // 唯一的 gradient id（避免同页多棵树 id 冲突）
  const gid = `gid-${seed}`;

  // 生成散落的花瓣：在一个大的椭圆区域内随机分布
  // 中心 (100, 60)，区域 rx=70 ry=50
  const blossoms = Array.from({ length: blossomCount }).map((_, i) => {
    const r1 = rand(seed, i * 3);
    const r2 = rand(seed, i * 3 + 1);
    const r3 = rand(seed, i * 3 + 2);
    // 极坐标均匀分布到椭圆区域（sqrt 消除中心聚集）
    const angle = r1 * Math.PI * 2;
    const radius = Math.sqrt(r2);
    const x = 100 + Math.cos(angle) * radius * 68;
    // 上半部密集，下半部稀疏（模拟树冠）
    const yFactor = Math.sin(angle) > 0 ? 1.3 : 0.75;
    const y = 62 + Math.sin(angle) * radius * 42 * yFactor;
    // 花朵大小、颜色随机
    const size = 3 + r3 * 3.5;
    const colorRoll = rand(seed, i * 5);
    const color =
      colorRoll < 0.35
        ? '#f4c8d0' // 浅粉
        : colorRoll < 0.7
          ? '#e8a88e' // coral-soft
          : colorRoll < 0.9
            ? '#d4a0a0' // love-pink
            : '#f8e4d4'; // 米白花
    return { x, y, size, color, i };
  });

  return (
    <article className="group relative bg-warm-cream rounded-3xl p-6 border border-moss/15 shadow-[0_4px_24px_rgba(26,46,26,0.04)] hover:shadow-[0_12px_40px_rgba(26,46,26,0.08)] hover:-translate-y-1 transition-all duration-300 flex flex-col">
      {/* SVG Tree — sakura style */}
      <div className="relative flex justify-center mb-4">
        <svg viewBox="0 0 200 240" width="200" height="240" aria-hidden="true">
          <defs>
            {/* 树干渐变 */}
            <linearGradient id={`${gid}-trunk`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#2a1a0f" />
              <stop offset="45%" stopColor="#4a3220" />
              <stop offset="100%" stopColor="#1a0e07" />
            </linearGradient>
            {/* 地面阴影 */}
            <radialGradient id={`${gid}-ground`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0%" stopColor="#2a1a0f" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#2a1a0f" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* 地面阴影 */}
          <ellipse cx="100" cy="228" rx="55" ry="4" fill={`url(#${gid}-ground)`} />

          {/* 主干 — 弯曲的 S 形曲线，从下往上分叉 */}
          <path
            d="M 95 228
               C 97 210, 100 195, 98 180
               C 95 165, 105 150, 102 130
               C 98 110, 108 95, 105 75
               C 103 60, 112 50, 108 38"
            stroke={`url(#${gid}-trunk)`}
            strokeWidth="9"
            strokeLinecap="round"
            fill="none"
          />
          {/* 第二个主干（略细，对称偏右） */}
          <path
            d="M 102 228
               C 100 205, 98 195, 101 180
               C 105 160, 98 150, 103 130
               C 107 110, 95 95, 100 75
               C 104 58, 92 48, 96 38"
            stroke={`url(#${gid}-trunk)`}
            strokeWidth="6"
            strokeLinecap="round"
            fill="none"
            opacity="0.9"
          />

          {/* 伸出的枝条 — 细分支 */}
          {/* 左下粗枝 */}
          <path
            d="M 100 165 Q 80 155 55 140 Q 42 135 28 130"
            stroke="#2a1a0f"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M 55 140 Q 48 128 35 115"
            stroke="#2a1a0f"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
          {/* 右上粗枝 */}
          <path
            d="M 105 105 Q 130 95 160 82 Q 172 78 182 72"
            stroke="#2a1a0f"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M 160 82 Q 168 70 175 55"
            stroke="#2a1a0f"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
          {/* 左上细枝 */}
          <path
            d="M 103 70 Q 85 60 65 50"
            stroke="#2a1a0f"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
          {/* 右下细枝 */}
          <path
            d="M 100 195 Q 120 188 140 180"
            stroke="#2a1a0f"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
          {/* 顶部细枝 */}
          <path
            d="M 102 38 Q 95 28 85 22"
            stroke="#2a1a0f"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M 102 38 Q 115 30 125 24"
            stroke="#2a1a0f"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />

          {/* 花朵散落 — 先渲染后排深色，再渲染前排亮色 */}
          {blossoms
            .filter((_, i) => i % 3 === 0)
            .map(b => (
              <circle
                key={`b-bg-${b.i}`}
                cx={b.x}
                cy={b.y}
                r={b.size * 1.3}
                fill="#a86b5e"
                opacity="0.3"
              />
            ))}
          {blossoms.map(b => (
            <circle
              key={`b-${b.i}`}
              cx={b.x}
              cy={b.y}
              r={b.size}
              fill={b.color}
              opacity="0.95"
            />
          ))}
          {/* 花蕊亮点 */}
          {blossoms
            .filter((_, i) => i % 4 === 0)
            .map(b => (
              <circle
                key={`b-hl-${b.i}`}
                cx={b.x - 0.5}
                cy={b.y - 0.5}
                r={b.size * 0.35}
                fill="#fff4e6"
                opacity="0.85"
              />
            ))}
        </svg>
        {/* 姓名首字母头像 — 悬浮在左上角，像树上的一颗果实 */}
        <div
          className={`absolute top-2 right-6 w-11 h-11 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-serif font-bold text-lg shadow-[0_4px_14px_rgba(26,46,26,0.25)] ring-[3px] ring-warm-cream`}
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
