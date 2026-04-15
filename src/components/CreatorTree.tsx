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

export default function CreatorTree({ node }: Props) {
  const name = node.name || '无名之树';
  const initial = firstChar(name);
  const gradient = hashPick(name, gradients);

  // 树枝数量 = 核心内容字段数（doing / product / experience 非空）
  const branches = [
    { label: '在做', text: node.doing },
    { label: '作品', text: node.product },
    { label: '擅长', text: node.experience },
  ].filter(b => b.text && b.text.trim());

  // 树根数量 = topics 数（1-5）
  const rootCount = Math.min(Math.max((node.topics || []).length, 1), 5);
  const branchCount = Math.max(branches.length, 2);

  // 生成树枝坐标：左右对称分布，高度从 trunk 上半部
  const branchPoints = Array.from({ length: branchCount }).map((_, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const t = (i + 1) / (branchCount + 1); // 0..1
    const y = 110 - t * 70; // from 110 (lower) up to 40
    const len = 36 + (i % 2) * 10;
    return {
      x1: 80,
      y1: y,
      x2: 80 + side * len,
      y2: y - 14,
    };
  });

  // 生成树根坐标
  const rootPoints = Array.from({ length: rootCount }).map((_, i) => {
    const spread = (i - (rootCount - 1) / 2) * 14;
    return {
      x1: 80,
      y1: 130,
      x2: 80 + spread,
      y2: 148,
    };
  });

  return (
    <article className="group relative bg-warm-cream rounded-3xl p-6 border border-moss/15 shadow-[0_4px_24px_rgba(26,46,26,0.04)] hover:shadow-[0_12px_40px_rgba(26,46,26,0.08)] hover:-translate-y-1 transition-all duration-300 flex flex-col">
      {/* SVG Tree */}
      <div className="relative flex justify-center mb-4">
        <svg viewBox="0 0 160 160" width="160" height="160" aria-hidden="true">
          {/* 树根 */}
          {rootPoints.map((p, i) => (
            <path
              key={`root-${i}`}
              d={`M ${p.x1} ${p.y1} Q ${(p.x1 + p.x2) / 2} ${p.y1 + 6} ${p.x2} ${p.y2}`}
              stroke="#8b6f47"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
              opacity="0.5"
            />
          ))}
          {/* 树干 */}
          <rect x="76" y="40" width="8" height="94" rx="4" fill="#5c4033" />
          {/* 树枝 */}
          {branchPoints.map((p, i) => (
            <g key={`branch-${i}`}>
              <line
                x1={p.x1}
                y1={p.y1}
                x2={p.x2}
                y2={p.y2}
                stroke="#4a7c4a"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <circle cx={p.x2} cy={p.y2} r="10" fill="#8fb573" opacity="0.85" />
              <circle cx={p.x2} cy={p.y2} r="6" fill="#a8c9a0" />
            </g>
          ))}
          {/* 顶部叶冠 */}
          <circle cx="80" cy="38" r="16" fill="#6b8f5e" opacity="0.75" />
          <circle cx="80" cy="34" r="10" fill="#8fb573" />
        </svg>
        {/* 姓名首字母头像（覆盖在树冠上） */}
        <div
          className={`absolute top-3 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-serif font-bold text-lg shadow-[0_4px_12px_rgba(26,46,26,0.2)] ring-2 ring-warm-cream`}
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
