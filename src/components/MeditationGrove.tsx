import Link from 'next/link';
import type { MeditationCategory, MeditationContent, MeditationKind, TrackMood } from '@/lib/meditations';

/**
 * 声音林 —— /meditations 不带参数时的列表页。
 *
 * 原来进来直接落到第一个分类，侧栏是一列胶囊筛选器——那是仪表盘的逻辑。
 * 这里改成把所有小径摊开，按形态分组，让人先看见全貌再挑一条走进去。
 * 版式语言对齐首页那组入口卡：衬线标题、大圆角、留白、汉字符号。
 */

type Props = {
  content: MeditationContent;
  counts: Record<string, number>;
};

const KIND_GROUPS: { kind: MeditationKind; eyebrow: string; title: string; note: string }[] = [
  {
    kind: 'guided',
    eyebrow: 'Guided',
    title: '引导冥想',
    note: '有人声带着走。随时挑一段，按自己的节奏听。',
  },
  {
    kind: 'program',
    eyebrow: 'Program',
    title: '陪伴营',
    note: '有次序的一整段旅程。一周一周走，不急着走完。',
  },
  {
    kind: 'ambient',
    eyebrow: 'Ambient',
    title: '纯声音',
    note: '没有引导。手碟、颂钵、雨声，放着就好。',
  },
];

// 每条小径的底色。深色底上的渐变要压得住，所以都从暗处起，向远处的光收。
const MOOD_WASH: Record<TrackMood, string> = {
  forest: 'from-[#16281f] via-[#3d5a49] to-[#8fa189]',
  daily: 'from-[#16232b] via-[#3c5a68] to-[#93a7ac]',
  emotion: 'from-[#1a2330] via-[#42566e] to-[#95a2b0]',
  care: 'from-[#2b1f1a] via-[#6b4c3c] to-[#c3a88f]',
  healing: 'from-[#18251a] via-[#425a3c] to-[#9aa88a]',
  body: 'from-[#1b2422] via-[#41544f] to-[#95a29b]',
  kindness: 'from-[#2a1c1c] via-[#6b4344] to-[#c29a94]',
  sleep: 'from-[#05080d] via-[#1b3644] to-[#6d8590]',
};

// 汉字符号沿用首页四条小径那套：一个字概括这条路在做什么
const GLYPH: Record<string, string> = {
  'walk-in': '入', 'mindful-life': '常', 'emotion': '绪',
  'self-care': '柔', 'inner-freedom': '松', 'sleep': '眠',
};

export default function MeditationGrove({ content, counts }: Props) {
  return (
    <div className="mx-auto max-w-[1080px]">
      <header className="mb-16 max-w-[760px] max-md:mb-10">
        <p className="mb-4 text-[12px] font-bold uppercase tracking-[0.2em] text-coral-soft">
          Sounds of the Forest
        </p>
        <h1
          className="text-[clamp(2rem,4.2vw,3.2rem)] font-medium leading-[1.22] tracking-[-0.03em] text-white"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          {content.title.replace(/\n/g, '')}
        </h1>
        <p className="mt-7 max-w-[560px] text-[15px] leading-[2] text-white/52">
          {content.description}
        </p>
      </header>

      <div className="flex flex-col gap-16 max-md:gap-12">
        {KIND_GROUPS.map(group => {
          const items = content.categories.filter(c => (c.kind || 'guided') === group.kind);
          // 还没有内容的那一组先不出现，免得摆一排空位
          if (items.length === 0) return null;
          return (
            <section key={group.kind}>
              <div className="mb-7 flex items-baseline gap-4 border-b border-white/[0.08] pb-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-coral-soft">
                  {group.eyebrow}
                </p>
                <h2 className="text-[1.15rem] font-semibold text-white">{group.title}</h2>
                <p className="ml-auto text-[12.5px] text-white/38 max-md:hidden">{group.note}</p>
              </div>

              <div
                className={
                  group.kind === 'program'
                    ? 'grid grid-cols-1 gap-5'
                    : 'grid grid-cols-3 gap-5 max-lg:grid-cols-2 max-md:grid-cols-1'
                }
              >
                {items.map(category => (
                  <PathCard
                    key={category.id}
                    category={category}
                    count={counts[category.id] || 0}
                    wide={group.kind === 'program'}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function PathCard({
  category, count, wide,
}: {
  category: MeditationCategory;
  count: number;
  wide: boolean;
}) {
  const mood = category.mood || 'forest';
  const glyph = GLYPH[category.id] || '声';

  return (
    <Link
      href={`/meditations?category=${encodeURIComponent(category.id)}`}
      className={`group relative overflow-hidden rounded-[26px] border border-white/[0.12] bg-gradient-to-br no-underline transition-all duration-300 hover:-translate-y-1 hover:border-white/25 hover:shadow-[0_20px_50px_rgba(0,0,0,0.3)] ${MOOD_WASH[mood]} ${
        wide ? 'p-9 max-md:p-7' : 'p-8 max-md:p-7'
      }`}
    >
      {/* 一层暗罩，保证文字在任何渐变上都读得清 */}
      <div className="absolute inset-0 bg-[linear-gradient(155deg,rgba(6,10,8,0.34)_0%,rgba(6,10,8,0.62)_100%)]" />

      <div className={`relative flex h-full ${wide ? 'items-end gap-10 max-md:flex-col max-md:items-start max-md:gap-6' : 'flex-col'}`}>
        <div className={wide ? 'flex-1' : ''}>
          <div
            className="text-[1.6rem] text-white/78"
            style={{ fontFamily: 'var(--font-serif)' }}
            aria-hidden="true"
          >
            {glyph}
          </div>

          <h3
            className={`mt-4 font-medium tracking-[-0.02em] text-white ${
              wide ? 'text-[clamp(1.5rem,2.6vw,2rem)]' : 'text-[1.35rem]'
            }`}
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {category.label}
          </h3>

          {/* 陪伴营把金句露出来——那是它最该被看见的一句 */}
          {wide && category.highlight && (
            <p className="mt-3 max-w-[520px] text-[14.5px] font-medium leading-[1.75] text-white/82">
              {category.highlight}
            </p>
          )}

          {/*
            描述是后台自由填的，长短差得很远——「内在整合」那条能到十几行，
            会把同一行的卡片全撑高。所以截到三行，长的收住、短的也占同样高度。
          */}
          <p
            className={`mt-3 leading-[1.85] text-white/62 ${wide ? 'text-[13px]' : 'text-[13.5px] min-h-[5.6em]'}`}
            style={wide ? undefined : {
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {category.description}
          </p>
        </div>

        <div className={`flex items-center gap-3 ${wide ? 'shrink-0' : 'mt-7'}`}>
          <span className="rounded-full border border-white/22 bg-white/12 px-3.5 py-1.5 text-[12px] text-white/82 backdrop-blur-sm">
            {count > 0 ? `${count} 段声音` : '声音开放中'}
          </span>
          <span
            aria-hidden="true"
            className="text-[13px] text-white/58 transition-transform group-hover:translate-x-0.5"
          >
            ↗
          </span>
        </div>
      </div>
    </Link>
  );
}
