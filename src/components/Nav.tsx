'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

type NavLink =
  | { href: string; label: string; type: 'anchor'; cta?: boolean }
  | { href: string; label: string; type: 'route'; cta?: boolean };

// 基础导航（登录前后都在）
const baseLinks: NavLink[] = [
  { href: '/', label: '首页', type: 'route' },
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
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [memberId, setMemberId] = useState<string | null>(null);
  const pathname = usePathname();
  const isHome = pathname === '/';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // 登录态：挂载后读 nf_member cookie（值即节点 id）→ 决定尾部展示「个人中心」还是「加入森林/登录」。
  // 必须在挂载后读：SSR 无 document，且首帧需与服务端一致（null）以避免 hydration 不匹配。
  useEffect(() => {
    const id = readMemberId();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMemberId(prev => (prev === id ? prev : id));
  }, [pathname]);

  const tailLinks: NavLink[] = memberId
    ? [{ href: `/creators/${memberId}`, label: '个人中心', type: 'route', cta: true }]
    : [
        { href: '#join', label: '加入森林', type: 'anchor', cta: true },
        { href: '/login', label: '登录', type: 'route' },
      ];
  const navLinks = [...baseLinks, ...tailLinks];

  // 在非主页时，锚点链接需要先回主页再定位
  const resolveHref = (link: NavLink): string => {
    if (link.type === 'route') return link.href;
    return isHome ? link.href : `/${link.href}`;
  };

  return (
    <nav className={`fixed top-0 left-0 right-0 z-[100] px-10 py-5 flex justify-between items-center transition-all duration-400
      ${scrolled || !isHome ? 'bg-forest-deep/95 backdrop-blur-[20px] py-3 shadow-[0_2px_20px_rgba(0,0,0,0.2)]' : ''}
      max-md:px-5 max-md:py-4`}>
      <Link href="/" className="font-serif text-xl font-bold text-white no-underline flex items-center gap-2.5">
        <svg viewBox="0 0 28 28" fill="none" width="28" height="28">
          <circle cx="14" cy="14" r="13" stroke="#a8c9a0" strokeWidth="1.5"/>
          <path d="M14 6 C14 6, 8 12, 8 17 C8 20.3 10.7 23 14 23 C17.3 23 20 20.3 20 17 C20 12 14 6 14 6Z" fill="#8fb573" opacity="0.6"/>
          <path d="M14 10 C14 10, 10 14, 10 17.5 C10 19.7 11.8 21.5 14 21.5 C16.2 21.5 18 19.7 18 17.5 C18 14 14 10 14 10Z" fill="#a8c9a0"/>
        </svg>
        附近森林
      </Link>

      {/* Mobile menu button */}
      <button
        className="hidden max-md:block text-white text-2xl bg-transparent border-none cursor-pointer"
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label="Toggle menu"
      >
        {menuOpen ? '✕' : '☰'}
      </button>

      {/* Desktop nav */}
      <ul className="flex items-center gap-6 list-none max-md:hidden">
        {navLinks.map(link => {
          const href = resolveHref(link);
          const cls = link.cta
            ? 'rounded-full border border-white/40 px-4 py-1.5 text-sm text-white no-underline transition-colors hover:bg-white hover:text-forest-deep hover:border-white'
            : 'text-white/70 no-underline text-sm transition-colors hover:text-white';
          return (
            <li key={link.href}>
              {link.type === 'route' ? (
                <Link href={href} className={cls}>{link.label}</Link>
              ) : (
                <a href={href} className={cls}>{link.label}</a>
              )}
            </li>
          );
        })}
      </ul>

      {/* Mobile nav */}
      {menuOpen && (
        <div className="hidden max-md:flex flex-col absolute top-full left-0 right-0 bg-forest-deep/95 backdrop-blur-[20px] py-4 px-5">
          {navLinks.map(link => {
            const href = resolveHref(link);
            const cls = link.cta
              ? 'mt-3 inline-block self-start rounded-full border border-white/40 px-4 py-2 text-sm text-white no-underline transition-colors hover:bg-white hover:text-forest-deep'
              : 'text-white/70 no-underline text-sm py-3 border-b border-white/5 transition-colors hover:text-white';
            return link.type === 'route' ? (
              <Link
                key={link.href}
                href={href}
                className={cls}
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </Link>
            ) : (
              <a
                key={link.href}
                href={href}
                className={cls}
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </a>
            );
          })}
        </div>
      )}
    </nav>
  );
}
