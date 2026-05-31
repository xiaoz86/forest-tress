'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { MeditationCategory, MeditationContent, MeditationTrack, TrackMood } from '@/lib/meditations';

type Props = {
  initialContent: MeditationContent;
};

const MOOD_OPTIONS: { value: TrackMood; label: string }[] = [
  { value: 'settle', label: '安顿' },
  { value: 'listen', label: '看见' },
  { value: 'ground', label: '转场' },
];

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export default function MeditationAdminEditor({ initialContent }: Props) {
  const [content, setContent] = useState<MeditationContent>(initialContent);
  const [saving, setSaving] = useState(false);
  const [uploadingTrackId, setUploadingTrackId] = useState('');
  const [message, setMessage] = useState('');

  const categoryOptions = useMemo(() => content.categories, [content.categories]);

  const patchContent = (patch: Partial<MeditationContent>) => {
    setContent(prev => ({ ...prev, ...patch }));
  };

  const updateCategory = (id: string, patch: Partial<MeditationCategory>) => {
    setContent(prev => ({
      ...prev,
      categories: prev.categories.map(category => (
        category.id === id ? { ...category, ...patch } : category
      )),
    }));
  };

  const addCategory = () => {
    const id = makeId('category');
    setContent(prev => ({
      ...prev,
      categories: [...prev.categories, { id, label: '新的分类' }],
    }));
  };

  const removeCategory = (id: string) => {
    setContent(prev => {
      if (prev.categories.length <= 1) return prev;
      const nextCategories = prev.categories.filter(category => category.id !== id);
      const fallback = nextCategories[0].id;
      return {
        ...prev,
        categories: nextCategories,
        tracks: prev.tracks.map(track => (
          track.categoryId === id ? { ...track, categoryId: fallback } : track
        )),
      };
    });
  };

  const updateTrack = (id: string, patch: Partial<MeditationTrack>) => {
    setContent(prev => ({
      ...prev,
      tracks: prev.tracks.map(track => (
        track.id === id ? { ...track, ...patch } : track
      )),
    }));
  };

  const addTrack = () => {
    setContent(prev => ({
      ...prev,
      tracks: [
        ...prev.tracks,
        {
          id: makeId('track'),
          title: '新的冥想',
          intention: '写下一句话，让人知道这段声音会带他们去哪里。',
          duration: '8 分钟',
          stage: prev.categories[0]?.label || '林间呼吸',
          categoryId: prev.categories[0]?.id || 'recommended',
          mood: 'settle',
        },
      ],
    }));
  };

  const removeTrack = (id: string) => {
    setContent(prev => ({
      ...prev,
      tracks: prev.tracks.filter(track => track.id !== id),
    }));
  };

  const persistContent = async (nextContent: MeditationContent) => {
    const res = await fetch('/api/meditations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextContent),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'save-failed');
    return json.content as MeditationContent;
  };

  const save = async () => {
    setSaving(true);
    setMessage('');
    try {
      const savedContent = await persistContent(content);
      setContent(savedContent);
      setMessage('已保存。刷新首页后就能看到更新。');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const uploadAudio = async (trackId: string, file: File | null) => {
    if (!file) return;
    setUploadingTrackId(trackId);
    setMessage('');
    try {
      const savedContent = await persistContent(content);
      setContent(savedContent);
      const fd = new FormData();
      fd.append('trackId', trackId);
      fd.append('file', file);
      const res = await fetch('/api/meditations/audio', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'upload-failed');
      setContent(json.content);
      setMessage('音频已上传。');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploadingTrackId('');
    }
  };

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-white/10 bg-white/[0.045] p-6 max-md:p-5">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-medium tracking-[0.18em] text-coral-soft uppercase">
              首页文案
            </div>
            <h2 className="mt-2 text-xl font-semibold text-white">林间呼吸区域</h2>
          </div>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-[#111512] transition-opacity disabled:opacity-50"
          >
            {saving ? '保存中' : '保存'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field label="小标题">
            <input value={content.eyebrow} onChange={e => patchContent({ eyebrow: e.target.value })} className={inputCls} />
          </Field>
          <Field label="底部短语">
            <input value={content.note} onChange={e => patchContent({ note: e.target.value })} className={inputCls} />
          </Field>
          <Field label="主题" className="col-span-2 max-md:col-span-1">
            <textarea
              value={content.title}
              onChange={e => patchContent({ title: e.target.value })}
              className={`${inputCls} min-h-20 resize-y leading-relaxed`}
            />
          </Field>
          <Field label="说明" className="col-span-2 max-md:col-span-1">
            <textarea
              value={content.description}
              onChange={e => patchContent({ description: e.target.value })}
              className={`${inputCls} min-h-28 resize-y leading-relaxed`}
            />
          </Field>
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-white/[0.045] p-6 max-md:p-5">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-medium tracking-[0.18em] text-coral-soft uppercase">
              胶囊分类
            </div>
            <h2 className="mt-2 text-xl font-semibold text-white">首页菜单与冥想页分类</h2>
          </div>
          <button type="button" onClick={addCategory} className={ghostBtnCls}>
            添加分类
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          {content.categories.map(category => (
            <div key={category.id} className="rounded-lg border border-white/10 bg-black/10 p-4">
              <div className="mb-3 text-[11px] text-white/32">{category.id}</div>
              <input
                value={category.label}
                onChange={e => updateCategory(category.id, { label: e.target.value })}
                className={inputCls}
              />
              <button
                type="button"
                onClick={() => removeCategory(category.id)}
                className="mt-3 text-xs text-white/36 transition-colors hover:text-coral-soft"
              >
                删除
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-white/[0.045] p-6 max-md:p-5">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-medium tracking-[0.18em] text-coral-soft uppercase">
              音频内容
            </div>
            <h2 className="mt-2 text-xl font-semibold text-white">分类页里的具体冥想</h2>
          </div>
          <button type="button" onClick={addTrack} className={ghostBtnCls}>
            添加音频
          </button>
        </div>

        <div className="space-y-5">
          {content.tracks.map(track => (
            <article key={track.id} className="rounded-lg border border-white/10 bg-black/12 p-5">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] text-white/32">{track.id}</div>
                  <h3 className="mt-1 text-lg font-semibold text-white">{track.title}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => removeTrack(track.id)}
                  className="text-xs text-white/36 transition-colors hover:text-coral-soft"
                >
                  删除
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                <Field label="标题">
                  <input value={track.title} onChange={e => updateTrack(track.id, { title: e.target.value })} className={inputCls} />
                </Field>
                <Field label="时长">
                  <input value={track.duration} onChange={e => updateTrack(track.id, { duration: e.target.value })} className={inputCls} />
                </Field>
                <Field label="分类">
                  <select
                    value={track.categoryId}
                    onChange={e => updateTrack(track.id, { categoryId: e.target.value })}
                    className={inputCls}
                  >
                    {categoryOptions.map(category => (
                      <option key={category.id} value={category.id}>{category.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="封面气质">
                  <select
                    value={track.mood}
                    onChange={e => updateTrack(track.id, { mood: e.target.value as TrackMood })}
                    className={inputCls}
                  >
                    {MOOD_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="阶段">
                  <input value={track.stage} onChange={e => updateTrack(track.id, { stage: e.target.value })} className={inputCls} />
                </Field>
                <Field label="音频文件">
                  <input
                    type="file"
                    accept="audio/*,video/mp4"
                    onChange={e => uploadAudio(track.id, e.target.files?.[0] || null)}
                    className="block w-full text-sm text-white/44 file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#111512]"
                  />
                  {uploadingTrackId === track.id && (
                    <div className="mt-2 text-xs text-white/40">上传中...</div>
                  )}
                </Field>
                <Field label="说明" className="col-span-2 max-md:col-span-1">
                  <textarea
                    value={track.intention}
                    onChange={e => updateTrack(track.id, { intention: e.target.value })}
                    className={`${inputCls} min-h-24 resize-y leading-relaxed`}
                  />
                </Field>
              </div>

              {track.audioUrl && (
                <audio controls preload="none" src={track.audioUrl} className="mt-4 w-full" />
              )}
            </article>
          ))}
        </div>
      </section>

      {message && (
        <div className="rounded-lg border border-white/10 bg-white/[0.055] px-5 py-4 text-sm text-white/62">
          {message}
        </div>
      )}
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-white/10 bg-black/18 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-white/24 focus:border-coral-soft/45';

const ghostBtnCls =
  'rounded-full border border-white/14 bg-white/[0.055] px-4 py-2 text-sm font-medium text-white/62 transition-colors hover:bg-white/10 hover:text-white';

function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-[12px] font-medium text-white/42">{label}</span>
      {children}
    </label>
  );
}
