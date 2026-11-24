'use client';

import dynamic from 'next/dynamic';
import { useId } from 'react';
import type { dict } from '@/i18n';
import { ARTICLE_BODY_MAX_LENGTH } from '@/lib/shareArticle';

const ArticleBody = dynamic(() => import('@/components/ShareArticleBody'));
type Copy = ReturnType<typeof dict>['shares']['submit']['article'];

type Props = {
  copy: Copy;
  source: string;
  onChange: (source: string) => void;
  preview: boolean;
  onPreview: (active: boolean) => void;
};

export default function ShareArticleFields({ copy, source, onChange, preview, onPreview }: Props) {
  const id = useId();
  const overLimit = source.length > ARTICLE_BODY_MAX_LENGTH;
  const count = source.length.toLocaleString('en-US');
  const limit = ARTICLE_BODY_MAX_LENGTH.toLocaleString('en-US');

  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-forest-deep">{copy.body}</label>
        <div role="group" aria-label={copy.view} className="flex gap-1 rounded-full border border-forest-deep/10 bg-paper-soft p-1">
          {([false, true] as const).map(value => (
            <button key={String(value)} type="button" aria-pressed={preview === value}
              onClick={() => onPreview(value)}
              className={`rounded-full px-4 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest ${preview === value ? 'bg-forest text-white' : 'text-ink-soft hover:text-forest'}`}>
              {value ? copy.preview : copy.write}
            </button>
          ))}
        </div>
      </div>
      <textarea id={id} name="articleBody" value={source} onChange={event => onChange(event.target.value)}
        hidden={preview} aria-invalid={overLimit || undefined} aria-describedby={`${id}-count`}
        placeholder={copy.placeholder}
        className="min-h-80 w-full resize-y rounded-xl border border-forest-deep/15 bg-paper-soft px-5 py-5 font-sans text-base leading-[1.9] text-ink outline-none placeholder:text-ink-soft/75 focus:border-forest max-md:px-4" />
      {preview && (
        <div className="min-h-80 rounded-xl border border-forest-deep/15 bg-paper-soft px-5 py-5 max-md:px-4">
          {overLimit ? <p className="text-sm text-ink-soft">{copy.tooLong}</p>
            : source.trim() ? <ArticleBody source={source} />
            : <p className="text-sm text-ink-soft">{copy.emptyPreview}</p>}
        </div>
      )}
      <div id={`${id}-count`} className={`mt-1 text-right text-xs tabular-nums ${overLimit ? 'text-[#98452c]' : 'text-ink-soft'}`}>
        {overLimit && <span className="mr-2">{copy.tooLong}</span>}{count} / {limit}
      </div>
    </div>
  );
}
