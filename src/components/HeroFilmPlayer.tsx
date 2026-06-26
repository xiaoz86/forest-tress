'use client';

import { useRef } from 'react';

const HERO_FILM_SRC = '/hero-film.mp4?v=20260627-1';

export default function HeroFilmPlayer() {
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
      <button
        ref={triggerRef}
        type="button"
        onClick={openFilm}
        className="inline-flex items-center gap-3 rounded-full border border-white/30 bg-black/10 px-6 py-3.5 text-[15px] font-medium text-white/86 backdrop-blur-sm transition-colors hover:border-white/55 hover:bg-white/10 hover:text-white"
        aria-label="观看附近森林理念片"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/35" aria-hidden="true">
          <span className="ml-0.5 block h-0 w-0 border-y-[5px] border-y-transparent border-l-[8px] border-l-current" />
        </span>
        观看理念片
      </button>

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
