import Link from 'next/link';
import HeroFilmPlayer from '@/components/HeroFilmPlayer';

// [6] 为什么要做附近森林 —— 放在最后：先看见能做什么、有什么人、
// 会长出什么，再说来处，才不像开场白。
//
// 左边这张卡不用照片，用几层渐变画出「一棵树站在坡上」：
// 照片会把注意力拉到具体某处风景，插画只留下意象。

export default function OriginSection() {
  return (
    <section id="origin" className="px-8 py-28 max-md:px-7 max-md:py-20">
      <div className="mx-auto grid max-w-[1180px] grid-cols-[0.85fr_1.15fr] items-center gap-[70px] max-lg:grid-cols-1 max-lg:gap-11">
        <div
          className="relative min-h-[520px] overflow-hidden rounded-[36px] shadow-[0_22px_60px_rgba(42,59,47,0.08)] max-md:min-h-[430px]"
          style={{
            background:
              'linear-gradient(180deg, rgba(27,46,35,.02), rgba(27,46,35,.45)), radial-gradient(circle at 44% 24%, rgba(245,239,226,.92), transparent 20%), linear-gradient(155deg, #b9c4b2 0 44%, #4f6958 45% 67%, #243e2e 68%)',
          }}
        >
          {/* 树干 */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-[70px] left-1/2 h-[190px] w-2 rounded-full bg-[rgba(30,53,40,0.9)]"
          />
          {/* 树冠 */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-[210px] left-[calc(50%-88px)] h-[150px] w-[180px] rotate-[8deg] rounded-[70%_30%_55%_45%] bg-[rgba(30,53,40,0.84)]"
          />
          <div className="absolute bottom-8 left-8">
            <HeroFilmPlayer variant="glass" />
          </div>
        </div>

        <div>
          <p className="mb-[18px] text-[12px] font-bold uppercase tracking-[0.2em] text-forest">
            Why Nearby Forest
          </p>
          <h2
            className="text-[clamp(2.1rem,4.4vw,3.6rem)] font-medium leading-[1.2] tracking-[-0.035em] text-ink"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            每个人都可以有自己的生长方式。
          </h2>
          <p className="mt-6 text-[16px] leading-[1.85] text-ink-soft">
            附近森林不是一个只用来展示自己的橱窗，也不是另一个需要经营人设的社交广场。我们希望它是一片可以安顿自己、认识真实的人，也让正在做的事继续生长的空间。
          </p>

          <blockquote
            className="mt-9 border-l border-forest pl-[22px] text-[clamp(1.15rem,2.2vw,1.375rem)] leading-[1.65] text-forest"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            每一棵树都是独立的，
            <br />
            而根系在看不见的土地深处彼此连接。
          </blockquote>

          <div className="mt-10">
            <Link
              href="/about"
              className="text-[14px] text-forest no-underline underline-offset-4 transition-colors hover:text-forest-dark hover:underline"
            >
              阅读附近森林的来处 →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
