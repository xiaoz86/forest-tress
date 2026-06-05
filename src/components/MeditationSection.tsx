import Link from 'next/link';
import MeditationTrackCard from '@/components/MeditationTrackCard';
import type { MeditationCategory, MeditationContent, TrackMood } from '@/lib/meditations';

type Props = {
  content: MeditationContent;
  isAdmin?: boolean;
};

export default function MeditationSection({ content, isAdmin = false }: Props) {
  const featuredCategory = content.categories[0];
  const featuredTracks = featuredCategory
    ? content.tracks.filter(track => track.categoryId === featuredCategory.id)
    : content.tracks;
  const otherCategories = content.categories.slice(1);

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

        {featuredCategory && (
          <div className="grid grid-cols-[1.08fr_0.92fr] gap-6 max-lg:grid-cols-1">
            <Link
              href={`/meditations?category=${encodeURIComponent(featuredCategory.id)}`}
              className="relative min-h-[330px] overflow-hidden rounded-lg border border-white/12 bg-[linear-gradient(135deg,rgba(8,18,13,0.22),rgba(8,18,13,0.34)),url('/hero-forest.jpg')] bg-cover bg-center p-7 no-underline shadow-[0_26px_80px_rgba(0,0,0,0.18)] max-md:min-h-[280px] max-md:p-6"
            >
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,18,12,0.08)_0%,rgba(6,18,12,0.66)_100%)]" />
              <div className="relative flex h-full flex-col justify-between">
                <div className="text-[10px] font-medium uppercase tracking-[0.34em] text-white/58">
                  Mindfulness
                </div>
                <div>
                  <div className="mb-5 h-px w-12 bg-coral-soft/65" />
                  <h3
                    className="text-[clamp(1.7rem,3.6vw,2.55rem)] font-semibold leading-[1.25] text-white"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {featuredCategory.heroTitle || featuredCategory.label}
                  </h3>
                  <p className="mt-4 max-w-[420px] text-[14px] leading-[1.9] text-white/70">
                    {featuredCategory.heroSubtitle || featuredCategory.description}
                  </p>
                  <div className="mt-7 inline-flex rounded-full border border-white/18 bg-white/10 px-4 py-2 text-[12px] text-white/72 backdrop-blur-sm">
                    {featuredTracks.length} 段声音
                  </div>
                </div>
              </div>
            </Link>

            <div className="grid grid-cols-2 gap-5 max-md:grid-cols-1">
              {otherCategories.map(category => (
                <CategoryCard key={category.id} category={category} />
              ))}
            </div>
          </div>
        )}

        <div className="mt-14 mb-8 flex items-end justify-between gap-6 max-md:block">
          <div>
            <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.22em] text-white/30">
              {featuredCategory?.label || content.eyebrow}
            </div>
            <h3 className="text-2xl font-semibold text-white">推荐</h3>
          </div>
          <p className="max-w-[420px] text-sm leading-relaxed text-white/42 max-md:mt-4">
            从几段适合开始的声音进入，按自己的节奏慢慢听。
          </p>
        </div>

        <div className="grid grid-cols-4 gap-6 max-lg:grid-cols-2 max-md:grid-cols-2 max-[420px]:gap-5 max-[360px]:grid-cols-1">
          {featuredTracks.map(track => (
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

const CATEGORY_VISUALS: Record<TrackMood, string> = {
  forest: 'bg-[linear-gradient(135deg,#243f35_0%,#68877b_58%,#d4c5aa_100%)]',
  daily: 'bg-[linear-gradient(135deg,#6ba9c1_0%,#b5d1db_55%,#e8deca_100%)]',
  emotion: 'bg-[linear-gradient(135deg,#718da8_0%,#b8c8d4_56%,#e5d6d2_100%)]',
  care: 'bg-[linear-gradient(135deg,#dcae94_0%,#ead7c4_48%,#c5d6cb_100%)]',
  healing: 'bg-[linear-gradient(135deg,#718b68_0%,#b9c9ad_54%,#e6dac4_100%)]',
  body: 'bg-[linear-gradient(135deg,#6f837d_0%,#aebdaf_52%,#ded8c7_100%)]',
  kindness: 'bg-[linear-gradient(135deg,#cf8f86_0%,#ead0bf_50%,#c5d7ca_100%)]',
};

function CategoryCard({ category }: { category: MeditationCategory }) {
  const mood = category.mood || 'forest';
  return (
    <Link
      href={`/meditations?category=${encodeURIComponent(category.id)}`}
      className={`group relative min-h-[157px] overflow-hidden rounded-lg border border-white/12 p-5 no-underline ${CATEGORY_VISUALS[mood]}`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_18%,rgba(255,255,255,0.22),transparent_34%),linear-gradient(180deg,transparent_0%,rgba(7,18,12,0.36)_100%)]" />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex justify-end text-white/82">
          <SmallGlyph mood={mood} />
        </div>
        <div>
          <div className="text-[1.05rem] font-semibold leading-snug text-white">
            {category.label}
          </div>
          <p className="mt-2 line-clamp-2 text-[12.5px] leading-[1.7] text-white/66">
            {category.description}
          </p>
        </div>
      </div>
    </Link>
  );
}

function SmallGlyph({ mood }: { mood: TrackMood }) {
  if (mood === 'care') {
    return (
      <svg viewBox="0 0 40 40" className="h-9 w-9" fill="none" aria-hidden="true">
        <path d="M20 8v24M8 20h24M12 12c5 3 11 3 16 0M12 28c5-3 11-3 16 0" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (mood === 'kindness') {
    return (
      <svg viewBox="0 0 40 40" className="h-9 w-9" fill="none" aria-hidden="true">
        <path
          d="M20 31s-11-6-11-15c0-5 4-8 8-8 2 0 4 1 5 3 1-2 3-3 5-3 4 0 8 3 8 8 0 9-15 15-15 15Z"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M15 20c3 2 7 2 10 0" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" opacity="0.46" />
      </svg>
    );
  }
  if (mood === 'emotion') {
    return (
      <svg viewBox="0 0 40 40" className="h-9 w-9" fill="none" aria-hidden="true">
        <path d="M8 18c5-6 10-6 15 0s8 6 12 0M8 27c5-6 10-6 15 0s8 6 12 0" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (mood === 'daily') {
    return (
      <svg viewBox="0 0 40 40" className="h-9 w-9" fill="none" aria-hidden="true">
        <path d="M8 22h20c7 0 8 9 2 11-4 1-7-1-7-5M8 14h14c5 0 6-7 2-9-4-2-7 1-7 4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (mood === 'healing') {
    return (
      <svg viewBox="0 0 40 40" className="h-9 w-9" fill="none" aria-hidden="true">
        <path d="M20 7v26M7 20h26M11 11l18 18M29 11 11 29" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (mood === 'body') {
    return (
      <svg viewBox="0 0 40 40" className="h-9 w-9" fill="none" aria-hidden="true">
        <circle cx="20" cy="10" r="4" fill="currentColor" opacity="0.72" />
        <path d="M20 16v17M11 20c5 4 13 4 18 0M13 28c4 3 10 3 14 0" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 40 40" className="h-9 w-9" fill="none" aria-hidden="true">
      <path d="M28 27c-6 8-20 4-19-7C10 9 25 7 29 17c3 8-7 15-13 9-4-5 2-11 7-7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
