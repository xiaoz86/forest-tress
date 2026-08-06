/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import Nav from '@/components/Nav';
import ShareSubmitForm from '@/components/ShareSubmitForm';
import { isAdminId } from '@/lib/admin';
import { getAuthenticatedMemberId } from '@/lib/session';
import { fetchShareContent, getPublishedShares, getShareBadgeLabel, type ShareEntry } from '@/lib/shares';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '林间分享 · 附近森林',
  description: '附近森林里超级个体的作品、产品、活动与体验片段。',
};

export default async function SharesPage() {
  const [content, memberId] = await Promise.all([
    fetchShareContent(),
    getAuthenticatedMemberId(),
  ]);
  const isAdmin = isAdminId(memberId);
  const publishedShares = getPublishedShares(content);

  return (
    <>
      <Nav />
      <main className="min-h-screen bg-[linear-gradient(180deg,#fff_0%,#faf8f2_100%)] px-8 pb-24 pt-32 max-md:px-5">
        <div className="mx-auto max-w-[1120px]">
          <div className="mb-14 flex items-start justify-between gap-6 max-md:block">
            <div className="max-w-[720px]">
              <div className="mb-8 h-px w-20 bg-coral-soft/70" />
              <div className="mb-5 text-[11px] font-medium tracking-[3px] text-coral uppercase">
                {content.eyebrow}
              </div>
              <h1
                className="whitespace-pre-line text-[clamp(2.2rem,4.6vw,3.6rem)] font-semibold leading-[1.22] text-forest-deep"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                更多超级个体的分享
              </h1>
              <p className="mt-6 max-w-[620px] text-[15px] leading-[2] text-text-secondary">
                有些价值，需要先被人真实地进入。这里会慢慢放下有温度的超级个体带来的作品、产品、活动和体验。
              </p>
            </div>
            <div className="flex gap-3 max-md:mt-8">
              <a
                href="#submit"
                className="rounded-full border border-forest-deep/12 bg-white/70 px-5 py-2.5 text-sm font-medium text-forest-deep/70 no-underline transition-colors hover:bg-forest-deep hover:text-white"
              >
                带来我的分享
              </a>
              <Link
                href="/#experience"
                className="rounded-full border border-forest-deep/12 bg-white/70 px-5 py-2.5 text-sm font-medium text-forest-deep/70 no-underline transition-colors hover:bg-forest-deep hover:text-white"
              >
                回到首页
              </Link>
              {isAdmin && (
                <Link
                  href="/shares/admin"
                  className="rounded-full border border-coral-soft/35 bg-coral-soft/10 px-5 py-2.5 text-sm font-medium text-coral no-underline"
                >
                  管理分享
                </Link>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-7 max-lg:grid-cols-2 max-md:grid-cols-1">
            {publishedShares.map(share => (
              <ShareCard key={share.id} share={share} />
            ))}
          </div>

          <section id="submit" className="mt-16 scroll-mt-28">
            <ShareSubmitForm isLoggedIn={!!memberId} />
          </section>
        </div>
      </main>
    </>
  );
}

function ShareCard({ share }: { share: ShareEntry }) {
  const inner = (
    <article className="group overflow-hidden rounded-lg border border-forest-deep/10 bg-white/72 shadow-[0_14px_50px_rgba(26,46,26,0.06)]">
      <ShareMedia share={share} />
      <div className="p-6">
        <div className="mb-4 flex items-center gap-3 text-[11px] tracking-[0.16em] text-coral uppercase">
          <span className="h-px w-7 bg-coral-soft/60" />
          {share.kicker}
        </div>
        <h2 className="text-[1.35rem] font-semibold leading-[1.45] text-forest-deep">
          {share.title}
        </h2>
        <p className="mt-3 text-[13.5px] leading-[1.85] text-text-secondary">
          {share.summary}
        </p>
        <div className="mt-5 text-[12px] text-text-light">
          {getShareBadgeLabel(share)}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {share.tags.map(tag => (
            <span key={tag} className="rounded-full border border-forest-deep/10 px-3 py-1 text-[12px] text-forest-deep/55">
              {tag}
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

function ShareMedia({ share }: { share: ShareEntry }) {
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
    return <img src={share.mediaUrl} alt={share.title} className="aspect-video w-full object-cover bg-[#173018]" />;
  }

  if (share.posterUrl) {
    return <img src={share.posterUrl} alt={share.title} className="aspect-video w-full object-cover bg-[#173018]" />;
  }

  return (
    <div className="relative aspect-video w-full bg-[linear-gradient(135deg,#132413_0%,#263f26_55%,#6b7b62_100%)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.12),transparent_34%)]" />
    </div>
  );
}
