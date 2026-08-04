import Link from 'next/link';
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

// 纸底上不铺整块渐变——那会把版面压得很闷。
// 每条小径只留一点自己的颜色：汉字符号和顶端那道细线。
const MOOD_INK: Record<TrackMood, { text: string; rule: string; tint: string }> = {
  forest: { text: '#3f6350', rule: '#6b8f5e', tint: 'rgba(107,143,94,0.07)' },
  daily: { text: '#3d6070', rule: '#7ba7bc', tint: 'rgba(123,167,188,0.07)' },
  emotion: { text: '#465a72', rule: '#738faa', tint: 'rgba(115,143,170,0.07)' },
  care: { text: '#8a5a41', rule: '#dcaf96', tint: 'rgba(220,175,150,0.09)' },
  healing: { text: '#4a6440', rule: '#8fb573', tint: 'rgba(143,181,115,0.08)' },
  body: { text: '#4a5c56', rule: '#8aa09a', tint: 'rgba(138,160,154,0.08)' },
  kindness: { text: '#8b504c', rule: '#cf9087', tint: 'rgba(207,144,135,0.08)' },
  sleep: { text: '#2f4654', rule: '#4a6b7d', tint: 'rgba(74,107,125,0.08)' },
};

// 汉字符号沿用首页四条小径那套：一个字概括这条路在做什么
const GLYPH: Record<string, string> = {
  'walk-in': '入', 'mindful-life': '常', 'emotion': '绪',
  'self-care': '柔', 'inner-freedom': '松', 'sleep': '眠', 'ambient': '声',
};

export default function MeditationGrove({ content, counts }: Props) {
  return (
    <div className="mx-auto max-w-[1080px]">
      <header className="mb-16 max-w-[760px] max-md:mb-10">
        <p className="mb-4 text-[12px] font-bold uppercase tracking-[0.2em] text-forest">
          Sounds of the Forest
        </p>
        <h1
          className="text-[clamp(2rem,4.2vw,3.2rem)] font-medium leading-[1.22] tracking-[-0.03em] text-ink"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          {content.title.replace(/\n/g, '')}
        </h1>
        <p className="mt-7 max-w-[560px] text-[15px] leading-[2] text-ink-soft">
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
              <div className="mb-7 flex items-baseline gap-4 border-b border-forest/[0.12] pb-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-forest">
                  {group.eyebrow}
                </p>
                <h2 className="text-[1.15rem] font-semibold text-ink">{group.title}</h2>
                <p className="ml-auto text-[12.5px] text-ink-soft max-md:hidden">{group.note}</p>
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
  const ink = MOOD_INK[category.mood || 'forest'];
  const glyph = GLYPH[category.id] || '声';

  return (
    <Link
      href={`/meditations?category=${encodeURIComponent(category.id)}`}
      className={`group relative flex flex-col overflow-hidden rounded-[26px] border border-forest-deep/[0.10] bg-white/72 no-underline transition-all duration-300 hover:-translate-y-1 hover:border-forest-deep/20 hover:bg-white/90 hover:shadow-[0_18px_44px_rgba(42,59,47,0.09)] ${
        wide ? 'p-9 max-md:p-7' : 'p-8 max-md:p-7'
      }`}
      style={{ backgroundImage: `linear-gradient(160deg, ${ink.tint}, transparent 62%)` }}
    >
      {/* 顶端那道细线是这条小径唯一的颜色标记 */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[3px] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: ink.rule }}
      />

      <div className={`flex h-full ${wide ? 'items-end gap-10 max-md:flex-col max-md:items-start max-md:gap-6' : 'flex-col'}`}>
        <div className={wide ? 'flex-1' : 'flex-1'}>
          <div
            className="text-[1.6rem]"
            style={{ fontFamily: 'var(--font-serif)', color: ink.text }}
            aria-hidden="true"
          >
            {glyph}
          </div>

          <h3
            className={`mt-4 font-semibold tracking-[-0.02em] text-forest-deep ${
              wide ? 'text-[clamp(1.5rem,2.6vw,2rem)]' : 'text-[1.25rem]'
            }`}
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {category.label}
          </h3>

          {/* 陪伴营把金句露出来——那是它最该被看见的一句 */}
          {wide && category.highlight && (
            <p className="mt-3 max-w-[560px] text-[15px] font-medium leading-[1.75] text-forest">
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
        </div>

        <div className={`flex items-center gap-3 ${wide ? 'shrink-0' : 'mt-7'}`}>
          <span className="rounded-full border border-forest/15 bg-white/70 px-3.5 py-1.5 text-[12px] font-medium text-forest">
            {count > 0 ? `${count} 段声音` : '声音开放中'}
          </span>
          <span
            aria-hidden="true"
            className="text-[13px] text-forest-mid transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          >
            ↗
          </span>
        </div>
      </div>
    </Link>
  );
}
