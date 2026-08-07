import Link from 'next/link';
import type { Dictionary } from '@/i18n';

// [2] 我能做什么 —— 首页不再完整展开每个产品，只给每类需要一个清晰入口。
// 名字沿用导航里的正式叫法，别在这里另发明一套。
//
// 链接不进字典：那是路由，不是文案。字典里四条的顺序就是下面这四条的顺序，
// 加减一条要两边一起改。

const HREFS = ['/meditations', '/phil-coach', '/creators', '/shares'];

export default function EntranceSection({ t }: { t: Dictionary['home']['entrances'] }) {
  return (
    <section id="entrances" className="bg-paper-soft/60 px-8 py-24 max-md:px-7 max-md:py-16">
      <div className="mx-auto max-w-[1080px]">
        <div className="mb-12 max-w-[860px]">
          <p className="mb-4 text-[12px] font-bold uppercase tracking-[0.2em] text-forest">
            Four Ways In
          </p>
          <h2
            className="text-[clamp(2rem,4.2vw,3.2rem)] font-medium leading-[1.2] tracking-[-0.03em] text-ink"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {t.heading}
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-5 max-md:grid-cols-1 max-md:gap-4">
          {t.items.map((e, i) => (
            <Link
              key={HREFS[i]}
              href={HREFS[i]}
              className="group flex flex-col justify-between rounded-[26px] border border-forest-deep/[0.10] bg-paper-soft p-9 no-underline transition-all hover:-translate-y-1 hover:border-forest-deep/20 hover:shadow-[0_18px_44px_rgba(42,59,47,0.07)] max-md:p-7"
            >
              <div>
                <div
                  className="text-[1.5rem] text-forest-mid"
                  style={{ fontFamily: 'var(--font-serif)' }}
                  aria-hidden="true"
                >
                  {e.icon}
                </div>
                <h3 className="mt-4 text-[1.2rem] font-semibold text-forest-deep">{e.title}</h3>
                <p className="mt-3 text-[13.5px] leading-[1.85] text-ink-soft">{e.body}</p>
              </div>
              <span className="mt-8 inline-flex items-center gap-1.5 text-[13px] font-medium text-forest-mid">
                {e.cta}
                <span
                  aria-hidden="true"
                  className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                >
                  ↗
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
