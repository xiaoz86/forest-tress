import Link from 'next/link';
import type { Dictionary } from '@/i18n';
import type { MeditationCategory, MeditationContent, MeditationKind, TrackMood } from '@/lib/meditations';

/**
 * 声音林 —— /meditations 不带参数时的列表页。
 *
 * 原来进来直接落到第一个分类，侧栏是一列胶囊筛选器——那是仪表盘的逻辑。
 * 这里改成把所有小径摊开，按形态分组，让人先看见全貌再挑一条走进去。
 * 版式和用色都对齐首页那组入口卡：纸感底、衬线标题、大圆角、汉字符号。
 */

type Props = {
  content: MeditationContent;
  counts: Record<string, number>;
  /** 页面框架的文案。分类名和音频标题来自 content，那些存在库里，翻不了。 */
  t: Dictionary['meditations'];
};

/** 三组的文字跟着字典走；kind 是代码里的分组键，不显示给人看。 */
function kindGroups(t: Dictionary['meditations']) {
  return [
    { kind: 'guided' as MeditationKind, ...t.grove.guided },
    { kind: 'program' as MeditationKind, ...t.grove.program },
    { kind: 'ambient' as MeditationKind, ...t.grove.ambient },
    { kind: 'film' as MeditationKind, ...t.grove.film },
  ];
}

/**
 * 每条小径自己的光。
 *
 * 上一版把透明度压到 0.07，结果三张卡看上去一模一样——「跟着主题走」
 * 等于没做。现在给到能一眼分出来的程度：一片光从左上角斜下来，
 * 到六成处散尽。深墨的字压在最淡的那一端，所以照样读得清。
 *
 * 想的是同一片林子里不同位置的光：苔绿、晨蓝、雾灰、午后的暖、夜里的深。
 */
const MOOD_INK: Record<TrackMood, { text: string; rule: string; wash: string }> = {
  forest: {
    text: '#33604a', rule: '#6b8f5e',
    wash: 'linear-gradient(152deg, rgba(122,166,112,0.30) 0%, rgba(168,201,160,0.13) 40%, transparent 70%)',
  },
  daily: {
    text: '#2f5c70', rule: '#7ba7bc',
    wash: 'linear-gradient(152deg, rgba(118,171,196,0.30) 0%, rgba(180,212,224,0.13) 40%, transparent 70%)',
  },
  emotion: {
    text: '#3b5170', rule: '#738faa',
    wash: 'linear-gradient(152deg, rgba(112,142,178,0.28) 0%, rgba(178,196,218,0.12) 40%, transparent 70%)',
  },
  care: {
    text: '#8a5334', rule: '#dcaf96',
    wash: 'linear-gradient(152deg, rgba(226,169,132,0.34) 0%, rgba(240,212,190,0.14) 40%, transparent 70%)',
  },
  healing: {
    text: '#41652f', rule: '#8fb573',
    wash: 'linear-gradient(152deg, rgba(150,190,116,0.30) 0%, rgba(196,220,172,0.13) 40%, transparent 70%)',
  },
  body: {
    text: '#3f5b53', rule: '#8aa09a',
    wash: 'linear-gradient(152deg, rgba(126,160,150,0.30) 0%, rgba(184,206,198,0.13) 40%, transparent 70%)',
  },
  kindness: {
    text: '#8b4644', rule: '#cf9087',
    wash: 'linear-gradient(152deg, rgba(212,138,128,0.30) 0%, rgba(236,196,188,0.13) 40%, transparent 70%)',
  },
  sleep: {
    text: '#26485c', rule: '#4a6b7d',
    wash: 'linear-gradient(152deg, rgba(58,102,126,0.34) 0%, rgba(140,176,192,0.15) 40%, transparent 72%)',
  },
};

// 汉字符号沿用首页四条小径那套：一个字概括这条路在做什么
const GLYPH: Record<string, string> = {
  'walk-in': '入', 'mindful-life': '常', 'emotion': '绪',
  'self-care': '柔', 'inner-freedom': '松', 'sleep': '眠', 'ambient': '声',
  // 物候——二十四节气看的就是草木鸟兽随时序变化的那些迹象
  'solar-terms': '候',
};

export default function MeditationGrove({ content, counts, t }: Props) {
  return (
    <div className="mx-auto max-w-[1080px]">
      <header className="mb-16 max-w-[760px] max-md:mb-10">
        <p className="mb-4 text-[12px] font-bold uppercase tracking-[0.2em] text-forest">
          {t.grove.eyebrow}
        </p>
        <h1
          className="text-[clamp(2rem,4.2vw,3.2rem)] font-normal leading-[1.22] tracking-[-0.03em] text-ink"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          {content.title.replace(/\n/g, '')}
        </h1>
        <p className="mt-7 max-w-[560px] text-[16px] leading-[2] text-ink-soft">
          {content.description}
        </p>
      </header>

      <div className="flex flex-col gap-16 max-md:gap-12">
        {kindGroups(t).map(group => {
          const items = content.categories.filter(c => (c.kind || 'guided') === group.kind);
          // 还没有内容的那一组先不出现，免得摆一排空位
          if (items.length === 0) return null;
          return (
            <section key={group.kind}>
              <div className="mb-7 flex items-baseline gap-4 border-b border-forest/[0.12] pb-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-forest">
                  {group.eyebrow}
                </p>
                <h2 className="text-[1.15rem] font-normal text-ink">{group.title}</h2>
                <p className="ml-auto text-[12.5px] text-ink-soft max-md:hidden">{group.note}</p>
              </div>

              {/*
                只有一条的时候用宽卡。三列格子里孤零零摆一张、右边空掉三分之二，
                看着像出了错——纯声音、睡眠系列就是这个情况：它们本来就是
                「一整件东西」，占满一行是对的。

                「看见」是例外，永远走网格。它是一个会长出很多专题的模块
                （人物、自然、练习、创作、节气、社区纪录），拿宽卡去撑，
                等于把此刻唯一的那个专题说成整个模块本身；右边再压一张
                影片封面，就更像「这里有个视频」而不是「这里有一扇窗」。
                空着的两格是诚实的：那是还没长出来的位置。
              */}
              {(() => {
                const wide = group.kind !== 'film' && items.length === 1;
                return (
                  <div
                    className={
                      wide
                        ? 'grid grid-cols-1 gap-5'
                        : 'grid grid-cols-3 gap-5 max-lg:grid-cols-2 max-md:grid-cols-1'
                    }
                  >
                    {items.map(category => (
                      <PathCard
                        key={category.id}
                        category={category}
                        count={counts[category.id] || 0}
                        wide={wide}
                        t={t}
                      />
                    ))}
                  </div>
                );
              })()}
            </section>
          );
        })}
      </div>
    </div>
  );
}

// 没上封面时的兜底底色。原来写死成睡眠那套夜空——挂到纯声音上就不对了，
// 所以改成跟着各自的主题走，和卡片正面是同一族颜色。
const COVER_FALLBACK: Record<TrackMood, string> = {
  forest: 'linear-gradient(165deg,#1d3529 0%,#3f6350 52%,#93a98c 100%)',
  daily: 'linear-gradient(165deg,#1b2f3a 0%,#3d6070 52%,#9db8c4 100%)',
  emotion: 'linear-gradient(165deg,#20293a 0%,#465a72 52%,#a3b2c4 100%)',
  care: 'linear-gradient(165deg,#3a2418 0%,#8a5334 52%,#dcbba0 100%)',
  healing: 'linear-gradient(165deg,#1e3319 0%,#41652f 52%,#a8c295 100%)',
  body: 'linear-gradient(165deg,#1e2b27 0%,#3f5b53 52%,#a0b3ab 100%)',
  kindness: 'linear-gradient(165deg,#3a1e1d 0%,#8b4644 52%,#d8aaa4 100%)',
  sleep: 'linear-gradient(180deg,#04060a 0%,#04060a 52%,#0d1c24 58%,#1b333f 82%,#2a4b59 100%)',
};

/** 宽卡右侧的封面。没上传图时用同主题的渐变顶着，不留白块。 */
function WideCover({ category }: { category: MeditationCategory }) {
  const mood = category.mood || 'forest';
  const base = 'relative w-[240px] shrink-0 aspect-square overflow-hidden rounded-[20px] border border-forest-deep/[0.08] shadow-[0_10px_30px_rgba(42,59,47,0.10)] max-lg:w-[180px] max-md:w-[140px]';

  if (category.coverUrl) {
    return (
      <div className={base}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={category.coverUrl} alt="" className="h-full w-full object-cover" />
      </div>
    );
  }

  return (
    <div className={base} style={{ background: COVER_FALLBACK[mood] }}>
      {/* 睡眠那条留着弦月——封面照片就是这个意象，没图时也别丢了 */}
      {mood === 'sleep' && (
        <span className="absolute left-[54%] top-[30%] aspect-square w-[26%] rounded-full bg-[#f2ead6] shadow-[0_0_22px_rgba(242,234,214,0.32)]">
          <span className="absolute inset-0 translate-x-[-28%] translate-y-[-13%] rounded-full bg-[#04060a]" />
        </span>
      )}
    </div>
  );
}

function PathCard({
  category, count, wide, t,
}: {
  category: MeditationCategory;
  count: number;
  wide: boolean;
  t: Dictionary['meditations'];
}) {
  const ink = MOOD_INK[category.mood || 'forest'];
  const glyph = GLYPH[category.id] || '声';
  // 影像论「支」不论「段」。用一句话顶着两种量词会两边都别扭。
  const isFilm = (category.kind || 'guided') === 'film';

  return (
    <Link
      href={`/meditations?category=${encodeURIComponent(category.id)}`}
      className={`group relative flex flex-col overflow-hidden rounded-[26px] border border-forest-deep/[0.10] bg-white/72 no-underline transition-all duration-300 hover:-translate-y-1 hover:border-forest-deep/20 hover:bg-white/90 hover:shadow-[0_18px_44px_rgba(42,59,47,0.09)] ${
        wide ? 'p-9 max-md:p-7' : 'p-8 max-md:p-7'
      }`}
      style={{ backgroundImage: ink.wash }}
    >
      {/* 顶端那道细线是这条小径唯一的颜色标记 */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[3px] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: ink.rule }}
      />

      <div className={`flex h-full ${wide ? 'items-center gap-10 max-md:flex-col-reverse max-md:items-start max-md:gap-6' : 'flex-col'}`}>
        <div className="flex-1">
          <div
            className="text-[1.6rem] font-normal"
            style={{ fontFamily: 'var(--font-serif)', color: ink.text }}
            aria-hidden="true"
          >
            {glyph}
          </div>

          <h3
            className={`mt-4 font-normal tracking-[-0.02em] text-forest-deep ${
              wide ? 'text-[clamp(1.5rem,2.6vw,2rem)]' : 'text-[1.25rem]'
            }`}
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {category.label}
          </h3>

          {/* 陪伴营把金句露出来——那是它最该被看见的一句 */}
          {wide && category.highlight && (
            <p className="mt-3 max-w-[560px] text-[16px] font-medium leading-[1.75] text-forest">
              {category.highlight}
            </p>
          )}

          {/*
            描述是后台自由填的，长短差得很远——「内在整合」那条能到十几行，
            会把同一行的卡片全撑高。所以截到三行。
          */}
          <p
            className={`mt-3 leading-[1.85] text-ink-soft ${wide ? 'text-[13px]' : 'text-[13.5px] min-h-[5.6em]'}`}
            style={wide ? undefined : {
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {category.description}
          </p>

          <div className="mt-7 flex items-center gap-3">
            <span className="rounded-full border border-forest/15 bg-white/70 px-3.5 py-1.5 text-[12px] font-medium text-forest">
              {count > 0
                ? (isFilm ? t.filmCount(count) : t.soundCount(count))
                : (isFilm ? t.filmsComing : t.soundsComing)}
            </span>
            <span
              aria-hidden="true"
              className="text-[13px] text-forest-mid transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            >
              ↗
            </span>
          </div>
        </div>

        {/*
          宽卡右边原来是一大片空白：文字只占一半，一个小胶囊挂在最右下角。
          把封面放进来填上——陪伴营本来就有封面，没上传时是同色调的渐变。
        */}
        {wide && <WideCover category={category} />}
      </div>
    </Link>
  );
}
