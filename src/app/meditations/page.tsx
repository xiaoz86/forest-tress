import Link from 'next/link';
import { cookies } from 'next/headers';
import Nav from '@/components/Nav';
import MeditationTrackCard from '@/components/MeditationTrackCard';
import MeditationProgram from '@/components/MeditationProgram';
import { isAdminId } from '@/lib/admin';
import {
  fetchMeditationContent,
  fetchPaidPrograms,
  getMeditationCategory,
  getTracksForCategory,
  prepareClientContent,
  type MeditationCategory,
  type TrackMood,
} from '@/lib/meditations';

export const metadata = {
  title: '林间呼吸 · 附近森林',
  description: '附近森林的主题冥想与声音练习。',
};

type Props = {
  searchParams: Promise<{ category?: string }>;
};

export default async function MeditationsPage({ searchParams }: Props) {
  const [{ category }, rawContent, cookieStore] = await Promise.all([
    searchParams,
    fetchMeditationContent(),
    cookies(),
  ]);
  const memberId = cookieStore.get('nf_member')?.value || '';
  const isAdmin = isAdminId(memberId);

  // 音频「在哪」在这里就全部摘掉，只留「有没有」——播放统一走 stream 路由
  const paidPrograms = await fetchPaidPrograms(memberId);
  const content = prepareClientContent(rawContent);

  const firstCategoryId = content.categories[0]?.id || 'recommended';
  const activeCategoryId = content.categories.some(item => item.id === category)
    ? category!
    : firstCategoryId;
  const activeCategory = getMeditationCategory(content, activeCategoryId);
  const tracks = getTracksForCategory(content, activeCategoryId);
  const isProgram = activeCategory.kind === 'program';

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

          {/* 陪伴营自带头部（封面 + 金句 + 导师），不再套这一层通用大标题 */}
          {!isProgram && (
          <section className="grid grid-cols-[0.72fr_1.28fr] gap-12 items-end max-lg:grid-cols-1 max-lg:gap-10">
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

            <CategoryHero category={activeCategory} count={tracks.length} />
          </section>
          )}

          <section className="mt-14 grid grid-cols-[220px_1fr] gap-10 max-lg:grid-cols-1 max-lg:mt-8">
            <aside className="max-lg:overflow-x-auto">
              <div className="flex flex-col gap-3 max-lg:flex-row max-lg:pb-2">
                {content.categories.map(categoryItem => {
                  const active = categoryItem.id === activeCategoryId;
                  return (
                    <Link
                      key={categoryItem.id}
                      href={`/meditations?category=${encodeURIComponent(categoryItem.id)}`}
                      className={`min-w-fit rounded-lg border px-5 py-4 text-[14px] font-medium no-underline transition-colors ${
                        active
                          ? 'border-white bg-white text-[#111512]'
                          : 'border-white/10 bg-white/[0.045] text-white/56 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {categoryItem.label}
                    </Link>
                  );
                })}
              </div>
            </aside>

            {isProgram ? (
              <MeditationProgram
                content={content}
                category={activeCategory}
                paid={paidPrograms.has(activeCategory.id)}
              />
            ) : (
            <div>
            <CategoryNotes category={activeCategory} />

            <div className="mb-8 flex items-end justify-between gap-6 max-md:block">
              <div>
                <div className="mb-3 text-[11px] font-medium tracking-[0.2em] text-white/32 uppercase">
                  {content.eyebrow} · {activeCategory.label}
                </div>
                <h2 className="text-2xl font-semibold text-white">具体的声音</h2>
              </div>
              <p className="max-w-[430px] text-sm leading-relaxed text-white/42 max-md:mt-4">
                {activeCategory.description || '选择一段声音，给自己一小块不被催促的时间。'}
              </p>
            </div>

            {tracks.length > 0 ? (
              <div className="grid grid-cols-3 gap-8 max-xl:grid-cols-2 max-md:grid-cols-2 max-[420px]:gap-5 max-[360px]:grid-cols-1">
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
                这一条小径还在生长。等新的声音出现，会安静地放进来。
              </div>
            )}
            </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}

function CategoryNotes({ category }: { category: MeditationCategory }) {
  const benefits = (category.benefits || []).filter(Boolean);
  const hasNotes = Boolean(category.sourceNote || category.featureNote || benefits.length);
  if (!hasNotes) return null;

  return (
    <section className="mb-10 border-y border-white/10 py-7">
      <div className="grid grid-cols-[1.1fr_0.9fr] gap-8 max-md:grid-cols-1 max-md:gap-6">
        <div>
          <div className="mb-4 text-[11px] font-medium uppercase tracking-[0.2em] text-coral-soft">
            来源与特色
          </div>
          {category.sourceNote && (
            <p className="text-[14px] leading-[2] text-white/56">
              {category.sourceNote}
            </p>
          )}
          {category.featureNote && (
            <p className="mt-4 text-[14px] leading-[2] text-white/48">
              {category.featureNote}
            </p>
          )}
        </div>

        {benefits.length > 0 && (
          <div>
            <div className="mb-4 text-[11px] font-medium uppercase tracking-[0.2em] text-white/32">
              可能带来的变化
            </div>
            <div className="flex flex-wrap gap-3">
              {benefits.map(benefit => (
                <span
                  key={benefit}
                  className="rounded-full border border-white/12 bg-white/[0.055] px-4 py-2 text-[13px] text-white/64"
                >
                  {benefit}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

const CATEGORY_VISUALS: Record<TrackMood, string> = {
  forest: 'bg-[linear-gradient(135deg,#1d352d_0%,#668579_52%,#d3c5ac_100%)]',
  daily: 'bg-[linear-gradient(135deg,#6aa8c2_0%,#b6d2dd_54%,#eadfca_100%)]',
  emotion: 'bg-[linear-gradient(135deg,#738faa_0%,#b7c7d3_54%,#e5d6d2_100%)]',
  care: 'bg-[linear-gradient(135deg,#dcaf96_0%,#ead8c8_50%,#c7d8ce_100%)]',
  healing: 'bg-[linear-gradient(135deg,#6f8966_0%,#bac8ad_52%,#e7dac4_100%)]',
  body: 'bg-[linear-gradient(135deg,#687d77_0%,#aebdaf_52%,#ded8c7_100%)]',
  kindness: 'bg-[linear-gradient(135deg,#cf9087_0%,#ead0bf_50%,#c7d8cb_100%)]',
  // 夜空 → 海面 → 远处的一点光，取自睡眠专题那张弦月照片
  sleep: 'bg-[linear-gradient(160deg,#05080d_0%,#0f2430_48%,#27505f_78%,#8fa0a2_100%)]',
};

function CategoryHero({ category, count }: { category: MeditationCategory; count: number }) {
  const mood = category.mood || 'forest';
  return (
    <div className={`relative min-h-[280px] overflow-hidden rounded-lg border border-white/12 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.18)] ${CATEGORY_VISUALS[mood]} max-md:p-6`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_26%_18%,rgba(255,255,255,0.25),transparent_34%),linear-gradient(180deg,transparent_0%,rgba(5,17,11,0.46)_100%)]" />
      <div className="relative flex h-full min-h-[216px] flex-col justify-between">
        <div className="text-[10px] font-medium uppercase tracking-[0.34em] text-white/62">
          Mindfulness
        </div>
        <div>
          <div className="mb-5 h-px w-12 bg-white/48" />
          <h2
            className="text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-[1.18] text-white"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {category.heroTitle || category.label}
          </h2>
          <p className="mt-4 max-w-[520px] text-[15px] leading-[1.9] text-white/74">
            {category.heroSubtitle || category.description}
          </p>
          <div className="mt-7 inline-flex rounded-full border border-white/18 bg-white/12 px-4 py-2 text-[12px] text-white/76 backdrop-blur-sm">
            {count > 0 ? `${count} 段声音` : '声音整理中'}
          </div>
        </div>
      </div>
    </div>
  );
}
