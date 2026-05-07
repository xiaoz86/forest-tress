'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AIRecommendation } from '@/lib/supabase';

type Props = {
  nodeId: string;
  initial: AIRecommendation[];
  generatedAt?: string | null;
  /** 当前可见者是节点本人还是管理员 — 文案会做区分 */
  mode: 'owner' | 'admin';
};

const matchTypeStyle: Record<AIRecommendation['matchType'], string> = {
  同频: 'bg-leaf/15 text-forest-mid border-leaf/30',
  互补: 'bg-warmth/20 text-coral border-coral-soft/40',
  同城: 'bg-sky/15 text-[#4a7c9a] border-sky/30',
};

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

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
}

export default function AIRecommendations({ nodeId, initial, generatedAt, mode }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<AIRecommendation[]>(initial);
  const [stamp, setStamp] = useState<string | null | undefined>(generatedAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const regenerate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          json?.error === 'forbidden'
            ? '没有权限重新生成'
            : json?.error === 'column-missing'
              ? '数据库尚未升级，请联系管理员'
              : '生成失败，请稍后再试',
        );
      } else {
        setItems(Array.isArray(json.recommendations) ? json.recommendations : []);
        setStamp(typeof json.generatedAt === 'string' ? json.generatedAt : null);
        // 让服务端最新数据回流（关系网等）
        router.refresh();
      }
    } catch {
      setError('生成失败，请稍后再试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.18em] uppercase text-coral mb-1">
            AI 为你推荐 · 仅你{mode === 'admin' ? '（管理员）' : ''}可见
          </div>
          {stamp && (
            <div className="text-[11px] text-text-light">
              生成于 {formatTime(stamp)}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={regenerate}
          disabled={busy}
          className="text-[12.5px] font-medium px-3.5 py-1.5 rounded-full border border-black/[0.08] bg-white hover:bg-[#fafaf7] disabled:opacity-50 transition-colors"
        >
          {busy ? '生成中…' : items.length > 0 ? '重新生成' : '让 AI 现在生成'}
        </button>
      </div>

      {error && (
        <div className="mb-3 text-[12px] text-coral">{error}</div>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-mist bg-warm-cream/50 p-5 text-[13px] leading-relaxed text-text-secondary">
          还没有 AI 推荐。点上方「让 AI 现在生成」按钮，根据你最新的节点信息生成 1-3 位最值得连接的成员。
          <br />
          每次更新完个人资料后都可以重新生成一次。
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((m, i) => {
            const initialChar = (m.name || '·').trim().charAt(0) || '·';
            const grad = hashPick(m.name || String(i));
            return (
              <li
                key={m.id || i}
                className="flex items-start gap-3 p-4 bg-white rounded-2xl border border-black/[0.06] shadow-[0_1px_8px_rgba(0,0,0,0.03)]"
              >
                <div
                  className={`flex-shrink-0 w-12 h-12 rounded-full overflow-hidden bg-gradient-to-br ${grad} flex items-center justify-center text-white font-serif font-bold text-lg`}
                >
                  {m.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.avatar_url} alt={m.name} className="w-full h-full object-cover" />
                  ) : (
                    initialChar
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-2 mb-1">
                    <Link
                      href={m.id ? `/creators/${m.id}` : '#'}
                      className="font-serif text-[16px] font-semibold text-forest-deep hover:underline underline-offset-2 no-underline"
                    >
                      {m.name}
                    </Link>
                    {m.city && <span className="text-[11.5px] text-text-light">· {m.city}</span>}
                    <span
                      className={`ml-auto inline-block px-2 py-0.5 rounded-full text-[10.5px] font-semibold border ${matchTypeStyle[m.matchType]}`}
                    >
                      {m.matchType}
                    </span>
                  </div>
                  {m.doing && (
                    <p className="text-[13px] text-text-secondary leading-relaxed line-clamp-2 mb-2">
                      {m.doing}
                    </p>
                  )}
                  {m.aiSummary && (
                    <div className="mb-1.5 p-2.5 rounded-lg bg-leaf/8 border border-leaf/20">
                      <div className="text-[10px] font-semibold tracking-widest text-forest-mid uppercase mb-0.5">
                        为何匹配
                      </div>
                      <p className="text-[12.5px] text-text-secondary leading-relaxed">
                        {m.aiSummary}
                      </p>
                    </div>
                  )}
                  {m.aiCoCreate && (
                    <div className="mb-1.5 p-2.5 rounded-lg bg-warmth/15 border border-coral-soft/30">
                      <div className="text-[10px] font-semibold tracking-widest text-coral uppercase mb-0.5">
                        可能共创
                      </div>
                      <p className="text-[12.5px] text-text-secondary leading-relaxed">
                        {m.aiCoCreate}
                      </p>
                    </div>
                  )}
                  {m.reasons && m.reasons.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {m.reasons.map((r, idx) => (
                        <span
                          key={idx}
                          className="inline-block px-2 py-0.5 bg-love-pink/8 border border-love-pink/20 rounded-full text-[10.5px] text-coral"
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
