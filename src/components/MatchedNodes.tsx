'use client';

import Link from 'next/link';
import type { MatchedNode } from '@/lib/match';

type Props = { matches: MatchedNode[] };

const gradients = [
  'from-coral-soft to-warmth',
  'from-sky to-[#a5cce0]',
  'from-leaf to-sage',
  'from-[#b088c9] to-[#d4b4e8]',
  'from-gold to-gold-light',
];

function hashPick(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return gradients[h % gradients.length];
}

const matchTypeStyle: Record<MatchedNode['matchType'], string> = {
  同频: 'bg-leaf/15 text-forest-mid border-leaf/30',
  互补: 'bg-warmth/20 text-coral border-coral-soft/40',
  同城: 'bg-sky/15 text-[#4a7c9a] border-sky/30',
};

export default function MatchedNodes({ matches }: Props) {
  if (matches.length === 0) {
    return (
      <div className="mt-8 text-center py-10 px-6 bg-gradient-to-br from-love-pink/8 to-warmth/8 rounded-2xl border border-coral-soft/20">
        <div className="text-4xl mb-3">🌱</div>
        <h3 className="font-serif text-xl font-bold text-forest-deep mb-2">
          你是这片森林的第一棵树
        </h3>
        <p className="text-sm text-text-secondary leading-relaxed max-w-md mx-auto">
          森林的每一次起始都是如此安静。
          <br />
          期待与后来的创造者在这里相遇。
        </p>
        <Link
          href="/creators"
          className="inline-block mt-5 px-6 py-2.5 bg-gradient-to-br from-coral-soft to-warmth text-forest-deep text-sm font-semibold rounded-full no-underline hover:-translate-y-0.5 transition-transform"
        >
          去看看这片森林
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-10">
      <div className="text-center mb-6">
        <h3 className="font-serif text-2xl font-bold text-forest-deep mb-2">
          为你找到 {matches.length} 位可能同频的人
        </h3>
        <p className="text-sm text-text-light">
          基于你的节点信息，从现有森林里找到了这些可能链接的树
        </p>
      </div>

      <div className="space-y-4">
        {matches.map((m, i) => {
          const initial = (m.name || '·').trim().charAt(0) || '·';
          const gradient = hashPick(m.name || String(i));
          return (
            <div
              key={m.id || i}
              className="flex items-start gap-4 p-5 bg-warm-cream rounded-2xl border border-moss/15 hover:border-moss/30 transition-colors"
            >
              <div
                className={`flex-shrink-0 w-14 h-14 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-serif font-bold text-xl shadow-[0_3px_12px_rgba(26,46,26,0.15)]`}
              >
                {initial}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center flex-wrap gap-2 mb-1.5">
                  <h4 className="font-serif text-lg font-bold text-forest-deep">{m.name}</h4>
                  {m.city && <span className="text-xs text-text-light">· {m.city}</span>}
                  <span
                    className={`ml-auto inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${matchTypeStyle[m.matchType]}`}
                  >
                    {m.matchType}
                  </span>
                </div>
                {m.doing && (
                  <p className="text-sm text-text-secondary leading-relaxed line-clamp-2 mb-2">
                    {m.doing}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {m.reasons.map((r, idx) => (
                    <span
                      key={idx}
                      className="inline-block px-2.5 py-1 bg-love-pink/8 border border-love-pink/20 rounded-full text-[11px] text-coral"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-center mt-8">
        <Link
          href="/creators"
          className="inline-flex items-center gap-2 px-7 py-3 bg-gradient-to-br from-coral-soft to-warmth text-forest-deep font-semibold rounded-full no-underline shadow-[0_4px_20px_rgba(212,160,160,0.25)] hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(212,160,160,0.35)] transition-all"
        >
          去看看整片森林
        </Link>
      </div>
    </div>
  );
}
