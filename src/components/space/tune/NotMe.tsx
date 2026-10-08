'use client';

/**
 * 调风格时，页面每一块角上的「这不像我」。点了把是哪一块告诉调风格面板，由面板问一个具体问题。
 * 只在本人打开「调风格」时出现。
 */
export default function NotMe({ block, label }: { block: string; label: string }) {
  return (
    <button type="button" className="sp-notme" aria-label={`${label}这里不像我`}
      onClick={() => window.dispatchEvent(new CustomEvent('sp:notme', { detail: { block } }))}>
      这不像我
    </button>
  );
}
