import Link from 'next/link';
import MeditationTrackCard from '@/components/MeditationTrackCard';
import type { MeditationContent } from '@/lib/meditations';

type Props = {
  content: MeditationContent;
  isAdmin?: boolean;
};

export default function MeditationSection({ content, isAdmin = false }: Props) {
  return (
    <section
      id="meditations"
      className="relative overflow-hidden bg-[#0f1411] px-8 py-24 text-white max-md:px-5 max-md:py-16"
    >
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(160deg,rgba(255,255,255,0.055),transparent_42%,rgba(232,201,160,0.045))]" />

      <div className="relative max-w-[1120px] mx-auto">
        <div className="mb-12 grid grid-cols-[0.9fr_1.1fr] gap-14 items-end max-lg:grid-cols-1 max-lg:gap-8">
          <div className="max-w-[540px]">
            <div className="mb-8 h-px w-20 bg-coral-soft/70" />
            <div className="text-[11px] tracking-[3px] text-coral-soft uppercase mb-5 font-medium">
              {content.eyebrow}
            </div>
            <Link
              href="/meditations"
              className="block no-underline"
              aria-label={`进入${content.eyebrow}冥想页`}
            >
              <h2
              className="whitespace-pre-line text-[clamp(2rem,4.8vw,3.4rem)] font-semibold text-white leading-[1.22] tracking-normal"
              style={{ fontFamily: 'var(--font-display)' }}
              >
                {content.title}
              </h2>
            </Link>
            <p className="mt-7 text-[15px] text-white/52 leading-[2] max-w-[500px]">
              {content.description}
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4 text-[12px] text-white/36">
              <span className="h-px w-10 bg-white/20" />
              <span>{content.note}</span>
              {isAdmin && (
                <Link
                  href="/meditations/admin"
                  className="rounded-full border border-white/12 bg-white/[0.055] px-4 py-2 text-white/62 no-underline transition-colors hover:bg-white/10 hover:text-white"
                >
                  管理冥想
                </Link>
              )}
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-3 max-lg:justify-start">
            {content.categories.map((category, index) => (
              <Link
                key={category.id}
                href={`/meditations?category=${encodeURIComponent(category.id)}`}
                className={`inline-flex h-11 items-center rounded-full border px-5 text-[14px] font-medium transition-colors ${
                  index === 0
                    ? 'border-white bg-white text-[#111512]'
                    : 'border-white/14 bg-white/[0.055] text-white/62'
                } no-underline hover:bg-white hover:text-[#111512]`}
              >
                {category.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-8 max-lg:grid-cols-2 max-md:grid-cols-2 max-[420px]:gap-5 max-[360px]:grid-cols-1">
          {content.tracks.map(track => (
            <MeditationTrackCard
              key={track.id}
              track={track}
              href={`/meditations?category=${encodeURIComponent(track.categoryId)}#${track.id}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
