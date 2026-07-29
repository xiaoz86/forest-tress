'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

// 悬浮胶囊导航：纸色半透明 + 背景模糊，浅底深底都压得住，
// 不用再随滚动切换深绿底色。

type NavLink =
  | { href: string; label: string; type: 'anchor' }
  | { href: string; label: string; type: 'route' };

// 中间那排：品牌已经指向首页，这里就不再重复放「首页」
const baseLinks: NavLink[] = [
  { href: '/meditations', label: '林间归处', type: 'route' },
  { href: '/phil-coach', label: '回到自己', type: 'route' },
  { href: '/shares', label: '个体创造', type: 'route' },
  { href: '/creators', label: '遇见附近', type: 'route' },
  { href: '/about', label: '生态社区', type: 'route' },
];

function readMemberId(): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(/(?:^|;\s*)nf_member=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export default function Nav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [memberId, setMemberId] = useState<string | null>(null);
  const pathname = usePathname();
  const isHome = pathname === '/';

  // 登录态：挂载后读 nf_member cookie（值即节点 id）→ 决定尾部展示「个人中心」还是「加入森林/登录」。
  // 必须在挂载后读：SSR 无 document，且首帧需与服务端一致（null）以避免 hydration 不匹配。
  useEffect(() => {
    const id = readMemberId();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMemberId(prev => (prev === id ? prev : id));
  }, [pathname]);

  // 在非主页时，锚点链接需要先回主页再定位
  const resolveHref = (link: NavLink): string =>
    link.type === 'route' ? link.href : isHome ? link.href : `/${link.href}`;

  const cta: NavLink = memberId
    ? { href: `/creators/${memberId}`, label: '个人中心', type: 'route' }
    : { href: '#join', label: '种下一棵树', type: 'anchor' };

  const ctaClass =
    'inline-flex min-h-[46px] items-center justify-center gap-2 rounded-full bg-forest px-6 text-[14px] font-medium text-white no-underline shadow-[0_14px_28px_rgba(47,81,61,0.18)] transition-all hover:-translate-y-0.5 hover:bg-forest-dark';

  return (
    <div className="fixed left-1/2 top-4 z-[100] w-[min(calc(100%-28px),1220px)] -translate-x-1/2 rounded-[999px] border border-white/50 bg-paper/[0.82] shadow-[0_12px_38px_rgba(31,48,37,0.07)] backdrop-blur-[18px] max-md:top-2 max-md:w-[calc(100%-16px)]">
      <nav className="flex h-[68px] items-center justify-between gap-6 pl-6 pr-3.5 max-md:h-[62px] max-md:pl-4">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 font-serif text-[19px] font-bold text-forest-dark no-underline"
        >
          <svg viewBox="0 0 28 28" fill="none" width="26" height="26" aria-hidden="true">
            <path
              d="M14 6 C14 6, 8 12, 8 17 C8 20.3 10.7 23 14 23 C17.3 23 20 20.3 20 17 C20 12 14 6 14 6Z"
              fill="#2f513d"
              opacity="0.55"
            />
            <path
              d="M14 10 C14 10, 10 14, 10 17.5 C10 19.7 11.8 21.5 14 21.5 C16.2 21.5 18 19.7 18 17.5 C18 14 14 10 14 10Z"
              fill="#2f513d"
            />
          </svg>
          附近森林
        </Link>

        <div className="flex items-center gap-7 text-[14px] text-[#445148] max-lg:hidden">
          {baseLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className="no-underline transition-colors hover:text-forest"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {!memberId && (
            <Link
              href="/login"
              className="text-[13.5px] text-ink-soft no-underline transition-colors hover:text-forest max-md:hidden"
            >
              登录
            </Link>
          )}
          {cta.type === 'route' ? (
            <Link href={cta.href} className={`${ctaClass} max-md:min-h-[40px] max-md:px-4 max-md:text-[12.5px]`}>
              {cta.label}
              <span aria-hidden="true">↗</span>
            </Link>
          ) : (
            <a
              href={resolveHref(cta)}
              className={`${ctaClass} max-md:min-h-[40px] max-md:px-4 max-md:text-[12.5px]`}
            >
              {cta.label}
              <span aria-hidden="true">↗</span>
            </a>
          )}
          <button
            className="hidden h-10 w-10 place-items-center rounded-full text-[19px] text-forest-dark transition-colors hover:bg-forest/10 max-lg:grid"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div className="hidden flex-col gap-1 border-t border-forest/10 px-6 pb-5 pt-3 max-lg:flex">
          {baseLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className="border-b border-forest/[0.07] py-3 text-[14px] text-[#445148] no-underline transition-colors hover:text-forest"
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          {!memberId && (
            <Link
              href="/login"
              className="py-3 text-[14px] text-[#445148] no-underline transition-colors hover:text-forest"
              onClick={() => setMenuOpen(false)}
            >
              登录
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
