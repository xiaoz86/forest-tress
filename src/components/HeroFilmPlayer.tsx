'use client';

import { useRef } from 'react';

const HERO_FILM_SRC = '/hero-film.mp4?v=20260627-1';

/**
 * hero  —— 深底上的描边胶囊（原样式）
 * paper —— 纸底上的浅色胶囊
 * glass —— 贴在图上的圆形玻璃钮，只有一个播放三角
 */
type Variant = 'hero' | 'paper' | 'glass';

export default function HeroFilmPlayer({ variant = 'hero' }: { variant?: Variant } = {}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const filmRef = useRef<HTMLVideoElement>(null);
  const previousOverflowRef = useRef('');

  const openFilm = () => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;

    previousOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    closeRef.current?.focus();

    const film = filmRef.current;
    if (film) {
      film.currentTime = 0;
      void film.play().catch(() => undefined);
    }
  };

  const closeFilm = () => {
    filmRef.current?.pause();
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    document.body.style.overflow = previousOverflowRef.current;
    triggerRef.current?.focus();
  };

  return (
    <>
      {variant === 'glass' ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={openFilm}
          className="grid h-[82px] w-[82px] place-items-center rounded-full border border-white/45 bg-white/[0.14] text-white backdrop-blur-[12px] transition-all hover:-translate-y-0.5 hover:bg-white/25"
          aria-label="观看附近森林理念片"
        >
          <span
            aria-hidden="true"
            className="ml-[5px] block h-0 w-0 border-y-[9px] border-y-transparent border-l-[14px] border-l-white"
          />
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={openFilm}
          className={
            variant === 'paper'
              ? 'inline-flex min-h-[48px] items-center gap-3 rounded-full border border-forest/15 bg-paper-soft/70 px-6 text-[14.5px] font-medium text-forest transition-all hover:-translate-y-0.5 hover:bg-paper-soft'
              : 'inline-flex items-center gap-3 rounded-full border border-white/30 bg-black/10 px-6 py-3.5 text-[15px] font-medium text-white/86 backdrop-blur-sm transition-colors hover:border-white/55 hover:bg-white/10 hover:text-white'
          }
          aria-label="观看附近森林理念片"
        >
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-full border ${
              variant === 'paper' ? 'border-forest/30' : 'border-white/35'
            }`}
            aria-hidden="true"
          >
            <span className="ml-0.5 block h-0 w-0 border-y-[5px] border-y-transparent border-l-[8px] border-l-current" />
          </span>
          观看理念片
        </button>
      )}

      <dialog
          ref={dialogRef}
          className="fixed inset-0 m-0 h-dvh w-screen max-w-none border-0 bg-[#06110b]/96 p-5 text-white backdrop:bg-[#06110b]/96 backdrop:backdrop-blur-md max-md:p-0"
          aria-labelledby="hero-film-title"
          onCancel={event => {
            event.preventDefault();
            closeFilm();
          }}
          onMouseDown={event => {
            if (event.currentTarget === event.target) closeFilm();
          }}
        >
          <div className="mx-auto flex h-full w-full max-w-[1180px] flex-col justify-center">
            <div className="mb-5 flex items-end justify-between gap-6 px-1 max-md:absolute max-md:left-5 max-md:right-5 max-md:top-5 max-md:mb-0">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.32em] text-coral-soft">
                  附近森林
                </div>
                <h2 id="hero-film-title" className="mt-2 text-xl font-semibold text-white">
                  理念片
                </h2>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={closeFilm}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/18 bg-white/[0.06] text-2xl font-light text-white/72 transition-colors hover:bg-white/12 hover:text-white"
                aria-label="关闭理念片"
                title="关闭"
              >
                ×
              </button>
            </div>

            <video
              ref={filmRef}
              controls
              playsInline
              preload="metadata"
              poster="/hero-forest.jpg"
              className="aspect-video w-full bg-black object-contain shadow-[0_28px_100px_rgba(0,0,0,0.45)] max-md:shadow-none"
              onEnded={() => filmRef.current?.pause()}
            >
              <source src={HERO_FILM_SRC} type="video/mp4" />
            </video>
          </div>
      </dialog>
    </>
  );
}
