import Link from 'next/link';
import Nav from '@/components/Nav';
import MeditationTrackCard from '@/components/MeditationTrackCard';
import MeditationProgram from '@/components/MeditationProgram';
import MeditationAmbient from '@/components/MeditationAmbient';
import MeditationGrove from '@/components/MeditationGrove';
import { isAdminId } from '@/lib/admin';
import { fetchNoteCounts } from '@/lib/meditationNotes';
import { findLatestOrder } from '@/lib/programOrders';
import { getAuthenticatedMemberId } from '@/lib/session';
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
  const [{ category }, rawContent, memberId] = await Promise.all([
    searchParams,
    fetchMeditationContent(),
    getAuthenticatedMemberId(),
  ]);
  const isAdmin = isAdminId(memberId);

  // 音频「在哪」在这里就全部摘掉，只留「有没有」——播放统一走 stream 路由
  const paidPrograms = await fetchPaidPrograms(memberId);
  const content = prepareClientContent(rawContent);

  // 不带 category（或给了个不存在的）就展示声音林。
  // 原来会默默落到第一个分类——进门就被塞进一条小径，看不到还有哪些路。
  const activeCategory = category
    ? content.categories.find(item => item.id === category)
    : undefined;

  // 「已经能听了，但主理人还没核对」这一档要说出来：页面一下全开，
  // 人反而会以为流程走完了，忘了自己那笔转账还等着对账。
  const activeOrder =
    memberId && activeCategory?.kind === 'program'
      ? await findLatestOrder(memberId, activeCategory.id)
      : null;
  // 只在「权限真的先开了」时才说这句话——被驳回过的那一档还没开，
  // 那种情况面板会自己走「等主理人确认」的分支。
  const claimPendingProgram =
    activeOrder &&
    activeOrder.status === 'pending' &&
    activeOrder.claimedAt &&
    !activeOrder.judgedBefore
      ? activeOrder.programId
      : '';

  if (!activeCategory) {
    const trackCounts: Record<string, number> = {};
    for (const t of content.tracks) {
      trackCounts[t.categoryId] = (trackCounts[t.categoryId] || 0) + 1;
    }
    return (
      <>
        <Nav />
        <main className="relative min-h-screen overflow-hidden bg-[#eef3ea] px-8 pb-28 pt-32 text-ink max-md:px-7 max-md:pt-28">
          <ForestLight />
          <div className="relative">
            <div className="mx-auto mb-12 flex max-w-[1080px] items-center justify-between gap-4">
              <Link
                href="/"
                className="text-sm text-ink-soft underline-offset-4 transition-colors hover:text-forest"
              >
                ← 回到首页
              </Link>
              {isAdmin && (
                <Link
                  href="/meditations/admin"
                  className="rounded-full border border-forest/15 bg-white/70 px-4 py-2 text-sm font-medium text-forest no-underline transition-colors hover:bg-white"
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
  const kind = activeCategory.kind || 'guided';
  const isProgram = kind === 'program';
  const isAmbient = kind === 'ambient';
  // 一次把当前分类所有段落的感悟条数取回来，省掉一段一次的往返
  const noteCounts = await fetchNoteCounts(tracks.map(t => t.id));

  return (
    <>
      <Nav />
      {/*
        深色只留给睡眠陪伴营——那是关了灯、躺下之后用的。
        其余（声音林、引导冥想、纯声音）走首页那套纸感底：干净、清爽、林中漫步。
      */}
      <main
        className={`relative min-h-screen overflow-hidden px-8 pb-24 pt-32 max-md:px-7 max-md:pt-28 ${
          isProgram ? 'bg-[#0f1411] text-white' : 'bg-[#eef3ea] text-ink'
        }`}
      >
        {isProgram ? (
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(160deg,rgba(255,255,255,0.055),transparent_44%,rgba(232,201,160,0.05))]" />
        ) : (
          <ForestLight />
        )}

        <div className="relative mx-auto max-w-[1120px]">
          <div className="mb-12 flex items-center justify-between gap-4">
            <Link
              href="/meditations"
              className={`text-sm underline-offset-4 transition-colors ${
                isProgram ? 'text-white/42 hover:text-white' : 'text-ink-soft hover:text-forest'
              }`}
            >
              ← 所有声音
            </Link>
            {isAdmin && (
              <div className="flex items-center gap-2.5">
                {/* 开通确认只对陪伴营有意义，别的分类不放这个入口 */}
                {isProgram && (
                  <Link
                    href="/meditations/orders"
                    className="rounded-full border border-coral-soft/35 bg-coral-soft/12 px-4 py-2 text-sm font-medium text-coral-soft no-underline transition-colors hover:bg-coral-soft/20"
                  >
                    开通确认
                  </Link>
                )}
                <Link
                  href="/meditations/admin"
                  className={`rounded-full border px-4 py-2 text-sm font-medium no-underline transition-colors ${
                    isProgram
                      ? 'border-white/14 bg-white/[0.055] text-white/62 hover:bg-white/10 hover:text-white'
                      : 'border-forest/15 bg-white/70 text-forest hover:bg-white'
                  }`}
                >
                  管理冥想
                </Link>
              </div>
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
              <p
                className={`mb-4 text-[11px] font-bold uppercase tracking-[0.2em] max-lg:hidden ${
                  isProgram ? 'text-white/28' : 'text-forest/45'
                }`}
              >
                Other Paths
              </p>
              <div className="flex flex-col gap-0.5 max-lg:flex-row max-lg:gap-2 max-lg:pb-2">
                {content.categories.map(categoryItem => {
                  const active = categoryItem.id === activeCategoryId;
                  const dark = isProgram;
                  return (
                    <Link
                      key={categoryItem.id}
                      href={`/meditations?category=${encodeURIComponent(categoryItem.id)}`}
                      aria-current={active ? 'page' : undefined}
                      className={`min-w-fit border-l-2 py-2.5 pl-4 text-[14px] no-underline transition-colors max-lg:rounded-full max-lg:border-l-0 max-lg:border max-lg:px-4 max-lg:py-2 ${
                        active
                          ? dark
                            ? 'border-coral-soft font-medium text-white max-lg:border-white max-lg:bg-white max-lg:text-[#111512]'
                            : 'border-clay font-medium text-forest-deep max-lg:border-forest max-lg:bg-forest max-lg:text-white'
                          : dark
                            ? 'border-white/10 text-white/48 hover:border-white/35 hover:text-white max-lg:border-white/12 max-lg:bg-white/[0.045]'
                            : 'border-forest/12 text-ink-soft hover:border-forest/40 hover:text-forest-deep max-lg:border-forest/12 max-lg:bg-white/60'
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
                claimPending={claimPendingProgram === activeCategory.id}
                noteCounts={noteCounts}
                loggedIn={Boolean(memberId)}
              />
            ) : isAmbient ? (
              <MeditationAmbient
                content={content}
                category={activeCategory}
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
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-forest/45">
                Listen
              </p>
              <h2
                className="text-[1.5rem] font-semibold tracking-[-0.02em] text-ink"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                具体的声音
              </h2>
            </div>

            {tracks.length === 1 ? (
              /*
                只有一段的时候不要塞进网格：一张竖卡站在三分之一格里，
                右边整片空白，看着像是加载失败。横版把这一行用满。
                宽度收在 760px 以内，否则大屏上一行正文会长到读不下去。
              */
              <div className="max-w-[760px]">
                <MeditationTrackCard
                  track={tracks[0]}
                  layout="wide"
                  showAudio
                  loggedIn={Boolean(memberId)}
                  noteCount={noteCounts[tracks[0].id] || 0}
                />
              </div>
            ) : tracks.length > 0 ? (
              /*
                列数跟着实际有几段走，别让最后一行留下空格子。
                手机上一律单列——两列的话每行只剩十个字，中文根本读不成句。
              */
              <div
                className={`grid gap-8 max-[420px]:gap-5 ${
                  tracks.length === 2
                    ? 'sm:grid-cols-2'
                    : 'sm:grid-cols-2 xl:grid-cols-3'
                }`}
              >
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
              <div className="rounded-2xl border border-forest/12 bg-white/60 px-6 py-10 text-ink-soft">
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

/**
 * 林间晨光 —— 浅色页面的底。
 *
 * 试过首页那套暖纸底，不搭：纸感是「文档」的气质，而这里要的是森林、
 * 呼吸、林中漫步。所以换成偏冷的淡绿，光从上方透下来，
 * 两侧各留一点雾。干净、清爽，但不至于像一张白纸。
 */
function ForestLight() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        background: [
          'radial-gradient(ellipse 130% 55% at 50% -8%, rgba(255,255,255,0.92), transparent 62%)',
          'radial-gradient(circle at 10% 16%, rgba(168,201,160,0.20), transparent 32%)',
          'radial-gradient(circle at 90% 6%, rgba(212,228,207,0.34), transparent 30%)',
          'linear-gradient(180deg, #eff4ec 0%, #e8efe5 100%)',
        ].join(','),
      }}
    />
  );
}

function CategoryNotes({ category }: { category: MeditationCategory }) {
  const benefits = (category.benefits || []).filter(Boolean);
  const hasNotes = Boolean(category.sourceNote || category.featureNote || benefits.length);
  if (!hasNotes) return null;

  return (
    <section className="mb-10 border-y border-forest/[0.12] py-7">
      <div className="grid grid-cols-[1.1fr_0.9fr] gap-8 max-md:grid-cols-1 max-md:gap-6">
        <div>
          <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-clay">
            来源与特色
          </div>
          {category.sourceNote && (
            <p className="text-[14px] leading-[2] text-ink-soft">
              {category.sourceNote}
            </p>
          )}
          {category.featureNote && (
            <p className="mt-4 text-[14px] leading-[2] text-ink-soft/85">
              {category.featureNote}
            </p>
          )}
        </div>

        {benefits.length > 0 && (
          <div>
            <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-forest/45">
              可能带来的变化
            </div>
            <div className="flex flex-wrap gap-2.5">
              {benefits.map(benefit => (
                <span
                  key={benefit}
                  className="rounded-full border border-forest/12 bg-white/70 px-4 py-2 text-[13px] text-forest"
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
// 让位置留给标题本身。纸底上要更淡，否则会脏。
const MOOD_AURA: Record<TrackMood, string> = {
  forest: 'rgba(107,143,94,0.20)',
  daily: 'rgba(123,167,188,0.18)',
  emotion: 'rgba(115,143,170,0.18)',
  care: 'rgba(220,175,150,0.20)',
  healing: 'rgba(143,181,115,0.18)',
  body: 'rgba(138,160,154,0.18)',
  kindness: 'rgba(207,144,135,0.18)',
  sleep: 'rgba(39,80,95,0.34)',
};

const MOOD_GLYPH_INK: Record<TrackMood, string> = {
  forest: '#3f6350', daily: '#3d6070', emotion: '#465a72', care: '#8a5a41',
  healing: '#4a6440', body: '#4a5c56', kindness: '#8b504c', sleep: '#2f4654',
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
          className="text-[1.7rem]"
          style={{
            fontFamily: 'var(--font-serif)',
            color: MOOD_GLYPH_INK[category.mood || 'forest'],
          }}
          aria-hidden="true"
        >
          {CATEGORY_GLYPH[category.id] || '声'}
        </div>
        <h1
          className="mt-5 text-[clamp(2rem,4.4vw,3.1rem)] font-medium leading-[1.2] tracking-[-0.03em] text-ink"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          {category.heroTitle || category.label}
        </h1>
        <p className="mt-6 max-w-[560px] text-[15px] leading-[2] text-ink-soft">
          {category.heroSubtitle || category.description}
        </p>
        <div className="mt-8 flex items-center gap-4 text-[12.5px] text-ink-soft">
          <span className="h-px w-10 bg-forest/20" />
          <span>{count > 0 ? `${count} 段声音` : '声音开放中'}</span>
        </div>
      </div>
    </section>
  );
}
