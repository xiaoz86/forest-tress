'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildProgramView,
  isPlayable,
  type MeditationCategory,
  type MeditationContent,
  type MeditationTrack,
  type ProgramTrackState,
} from '@/lib/meditations';

type Props = {
  content: MeditationContent;
  category: MeditationCategory;
  /** 有没有买。由服务端按开通记录算好传进来，前端不自己判断。 */
  paid: boolean;
};

// 听到八成就算走完这一段。要求听满 100% 的话，
// 差十几秒关掉的人就永远卡在这一周——而解锁下一周正依赖这个数。
const DONE_RATIO = 0.8;

function storageKey(categoryId: string) {
  return `nf_program_${categoryId}`;
}

function readListened(categoryId: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey(categoryId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export default function MeditationProgram({ content, category, paid }: Props) {
  const [listened, setListened] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [openPhase, setOpenPhase] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 进度只在挂载后读：服务端没有 localStorage，首帧必须和服务端一致（空数组），
  // 否则 hydration 会不匹配。同 Nav.tsx 读 cookie 的处理。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setListened(readListened(category.id));
    setReady(true);
  }, [category.id]);

  const markDone = useCallback((trackId: string) => {
    setListened(prev => {
      if (prev.includes(trackId)) return prev;
      const next = [...prev, trackId];
      try {
        window.localStorage.setItem(storageKey(category.id), JSON.stringify(next));
      } catch {
        // 无痕模式下写不进去，进度就只在这一次会话里有效
      }
      return next;
    });
  }, [category.id]);

  const view = useMemo(
    () => buildProgramView(content, category, { listened, paid }),
    [content, category, listened, paid],
  );

  const playing = useMemo(
    () => content.tracks.find(t => t.id === playingId) || null,
    [content.tracks, playingId],
  );

  const activeId = openPhase ?? view.activePhaseId;

  const onTimeUpdate = useCallback(() => {
    const el = audioRef.current;
    if (!el || !playingId || !el.duration) return;
    if (el.currentTime / el.duration >= DONE_RATIO) markDone(playingId);
  }, [playingId, markDone]);

  const price = ((category.priceCents ?? 0) / 100).toFixed(0);
  const locked = view.total - view.phases.reduce(
    (n, p) => n + p.tracks.filter(t => isPlayable(t.state)).length, 0,
  );

  return (
    <div className="pb-24">
      {/* ---- 头部：封面 + 金句 + 导师 ---- */}
      <section className="grid grid-cols-[172px_1fr] gap-7 items-start max-md:grid-cols-[116px_1fr] max-md:gap-4">
        <Cover category={category} />
        <div className="min-w-0">
          <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.2em] text-coral-soft">
            {category.label} · 系列 {view.total} 节
          </div>
          {category.highlight && (
            <h1
              className="text-[clamp(1.35rem,3.4vw,2.1rem)] font-semibold leading-[1.35] tracking-[-0.01em] text-white text-balance"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {category.highlight}
            </h1>
          )}
          <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-white/10 pt-4">
            <span className="text-[15px] font-semibold text-white">{category.heroTitle || category.label}</span>
            {category.subtitle && (
              <span className="text-[13px] text-white/45">{category.subtitle}</span>
            )}
          </div>
          {category.teacherName && (
            <div className="mt-4 flex items-center gap-3">
              <span
                aria-hidden="true"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-coral-soft to-mist text-[13px] font-bold text-[#2a2118]"
              >
                {category.teacherName.slice(0, 1)}
              </span>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-white">{category.teacherName}</div>
                {category.teacherCredential && (
                  <div className="mt-0.5 text-[11px] leading-[1.55] text-white/44">
                    {category.teacherCredential}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ---- 进度 ---- */}
      <section className="mt-8">
        <div className="mb-2 flex items-baseline justify-between gap-4 text-[12px] text-white/42">
          <span>{view.phases.find(p => p.phase.id === view.activePhaseId)?.phase.label || ''}</span>
          <span className="tabular-nums">
            <b className="text-[13px] font-semibold text-white">{view.doneCount}</b> / {view.total} 段
          </span>
        </div>
        <div className="h-[3px] overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-leaf to-coral-soft transition-[width] duration-500"
            style={{ width: view.total ? `${(view.doneCount / view.total) * 100}%` : '0%' }}
          />
        </div>
      </section>

      {/* ---- 三周 ---- */}
      <section className="mt-7 flex flex-col gap-4">
        {view.phases.map(pv => {
          const expanded = pv.unlocked && pv.phase.id === activeId;
          const complete = pv.doneCount >= pv.tracks.length && pv.tracks.length > 0;
          return (
            <div
              key={pv.phase.id}
              className={`overflow-hidden rounded-xl border ${
                expanded ? 'border-coral-soft/32' : 'border-white/10'
              }`}
            >
              <button
                type="button"
                onClick={() => pv.unlocked && setOpenPhase(expanded ? '' : pv.phase.id)}
                disabled={!pv.unlocked}
                aria-expanded={expanded}
                className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors ${
                  expanded ? 'bg-coral-soft/[0.09]' : 'bg-white/[0.035]'
                } ${pv.unlocked ? 'cursor-pointer hover:bg-white/[0.06]' : 'cursor-default'}`}
              >
                <span className={`shrink-0 ${pv.unlocked ? 'text-coral-soft' : 'text-white/38'}`}>
                  {pv.unlocked ? (complete ? <IconCheck /> : <IconArrow open={expanded} />) : <IconLock />}
                </span>
                <span className={`flex-1 text-[13.5px] font-semibold ${pv.unlocked ? 'text-white' : 'text-white/44'}`}>
                  {pv.phase.label}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums tracking-[0.06em] text-white/40">
                  {pv.unlocked
                    ? `${pv.doneCount} / ${pv.tracks.length}`
                    : `${pv.tracks.length} 段 · 上一周听完 ${pv.phase.unlockAfter} 段后开放`}
                </span>
              </button>

              {expanded && (
                <div>
                  {pv.tracks.map((row, i) => {
                    // 付费墙就插在免费段和收费段的接缝处——撞到墙的地方才出现
                    const seam =
                      !view.paid &&
                      row.state === 'locked-paywall' &&
                      pv.tracks[i - 1]?.state === 'free';
                    return (
                      <div key={row.track.id}>
                        {seam && <Paywall lockedCount={locked} price={price} />}
                        <TrackRow
                          track={row.track}
                          state={row.state}
                          done={row.done}
                          playing={playingId === row.track.id}
                          onPlay={() => setPlayingId(row.track.id)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* ---- 吸底：没买时是购买条，买了之后是播放条 ---- */}
      {ready && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/12 bg-[#121814]/96 backdrop-blur-md">
          <div className="mx-auto flex max-w-[1120px] items-center gap-4 px-8 py-3 max-md:px-4">
            {playing ? (
              <>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-white">{playing.title}</div>
                  <div className="text-[11px] text-white/44">{playing.stage}</div>
                </div>
                <audio
                  ref={audioRef}
                  controls
                  autoPlay
                  preload="none"
                  src={playing.audioUrl}
                  onTimeUpdate={onTimeUpdate}
                  onEnded={() => markDone(playing.id)}
                  className="w-[min(52vw,420px)] max-md:w-[46vw]"
                />
              </>
            ) : view.paid ? (
              <div className="flex-1 text-[13px] text-white/50">选一段开始听。听到八成就算走完。</div>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-white">解锁完整 {view.total} 段</div>
                  <div className="text-[11px] text-white/44">一次付清，之后随时回来听</div>
                </div>
                <span className="shrink-0 text-[13px] font-bold tabular-nums text-white">¥{price}</span>
                <a
                  href="#unlock"
                  className="shrink-0 rounded-full bg-white px-5 py-2 text-[13px] font-semibold text-[#111512] no-underline"
                >
                  立即解锁
                </a>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Cover({ category }: { category: MeditationCategory }) {
  const base = 'relative aspect-square overflow-hidden rounded-xl border border-white/10';
  if (category.coverUrl) {
    return (
      <div className={base}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={category.coverUrl} alt="" className="h-full w-full object-cover" />
      </div>
    );
  }
  // 还没上封面时用同色调的渐变顶着，不留白块
  return (
    <div className={`${base} bg-[linear-gradient(180deg,#04060a_0%,#04060a_52%,#0d1c24_58%,#1b333f_82%,#2a4b59_100%)]`}>
      <span className="absolute left-[54%] top-[30%] aspect-square w-[26%] rounded-full bg-[#f2ead6] shadow-[0_0_22px_rgba(242,234,214,0.32)]">
        <span className="absolute inset-0 translate-x-[-28%] translate-y-[-13%] rounded-full bg-[#04060a]" />
      </span>
    </div>
  );
}

function TrackRow({
  track, state, done, playing, onPlay,
}: {
  track: MeditationTrack;
  state: ProgramTrackState;
  done: boolean;
  playing: boolean;
  onPlay: () => void;
}) {
  const playable = isPlayable(state) && Boolean(track.audioUrl);
  const label = track.seq ? String(track.seq).padStart(2, '0') : '';

  return (
    <div className="flex items-center gap-3 border-t border-white/[0.06] px-4 py-2.5">
      <span className="w-6 shrink-0 text-[11px] tabular-nums text-white/32">{label}</span>
      <button
        type="button"
        onClick={playable ? onPlay : undefined}
        disabled={!playable}
        aria-label={playable ? `播放${track.title}` : track.title}
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border transition-colors ${
          done
            ? 'border-leaf/45 bg-leaf/15 text-leaf'
            : playable
              ? 'border-white/20 text-white/78 hover:border-white hover:bg-white hover:text-[#111512]'
              : 'border-white/12 text-white/30'
        }`}
      >
        {done ? <IconCheck small /> : isPlayable(state) ? <IconPlay playing={playing} /> : <IconLock small />}
      </button>
      <span className={`min-w-0 flex-1 truncate text-[13.5px] ${isPlayable(state) ? 'text-white' : 'text-white/44'}`}>
        {track.title}
      </span>
      {state === 'free' && (
        <span className="shrink-0 rounded border border-leaf/35 px-1.5 py-px text-[10px] tracking-[0.08em] text-leaf">
          免费
        </span>
      )}
      {track.duration && (
        <span className="shrink-0 text-[11px] tabular-nums text-white/36">{track.duration}</span>
      )}
      {isPlayable(state) && !track.audioUrl && (
        <span className="shrink-0 text-[11px] text-white/32">整理中</span>
      )}
    </div>
  );
}

function Paywall({ lockedCount, price }: { lockedCount: number; price: string }) {
  return (
    <div
      id="unlock"
      className="scroll-mt-24 border-t border-coral-soft/25 bg-[linear-gradient(160deg,rgba(232,168,142,0.13),rgba(30,42,68,0.22))] px-4 py-5"
    >
      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-coral-soft">
        还有 {lockedCount} 段
      </div>
      <h3 className="text-[15px] font-semibold text-white">注册附近森林，解锁完整旅程</h3>
      <p className="mt-1 text-[12.5px] leading-[1.75] text-white/50">
        三周的声音就都在这里了。一次付清，之后随时回来听。
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a
          href="/login"
          className="rounded-full bg-white px-5 py-2 text-[13px] font-semibold text-[#111512] no-underline"
        >
          注册并解锁
        </a>
        <span className="text-[13px] font-bold tabular-nums text-white">¥{price}</span>
        <a href="/login" className="text-[12px] text-white/45 no-underline hover:text-white/70">
          已注册？登录
        </a>
      </div>
    </div>
  );
}

function IconPlay({ playing }: { playing: boolean }) {
  return playing ? (
    <svg viewBox="0 0 10 10" fill="currentColor" className="h-2.5 w-2.5" aria-hidden="true">
      <rect x="1" y="1" width="3" height="8" rx="1" />
      <rect x="6" y="1" width="3" height="8" rx="1" />
    </svg>
  ) : (
    <svg viewBox="0 0 10 10" fill="currentColor" className="h-2.5 w-2.5" aria-hidden="true">
      <path d="M2 1l7 4-7 4z" />
    </svg>
  );
}

function IconCheck({ small }: { small?: boolean } = {}) {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={small ? 'h-3 w-3' : 'h-3.5 w-3.5'}
      aria-hidden="true"
    >
      <path d="M2 6.3l2.8 2.8L10 3.9" />
    </svg>
  );
}

function IconLock({ small }: { small?: boolean } = {}) {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={small ? 'h-3 w-3' : 'h-3.5 w-3.5'}
      aria-hidden="true"
    >
      <rect x="2.6" y="5.2" width="6.8" height="4.8" rx="1.1" />
      <path d="M4.4 5.2V3.8a1.6 1.6 0 0 1 3.2 0v1.4" />
    </svg>
  );
}

function IconArrow({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
      aria-hidden="true"
    >
      <path d="M5 2.5L9.5 7 5 11.5" />
    </svg>
  );
}
