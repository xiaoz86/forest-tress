'use client';

import { useState } from 'react';

// 四步的展示部分。
// 桌面四栏平铺。
// 手机上做成一条被 S 形折起的纸带：四折交替朝前 / 朝后倾，
// 折与折之间一道细线当折痕，点一下整条摊平、正文展开。
//
// 客户端组件不自己判断语言：四步和那两个按钮字都由 PathSection 传进来。

export type Step = { n: string; title: string; body: string };

type Props = {
  steps: readonly Step[];
  /** 收起时按钮上的字（摊开这四步） */
  unfold: string;
  /** 展开时按钮上的字（折回去） */
  fold: string;
};

const FOLD_DEG = 48;   // 收起时每一折的倾角，太大字就压扁看不清了
const STRIP = 58;      // 收起时每一折露出的高度（px）
// 折起来之后每折在垂直方向只剩 cos(角度) 这么高，
// 但 transform 不改变布局高度——得用负 margin 把这段差补回去，
// 否则折与折之间会裂开一道空隙，就不像一条连续的纸带了。
// 折痕一律取顶边：若一半在顶一半在底，可见条带一个贴上、一个贴下，
// 同一个负 margin 就串不齐——相邻两折会叠到一起，末尾那折被挤没。
const SQUASH = Math.round(STRIP * (1 - Math.cos((FOLD_DEG * Math.PI) / 180)));

export default function PathSteps({ steps, unfold, fold }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* ── 手机：折纸 ── */}
      <div className="max-w-[860px] md:hidden">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="block w-full overflow-hidden rounded-b-2xl text-left"
          style={{ perspective: '1200px' }}
        >
          {steps.map((s, i) => {
            const facingDown = i % 2 === 0;
            return (
              <div
                key={s.n}
                className="border-t border-white/[0.16] first:border-t-0"
                style={{
                  transformOrigin: 'center top',
                  transform: open
                    ? 'rotateX(0deg)'
                    : `rotateX(${facingDown ? -FOLD_DEG : FOLD_DEG}deg)`,
                  marginBottom: open ? 0 : -SQUASH,
                  // 一正一反两个折面受光不同，交替深浅才看得出是折起来的
                  background: facingDown
                    ? 'linear-gradient(180deg, rgba(255,255,255,0.085), rgba(255,255,255,0.03))'
                    : 'linear-gradient(180deg, rgba(0,0,0,0.10), rgba(255,255,255,0.015))',
                  transition:
                    'transform 720ms cubic-bezier(0.22, 1, 0.36, 1), margin-bottom 720ms cubic-bezier(0.22, 1, 0.36, 1), background 500ms ease',
                }}
              >
                <div className="flex items-center gap-3.5 px-5" style={{ height: STRIP }}>
                  <span className="text-[13px] font-medium tracking-[0.14em] text-coral-soft/90">
                    {s.n}
                  </span>
                  <span className="flex-1 text-[1.02rem] font-semibold text-white">{s.title}</span>
                </div>

                <div
                  className={`grid transition-[grid-template-rows] duration-500 ease-out ${
                    open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="px-5 pb-6 text-[13px] leading-[1.85] text-white/58">{s.body}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </button>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="mt-5 inline-flex items-center gap-2 text-[12.5px] text-white/45 transition-colors hover:text-white"
        >
          <span
            aria-hidden="true"
            className={`inline-block transition-transform duration-500 ${open ? 'rotate-45' : ''}`}
          >
            ＋
          </span>
          {open ? fold : unfold}
        </button>
      </div>

      {/* ── 桌面：四栏平铺 ── */}
      <ol className="hidden gap-8 md:grid md:grid-cols-2 lg:grid-cols-4">
        {steps.map(s => (
          <li key={s.n} className="relative">
            <div className="mb-5 flex items-center gap-3">
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
    </>
  );
}
