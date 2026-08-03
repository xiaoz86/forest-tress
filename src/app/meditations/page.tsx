import Link from 'next/link';
import { cookies } from 'next/headers';
import Nav from '@/components/Nav';
import MeditationTrackCard from '@/components/MeditationTrackCard';
import MeditationProgram from '@/components/MeditationProgram';
import MeditationGrove from '@/components/MeditationGrove';
import { isAdminId } from '@/lib/admin';
import { fetchNoteCounts } from '@/lib/meditationNotes';
import {
  fetchMeditationContent,
  fetchPaidPrograms,
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

  // 不带 category（或给了个不存在的）就展示声音林。
  // 原来会默默落到第一个分类——进门就被塞进一条小径，看不到还有哪些路。
  const activeCategory = category
    ? content.categories.find(item => item.id === category)
    : undefined;

  if (!activeCategory) {
    const trackCounts: Record<string, number> = {};
    for (const t of content.tracks) {
      trackCounts[t.categoryId] = (trackCounts[t.categoryId] || 0) + 1;
    }
    return (
      <>
        <Nav />
        <main className="relative min-h-screen overflow-hidden bg-[#0f1411] px-8 pb-28 pt-32 text-white max-md:px-5 max-md:pt-28">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(160deg,rgba(255,255,255,0.055),transparent_44%,rgba(232,201,160,0.05))]" />
          <div className="relative">
            <div className="mx-auto mb-12 flex max-w-[1080px] items-center justify-between gap-4">
              <Link
                href="/"
                className="text-sm text-white/42 underline-offset-4 transition-colors hover:text-white"
              >
                ← 回到首页
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
            <MeditationGrove content={content} counts={trackCounts} />
          </div>
        </main>
      </>
    );
  }

  const activeCategoryId = activeCategory.id;
  const tracks = getTracksForCategory(content, activeCategoryId);
  const isProgram = activeCategory.kind === 'program';
  // 一次把当前分类所有段落的感悟条数取回来，省掉一段一次的往返
  const noteCounts = await fetchNoteCounts(tracks.map(t => t.id));

  return (
    <>
      <Nav />
      <main className="relative min-h-screen overflow-hidden bg-[#0f1411] px-8 pb-24 pt-32 text-white max-md:px-5 max-md:pt-28">
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(160deg,rgba(255,255,255,0.055),transparent_44%,rgba(232,201,160,0.05))]" />

        <div className="relative mx-auto max-w-[1120px]">
          <div className="mb-12 flex items-center justify-between gap-4">
            <Link
              href="/meditations"
              className="text-sm text-white/42 underline-offset-4 transition-colors hover:text-white"
            >
              ← 所有声音
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
            <CategoryHero category={activeCategory} count={tracks.length} />
          )}

          <section className="mt-14 grid grid-cols-[220px_1fr] gap-10 max-lg:grid-cols-1 max-lg:mt-8">
            {/*
              换一条小径。已经有声音林当列表页了，这里就不必再做成一排
              抢眼的筛选按钮——退成安静的一列文字，当前那条用左侧一道线标出。
            */}
            <aside className="max-lg:overflow-x-auto">
              <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-white/28 max-lg:hidden">
                Other Paths
              </p>
              <div className="flex flex-col gap-0.5 max-lg:flex-row max-lg:gap-2 max-lg:pb-2">
                {content.categories.map(categoryItem => {
                  const active = categoryItem.id === activeCategoryId;
                  return (
                    <Link
                      key={categoryItem.id}
                      href={`/meditations?category=${encodeURIComponent(categoryItem.id)}`}
                      aria-current={active ? 'page' : undefined}
                      className={`min-w-fit border-l-2 py-2.5 pl-4 text-[14px] no-underline transition-colors max-lg:rounded-full max-lg:border-l-0 max-lg:border max-lg:px-4 max-lg:py-2 ${
                        active
                          ? 'border-coral-soft font-medium text-white max-lg:border-white max-lg:bg-white max-lg:text-[#111512]'
                          : 'border-white/10 text-white/48 hover:border-white/35 hover:text-white max-lg:border-white/12 max-lg:bg-white/[0.045]'
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
                noteCounts={noteCounts}
                loggedIn={Boolean(memberId)}
              />
            ) : (
            <div>
            <CategoryNotes category={activeCategory} />

            {/*
              这里原来还并排放一段 description。页首现在已经用大字介绍过这条小径，
              再摆一遍就是重复；而且那字段是后台自由填的，长起来会把这一行拽得很难看。
            */}
            <div className="mb-8">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-white/28">
                Listen
              </p>
              <h2
                className="text-[1.5rem] font-medium tracking-[-0.02em] text-white"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                具体的声音
              </h2>
            </div>

            {tracks.length > 0 ? (
              <div className="grid grid-cols-3 gap-8 max-xl:grid-cols-2 max-md:grid-cols-2 max-[420px]:gap-5 max-[360px]:grid-cols-1">
                {tracks.map(track => (
                  <MeditationTrackCard
                    key={track.id}
                    track={track}
                    showAudio
                    loggedIn={Boolean(memberId)}
                    noteCount={noteCounts[track.id] || 0}
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

// 每条小径在页面顶端的一层氛围光。不再是一块占满首屏的实心渐变卡片——
// 那东西占了最大面积却只承载三行小字。改成从右上角漫下来的一片光，
// 让位置留给标题本身。
const MOOD_AURA: Record<TrackMood, string> = {
  forest: 'rgba(104,133,121,0.30)',
  daily: 'rgba(106,168,194,0.26)',
  emotion: 'rgba(115,143,170,0.26)',
  care: 'rgba(220,175,150,0.24)',
  healing: 'rgba(111,137,102,0.28)',
  body: 'rgba(104,125,119,0.26)',
  kindness: 'rgba(207,144,135,0.24)',
  sleep: 'rgba(39,80,95,0.34)',
};

// 汉字符号沿用首页四条小径那套写法
const CATEGORY_GLYPH: Record<string, string> = {
  'walk-in': '入', 'mindful-life': '常', 'emotion': '绪',
  'self-care': '柔', 'inner-freedom': '松', 'sleep': '眠',
};

function CategoryHero({ category, count }: { category: MeditationCategory; count: number }) {
  const aura = MOOD_AURA[category.mood || 'forest'];
  return (
    <section className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 right-[-12%] h-[420px] w-[620px] rounded-full blur-[110px] max-md:hidden"
        style={{ background: `radial-gradient(circle, ${aura}, transparent 70%)` }}
      />
      <div className="relative max-w-[720px]">
        <div
          className="text-[1.7rem] text-white/70"
          style={{ fontFamily: 'var(--font-serif)' }}
          aria-hidden="true"
        >
          {CATEGORY_GLYPH[category.id] || '声'}
        </div>
        <h1
          className="mt-5 text-[clamp(2rem,4.4vw,3.1rem)] font-medium leading-[1.2] tracking-[-0.03em] text-white"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          {category.heroTitle || category.label}
        </h1>
        <p className="mt-6 max-w-[560px] text-[15px] leading-[2] text-white/58">
          {category.heroSubtitle || category.description}
        </p>
        <div className="mt-8 flex items-center gap-4 text-[12.5px] text-white/38">
          <span className="h-px w-10 bg-white/20" />
          <span>{count > 0 ? `${count} 段声音` : '声音开放中'}</span>
        </div>
      </div>
    </section>
  );
}
