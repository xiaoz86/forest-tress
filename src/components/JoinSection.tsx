'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import JoinForm from './JoinForm';

/**
 * 首页第 5 屏的两种状态：
 *   collapsed (默认) — 一个安静的 CTA 卡，"成为一棵树"
 *   expanded         — 展开 7 步 wizard
 *
 * 用 useState 控制，第一次 expanded 后自动 scrollIntoView，让用户看到表单出现。
 */
export default function JoinSection() {
  const [open, setOpen] = useState(false);

  // 支持外部锚点跳转直接展开（hash = #join 时自动展开 + 滚动）
  useEffect(() => {
    const tryOpenFromHash = () => {
      if (window.location.hash === '#join') {
        setOpen(true);
      }
    };
    tryOpenFromHash();
    window.addEventListener('hashchange', tryOpenFromHash);
    return () => window.removeEventListener('hashchange', tryOpenFromHash);
  }, []);

  // 展开后让 wizard 进入视野
  useEffect(() => {
    if (open) {
      const node = document.getElementById('join-form');
      if (node) {
        // 给浏览器一帧渲染 wizard
        requestAnimationFrame(() => {
          node.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    }
  }, [open]);

  if (!open) {
    return (
      <div className="max-w-[560px] mx-auto text-center">
        <h2
          className="font-serif text-[clamp(1.7rem,3.8vw,2.4rem)] font-semibold text-forest-deep leading-[1.45] tracking-[-0.005em]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          每一棵树，都从一颗种子开始
        </h2>
        <p className="mt-4 text-[14.5px] text-text-light leading-[1.85]">
          把正在发芽的自己，轻轻放进森林
        </p>
        <p className="mt-3 text-[13px] text-text-light/80 leading-[1.9]">
          种下后你会拥有：自己的节点卡与同频伙伴 AI 推荐、
          <span className="text-forest-deep font-medium">个性化 phil-coach</span>
          ——记得你的专属虚拟陪伴教练，以及更多正在生长的服务
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-9 inline-flex items-center gap-2 px-7 py-3 rounded-full border border-forest-deep/20 bg-white/60 backdrop-blur-sm text-[14.5px] font-medium text-forest-deep hover:bg-forest-deep hover:text-white hover:border-forest-deep transition-all shadow-[0_2px_14px_rgba(26,46,26,0.05)] cursor-pointer"
          aria-label="展开节点卡填写表单"
        >
          成为一棵树
          <span className="text-[15px] leading-none">↗</span>
        </button>
        <p className="mt-5 text-[12px] text-text-light/70 leading-relaxed">
          填一张节点卡即加入森林；这也是注册。已经加入过了？
          <Link href="/login" className="text-forest-deep underline underline-offset-2 ml-1">
            用邮箱登录
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div id="join-form" className="scroll-mt-24">
      <JoinForm />
      <div className="text-center mt-8">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[12.5px] text-text-light/70 hover:text-text-light underline-offset-4 hover:underline bg-transparent border-none cursor-pointer"
        >
          收起表单
        </button>
      </div>
    </div>
  );
}
