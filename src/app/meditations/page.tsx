import Link from 'next/link';
import { cookies } from 'next/headers';
import Nav from '@/components/Nav';
import MeditationTrackCard from '@/components/MeditationTrackCard';
import { isAdminId } from '@/lib/admin';
import {
  fetchMeditationContent,
  getMeditationCategory,
  getTracksForCategory,
} from '@/lib/meditations';

export const metadata = {
  title: '林间呼吸 · 附近森林',
  description: '附近森林的主题冥想与声音练习。',
};

type Props = {
  searchParams: Promise<{ category?: string }>;
};

export default async function MeditationsPage({ searchParams }: Props) {
  const [{ category }, content, cookieStore] = await Promise.all([
    searchParams,
    fetchMeditationContent(),
    cookies(),
  ]);
  const firstCategoryId = content.categories[0]?.id || 'recommended';
  const activeCategoryId = content.categories.some(item => item.id === category)
    ? category!
    : firstCategoryId;
  const activeCategory = getMeditationCategory(content, activeCategoryId);
  const tracks = getTracksForCategory(content, activeCategoryId);
  const memberId = cookieStore.get('nf_member')?.value || '';
  const isAdmin = isAdminId(memberId);

  return (
    <>
      <Nav />
      <main className="relative min-h-screen overflow-hidden bg-[#0f1411] px-8 pb-24 pt-32 text-white max-md:px-5 max-md:pt-28">
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(160deg,rgba(255,255,255,0.055),transparent_44%,rgba(232,201,160,0.05))]" />

        <div className="relative mx-auto max-w-[1120px]">
          <div className="mb-12 flex items-center justify-between gap-4">
            <Link
              href="/#meditations"
              className="text-sm text-white/42 underline-offset-4 transition-colors hover:text-white"
            >
              回到首页
            </Link>
            {isAdmin && (
              <Link
                href="/meditations/admin"
                className="rounded-full border border-white/14 bg-white/[0.055] px-4 py-2 text-sm font-medium text-white/62 no-underline transition-colors hover:bg-white/10 hover:text-white"
              >
                管理冥想
              </Link>
            )}
          </div>

          <section className="grid grid-cols-[0.85fr_1.15fr] gap-14 items-end max-lg:grid-cols-1 max-lg:gap-10">
            <div className="max-w-[560px]">
              <div className="mb-8 h-px w-20 bg-coral-soft/70" />
              <div className="mb-5 text-[11px] font-medium tracking-[3px] text-coral-soft uppercase">
                {content.eyebrow}
              </div>
              <h1
                className="whitespace-pre-line text-[clamp(2.35rem,5.2vw,4rem)] font-semibold leading-[1.18] tracking-normal"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {content.title}
              </h1>
              <p className="mt-7 max-w-[500px] text-[15px] leading-[2] text-white/52">
                {content.description}
              </p>
              <div className="mt-9 flex items-center gap-4 text-[12px] text-white/36">
                <span className="h-px w-10 bg-white/20" />
                <span>{content.note}</span>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3 max-lg:justify-start">
              {content.categories.map(categoryItem => {
                const active = categoryItem.id === activeCategoryId;
                return (
                  <Link
                    key={categoryItem.id}
                    href={`/meditations?category=${encodeURIComponent(categoryItem.id)}`}
                    className={`inline-flex h-11 items-center rounded-full border px-5 text-[14px] font-medium no-underline transition-colors ${
                      active
                        ? 'border-white bg-white text-[#111512]'
                        : 'border-white/14 bg-white/[0.055] text-white/62 hover:bg-white hover:text-[#111512]'
                    }`}
                  >
                    {categoryItem.label}
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="mt-16">
            <div className="mb-8 flex items-end justify-between gap-6 max-md:block">
              <div>
                <div className="mb-3 text-[11px] font-medium tracking-[0.2em] text-white/32 uppercase">
                  {content.eyebrow} · {activeCategory.label}
                </div>
                <h2 className="text-2xl font-semibold text-white">具体的声音</h2>
              </div>
              <p className="max-w-[420px] text-sm leading-relaxed text-white/42 max-md:mt-4">
                选择一段声音，给自己一小块不被催促的时间。
              </p>
            </div>

            {tracks.length > 0 ? (
              <div className="grid grid-cols-3 gap-8 max-lg:grid-cols-2 max-md:grid-cols-2 max-[420px]:gap-5 max-[360px]:grid-cols-1">
                {tracks.map(track => (
                  <MeditationTrackCard
                    key={track.id}
                    track={track}
                    showAudio
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-white/10 bg-white/[0.035] px-6 py-10 text-white/45">
                这一类声音还在整理中。
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
