'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ShareContent, ShareEntry, ShareMediaKind, ShareStatus } from '@/lib/shares';

type Props = {
  initialContent: ShareContent;
};

const MEDIA_OPTIONS: { value: ShareMediaKind; label: string }[] = [
  { value: 'video', label: '视频' },
  { value: 'image', label: '图片' },
  { value: 'poster', label: '海报' },
];

const STATUS_OPTIONS: { value: ShareStatus; label: string }[] = [
  { value: 'pending', label: '待审核' },
  { value: 'published', label: '已发布' },
  { value: 'rejected', label: '已退回' },
];

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export default function ShareAdminEditor({ initialContent }: Props) {
  const [content, setContent] = useState<ShareContent>(initialContent);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState('');
  const [message, setMessage] = useState('');
  const sortedShares = [...content.shares].sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    return 0;
  });

  const patchContent = (patch: Partial<ShareContent>) => {
    setContent(prev => ({ ...prev, ...patch }));
  };

  const updateShare = (id: string, patch: Partial<ShareEntry>) => {
    setContent(prev => ({
      ...prev,
      shares: prev.shares.map(share => (
        share.id === id ? { ...share, ...patch } : share
      )),
    }));
  };

  const setFeatured = (id: string) => {
    setContent(prev => ({
      ...prev,
      shares: prev.shares.map(share => ({ ...share, featured: share.id === id })),
    }));
  };

  const addShare = () => {
    setContent(prev => ({
      ...prev,
      shares: [
        ...prev.shares,
        {
          id: makeId('share'),
          title: '新的林间分享',
          kicker: '超级个体的分享',
          author: '分享者',
          authorLabel: '作品 / 产品 / 活动 / 体验',
          badgeLabel: '分享者 · 作品 / 产品 / 活动 / 体验',
          question: '这一次分享，从哪个问题开始？',
          summary: '写下一小段真实描述，让别人知道这段分享里发生了什么。',
          note: '可以补一句留下来的感受。',
          tags: ['分享'],
          mediaKind: 'video',
        },
      ],
    }));
  };

  const removeShare = (id: string) => {
    setContent(prev => {
      if (prev.shares.length <= 1) return prev;
      const nextShares = prev.shares.filter(share => share.id !== id);
      if (!nextShares.some(share => share.featured)) {
        nextShares[0] = { ...nextShares[0], featured: true };
      }
      return { ...prev, shares: nextShares };
    });
  };

  const persistContent = async (nextContent: ShareContent) => {
    const res = await fetch('/api/shares', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextContent),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'save-failed');
    return json.content as ShareContent;
  };

  const save = async () => {
    setSaving(true);
    setMessage('');
    try {
      const savedContent = await persistContent(content);
      setContent(savedContent);
      setMessage('已保存。首页和分享页会读取这份内容。');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const uploadFile = async (shareId: string, slot: 'media' | 'poster', file: File | null) => {
    if (!file) return;
    const key = `${shareId}:${slot}`;
    setUploading(key);
    setMessage('');
    try {
      const savedContent = await persistContent(content);
      setContent(savedContent);
      const fd = new FormData();
      fd.append('shareId', shareId);
      fd.append('slot', slot);
      fd.append('file', file);
      const res = await fetch('/api/shares/media', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'upload-failed');
      setContent(json.content);
      setMessage(slot === 'poster' ? '海报已上传。' : '媒体已上传。');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading('');
    }
  };

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-white/10 bg-white/[0.045] p-6 max-md:p-5">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-medium tracking-[0.18em] text-coral-soft uppercase">
              首页分享区
            </div>
            <h2 className="mt-2 text-xl font-normal text-white">林间分享文案</h2>
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
          <Field label="更多按钮">
            <input value={content.moreLabel} onChange={e => patchContent({ moreLabel: e.target.value })} className={inputCls} />
          </Field>
          <Field label="标题" className="col-span-2 max-md:col-span-1">
            <textarea
              value={content.title}
              onChange={e => patchContent({ title: e.target.value })}
              className={`${inputCls} min-h-20 resize-y leading-relaxed`}
            />
          </Field>
          <Field label="说明" className="col-span-2 max-md:col-span-1">
            <textarea
              value={content.intro}
              onChange={e => patchContent({ intro: e.target.value })}
              className={`${inputCls} min-h-28 resize-y leading-relaxed`}
            />
          </Field>
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-white/[0.045] p-6 max-md:p-5">
        <div className="mb-5 text-[11px] font-medium tracking-[0.18em] text-coral-soft uppercase">
          右侧手记
        </div>
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field label="手记小标题">
            <input value={content.noteEyebrow} onChange={e => patchContent({ noteEyebrow: e.target.value })} className={inputCls} />
          </Field>
          <Field label="手记标题">
            <input value={content.noteTitle} onChange={e => patchContent({ noteTitle: e.target.value })} className={inputCls} />
          </Field>
          <Field label="段落（一行一段）" className="col-span-2 max-md:col-span-1">
            <textarea
              value={content.noteParagraphs.join('\n')}
              onChange={e => patchContent({ noteParagraphs: e.target.value.split('\n') })}
              className={`${inputCls} min-h-36 resize-y leading-relaxed`}
            />
          </Field>
          <Field label="底部一句" className="col-span-2 max-md:col-span-1">
            <input value={content.footer} onChange={e => patchContent({ footer: e.target.value })} className={inputCls} />
          </Field>
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-white/[0.045] p-6 max-md:p-5">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-medium tracking-[0.18em] text-coral-soft uppercase">
              分享条目
            </div>
            <h2 className="mt-2 text-xl font-normal text-white">视频、图片、海报</h2>
          </div>
          <button type="button" onClick={addShare} className={ghostBtnCls}>
            添加分享
          </button>
        </div>

        <div className="space-y-5">
          {sortedShares.map(share => (
            <article key={share.id} className="rounded-lg border border-white/10 bg-black/12 p-5">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/32">
                    <span>{share.id}</span>
                    <span className={`rounded-full px-2 py-0.5 ${
                      share.status === 'pending'
                        ? 'bg-coral-soft/15 text-coral-soft'
                        : share.status === 'rejected'
                          ? 'bg-white/10 text-white/40'
                          : 'bg-leaf/15 text-leaf'
                    }`}>
                      {STATUS_OPTIONS.find(option => option.value === share.status)?.label || '已发布'}
                    </span>
                    {share.ownerId && <span>用户上传</span>}
                  </div>
                  <h3 className="mt-1 text-lg font-medium text-white">{share.title}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => removeShare(share.id)}
                  className="text-xs text-white/36 transition-colors hover:text-coral-soft"
                >
                  删除
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                <Field label="标题">
                  <input value={share.title} onChange={e => updateShare(share.id, { title: e.target.value })} className={inputCls} />
                </Field>
                <Field label="卡片顶部标记">
                  <input value={share.kicker} onChange={e => updateShare(share.id, { kicker: e.target.value })} className={inputCls} />
                </Field>
                <Field label="胶囊标记">
                  <input value={share.badgeLabel || `${share.author} · ${share.authorLabel}`} onChange={e => updateShare(share.id, { badgeLabel: e.target.value })} className={inputCls} />
                </Field>
                <Field label="分享者">
                  <input value={share.author} onChange={e => updateShare(share.id, { author: e.target.value })} className={inputCls} />
                </Field>
                <Field label="分享者短标">
                  <input value={share.authorLabel} onChange={e => updateShare(share.id, { authorLabel: e.target.value })} className={inputCls} />
                </Field>
                <Field label="主问题" className="col-span-2 max-md:col-span-1">
                  <input value={share.question} onChange={e => updateShare(share.id, { question: e.target.value })} className={inputCls} />
                </Field>
                <Field label="简述" className="col-span-2 max-md:col-span-1">
                  <textarea
                    value={share.summary}
                    onChange={e => updateShare(share.id, { summary: e.target.value })}
                    className={`${inputCls} min-h-24 resize-y leading-relaxed`}
                  />
                </Field>
                <Field label="补充一句" className="col-span-2 max-md:col-span-1">
                  <textarea
                    value={share.note}
                    onChange={e => updateShare(share.id, { note: e.target.value })}
                    className={`${inputCls} min-h-20 resize-y leading-relaxed`}
                  />
                </Field>
                <Field label="标签（逗号分隔）">
                  <input
                    value={share.tags.join('，')}
                    onChange={e => updateShare(share.id, { tags: e.target.value.split(/[，,]/).map(tag => tag.trim()).filter(Boolean) })}
                    className={inputCls}
                  />
                </Field>
                <Field label="展示格式">
                  <select
                    value={share.mediaKind}
                    onChange={e => updateShare(share.id, { mediaKind: e.target.value as ShareMediaKind })}
                    className={inputCls}
                  >
                    {MEDIA_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="审核状态">
                  <select
                    value={share.status || 'published'}
                    onChange={e => updateShare(share.id, { status: e.target.value as ShareStatus })}
                    className={inputCls}
                  >
                    {STATUS_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="外部链接（可选）" className="col-span-2 max-md:col-span-1">
                  <input value={share.href || ''} onChange={e => updateShare(share.id, { href: e.target.value || undefined })} className={inputCls} />
                </Field>
                <Field label="主媒体（视频 / 图片 / 海报）">
                  <input
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm,image/*"
                    onChange={e => uploadFile(share.id, 'media', e.target.files?.[0] || null)}
                    className={fileInputCls}
                  />
                  {uploading === `${share.id}:media` && (
                    <div className="mt-2 text-xs text-white/40">上传中...</div>
                  )}
                </Field>
                <Field label="视频海报（可选）">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => uploadFile(share.id, 'poster', e.target.files?.[0] || null)}
                    className={fileInputCls}
                  />
                  {uploading === `${share.id}:poster` && (
                    <div className="mt-2 text-xs text-white/40">上传中...</div>
                  )}
                </Field>
                <label className="col-span-2 inline-flex items-center gap-3 text-sm text-white/56 max-md:col-span-1">
                  <input
                    type="checkbox"
                    checked={!!share.featured}
                    onChange={() => setFeatured(share.id)}
                    className="h-4 w-4"
                  />
                  作为首页展示
                </label>
                {share.status === 'pending' && (
                  <div className="col-span-2 flex flex-wrap gap-3 max-md:col-span-1">
                    <button
                      type="button"
                      onClick={() => updateShare(share.id, { status: 'published' })}
                      className={ghostBtnCls}
                    >
                      发布
                    </button>
                    <button
                      type="button"
                      onClick={() => updateShare(share.id, { status: 'rejected' })}
                      className={ghostBtnCls}
                    >
                      退回
                    </button>
                  </div>
                )}
              </div>

              {(share.mediaUrl || share.posterUrl) && (
                <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.035] px-4 py-3 text-xs leading-relaxed text-white/42">
                  {share.mediaUrl && <div>主媒体已上传</div>}
                  {share.posterUrl && <div>海报已上传</div>}
                </div>
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

const fileInputCls =
  'block w-full text-sm text-white/44 file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#111512]';

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
