'use client';

import { useState } from 'react';

// 四步的展示部分。
// 桌面四栏平铺、全部可见；手机上竖着排四段全文太长，改成默认收起、
// 点开一条展开一条——先扫完四个标题知道流程，再决定看哪一段。

export type Step = { n: string; title: string; body: string };

export default function PathSteps({ steps }: { steps: Step[] }) {
  // 只在手机生效：桌面无视这个状态，始终展开
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <ol className="grid grid-cols-4 gap-8 max-lg:grid-cols-2 max-md:grid-cols-1 max-md:gap-0">
      {steps.map((s, i) => {
        const open = openIndex === i;
        return (
          <li
            key={s.n}
            className="relative max-md:border-b max-md:border-white/10 max-md:last:border-0"
          >
            {/* 手机上整行可点；桌面这颗按钮退化成普通标题，不接收点击 */}
            <button
              type="button"
              onClick={() => setOpenIndex(open ? null : i)}
              aria-expanded={open}
              className="w-full cursor-pointer text-left max-md:py-5 md:pointer-events-none md:cursor-default"
            >
              <div className="mb-5 flex items-center gap-3 max-md:mb-0">
                <span className="text-[13px] font-medium tracking-[0.14em] text-coral-soft/90">
                  {s.n}
                </span>
                <span aria-hidden="true" className="h-px flex-1 bg-white/12 max-md:hidden" />
                {/* 手机：标题在同一行，右侧一个 ＋ 提示可展开 */}
                <span className="hidden flex-1 text-[1.05rem] font-semibold text-white max-md:block">
                  {s.title}
                </span>
                <span
                  aria-hidden="true"
                  className={`hidden shrink-0 text-[15px] text-white/40 transition-transform duration-300 max-md:block ${
                    open ? 'rotate-45' : ''
                  }`}
                >
                  ＋
                </span>
              </div>
              {/* 桌面：标题单独一行 */}
              <span className="block text-[1.05rem] font-semibold text-white max-md:hidden">
                {s.title}
              </span>
            </button>

            {/*
              0fr → 1fr 的行高过渡：不用写死高度也能有展开动画。
              基础是 1fr（桌面、以及手机展开时），收起时才在窄屏加 0fr。
              两个类名都是完整字面量，Tailwind 才扫得到。
            */}
            <div
              className={`grid transition-[grid-template-rows] duration-300 ease-out grid-rows-[1fr] ${
                open ? '' : 'max-md:grid-rows-[0fr]'
              }`}
            >
              <p
                className={`overflow-hidden text-[13px] leading-[1.85] text-white/55 md:mt-3 ${
                  open ? 'max-md:pb-5' : ''
                }`}
              >
                {s.body}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
