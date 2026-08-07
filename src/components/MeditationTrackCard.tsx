import Link from 'next/link';
import TrackAudioPanel from '@/components/TrackAudioPanel';
import type { MeditationTrack, TrackMood } from '@/lib/meditations';

type Props = {
  track: MeditationTrack;
  href?: string;
  showAudio?: boolean;
  showDescription?: boolean;
  /** 只在 showAudio 时用得上：决定能不能写感悟、已有几条 */
  loggedIn?: boolean;
  noteCount?: number;
  /**
   * grid = 网格里的竖版（封面在上、文字在下）。
   * wide = 独占一行的横版（封面在左、文字在右）：一条小径下面只有一两段声音时，
   *        竖版会孤零零站在一格里、右边整片空白，横版才把那行宽度用起来。
   */
  layout?: 'grid' | 'wide';
};

const TRACK_VISUALS: Record<TrackMood, { cover: string; dot: string; shade: string }> = {
  forest: {
    cover: 'bg-[linear-gradient(135deg,#5f7f78_0%,#9fb4b0_48%,#d7c9b5_100%)]',
    dot: 'bg-leaf',
    shade: 'bg-[radial-gradient(circle_at_24%_18%,rgba(255,255,255,0.24),transparent_32%),linear-gradient(180deg,transparent_0%,rgba(6,20,12,0.28)_100%)]',
  },
  daily: {
    cover: 'bg-[linear-gradient(135deg,#7ab6cf_0%,#b8d4df_48%,#e9dfca_100%)]',
    dot: 'bg-sky',
    shade: 'bg-[radial-gradient(circle_at_72%_24%,rgba(255,255,255,0.28),transparent_30%),linear-gradient(180deg,transparent_0%,rgba(8,24,32,0.22)_100%)]',
  },
  emotion: {
    cover: 'bg-[linear-gradient(135deg,#7d9ab8_0%,#b8c7d4_52%,#e6d7d0_100%)]',
    dot: 'bg-coral-soft',
    shade: 'bg-[radial-gradient(circle_at_24%_22%,rgba(255,255,255,0.22),transparent_34%),linear-gradient(180deg,transparent_0%,rgba(11,24,36,0.25)_100%)]',
  },
  care: {
    cover: 'bg-[linear-gradient(135deg,#e4bea6_0%,#ead8c8_45%,#c7d8ce_100%)]',
    dot: 'bg-coral-soft',
    shade: 'bg-[radial-gradient(circle_at_30%_24%,rgba(255,255,255,0.26),transparent_32%),linear-gradient(180deg,transparent_0%,rgba(50,24,14,0.18)_100%)]',
  },
  healing: {
    cover: 'bg-[linear-gradient(135deg,#879f7a_0%,#bdccb3_48%,#e7dcc8_100%)]',
    dot: 'bg-leaf',
    shade: 'bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.22),transparent_30%),linear-gradient(180deg,transparent_0%,rgba(19,43,22,0.25)_100%)]',
  },
  body: {
    cover: 'bg-[linear-gradient(135deg,#70847e_0%,#aebdaf_50%,#ded8c7_100%)]',
    dot: 'bg-mist',
    shade: 'bg-[radial-gradient(circle_at_50%_28%,rgba(255,255,255,0.24),transparent_30%),linear-gradient(180deg,transparent_0%,rgba(22,36,30,0.26)_100%)]',
  },
  kindness: {
    cover: 'bg-[linear-gradient(135deg,#d79a8f_0%,#ead1c1_48%,#c6d7ca_100%)]',
    dot: 'bg-coral-soft',
    shade: 'bg-[radial-gradient(circle_at_40%_24%,rgba(255,255,255,0.28),transparent_31%),linear-gradient(180deg,transparent_0%,rgba(60,28,18,0.2)_100%)]',
  },
  sleep: {
    cover: 'bg-[linear-gradient(160deg,#05080d_0%,#0f2430_48%,#27505f_78%,#8fa0a2_100%)]',
    dot: 'bg-sky',
    shade: 'bg-[radial-gradient(circle_at_62%_30%,rgba(242,234,214,0.3),transparent_26%),linear-gradient(180deg,transparent_0%,rgba(2,6,12,0.4)_100%)]',
  },
};

export default function MeditationTrackCard({
  track,
  href,
  showAudio = false,
  showDescription = true,
  loggedIn = false,
  noteCount = 0,
  layout = 'grid',
}: Props) {
  const wide = layout === 'wide';
  const visual = TRACK_VISUALS[track.mood] || TRACK_VISUALS.forest;
  const coverClass = [
    'relative block overflow-hidden rounded-[20px] border border-forest-deep/[0.10] no-underline',
    // 横版在手机上是上下叠的：这时封面用 3:2 的横幅，正方形会占掉大半屏，
    // 人要滑过一整块装饰才看得到标题。到 sm 以上它移到左边，才变回正方形。
    wide ? 'aspect-[3/2] sm:aspect-square' : 'aspect-square',
    'transition-all duration-500 group-hover:-translate-y-1 group-hover:shadow-[0_16px_36px_rgba(42,59,47,0.10)]',
    visual.cover,
  ].join(' ');
  const cover = (
    <>
      <div className={`absolute inset-0 ${visual.shade}`} />
      {/*
        原来这里写死 Mindfulness。等手碟、雨声这类声音进来，
        卡片上顶着 MINDFULNESS 就成了假标签——所以改成跟着阶段走。

        封面在浅底上是淡色的，所以这一层的字全用深墨，不能用白——
        白字压在淡渐变上根本读不出来。
      */}
      <div className="absolute left-4 top-4 max-w-[58%] truncate text-[10px] font-semibold uppercase tracking-[0.2em] text-forest-deep/60">
        {track.stage || '声音'}
      </div>
      <div className="absolute right-3 top-3 rounded-full bg-white/75 px-2.5 py-1 text-[11px] font-medium text-forest-deep backdrop-blur-sm">
        {track.hasAudio ? '可收听' : '开放中'}
      </div>
      <div className="absolute inset-0 flex items-center justify-center text-forest-deep/45">
        <TrackGlyph mood={track.mood} />
      </div>
    </>
  );

  const coverEl = href ? (
    <Link href={href} className={coverClass} aria-label={`打开${track.title}`}>
      {cover}
    </Link>
  ) : (
    <div className={coverClass}>{cover}</div>
  );

  return (
    <article
      id={track.id}
      className={
        wide
          ? 'group scroll-mt-28 sm:flex sm:items-start sm:gap-8'
          : 'group min-w-0 scroll-mt-28'
      }
    >
      {/* 横版里给封面一个定宽，它才不会跟着文字一起被拉成一整行那么大 */}
      {wide ? <div className="sm:w-[240px] sm:shrink-0">{coverEl}</div> : coverEl}

      <div className={wide ? 'min-w-0 flex-1' : ''}>
        <div
          className={`flex items-center gap-2 text-[12px] font-medium tracking-[0.08em] text-ink-soft ${
            wide ? 'mt-5 sm:mt-1' : 'mt-5'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${visual.dot}`} />
          <span>{[track.duration, track.stage].filter(Boolean).join(' · ')}</span>
        </div>
        <h3
          className="mt-2 text-[clamp(1.05rem,2.2vw,1.3rem)] font-semibold leading-[1.45] text-forest-deep"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          {track.title}
        </h3>
        {showDescription && track.intention && (
          <p className="mt-2 text-[13.5px] leading-[1.85] text-ink-soft">
            {track.intention}
          </p>
        )}

        {showAudio && (
          <TrackAudioPanel
            trackId={track.id}
            hasAudio={Boolean(track.hasAudio)}
            loggedIn={loggedIn}
            noteCount={noteCount}
          />
        )}
      </div>
    </article>
  );
}

function TrackGlyph({ mood }: { mood: TrackMood }) {
  if (mood === 'forest') {
    return (
      <svg viewBox="0 0 120 120" className="h-[44%] w-[44%]" fill="none" aria-hidden="true">
        <path
          d="M82 78c-11 16-39 12-48-7-9-20 9-44 31-37 19 6 22 32 5 42-13 8-29-2-28-16 1-11 13-18 23-12 8 5 7 17-1 20-6 3-12-2-11-8"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (mood === 'daily') {
    return (
      <svg viewBox="0 0 120 120" className="h-[45%] w-[45%]" fill="none" aria-hidden="true">
        <path d="M23 62h66c13 0 19 18 7 25-8 5-18 0-19-9" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
        <path d="M23 80h38" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
        <path d="M28 42h38c10 0 15-14 7-20-6-4-14-1-15 7" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      </svg>
    );
  }

  if (mood === 'care') {
    return (
      <svg viewBox="0 0 120 120" className="h-[43%] w-[43%]" fill="none" aria-hidden="true">
        <path d="M60 25v70M25 60h70" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
        <path
          d="M37 37c15 6 31 6 46 0M37 83c15-6 31-6 46 0M37 37c6 15 6 31 0 46M83 37c-6 15-6 31 0 46"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <circle cx="60" cy="60" r="9" fill="currentColor" opacity="0.65" />
      </svg>
    );
  }

  if (mood === 'kindness') {
    return (
      <svg viewBox="0 0 120 120" className="h-[43%] w-[43%]" fill="none" aria-hidden="true">
        <path
          d="M60 88s-30-17-30-40c0-11 8-19 18-19 6 0 10 3 12 8 2-5 6-8 12-8 10 0 18 8 18 19 0 23-30 40-30 40Z"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M45 58c8 6 22 6 30 0" stroke="currentColor" strokeWidth="6" strokeLinecap="round" opacity="0.46" />
        <path d="M38 35c-5 3-9 8-11 14M82 35c5 3 9 8 11 14" stroke="currentColor" strokeWidth="6" strokeLinecap="round" opacity="0.34" />
      </svg>
    );
  }

  if (mood === 'emotion') {
    return (
      <svg viewBox="0 0 120 120" className="h-[43%] w-[43%]" fill="none" aria-hidden="true">
        <path d="M30 67c10-12 20-12 30 0s20 12 30 0" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
        <path d="M30 48c10-12 20-12 30 0s20 12 30 0" stroke="currentColor" strokeWidth="6" strokeLinecap="round" opacity="0.62" />
        <path d="M30 86c10-12 20-12 30 0s20 12 30 0" stroke="currentColor" strokeWidth="6" strokeLinecap="round" opacity="0.62" />
      </svg>
    );
  }

  if (mood === 'body') {
    return (
      <svg viewBox="0 0 120 120" className="h-[43%] w-[43%]" fill="none" aria-hidden="true">
        <circle cx="60" cy="27" r="10" fill="currentColor" opacity="0.75" />
        <path d="M60 43v45" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
        <path d="M33 54c16 13 38 13 54 0" stroke="currentColor" strokeWidth="6" strokeLinecap="round" opacity="0.86" />
        <path d="M39 76c12 10 30 10 42 0" stroke="currentColor" strokeWidth="6" strokeLinecap="round" opacity="0.62" />
        <path d="M48 94c7 5 17 5 24 0" stroke="currentColor" strokeWidth="6" strokeLinecap="round" opacity="0.42" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 120 120" className="h-[43%] w-[43%]" fill="none" aria-hidden="true">
      <path d="M60 24v72M26 60h68M37 37l46 46M83 37 37 83" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      <circle cx="60" cy="60" r="10" fill="currentColor" opacity="0.55" />
    </svg>
  );
}
