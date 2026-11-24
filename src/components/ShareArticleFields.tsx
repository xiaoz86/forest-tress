'use client';

import dynamic from 'next/dynamic';
import { useId, useRef, useState } from 'react';
import type { dict } from '@/i18n';
import { ARTICLE_BODY_MAX_LENGTH, type ShareArticleTheme } from '@/lib/shareArticle';
import { ARTICLE_IMAGE_ACCEPT, ARTICLE_VIDEO_ACCEPT } from '@/lib/shareArticleMedia';
import { uploadArticleMedia } from '@/lib/uploadArticleMedia';

const ArticleBody = dynamic(() => import('@/components/ShareArticleBody'));
type Copy = ReturnType<typeof dict>['shares']['submit']['article'];

type Props = {
  copy: Copy;
  title: string;
  theme: ShareArticleTheme;
  onTheme: (theme: ShareArticleTheme) => void;
  source: string;
  onChange: (source: string) => void;
  preview: boolean;
  onPreview: (active: boolean) => void;
  uploading: boolean;
  onUploading: (active: boolean) => void;
  submitting: boolean;
};

export default function ShareArticleFields({ copy, title, theme, onTheme, source, onChange, preview, onPreview, uploading, onUploading, submitting }: Props) {
  const id = useId();
  const editor = useRef<HTMLTextAreaElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState('');
  const overLimit = source.length > ARTICLE_BODY_MAX_LENGTH;
  const count = source.length.toLocaleString('en-US');
  const limit = ARTICLE_BODY_MAX_LENGTH.toLocaleString('en-US');

  async function insertMedia(file: File | undefined, kind: 'image' | 'video') {
    if (!file || uploading || submitting) return;
    setUploadError('');
    if (!file.type.startsWith(kind + '/')) {
      setUploadError(copy.formats);
      return;
    }
    onUploading(true);
    try {
      const url = await uploadArticleMedia(file);
      const field = editor.current;
      if (!field) return;
      // Read the live draft and caret so typing during a transfer is preserved.
      const before = field.value.slice(0, field.selectionEnd);
      const after = field.value.slice(field.selectionEnd);
      const label = file.name.replace(/\.[^.]+$/, '').replace(/[\[\]\\\r\n<>*_~`&!]/g, ' ').trim()
        || (kind === 'image' ? copy.image : copy.video);
      const media = `${kind === 'image' ? '!' : ''}[${label}](${url})`;
      const prefix = before && before.replace(/\n{0,2}$/, '\n\n');
      const suffix = after.replace(/^\n{0,2}/, '\n\n');
      onChange(prefix + media + suffix);
      requestAnimationFrame(() => {
        field.focus({ preventScroll: true });
        const next = prefix.length + media.length + 2;
        field.setSelectionRange(next, next);
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : '';
      setUploadError(reason === 'bad-file-type' || reason === 'file-too-large' || reason === 'empty-file'
        ? copy.formats : reason === 'login-required' ? copy.loginRequired : copy.uploadFailed);
    } finally {
      onUploading(false);
    }
  }

  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <label htmlFor={id} className="text-sm font-medium text-forest-deep">{copy.body}</label>
          <label className="inline-flex items-center gap-2 text-sm text-ink-soft">
            {copy.theme}
            <select name="articleTheme" value={theme} disabled={submitting}
              onChange={event => onTheme(event.target.value === 'forest' ? 'forest' : 'default')}
              className="min-h-9 rounded-lg border border-forest-deep/15 bg-paper-soft px-2 text-forest-deep focus-visible:outline-forest">
              <option value="default">{copy.themeDefault}</option>
              <option value="forest">{copy.themeForest}</option>
            </select>
          </label>
        </div>
        <div role="group" aria-label={copy.view} className="flex gap-1 rounded-full border border-forest-deep/10 bg-paper-soft p-1">
          {([false, true] as const).map(value => (
            <button key={String(value)} type="button" aria-pressed={preview === value} disabled={uploading || submitting}
              onClick={() => onPreview(value)}
              className={`rounded-full px-4 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest ${preview === value ? 'bg-forest text-white' : 'text-ink-soft hover:text-forest'}`}>
              {value ? copy.preview : copy.write}
            </button>
          ))}
        </div>
      </div>
      {!preview && (
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-forest">
          {(['image', 'video'] as const).map(kind => {
            const image = kind === 'image';
            const input = image ? imageInput : videoInput;
            const label = image ? copy.insertImage : copy.insertVideo;
            return (
              <span key={kind}>
                <button type="button" className="min-h-9 font-medium hover:underline disabled:opacity-50"
                  disabled={uploading || submitting} onClick={() => input.current?.click()}>{label}</button>
                <input hidden type="file" aria-label={label} ref={input} accept={image ? ARTICLE_IMAGE_ACCEPT : ARTICLE_VIDEO_ACCEPT}
                  onChange={event => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = '';
                    void insertMedia(file, kind);
                  }} />
              </span>
            );
          })}
          <span role="status" className="text-xs text-ink-soft">{uploading ? copy.uploading : uploadError}</span>
        </div>
      )}
      <textarea ref={editor} id={id} name="articleBody" value={source} readOnly={submitting} onChange={event => onChange(event.target.value)}
        hidden={preview} aria-invalid={overLimit || undefined} aria-describedby={`${id}-count`}
        placeholder={copy.placeholder}
        className="min-h-80 w-full resize-y rounded-xl border border-forest-deep/15 bg-paper-soft px-5 py-5 font-sans text-base leading-[1.9] text-ink outline-none placeholder:text-ink-soft/75 focus:border-forest max-md:px-4" />
      {preview && (
        <div className={theme === 'forest' ? 'min-h-80' : 'min-h-80 rounded-xl border border-forest-deep/15 bg-paper-soft px-5 py-5 max-md:px-4'}>
          {overLimit ? <p className="text-sm text-ink-soft">{copy.tooLong}</p>
            : <ArticleBody source={source} theme={theme}>
                {theme === 'forest' && title.trim() && (
                  <header className="mb-9 border-b border-mist-muted pb-6"><h2 data-article-title>{title}</h2></header>
                )}
                {!source.trim() && <p className="text-sm text-ink-soft">{copy.emptyPreview}</p>}
              </ArticleBody>}
        </div>
      )}
      <div id={`${id}-count`} className={`mt-1 text-right text-xs tabular-nums ${overLimit ? 'text-[#98452c]' : 'text-ink-soft'}`}>
        {overLimit && <span className="mr-2">{copy.tooLong}</span>}{count} / {limit}
      </div>
    </div>
  );
}
