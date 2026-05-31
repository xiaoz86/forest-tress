import Link from 'next/link';
import type { MeditationTrack, TrackMood } from '@/lib/meditations';

type Props = {
  track: MeditationTrack;
  href?: string;
  showAudio?: boolean;
  showDescription?: boolean;
};

const TRACK_VISUALS: Record<TrackMood, { cover: string; dot: string }> = {
  settle: {
    cover: 'bg-[linear-gradient(135deg,#9fb1d7_0%,#b8bed7_52%,#ded7c6_100%)]',
    dot: 'bg-leaf',
  },
  listen: {
    cover: 'bg-[linear-gradient(135deg,#e5b99e_0%,#e8d6bd_45%,#b9d3ce_100%)]',
    dot: 'bg-coral-soft',
  },
  ground: {
    cover: 'bg-[linear-gradient(135deg,#6f9fc0_0%,#a9c5d5_48%,#d8e2dc_100%)]',
    dot: 'bg-sky',
  },
};

export default function MeditationTrackCard({
  track,
  href,
  showAudio = false,
  showDescription = true,
}: Props) {
  const visual = TRACK_VISUALS[track.mood] || TRACK_VISUALS.settle;
  const coverClass = [
    'relative block aspect-square overflow-hidden rounded-lg border border-white/14 no-underline',
    'transition-transform duration-500 group-hover:-translate-y-1',
    visual.cover,
  ].join(' ');
  const cover = (
    <>
      <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,0.22),transparent_48%,rgba(0,0,0,0.10))]" />
      <div className="absolute right-3 top-3 rounded-md bg-black/18 px-2.5 py-1 text-[11px] font-medium text-white/82 backdrop-blur-sm">
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
  if (mood === 'settle') {
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

  if (mood === 'listen') {
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

  return (
    <svg viewBox="0 0 120 120" className="h-[45%] w-[45%]" fill="none" aria-hidden="true">
      <path d="M22 44h48c12 0 18-16 8-23-7-5-17-1-18 8" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      <path d="M22 62h66c13 0 19 18 7 25-8 5-18 0-19-9" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      <path d="M22 80h38" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}
