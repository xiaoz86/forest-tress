'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  id: string;
  currentUrl?: string | null;
  name: string;
  size?: number;
  /** 'owner'（本人上传）| 'admin'（管理员替别人上传） */
  mode?: 'owner' | 'admin';
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

function firstChar(name: string): string {
  return (name || '').trim().charAt(0) || '·';
}

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: '只能上传你自己的形象照',
  'bad-file-type': '请上传 JPG / PNG / WebP / HEIC 图片',
  'file-too-large': '图片过大，请压缩到 5MB 以内',
  'column-missing': '数据库尚未升级，请联系管理员',
  'missing-id': '缺少身份信息',
  'missing-file': '没有选中文件',
  'upload-failed': '上传失败，请稍后再试',
  'db-update-failed': '保存失败，请稍后再试',
};

export default function AvatarUploader({
  id,
  currentUrl,
  name,
  size = 128,
  mode = 'owner',
}: Props) {
  const isAdmin = mode === 'admin';
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl || null);

  const initial = firstChar(name);
  const gradient = hashPick(name || 'x');

  const handleFile = async (file: File) => {
    setUploading(true);
    setError(null);

    // 立即本地预览
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);

    const fd = new FormData();
    fd.set('id', id);
    fd.set('file', file);

    try {
      const res = await fetch('/api/avatar', { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(ERROR_MESSAGES[json.error] || '上传失败，请稍后再试');
        // 失败时回到原始头像
        setPreviewUrl(currentUrl || null);
      } else {
        setPreviewUrl(json.url);
        router.refresh();
      }
    } catch {
      setError('上传失败，请稍后再试');
      setPreviewUrl(currentUrl || null);
    } finally {
      setUploading(false);
      URL.revokeObjectURL(localUrl);
    }
  };

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="group relative rounded-full overflow-hidden ring-1 ring-black/[0.06] shadow-[0_8px_36px_rgba(0,0,0,0.10)] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf"
        style={{ width: `${size}px`, height: `${size}px` }}
        aria-label={
          isAdmin
            ? previewUrl ? `管理员替 ${name} 更换形象照` : `管理员替 ${name} 上传形象照`
            : previewUrl ? '更换形象照' : '上传形象照'
        }
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className={`w-full h-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-serif font-bold`}
            style={{ fontSize: size * 0.42 }}
          >
            {initial}
          </div>
        )}
        {/* Hover/upload overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/45 transition-colors flex items-center justify-center text-white text-[12px] font-medium tracking-wide opacity-0 group-hover:opacity-100">
          {uploading
            ? '上传中…'
            : isAdmin
              ? previewUrl ? '管理员更换' : '管理员上传'
              : previewUrl ? '更换照片' : '上传照片'}
        </div>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
      />

      {!previewUrl && !uploading && (
        <p className="mt-3 text-[12px] text-text-light">
          {isAdmin ? '点击为 TA 上传形象照（管理员）' : '点击上传你的形象照（可选）'}
        </p>
      )}
      {previewUrl && !uploading && isAdmin && (
        <p className="mt-3 text-[11px] text-text-light/80">管理员模式 · 点击头像更换</p>
      )}
      {error && <p className="mt-3 text-[12px] text-coral">{error}</p>}
    </div>
  );
}
