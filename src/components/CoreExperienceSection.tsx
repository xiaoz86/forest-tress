/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { getFeaturedShare, getShareBadgeLabel, type ShareContent, type ShareEntry } from '@/lib/shares';

type Props = {
  content: ShareContent;
  isAdmin?: boolean;
};

export default function CoreExperienceSection({ content, isAdmin = false }: Props) {
  const featured = getFeaturedShare(content);

  return (
    <section
      id="experience"
      className="relative py-28 px-8 bg-[linear-gradient(180deg,#fff_0%,#faf8f2_100%)] max-md:py-16 max-md:px-7"
    >
      <div className="max-w-[1120px] mx-auto">
        <div className="mb-14 grid grid-cols-[0.9fr_1.1fr] items-end gap-12 max-lg:block">
          <div className="max-w-[680px]">
            <div className="mb-8 h-px w-20 bg-coral-soft/70" />
            <div className="text-[11px] tracking-[3px] text-coral uppercase mb-5 font-medium">
              {content.eyebrow}
            </div>
            <h2
              className="whitespace-pre-line text-[clamp(2rem,4vw,3.1rem)] font-normal text-forest-deep leading-[1.25] tracking-normal"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {content.title}
            </h2>
          </div>
          <div className="max-w-[520px] justify-self-end max-lg:mt-7 max-lg:justify-self-start">
            <p className="text-[16px] text-text-secondary leading-[2]">
              {content.intro}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/shares"
                className="inline-flex items-center rounded-full border border-forest-deep/12 bg-white/65 px-5 py-2.5 text-sm font-medium text-forest-deep/70 no-underline transition-colors hover:bg-forest-deep hover:text-white"
              >
                {content.moreLabel === '更多' ? '更多超级个体的分享' : content.moreLabel}
              </Link>
              {isAdmin && (
                <Link
                  href="/shares/admin"
                  className="inline-flex items-center rounded-full border border-coral-soft/35 bg-coral-soft/10 px-5 py-2.5 text-sm font-medium text-coral no-underline transition-colors hover:bg-coral-soft/20"
                >
                  管理分享
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[1.05fr_0.95fr] gap-8 items-stretch max-lg:grid-cols-1">
          <div className="overflow-hidden rounded-lg bg-forest-deep text-white min-h-[480px] flex flex-col shadow-[0_24px_80px_rgba(26,46,26,0.16)]">
            <ShareMedia share={featured} />
            <div className="p-8 max-md:p-6 flex-1 flex flex-col justify-between bg-[linear-gradient(180deg,#153117_0%,#102712_100%)]">
              <div>
                <div className="mb-4 flex items-center gap-3 text-[11px] tracking-[0.16em] text-coral-soft uppercase">
                  <span className="h-px w-8 bg-coral-soft/50" />
                  {featured.kicker}
                </div>
                <h3 className="text-[1.55rem] font-medium leading-[1.45]">
                  {featured.title}
                </h3>
                <p className="mt-4 text-[14px] text-white/68 leading-[1.9]">
                  {featured.summary}
                </p>
                <div className="mt-5 inline-flex rounded-full border border-white/12 px-3 py-1 text-[12px] text-white/52">
                  {getShareBadgeLabel(featured)}
                </div>
              </div>
              <div className="mt-7 flex flex-wrap gap-3 text-[12px] text-white/60">
                {featured.tags.map(tag => (
                  <span key={tag} className="rounded-full border border-white/12 px-3 py-1">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-forest-deep/10 bg-white/72 p-9 max-md:p-6">
            <div className="mb-8 h-px w-14 bg-coral-soft/55" />
            <div className="text-[11px] tracking-[0.18em] text-coral uppercase">
              {content.noteEyebrow}
            </div>
            <h3
              className="mt-5 text-[clamp(1.35rem,2.2vw,1.75rem)] font-medium leading-[1.45] text-forest-deep"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {content.noteTitle}
            </h3>
            <div className="mt-7 space-y-5 text-[16px] leading-[2] text-text-secondary">
              {content.noteParagraphs.map(paragraph => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            <div className="mt-9 border-t border-forest-deep/10 pt-6">
              <p className="text-[13.5px] leading-[1.9] text-coral">
                {content.footer}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ShareMedia({ share }: { share: ShareEntry }) {
  if (share.mediaKind === 'video' && share.mediaUrl) {
    return (
      <video
        controls
        preload="metadata"
        poster={share.posterUrl || undefined}
        className="aspect-video w-full object-cover bg-black"
      >
        <source src={share.mediaUrl} />
      </video>
    );
  }

  if ((share.mediaKind === 'image' || share.mediaKind === 'poster') && share.mediaUrl) {
    return (
      <img
        src={share.mediaUrl}
        alt={share.title}
        className="aspect-video w-full object-cover bg-[#173018]"
      />
    );
  }

  if (share.posterUrl) {
    return (
      <img
        src={share.posterUrl}
        alt={share.title}
        className="aspect-video w-full object-cover bg-[#173018]"
      />
    );
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden bg-[linear-gradient(135deg,#132413_0%,#263f26_55%,#6b7b62_100%)] flex items-center justify-center">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(255,255,255,0.12),transparent_34%),linear-gradient(180deg,transparent_0%,rgba(0,0,0,0.16)_100%)]" />
      <div className="relative h-[68px] w-[68px] rounded-full border border-white/35 bg-white/6 flex items-center justify-center backdrop-blur-sm">
        <span className="ml-1 block h-0 w-0 border-y-[10px] border-y-transparent border-l-[16px] border-l-white/86" />
      </div>
    </div>
  );
}
