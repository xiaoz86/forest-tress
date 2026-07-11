'use client';

// 「phil-coach 记得的」——节点主人查看/删除自己留住的对话记忆。
// 只在本人的节点页渲染（隐私：管理员也看不到）。

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PHIL_PATHS, PROFILE_PATH } from '@/lib/philCoach';

type Memory = {
  id: string;
  content: string;
  takeaway: string;
  path_id: string;
  created_at: string;
};

function pathLabel(id: string): string {
  if (id === PROFILE_PATH) return '来自你的资料';
  return PHIL_PATHS.find(p => p.id === id)?.label ?? '';
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export default function PhilMemoriesManager() {
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
            phil-coach 记得的
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
            这些是你在对话里亲手选择留住的片段。它们只有你自己能看到，随时可以删除。
          </p>
        </div>
      </div>

      {memories.length === 0 ? (
        <p className="mt-5 text-[13px] leading-relaxed text-text-light">
          还没有留住的对话。下次在
          <Link href="/phil-coach" className="mx-1 text-forest-deep underline underline-offset-2">
            回到自己
          </Link>
          聊到重要处，点一下「留住这一段」。
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
                    {fmtDate(m.created_at)}
                    {pathLabel(m.path_id) ? ` · ${pathLabel(m.path_id)}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => remove(m.id)}
                  disabled={deleting === m.id}
                  type="button"
                  className="shrink-0 text-[12px] text-text-light underline-offset-2 transition-colors hover:text-coral hover:underline disabled:opacity-40"
                >
                  {deleting === m.id ? '删除中…' : '删除'}
                </button>
              </div>
              {m.content && (
                <details className="mt-2">
                  <summary className="cursor-pointer list-none text-[12px] text-text-light hover:text-forest-deep [&::-webkit-details-marker]:hidden">
                    展开这段对话
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
