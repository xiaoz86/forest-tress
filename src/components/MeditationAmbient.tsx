'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import TrackNotes from '@/components/TrackNotes';
import { dict } from '@/i18n';
import type { Locale } from '@/lib/locale';
import type { MeditationCategory, MeditationTrack } from '@/lib/meditations';

/**
 * 纯声音 —— 手碟、颂钵、雨声这类没有引导的声音。
 *
 * 不用引导冥想那套方形卡片网格：这类内容是靠名字选的，封面帮不上忙，
 * 一屏只能放六张卡反而把信息密度压没了。改成一行一条。
 *
 * 时长在这里的含义也变了——不是「要花你多久」，而是「能陪你多久」，
 * 所以 45:00 是卖点不是负担，而且默认循环。
 */

type Props = {
  /**
   * 文案在客户端自己取。
   *
   * 不能像服务端组件那样把字典切片当 props 传进来——字典里为了英文单复数
   * 用了函数（progress、phaseLocked 这些），而函数跨不过 server → client
   * 那道序列化边界，页面会直接崩在「Functions cannot be passed directly
   * to Client Components」。所以只传 locale 这个字符串，字典在这边查。
   *
   * 这也不违反「客户端不要自己判断语言」那条：locale 仍然是服务端算好的，
   * 这里不读 cookie，不会先渲染一遍中文再闪成英文。
   */
  locale: Locale;
  content: { tracks: MeditationTrack[] };
  category: MeditationCategory;
  noteCounts: Record<string, number>;
  loggedIn: boolean;
};

export default function MeditationAmbient({content, category, noteCounts, loggedIn, locale}: Props) {
  // 用 useMemo 包一层：dict() 是个函数调用，直接放在组件体里
  // React Compiler 分析不了，会连带放弃保留下面 useCallback 的记忆化。
  const { t, programT } = useMemo(() => {
    const d = dict(locale).meditations;
    return { t: d.ambient, programT: d.program };
  }, [locale]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loop, setLoop] = useState(true);
  const [failed, setFailed] = useState(false);
  const [openNotes, setOpenNotes] = useState<string | null>(null);
  const [counts, setCounts] = useState(noteCounts);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const tracks = useMemo(
    () => content.tracks.filter(track => track.categoryId === category.id),
    [content.tracks, category.id],
  );
  const playing = useMemo(
    () => tracks.find(track => track.id === playingId) || null,
    [tracks, playingId],
  );

  const bumpCount = useCallback((trackId: string, delta: number) => {
    setCounts(prev => ({ ...prev, [trackId]: Math.max(0, (prev[trackId] || 0) + delta) }));
  }, []);

  const toggle = useCallback((track: MeditationTrack) => {
    if (playingId === track.id) {
      const el = audioRef.current;
      if (el) { if (el.paused) void el.play(); else el.pause(); }
      return;
    }
    setFailed(false);
    setPlayingId(track.id);
  }, [playingId]);

  if (tracks.length === 0) {
    return (
      <div className="rounded-2xl border border-forest/12 bg-white/60 px-6 py-10 text-ink-soft">
        {t.empty}
      </div>
    );
  }

  return (
    <div className="pb-28">
      {/* 页首的 CategoryHero 已经介绍过这条小径了，这里只留一行说明听法 */}
      <div className="mb-5 flex items-baseline gap-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-forest/45">Ambient</p>
        <p className="text-[12.5px] text-ink-soft">{t.note}</p>
      </div>

      <ul className="list-none border-t border-forest/12 p-0">
        {tracks.map(track => {
          const active = playingId === track.id;
          const open = openNotes === track.id;
          return (
            <li key={track.id} className="border-b border-forest/12">
              <div className="flex items-center gap-4 py-4">
                <button
                  type="button"
                  onClick={() => track.hasAudio && toggle(track)}
                  disabled={!track.hasAudio}
                  aria-label={track.hasAudio ? programT.play(track.title) : track.title}
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-colors ${
                    active
                      ? 'border-forest bg-forest text-white'
                      : track.hasAudio
                        ? 'border-forest/25 text-forest hover:border-forest hover:bg-forest hover:text-white'
                        : 'border-forest/10 text-ink-soft/45'
                  }`}
                >
                  {active ? <IconPause /> : <IconPlay />}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-[16px] font-medium text-forest-deep">{track.title}</div>
                  {track.intention && (
                    <div className="mt-0.5 truncate text-[12px] text-ink-soft">{track.intention}</div>
                  )}
                </div>

                {track.duration && (
                  <span className="shrink-0 text-[12px] tabular-nums text-ink-soft">{track.duration}</span>
                )}
                {track.loopable !== false && (
                  <span
                    title={t.loopable}
                    aria-hidden="true"
                    className={`shrink-0 text-[14px] ${active && loop ? 'text-clay' : 'text-ink-soft/45'}`}
                  >
                    ∞
                  </span>
                )}
                {!track.hasAudio && (
                  <span className="shrink-0 text-[11px] text-ink-soft/70">开放中</span>
                )}

                <button
                  type="button"
                  onClick={() => setOpenNotes(open ? null : track.id)}
                  aria-expanded={open}
                  className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] tabular-nums transition-colors ${
                    open ? 'bg-forest/12 text-forest-deep' : 'text-ink-soft hover:bg-forest/[0.07] hover:text-forest-deep'
                  }`}
                >
                  <IconNote />
                  {(counts[track.id] || 0) > 0 ? counts[track.id] : programT.notes}
                </button>
              </div>

              {open && (
                <div className="mb-4 overflow-hidden rounded-xl border border-forest/12">
                  <TrackNotes locale={locale} trackId={track.id} loggedIn={loggedIn} onCountChange={bumpCount} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {playing && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-forest-dark/[0.97] backdrop-blur-md">
          <div className="mx-auto flex max-w-[1120px] items-center gap-4 px-8 py-3 max-md:px-4">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-white">{playing.title}</div>
              <div className="text-[11px] text-white/44">
                {failed ? (
                  <span className="text-coral-soft">{programT.audioFailed}</span>
                ) : (
                  loop ? t.looping : t.once
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setLoop(!loop)}
              aria-pressed={loop}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
                loop
                  ? 'border-coral-soft/45 bg-coral-soft/15 text-coral-soft'
                  : 'border-white/16 text-white/50 hover:text-white'
              }`}
            >
              {t.loopToggle}
            </button>

            <audio
              ref={audioRef}
              controls
              autoPlay
              loop={loop}
              preload="none"
              controlsList="nodownload noplaybackrate"
              onContextMenu={e => e.preventDefault()}
              onError={() => setFailed(true)}
              onPlaying={() => setFailed(false)}
              src={`/api/meditations/stream?track=${encodeURIComponent(playing.id)}`}
              className="w-[min(46vw,380px)] max-md:w-[40vw]"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function IconPlay() {
  return (
    <svg viewBox="0 0 10 10" fill="currentColor" className="h-3 w-3" aria-hidden="true">
      <path d="M2 1l7 4-7 4z" />
    </svg>
  );
}

function IconPause() {
  return (
    <svg viewBox="0 0 10 10" fill="currentColor" className="h-3 w-3" aria-hidden="true">
      <rect x="1" y="1" width="3" height="8" rx="1" />
      <rect x="6" y="1" width="3" height="8" rx="1" />
    </svg>
  );
}

function IconNote() {
  return (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-3 w-3" aria-hidden="true">
      <path d="M1.8 2.4h8.4v5.4H5.4L2.8 9.9V7.8H1.8z" strokeLinejoin="round" />
    </svg>
  );
}
