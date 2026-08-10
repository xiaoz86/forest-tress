/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next';
import Link from 'next/link';
import Nav from '@/components/Nav';
import { dict } from '@/i18n';
import { tr } from '@/lib/contentTranslate';
import { getLocale, type Locale } from '@/lib/locale';
import ShareSubmitForm from '@/components/ShareSubmitForm';
import { isAdminId } from '@/lib/admin';
import { getAuthenticatedMemberId } from '@/lib/session';
import { fetchShareContent, getPublishedShares, getShareBadgeLabel, type ShareEntry } from '@/lib/shares';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = dict(await getLocale()).shares;
  return { title: t.metaTitle, description: t.metaDescription };
}

export default async function SharesPage() {
  const [content, memberId, locale] = await Promise.all([
    fetchShareContent(),
    getAuthenticatedMemberId(),
    getLocale(),
  ]);
  const t = dict(locale).shares;
  const isAdmin = isAdminId(memberId);
  const publishedShares = getPublishedShares(content);

  return (
    <>
      <Nav />
      <main className="min-h-screen bg-[linear-gradient(180deg,#fff_0%,#faf8f2_100%)] px-8 pb-24 pt-32 max-md:px-7">
        <div className="mx-auto max-w-[1120px]">
          <div className="mb-14 flex items-start justify-between gap-6 max-md:block">
            <div className="max-w-[720px]">
              <div className="mb-8 h-px w-20 bg-coral-soft/70" />
              <div className="mb-5 text-[11px] font-medium tracking-[3px] text-coral uppercase">
                {tr(content.eyebrow, locale)}
              </div>
              <h1
                className="whitespace-pre-line text-[clamp(2.2rem,4.6vw,3.6rem)] font-light leading-[1.22] text-forest-deep"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {t.heroTitle}
              </h1>
              <p className="mt-6 max-w-[620px] text-[16px] leading-[2] text-text-secondary">
                {t.heroLede}
              </p>
            </div>
            <div className="flex gap-3 max-md:mt-8">
              <a
                href="#submit"
                className="rounded-full border border-forest-deep/12 bg-white/70 px-5 py-2.5 text-sm font-medium text-forest-deep/70 no-underline transition-colors hover:bg-forest-deep hover:text-white"
              >
                {t.submitCta}
              </a>
              <Link
                href="/#experience"
                className="rounded-full border border-forest-deep/12 bg-white/70 px-5 py-2.5 text-sm font-medium text-forest-deep/70 no-underline transition-colors hover:bg-forest-deep hover:text-white"
              >
                {t.backHome}
              </Link>
              {isAdmin && (
                <Link
                  href="/shares/admin"
                  className="rounded-full border border-coral-soft/35 bg-coral-soft/10 px-5 py-2.5 text-sm font-medium text-coral no-underline"
                >
                  {t.manage}
                </Link>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-7 max-lg:grid-cols-2 max-md:grid-cols-1">
            {publishedShares.map(share => (
              <ShareCard key={share.id} share={share} locale={locale} />
            ))}
          </div>

          <section id="submit" className="mt-16 scroll-mt-28">
            <ShareSubmitForm isLoggedIn={!!memberId} locale={locale} />
          </section>
        </div>
      </main>
    </>
  );
}

/**
 * 卡片上的字全是主理人在后台填的，代码里翻不了——每一段都过 tr()
 * 查 content-en.json 那张对照表。表里没有的会原样回落成中文，
 * 所以后台新加了分享之后要重跑一次 scripts/translate-content.mjs。
 */
function ShareCard({ share, locale }: { share: ShareEntry; locale: Locale }) {
  const inner = (
    <article className="group overflow-hidden rounded-lg border border-forest-deep/10 bg-white/72 shadow-[0_14px_50px_rgba(26,46,26,0.06)]">
      <ShareMedia share={share} locale={locale} />
      <div className="p-6">
        <div className="mb-4 flex items-center gap-3 text-[11px] tracking-[0.16em] text-coral uppercase">
          <span className="h-px w-7 bg-coral-soft/60" />
          {tr(share.kicker, locale)}
        </div>
        <h2 className="text-[1.35rem] font-normal leading-[1.45] text-forest-deep">
          {tr(share.title, locale)}
        </h2>
        <p className="mt-3 text-[13.5px] leading-[1.85] text-text-secondary">
          {tr(share.summary, locale)}
        </p>
        <div className="mt-5 text-[12px] text-text-light">
          {getShareBadgeLabel(share, locale)}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {share.tags.map(tag => (
            <span key={tag} className="rounded-full border border-forest-deep/10 px-3 py-1 text-[12px] text-forest-deep/55">
              {tr(tag, locale)}
            </span>
          ))}
        </div>
      </div>
    </article>
  );

  if (!share.href) return inner;
  return (
    <a href={share.href} target="_blank" rel="noreferrer" className="block no-underline">
      {inner}
    </a>
  );
}

function ShareMedia({ share, locale }: { share: ShareEntry; locale: Locale }) {
  if (share.mediaKind === 'video' && share.mediaUrl) {
    return (
      <video
        controls
        preload="metadata"
        poster={share.posterUrl || undefined}
        className="aspect-video w-full object-cover bg-[#173018]"
      >
        <source src={share.mediaUrl} />
      </video>
    );
  }

  if ((share.mediaKind === 'image' || share.mediaKind === 'poster') && share.mediaUrl) {
    return <img src={share.mediaUrl} alt={tr(share.title, locale)} className="aspect-video w-full object-cover bg-[#173018]" />;
  }

  if (share.posterUrl) {
    return <img src={share.posterUrl} alt={tr(share.title, locale)} className="aspect-video w-full object-cover bg-[#173018]" />;
  }

  return (
    <div className="relative aspect-video w-full bg-[linear-gradient(135deg,#132413_0%,#263f26_55%,#6b7b62_100%)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.12),transparent_34%)]" />
    </div>
  );
}
