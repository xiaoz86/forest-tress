/* eslint-disable @next/next/no-img-element */
import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Nav from '@/components/Nav';
import ShareArticleBody from '@/components/ShareArticleBody';
import { dict } from '@/i18n';
import { tr } from '@/lib/contentTranslate';
import { getLocale } from '@/lib/locale';
import { fetchShareContent, getPublishedShares } from '@/lib/shares';

type Props = { params: Promise<{ id: string }> };

const publishedArticle = cache(async (id: string) => {
  const article = getPublishedShares(await fetchShareContent()).find(share => share.id === id);
  if (!article?.articleBody) notFound();
  return { ...article, articleBody: article.articleBody };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const [article, locale] = await Promise.all([publishedArticle(id), getLocale()]);
  return { title: tr(article.title, locale), description: tr(article.summary, locale) };
}

export default async function ShareArticlePage({ params }: Props) {
  const { id } = await params;
  const [article, locale] = await Promise.all([publishedArticle(id), getLocale()]);
  const cover = article.mediaKind === 'video' ? article.posterUrl : article.mediaUrl || article.posterUrl;
  return (
    <>
      <Nav />
      <main className="min-h-screen bg-paper-soft px-6 pt-32 pb-24 max-md:pt-28">
        <article className="mx-auto max-w-[44rem]">
          <Link href="/shares?tab=aha" className="text-sm text-forest underline-offset-4 hover:underline">
            {dict(locale).shares.square.eyebrow}
          </Link>
          <header className="mt-7 mb-9 border-b border-mist-muted pb-6">
            <h1 className="mb-4 text-[clamp(1.9rem,4vw,2.8rem)] leading-[1.28] font-medium break-words text-forest-deep">
              {tr(article.title, locale)}
            </h1>
            <p className="text-sm text-ink-soft">{tr(article.author, locale)}</p>
          </header>
          {article.mediaKind === 'video' && article.mediaUrl ? (
            <video controls preload="metadata" poster={cover} src={article.mediaUrl} className="mb-8 max-h-[65vh] w-full rounded-xl bg-forest-dark" />
          ) : cover && (
            <img src={cover} alt="" className="mx-auto mb-8 max-h-[65vh] max-w-full rounded-xl object-contain" />
          )}
          <ShareArticleBody source={article.articleBody} />
          {article.href && (
            <footer className="mt-10 border-t border-mist-muted pt-5">
              <a href={article.href} className="text-sm text-forest underline underline-offset-4">
                {locale === 'en' ? 'Related link' : '相关链接'}
              </a>
            </footer>
          )}
        </article>
      </main>
    </>
  );
}
