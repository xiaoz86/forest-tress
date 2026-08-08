'use client';

// 「phil-coach 记得的」——节点主人查看/删除自己留住的对话记忆。
// 只在本人的节点页渲染（隐私：管理员也看不到）。

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { dict } from '@/i18n';
import type { Locale } from '@/lib/locale';
import { PROFILE_PATH } from '@/lib/philCoach';

type Memory = {
  id: string;
  content: string;
  takeaway: string;
  path_id: string;
  created_at: string;
};

type Copy = ReturnType<typeof dict>['philCoach'];

/** 小径名和日期都随语言变，所以从模块级函数挪进组件里现取 */
function pathLabel(id: string, t: Copy): string {
  if (id === PROFILE_PATH) return t.memories.fromProfile;
  return t.experience.paths[id as keyof Copy['experience']['paths']]?.label ?? '';
}

function fmtDate(iso: string, t: Copy): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return t.memories.date(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/**
 * 文案在客户端自己取。字典里有函数（date 这些），函数跨不过 server → client
 * 那道序列化边界，整片切片当 props 传会让页面直接崩。只传 locale。
 */
export default function PhilMemoriesManager({ locale }: { locale: Locale }) {
  const d = useMemo(() => dict(locale).philCoach, [locale]);
  const t = d.memories;
  const [memories, setMemories] = useState<Memory[] | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/phil-coach/memory')
      .then(r => (r.ok ? r.json() : null))
      .then(json => setMemories(json?.memories ?? []))
      .catch(() => setMemories([]));
  }, []);

  async function remove(id: string) {
    if (deleting) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/phil-coach/memory?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) setMemories(prev => (prev ? prev.filter(m => m.id !== id) : prev));
    } finally {
      setDeleting(null);
    }
  }

  if (memories === null) return null; // 加载中不占位

  return (
    <section className="rounded-2xl border border-black/[0.07] bg-[#fafaf7] p-6 max-md:p-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.18em] text-moss uppercase">
            {t.title}
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
            {t.lede}
          </p>
        </div>
      </div>

      {memories.length === 0 ? (
        <p className="mt-5 text-[13px] leading-relaxed text-text-light">
          {t.empty.before}
          <Link href="/phil-coach" className="mx-1 text-forest-deep underline underline-offset-2">
            {t.empty.link}
          </Link>
          {t.empty.after}
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {memories.map(m => (
            <li
              key={m.id}
              className="rounded-xl border border-black/[0.06] bg-white px-4 py-3.5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[14px] leading-relaxed text-forest-deep">
                    {m.takeaway || m.content.slice(0, 60)}
                  </p>
                  <p className="mt-1.5 text-[11px] text-text-light">
                    {fmtDate(m.created_at, d)}
                    {pathLabel(m.path_id, d) ? ` · ${pathLabel(m.path_id, d)}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => remove(m.id)}
                  disabled={deleting === m.id}
                  type="button"
                  className="shrink-0 text-[12px] text-text-light underline-offset-2 transition-colors hover:text-coral hover:underline disabled:opacity-40"
                >
                  {deleting === m.id ? t.removing : t.remove}
                </button>
              </div>
              {m.content && (
                <details className="mt-2">
                  <summary className="cursor-pointer list-none text-[12px] text-text-light hover:text-forest-deep [&::-webkit-details-marker]:hidden">
                    {t.expand}
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-[#f4f4ef] p-3 text-[12px] leading-[1.9] text-text-secondary">
                    {m.content}
                  </pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
