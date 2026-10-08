'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * 社区广场「去创作」的下拉。还是原生 <details>（没脚本时照样能点开），
 * 只补上收起的几种方式：按 Esc、点到外面、焦点移出去。
 * 不补的话它会一直盖在第一条活动上，手机上「点外面关掉」还会点进那场活动。
 */
export default function CreateMenu({ label, children }: { label: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  /**
   * 下拉往哪边展开。默认贴右（按钮在工具条右端）；窄屏上右边那组整组换到下一行时按钮靠左，
   * 贴右展开会有一截伸出屏幕左边——那时改成贴左。
   */
  const [alignLeft, setAlignLeft] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const close = (focusSummary = false) => {
      if (!el.open) return;
      el.open = false;
      if (focusSummary) el.querySelector('summary')?.focus();
    };
    // 菜单开着时点到外面：只关菜单，紧跟着的那一下 click 不落到下面那条活动的链接上
    let swallowUntil = 0;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(true); };
    const onDown = (e: PointerEvent) => {
      if (!el.open || el.contains(e.target as Node)) return;
      swallowUntil = e.timeStamp + 600;
      close();
    };
    const onClick = (e: MouseEvent) => {
      if (e.timeStamp > swallowUntil) return;
      swallowUntil = 0;
      e.preventDefault();
      e.stopPropagation();
    };
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null;
      if (next && !el.contains(next)) close();
    };
    // 点了菜单里的一项就收起：只改地址里 #submit 的那两项不会刷新页面，菜单会一直开着
    const onPick = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest('a')) close();
    };
    const onToggle = () => {
      if (el.open) setAlignLeft(el.getBoundingClientRect().right < 190);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('click', onClick, true);
    el.addEventListener('focusout', onFocusOut);
    el.addEventListener('click', onPick);
    el.addEventListener('toggle', onToggle);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('click', onClick, true);
      el.removeEventListener('focusout', onFocusOut);
      el.removeEventListener('click', onPick);
      el.removeEventListener('toggle', onToggle);
    };
  }, []);

  return (
    <details ref={ref} className="group relative shrink-0">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 whitespace-nowrap rounded-xl bg-forest-deep px-4 text-[15px] font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest [&::-webkit-details-marker]:hidden">
        {label}
      </summary>
      <div className={`absolute ${alignLeft ? 'left-0' : 'right-0'} z-20 mt-2 w-44 rounded-2xl border border-forest-deep/10 bg-white p-2 shadow-[0_12px_40px_rgba(26,46,26,0.14)]`}>
        {children}
      </div>
    </details>
  );
}
