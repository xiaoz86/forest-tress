'use client';

import { useState } from 'react';

// 四步的展示部分。
// 桌面四栏平铺、全部可见。
// 手机上整块默认收起，标题那一屏只剩一句话加一张卡——卡片用三层叠影
// 暗示下面还压着东西，点一下四步一起铺开。

export type Step = { n: string; title: string; body: string };

export default function PathSteps({ steps }: { steps: Step[] }) {
  // 只在手机生效：桌面无视这个状态，始终展开
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      {/* 收起态的卡片：仅手机，展开后消失 */}
      {!expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          className="relative block w-full pb-4 text-left md:hidden"
        >
          {/* 底下两层，往下露出边缘，像还压着几页 */}
          <span
            aria-hidden="true"
            className="absolute inset-x-6 bottom-0 top-4 rounded-3xl border border-white/[0.07] bg-white/[0.02]"
          />
          <span
            aria-hidden="true"
            className="absolute inset-x-3 bottom-2 top-2 rounded-3xl border border-white/[0.09] bg-white/[0.035]"
          />
          <span className="relative flex items-center justify-between gap-4 rounded-3xl border border-white/[0.14] bg-white/[0.06] px-6 py-6">
            <span>
              <span className="block text-[11px] tracking-[0.18em] text-coral-soft/80">四步</span>
              <span className="mt-2 block text-[1.05rem] font-semibold text-white">
                看看连接怎么长出来
              </span>
            </span>
            <span
              aria-hidden="true"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/20 text-[17px] text-white/70"
            >
              ＋
            </span>
          </span>
        </button>
      )}

      {/*
        0fr → 1fr 的行高过渡：不写死高度也能有展开动画。
        基础是 1fr（桌面、以及手机展开后），收起时才在窄屏加 0fr——
        两个类名都得是完整字面量，Tailwind 才扫得到。
      */}
      <div
        className={`grid grid-rows-[1fr] transition-[grid-template-rows] duration-500 ease-out ${
          expanded ? '' : 'max-md:grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <ol className="grid grid-cols-4 gap-8 max-lg:grid-cols-2 max-md:grid-cols-1 max-md:gap-7">
            {steps.map(s => (
              <li key={s.n} className="relative">
                <div className="mb-5 flex items-center gap-3 max-md:mb-3">
                  <span className="text-[13px] font-medium tracking-[0.14em] text-coral-soft/90">
                    {s.n}
                  </span>
                  <span aria-hidden="true" className="h-px flex-1 bg-white/12" />
                </div>
                <h3 className="text-[1.05rem] font-semibold text-white">{s.title}</h3>
                <p className="mt-3 text-[13px] leading-[1.85] text-white/55">{s.body}</p>
              </li>
            ))}
          </ol>

          {/* 展开后给个收回去的出口，免得只能一路往下滑 */}
          {expanded && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="mt-8 inline-flex items-center gap-2 text-[13px] text-white/45 transition-colors hover:text-white md:hidden"
            >
              <span aria-hidden="true">−</span>
              收起
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
