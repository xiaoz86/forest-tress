'use client';

import { dict } from '@/i18n';
import type { Locale } from '@/lib/locale';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  id: string;
  currentUrl?: string | null;
  name: string;
  size?: number;
  /** 'owner'（本人上传）| 'admin'（管理员替别人上传） */
  mode?: 'owner' | 'admin';
  /**
   * 文案在客户端自己取。字典里有函数（adminUploadAria 这些），
   * 函数跨不过 server → client 那道序列化边界，整片切片当 props
   * 传会让页面直接崩。只传 locale。
   */
  locale: Locale;
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

function errorText(code: string, t: ReturnType<typeof dict>['creatorDetail']['avatar']): string {
  const map: Record<string, string> = {
    forbidden: t.error.forbidden,
    'bad-file-type': t.error.badFileType,
    'file-too-large': t.error.fileTooLarge,
    'column-missing': t.error.columnMissing,
    'missing-id': t.error.missingId,
    'missing-file': t.error.missingFile,
    'upload-failed': t.error.uploadFailed,
    'db-update-failed': t.error.saveFailed,
  };
  return map[code] || t.error.uploadFailed;
}

export default function AvatarUploader({
  id,
  currentUrl,
  name,
  size = 128,
  mode = 'owner',
  locale,
}: Props) {
  const t = useMemo(() => dict(locale).creatorDetail.avatar, [locale]);
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
        setError(errorText(json.error, t));
        // 失败时回到原始头像
        setPreviewUrl(currentUrl || null);
      } else {
        setPreviewUrl(json.url);
        router.refresh();
      }
    } catch {
      setError(t.error.uploadFailed);
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
            ? previewUrl ? t.adminChangeAria(name) : t.adminUploadAria(name)
            : previewUrl ? t.changeAria : t.uploadAria
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
            ? t.uploading
            : isAdmin
              ? previewUrl ? t.adminChange : t.adminUpload
              : previewUrl ? t.change : t.upload}
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
          {isAdmin ? t.adminHint : t.hint}
        </p>
      )}
      {previewUrl && !uploading && isAdmin && (
        <p className="mt-3 text-[11px] text-text-light/80">{t.adminNote}</p>
      )}
      {error && <p className="mt-3 text-[12px] text-coral">{error}</p>}
    </div>
  );
}
