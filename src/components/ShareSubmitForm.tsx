'use client';

import { useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { dict } from '@/i18n';
import type { Locale } from '@/lib/locale';
import { ARTICLE_BODY_MAX_LENGTH } from '@/lib/shareArticle';
import ShareArticleFields from './ShareArticleFields';

type Props = {
  isLoggedIn: boolean;
  /**
   * 文案在客户端自己取。字典里为了英文单复数用了函数，而函数跨不过
   * server → client 那道序列化边界，整片字典切片当 props 传会让页面直接崩。
   * 所以只传 locale——它仍然是服务端算好的，这边不读 cookie，不会闪一下中文。
   */
  locale: Locale;
  /** 从「去创作」哪一项进来的：Aha! 还是写文章。审核的人在投稿标题上方看得出来 */
  kind?: 'aha' | 'article';
  /** 没登录时「去登录」的地址（带着登录完回来的位置） */
  loginHref?: string;
};

export default function ShareSubmitForm({ isLoggedIn, locale, kind = 'aha', loginHref = '/login' }: Props) {
  const t = useMemo(() => dict(locale).shares.submit, [locale]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [articleBody, setArticleBody] = useState('');
  const [preview, setPreview] = useState(false);
  const isArticle = kind === 'article';

  if (!isLoggedIn) {
    return (
      <div className="rounded-lg border border-forest-deep/10 bg-white/72 p-7">
        <div className="mb-3 text-[11px] font-medium tracking-[0.18em] text-coral uppercase">
          {t.eyebrow}
        </div>
        <h2 className="text-2xl font-normal text-forest-deep">{t.signInTitle}</h2>
        <p className="mt-4 text-sm leading-relaxed text-text-secondary">
          {t.signInBody}
        </p>
        <a
          href={loginHref}
          className="mt-6 inline-flex rounded-full bg-forest-deep px-5 py-2.5 text-sm font-medium text-white no-underline"
        >
          {t.signInCta}
        </a>
      </div>
    );
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    if (isArticle) {
      if (articleBody.length > ARTICLE_BODY_MAX_LENGTH) {
        setMessage(t.article.tooLong);
        return;
      }
      if (!articleBody.trim() && !(String(formData.get('href') || '').trim() && String(formData.get('summary') || '').trim())) {
        setMessage(t.article.missing);
        return;
      }
    }
    setSubmitting(true);
    setMessage('');
    try {
      const res = await fetch('/api/shares/submit', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('submit-failed');
      setMessage(t.done);
      form.reset();
      setArticleBody('');
      setPreview(false);
    } catch {
      // 原来这里把接口回的错误码原样显示出来（submit-failed 之类）。
      // 投稿人看不懂那种字符串，统一换成一句人话。
      setMessage(t.failed);
    } finally {
      setSubmitting(false);
    }
  };

  const detailsFields = (
    <>
      <Field label={t.field.tags}>
        <input name="tags" maxLength={120} placeholder={t.field.tagsPlaceholder} className={inputCls} />
      </Field>
      <Field label={t.field.question} className="col-span-2 max-md:col-span-1">
        <input name="question" maxLength={120} className={inputCls} />
      </Field>
      <Field label={isArticle ? t.article.summary : t.field.summary} className="col-span-2 max-md:col-span-1">
        <textarea name="summary" required={!isArticle} maxLength={260} className={`${inputCls} min-h-28 resize-y leading-relaxed`} />
      </Field>
      <Field label={t.field.note} className="col-span-2 max-md:col-span-1">
        <textarea name="note" maxLength={220} className={`${inputCls} min-h-20 resize-y leading-relaxed`} />
      </Field>
      <Field label={t.field.href} className="col-span-2 max-md:col-span-1">
        <input name="href" type="url" maxLength={900} className={inputCls} />
      </Field>
      <Field label={t.field.media}>
        <input name="media" type="file" accept="video/mp4,video/quicktime,video/webm,image/*" className={fileInputCls} />
      </Field>
      <Field label={t.field.poster}>
        <input name="poster" type="file" accept="image/*" className={fileInputCls} />
      </Field>
    </>
  );

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-forest-deep/10 bg-white/72 p-7 max-md:p-5"
    >
      <input type="hidden" name="kind" value={kind} />
      <div className="mb-3 text-[11px] font-medium tracking-[0.18em] text-coral uppercase">
        {t.eyebrow}
      </div>
      <h2 className="text-2xl font-normal text-forest-deep">{isArticle ? t.article.title : t.title}</h2>
      {!isArticle && <p className="mt-4 text-sm leading-relaxed text-text-secondary">{t.lede}</p>}

      <div className="mt-7 grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <Field label={t.field.title} className={isArticle ? 'col-span-full' : undefined}>
          <input name="title" required maxLength={64} className={inputCls} />
        </Field>
        {isArticle ? (
          <>
            <div className="col-span-full">
              <ShareArticleFields copy={t.article} source={articleBody} onChange={setArticleBody}
                preview={preview} onPreview={setPreview} />
            </div>
            <details className="col-span-full border-t border-forest-deep/10 pt-4">
              <summary className="cursor-pointer text-sm font-medium text-forest">{t.article.options}</summary>
              <p className="mt-3 text-sm text-ink-soft">{t.article.external}</p>
              <div className="mt-4 grid grid-cols-2 gap-4 max-md:grid-cols-1">{detailsFields}</div>
            </details>
          </>
        ) : detailsFields}
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-forest-deep px-6 py-3 text-sm font-medium text-white transition-opacity disabled:opacity-50"
        >
          {submitting ? t.submitting : t.submitCta}
        </button>
        {message && (
          <span role="status" className="text-sm leading-relaxed text-ink-soft">{message}</span>
        )}
      </div>
    </form>
  );
}

const inputCls =
  'w-full rounded-lg border border-forest-deep/10 bg-white/75 px-4 py-3 text-sm text-forest-deep outline-none transition-colors placeholder:text-text-light/50 focus:border-coral-soft/70';

const fileInputCls =
  'block w-full text-sm text-text-secondary file:mr-4 file:rounded-full file:border-0 file:bg-forest-deep file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white';

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
      <span className="mb-2 block text-[12px] font-medium text-text-light">{label}</span>
      {children}
    </label>
  );
}
