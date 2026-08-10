import type { Dictionary } from '@/i18n';

// [1] 这是什么 —— 紧跟 Hero，先把「来这里会发生什么」讲清楚，
// 再让访客自己去找入口。
//
// 上面那行 eyebrow（What Happens Here）两种语言都用英文，所以不进字典。
// 每张卡的汉字符号（见 / 遇 / 生）也一样：aria-hidden 的图形，不跟着语言变。

export default function ValueSection({ t }: { t: Dictionary['home']['value'] }) {
  return (
    <section className="px-8 py-24 max-md:px-7 max-md:py-16">
      <div className="mx-auto max-w-[1080px]">
        <div className="mb-14 text-center">
          <p className="mb-4 text-[12px] font-bold uppercase tracking-[0.2em] text-forest">
            What Happens Here
          </p>
          <h2
            className="mx-auto max-w-[680px] text-[clamp(2rem,4.2vw,3.2rem)] font-normal leading-[1.2] tracking-[-0.03em] text-ink"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {t.headingTop}
            <br />
            {t.headingBottom}
          </h2>
        </div>

        <div className="grid grid-cols-3 gap-5 max-md:grid-cols-1 max-md:gap-4">
          {t.items.map(v => (
            <article key={v.index} className="px-2 py-4 max-md:px-0">
              <span className="text-[10.5px] font-medium tracking-[0.2em] text-moss/70">
                {v.index}
              </span>
              <div
                className="font-normal mt-5 text-[1.6rem] text-forest-mid"
                                aria-hidden="true"
              >
                {v.symbol}
              </div>
              <h3 className="mt-4 text-[1.15rem] font-medium text-forest-deep">{v.title}</h3>
              <p className="mt-3 text-[13.5px] leading-[1.85] text-ink-soft">{v.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
