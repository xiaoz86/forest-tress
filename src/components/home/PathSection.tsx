import type { Dictionary } from '@/i18n';
import PathSteps from './PathSteps';
// [4] 加入后会获得什么 —— 把「连接怎么长出来」拆成四步，
// 让人知道种下节点之后会发生什么，而不是留在想象里。

export default function PathSection({ t }: { t: Dictionary['home']['paths'] }) {
  return (
    <section
      id="paths"
      className="bg-gradient-to-br from-forest-deep via-[#1f3a1f] to-forest-mid px-8 py-24 max-md:px-7 max-md:py-12"
    >
      <div className="mx-auto max-w-[1080px]">
        {/*
          手机上标题和四折是同一条纸带：标题是最上面那一折（始终摊平），
          底边一道细线就是第一道折痕，四折从这里接着往下折。
          所以标题块在窄屏才有底色和圆角，桌面维持原样。
        */}
        <div className="mb-14 max-w-[860px] max-md:mb-0 max-md:rounded-t-2xl max-md:border-b max-md:border-white/[0.16] max-md:bg-gradient-to-b max-md:from-white/[0.075] max-md:to-white/[0.025] max-md:px-7 max-md:pb-7 max-md:pt-7">
          <p className="mb-4 text-[12px] font-bold uppercase tracking-[0.2em] text-[rgba(238,242,235,0.62)]">
            How Connection Grows
          </p>
          <h2
            className="text-[clamp(2rem,4.2vw,3.2rem)] font-medium leading-[1.25] tracking-[-0.03em] text-white"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {t.headingTop}
            <br />
            {t.headingBottom}
          </h2>
        </div>

        <PathSteps steps={t.steps} unfold={t.unfold} fold={t.fold} />
      </div>
    </section>
  );
}
