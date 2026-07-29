import Link from 'next/link';
import HeroFilmPlayer from '@/components/HeroFilmPlayer';

// [6] 为什么要做附近森林 —— 放在最后：先看见能做什么、有什么人、
// 会长出什么，再说来处，才不像开场白。

export default function OriginSection() {
  return (
    <section id="origin" className="bg-white px-8 py-24 max-md:px-5 max-md:py-16">
      <div className="mx-auto grid max-w-[1080px] grid-cols-[0.95fr_1fr] items-center gap-14 max-lg:grid-cols-1 max-lg:gap-10">
        <div className="relative aspect-[4/5] overflow-hidden rounded-[30px] bg-forest-deep max-lg:aspect-[16/10]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/hero-forest.jpg"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover opacity-70"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-forest-deep/80 via-forest-deep/20 to-transparent" />
          <div className="absolute bottom-7 left-7 text-[11px] tracking-[0.2em] text-white/70">
            NEARBY FOREST · 理念片
          </div>
        </div>

        <div>
          <p className="mb-4 text-[11px] font-medium uppercase tracking-[3px] text-coral">
            Why Nearby Forest
          </p>
          <h2
            className="text-[clamp(1.6rem,3.6vw,2.4rem)] font-semibold leading-[1.4] tracking-[-0.01em] text-forest-deep"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            每个人都可以有自己的生长方式。
          </h2>
          <p className="mt-6 text-[14.5px] leading-[1.95] text-text-light">
            附近森林不是一个只用来展示自己的橱窗，也不是另一个需要经营人设的社交广场。我们希望它是一片可以安顿自己、认识真实的人，也让正在做的事继续生长的空间。
          </p>

          <blockquote
            className="mt-8 border-l-2 border-coral-soft/60 pl-6 text-[clamp(1rem,2vw,1.15rem)] leading-[1.9] text-forest-deep"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            每一棵树都是独立的，
            <br />
            而根系在看不见的土地深处彼此连接。
          </blockquote>

          <div className="mt-9 flex flex-wrap items-center gap-5">
            <HeroFilmPlayer />
            <Link
              href="/about"
              className="text-[13.5px] text-forest-mid underline-offset-4 transition-colors hover:text-forest-deep hover:underline"
            >
              阅读附近森林的来处 →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
