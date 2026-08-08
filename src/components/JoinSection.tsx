'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { dict } from '@/i18n';
import type { Locale } from '@/lib/locale';
import JoinForm from './JoinForm';

/**
 * 首页第 5 屏的两种状态：
 *   collapsed (默认) — 一个安静的 CTA 卡，"成为一棵树"
 *   expanded         — 展开 7 步 wizard
 *
 * 用 useState 控制，第一次 expanded 后自动 scrollIntoView，让用户看到表单出现。
 *
 * 文案只收 locale，不收字典切片。
 *
 * 这一屏原来是把 t={t.join} 整片传进来的，能跑是因为那片里全是字符串。
 * 后来 join 底下多了 7 步向导（wizard），里面为了英文单复数用了函数，
 * 函数跨不过 server → client 那道序列化边界，整个首页就崩在
 * 「Functions cannot be passed directly to Client Components」——
 * 而且 tsc 和 build 都查不出来，只有真在浏览器里打开才看得见。
 *
 * 这不违反「客户端不要自己判断语言」：locale 仍是服务端算好的，
 * 这边不读 cookie，不会先渲染中文再闪成英文。
 */
export default function JoinSection({ locale }: { locale: Locale }) {
  const t = useMemo(() => dict(locale).home.join, [locale]);
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
          {t.heading}
        </h2>
        <p className="mt-4 text-[14.5px] text-text-light leading-[1.85]">{t.lede}</p>
        <p className="mt-3 text-[13px] text-text-light/80 leading-[1.9]">
          {t.benefitsLead}
          <span className="text-forest-deep font-medium">{t.benefitsAccent}</span>
          {t.benefitsTail}
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-9 inline-flex items-center gap-2 px-7 py-3 rounded-full border border-forest-deep/20 bg-white/60 backdrop-blur-sm text-[14.5px] font-medium text-forest-deep hover:bg-forest-deep hover:text-white hover:border-forest-deep transition-all shadow-[0_2px_14px_rgba(26,46,26,0.05)] cursor-pointer"
          aria-label={t.ctaAria}
        >
          {t.cta}
          <span className="text-[15px] leading-none">↗</span>
        </button>
        <p className="mt-5 text-[12px] text-text-light/70 leading-relaxed">
          {t.loginLead}
          <Link href="/login" className="text-forest-deep underline underline-offset-2 ml-1">
            {t.loginLink}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div id="join-form" className="scroll-mt-24">
      <JoinForm locale={locale} />
      <div className="text-center mt-8">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[12.5px] text-text-light/70 hover:text-text-light underline-offset-4 hover:underline bg-transparent border-none cursor-pointer"
        >
          {t.collapse}
        </button>
      </div>
    </div>
  );
}
