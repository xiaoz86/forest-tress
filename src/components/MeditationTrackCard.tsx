import Link from 'next/link';
import type { MeditationTrack, TrackMood } from '@/lib/meditations';

type Props = {
  track: MeditationTrack;
  href?: string;
  showAudio?: boolean;
  showDescription?: boolean;
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
};

export default function MeditationTrackCard({
  track,
  href,
  showAudio = false,
  showDescription = true,
}: Props) {
  const visual = TRACK_VISUALS[track.mood] || TRACK_VISUALS.forest;
  const coverClass = [
    'relative block aspect-square overflow-hidden rounded-lg border border-white/14 no-underline',
    'transition-transform duration-500 group-hover:-translate-y-1',
    visual.cover,
  ].join(' ');
  const cover = (
    <>
      <div className={`absolute inset-0 ${visual.shade}`} />
      <div className="absolute left-4 top-4 text-[10px] font-medium uppercase tracking-[0.24em] text-white/58">
        Mindfulness
      </div>
      <div className="absolute right-3 top-3 rounded-md bg-white/18 px-2.5 py-1 text-[11px] font-medium text-white/86 backdrop-blur-sm">
        {track.audioUrl ? '可收听' : '整理中'}
      </div>
      <div className="absolute inset-0 flex items-center justify-center text-white/88">
        <TrackGlyph mood={track.mood} />
      </div>
    </>
  );

  return (
    <article id={track.id} className="group min-w-0 scroll-mt-28">
      {href ? (
        <Link href={href} className={coverClass} aria-label={`打开${track.title}`}>
          {cover}
        </Link>
      ) : (
        <div className={coverClass}>{cover}</div>
      )}

      <div>
        <div className="mt-5 flex items-center gap-2 text-[12px] font-medium tracking-[0.08em] text-white/38">
          <span className={`h-1.5 w-1.5 rounded-full ${visual.dot}`} />
          <span>{track.duration} · {track.stage}</span>
        </div>
        <h3 className="mt-2 text-[clamp(1.05rem,2.2vw,1.35rem)] font-semibold text-white leading-[1.45]">
          {track.title}
        </h3>
        {showDescription && (
          <p className="mt-2 text-[13.5px] text-white/45 leading-[1.85]">
            {track.intention}
          </p>
        )}
      </div>

      {showAudio && (
        track.audioUrl ? (
          <audio controls preload="none" src={track.audioUrl} className="mt-4 w-full" />
        ) : (
          <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-white/42">
            音频正在整理中
          </div>
        )
      )}
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
