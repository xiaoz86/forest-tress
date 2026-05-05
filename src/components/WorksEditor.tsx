'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Work } from '@/lib/supabase';

type Props = {
  nodeId: string;
  works: Work[];
  mode: 'owner' | 'admin';
};

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: '只有本人或管理员可以编辑作品',
  'missing-title': '请填写作品标题',
  'bad-url': '链接需以 http:// 或 https:// 开头',
  'bad-file-type': '请上传 JPG / PNG / WebP / HEIC 图片',
  'file-too-large': '图片过大，请压缩到 5MB 以内',
  'too-many-works': '作品数量已达上限',
  'column-missing': '数据库尚未升级，请联系管理员',
  'upload-failed': '上传失败，请稍后再试',
  'db-update-failed': '保存失败，请稍后再试',
  'node-not-found': '找不到这棵树',
  'work-not-found': '这条作品不存在或已被删除',
  'nothing-to-update': '没有可更新的内容',
};

export default function WorksEditor({ nodeId, works, mode }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const rowFileRef = useRef<HTMLInputElement>(null);
  const rowFileTargetId = useRef<string | null>(null);

  // 释放 ObjectURL，避免内存泄漏
  useEffect(() => {
    return () => {
      if (filePreview) URL.revokeObjectURL(filePreview);
    };
  }, [filePreview]);

  const reset = () => {
    setEditingId(null);
    setTitle('');
    setDesc('');
    setUrl('');
    setFile(null);
    if (filePreview) URL.revokeObjectURL(filePreview);
    setFilePreview(null);
    setError(null);
  };

  const openCreate = () => {
    reset();
    setOpen(true);
  };

  const openEdit = (w: Work) => {
    reset();
    setEditingId(w.id);
    setTitle(w.title);
    setDesc(w.desc || '');
    setUrl(w.url || '');
    setOpen(true);
  };

  const submit = async () => {
    if (!title.trim()) {
      setError(ERROR_MESSAGES['missing-title']);
      return;
    }
    setSubmitting(true);
    setError(null);
    const fd = new FormData();
    if (file) fd.set('file', file);

    try {
      let res: Response;
      if (editingId) {
        // 编辑：只发送可能变化的文本字段；图片仅当用户选了新文件时才更新
        fd.set('title', title.trim());
        fd.set('desc', desc.trim());
        fd.set('url', url.trim());
        res = await fetch(
          `/api/works?nodeId=${encodeURIComponent(nodeId)}&workId=${encodeURIComponent(editingId)}`,
          { method: 'PATCH', body: fd },
        );
      } else {
        fd.set('nodeId', nodeId);
        fd.set('title', title.trim());
        if (desc.trim()) fd.set('desc', desc.trim());
        if (url.trim()) fd.set('url', url.trim());
        res = await fetch('/api/works', { method: 'POST', body: fd });
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(ERROR_MESSAGES[json.error] || '保存失败，请稍后再试');
      } else {
        reset();
        setOpen(false);
        router.refresh();
      }
    } catch {
      setError('保存失败，请稍后再试');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (workId: string) => {
    if (!confirm('删除这条作品？此操作不可撤销。')) return;
    setBusyId(workId);
    try {
      const res = await fetch(
        `/api/works?nodeId=${encodeURIComponent(nodeId)}&workId=${encodeURIComponent(workId)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(ERROR_MESSAGES[json.error] || '删除失败');
      } else {
        router.refresh();
      }
    } catch {
      alert('删除失败');
    } finally {
      setBusyId(null);
    }
  };

  const replaceCover = async (workId: string, f: File) => {
    setBusyId(workId);
    try {
      const fd = new FormData();
      fd.set('file', f);
      const res = await fetch(
        `/api/works?nodeId=${encodeURIComponent(nodeId)}&workId=${encodeURIComponent(workId)}`,
        { method: 'PATCH', body: fd },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(ERROR_MESSAGES[json.error] || '更换封面失败');
      } else {
        router.refresh();
      }
    } catch {
      alert('更换封面失败');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-5">
      {/* 操作栏 */}
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-[12px] text-text-light">
          {mode === 'admin' ? '管理员模式 · 你正在编辑 TA 的作品' : '只有你能看到这些编辑按钮'}
        </p>
        {!open && (
          <button
            type="button"
            onClick={openCreate}
            className="text-[13px] font-medium px-4 py-2 rounded-full bg-forest-deep text-white hover:bg-forest-mid transition-colors"
          >
            + 添加作品
          </button>
        )}
      </div>

      {/* 表单（创建或编辑） */}
      {open && (
        <div className="mt-4 rounded-2xl border border-black/[0.08] bg-white p-5 max-md:p-4 shadow-[0_2px_18px_rgba(0,0,0,0.04)]">
          <div className="text-[12px] text-text-light mb-3">
            {editingId ? '编辑作品' : '新建作品'}
          </div>
          <div className="grid gap-3">
            <Field label="标题">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例：1on1 教练服务 / 播客《随机漫步的进化》"
                maxLength={80}
                className="w-full rounded-md border border-black/[0.1] bg-[#fafaf7] px-3 py-2 text-[14px] focus:outline-none focus:border-forest-mid"
              />
            </Field>

            <Field label="描述（可选，1-2 句话）">
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="一句话告诉访客这是什么"
                maxLength={240}
                rows={2}
                className="w-full rounded-md border border-black/[0.1] bg-[#fafaf7] px-3 py-2 text-[14px] resize-y focus:outline-none focus:border-forest-mid"
              />
            </Field>

            <Field label="跳转链接（可选）">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://mp.weixin.qq.com/s/..."
                className="w-full rounded-md border border-black/[0.1] bg-[#fafaf7] px-3 py-2 text-[14px] focus:outline-none focus:border-forest-mid"
              />
            </Field>

            <Field label={editingId ? '封面图（可选，留空则保留原图）' : '封面图（可选，5MB 内）'}>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="text-[13px] px-3 py-2 rounded-md border border-black/[0.1] bg-white hover:bg-[#fafaf7]"
                >
                  {file ? '更换图片' : '选择图片'}
                </button>
                {filePreview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={filePreview}
                    alt="预览"
                    className="w-12 h-12 rounded object-cover ring-1 ring-black/[0.08]"
                  />
                )}
                {file && (
                  <span className="text-[12px] text-text-light truncate max-w-[200px]">
                    {file.name}
                  </span>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setFile(f);
                  if (filePreview) URL.revokeObjectURL(filePreview);
                  setFilePreview(f ? URL.createObjectURL(f) : null);
                  e.target.value = '';
                }}
              />
            </Field>

            {error && <p className="text-[12px] text-coral">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  reset();
                  setOpen(false);
                }}
                disabled={submitting}
                className="text-[13px] px-4 py-2 rounded-full text-text-light hover:text-forest-deep"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="text-[13px] font-medium px-5 py-2 rounded-full bg-forest-deep text-white hover:bg-forest-mid disabled:opacity-50 transition-colors"
              >
                {submitting ? '保存中…' : editingId ? '保存更改' : '保存作品'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 已发布作品 — 行式编辑器 */}
      {works.length > 0 && (
        <div className="mt-5 px-1">
          <div className="text-[11px] text-text-light mb-2.5 tracking-wide">
            已发布 {works.length} 条
          </div>
          <ul className="divide-y divide-black/[0.05] border-y border-black/[0.05]">
            {works.map((w) => {
              const busy = busyId === w.id;
              return (
                <li key={w.id} className="flex items-center gap-3 py-3">
                  {/* 缩略图 */}
                  <div className="shrink-0 w-12 h-12 rounded-md overflow-hidden ring-1 ring-black/[0.06] bg-[#fafaf7]">
                    {w.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={w.image_url}
                        alt={w.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-text-light/70">
                        无图
                      </div>
                    )}
                  </div>

                  {/* 标题 + 链接预览 */}
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] text-forest-deep font-medium truncate">
                      {w.title}
                    </div>
                    <div className="text-[11.5px] text-text-light truncate">
                      {w.url || (w.desc ? w.desc : '无链接 · 无描述')}
                    </div>
                  </div>

                  {/* 操作 */}
                  <div className="shrink-0 flex items-center gap-1">
                    <RowAction
                      onClick={() => {
                        rowFileTargetId.current = w.id;
                        rowFileRef.current?.click();
                      }}
                      disabled={busy}
                      label="更换封面"
                    >
                      📷
                    </RowAction>
                    <RowAction
                      onClick={() => openEdit(w)}
                      disabled={busy}
                      label="编辑文字"
                    >
                      ✎
                    </RowAction>
                    <RowAction
                      onClick={() => remove(w.id)}
                      disabled={busy}
                      label="删除"
                      danger
                    >
                      {busy ? '…' : '×'}
                    </RowAction>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* 隐藏的封面替换 input — 复用一个 ref，根据 rowFileTargetId 决定目标 */}
          <input
            ref={rowFileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              const target = rowFileTargetId.current;
              e.target.value = '';
              rowFileTargetId.current = null;
              if (f && target) replaceCover(target, f);
            }}
          />
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[11px] font-semibold tracking-[0.14em] uppercase text-text-light mb-1.5">
        {label}
      </div>
      {children}
    </label>
  );
}

function RowAction({
  onClick,
  disabled,
  label,
  children,
  danger,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`w-7 h-7 inline-flex items-center justify-center rounded-md text-[13px] text-text-light hover:bg-[#f3f1ea] disabled:opacity-40 ${
        danger ? 'hover:text-coral hover:bg-coral/10' : 'hover:text-forest-deep'
      }`}
    >
      {children}
    </button>
  );
}
