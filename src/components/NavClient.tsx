'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import ForestLogo from '@/components/ForestLogo';
import type { Locale } from '@/lib/locale';
import type { Dictionary } from '@/i18n';

// 悬浮胶囊导航：纸色半透明 + 背景模糊，浅底深底都压得住，
// 不用再随滚动切换深绿底色。
//
// 文案由服务端的 Nav 外壳传进来。这里不自己判断语言：
// 客户端判断会先渲染一遍中文再闪成英文。

type NavLink =
  | { href: string; label: string; type: 'anchor' }
  | { href: string; label: string; type: 'route' };

type Props = {
  locale: Locale;
  /**
   * 这是客户端组件，却整片收着字典切片——现在能跑，只因为 nav 里
   * 恰好一个函数都没有。哪天为了英文单复数往 nav 加一个函数，
   * 全站导航会立刻崩在「Functions cannot be passed directly to
   * Client Components」，而 tsc 和 build 都查不出来（只有浏览器能）。
   * 真要加函数，先把这里改成只收 locale、在客户端自己 dict(locale)。
   */
  t: Dictionary['nav'];
  /** 深色页面（星空）用的反相导航 */
  night?: boolean;
};

/**
 * 登录态问服务器，不读 cookie。
 *
 * nf_member 前端可写：读它的话，任何人在控制台敲一行就能让导航说「已登录」；
 * 更常见的是另一种难堪——老浏览器里只剩 nf_member，界面显示「个人中心」，
 * 而服务端所有接口都认 nf_session、当你没登录。以服务器的说法为准。
 */
type Session = { memberId: string | null; legacy: boolean };

async function fetchSession(): Promise<Session> {
  try {
    const res = await fetch('/api/session', { cache: 'no-store' });
    if (!res.ok) return { memberId: null, legacy: false };
    const data = await res.json();
    return {
      memberId: typeof data.memberId === 'string' ? data.memberId : null,
      legacy: Boolean(data.legacy),
    };
  } catch {
    return { memberId: null, legacy: false };
  }
}

export default function NavClient({ locale, t, night = false }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  // undefined = 还没问到答案。和「确定没登录」分开，才不会在拿到答案前
  // 先把一个登录着的人指去注册。
  const [session, setSession] = useState<Session | undefined>(undefined);
  const pathname = usePathname();
  const isHome = pathname === '/';

  // 中间那排：品牌已经指向首页，这里就不再重复放「首页」
  // icon 沿用首页四条小径那套汉字符号，手机菜单排成两列时靠它认路
  const baseLinks: (NavLink & { icon: string })[] = [
    { href: '/meditations', label: t.links.meditations, type: 'route', icon: '息' },
    { href: '/phil-coach', label: t.links.philCoach, type: 'route', icon: '伴' },
    { href: '/shares', label: t.links.shares, type: 'route', icon: '创' },
    { href: '/sky', label: t.links.creators, type: 'route', icon: '见' },
    { href: '/about', label: t.links.about, type: 'route', icon: '林' },
  ];

  // 「联系我们」落到 /about 里那块二维码。桌面端它是颗描边胶囊，
  // 和那排纯文字链接区分开，所以不混进 baseLinks。
  const contactHref = '/about#contact';


  // 登录态：挂载后问一次 /api/session。整个站内跳转期间不会变
  // （登录和退出都是整页加载），所以只问一次。
  useEffect(() => {
    let alive = true;
    void fetchSession().then(next => {
      if (alive) setSession(next);
    });
    return () => { alive = false; };
  }, []);

  const memberId = session?.memberId ?? null;
  const pending = session === undefined;

  /**
   * 手机菜单里的全部条目。
   *
   * 之前「联系我们」和「登录」各自单独渲染、前者还占满一整行，
   * 面板比现在高两行——展开后把页面内容整个顶下去。
   * 现在七项走同一个网格自然流成两列，奇数时最后一张占满。
   */
  const menuItems: (NavLink & { icon: string; outline?: boolean })[] = [
    ...baseLinks,
    { href: contactHref, label: t.links.contact, type: 'route', icon: '招', outline: true },
    // 登录只在确定没登录时出现（pending 期间不出，免得登录着的人看它闪一下）
    ...(!pending && !memberId && !session?.legacy
      ? [{ href: '/login', label: t.login, type: 'route' as const, icon: '登' }]
      : []),
  ];

  /**
   * 切语言要整页重来：文案是服务端渲染的，只改 cookie 不刷新，
   * 页面上其余部分还是旧语言。reload 一次最诚实。
   */
  const switchTo = async (next: Locale) => {
    setLangOpen(false);
    if (next === locale || switching) return;
    setSwitching(true);
    try {
      await fetch('/api/locale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang: next }),
      });
      window.location.reload();
    } catch {
      setSwitching(false);
    }
  };

  // 在非主页时，锚点链接需要先回主页再定位
  const resolveHref = (link: NavLink): string =>
    link.type === 'route' ? link.href : isHome ? link.href : `/${link.href}`;

  // 注册过、但会话是换签名 cookie 之前留下的：指去登录，别让人再走一遍注册向导
  // ——那条路的终点是「这个邮箱已经注册过」。
  const cta: NavLink = memberId
    ? { href: `/creators/${memberId}`, label: t.ctaMember, type: 'route' }
    : session?.legacy
      ? { href: '/login', label: t.login, type: 'route' }
      : { href: '#join', label: t.ctaJoin, type: 'anchor' };

  const ctaClass =
    'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-forest px-6 text-[16px] font-medium text-white no-underline shadow-[0_14px_28px_rgba(47,81,61,0.18)] transition-all hover:-translate-y-0.5 hover:bg-forest-dark';

  const langOption = (value: Locale, label: string) => (
    <button
      key={value}
      type="button"
      onClick={() => void switchTo(value)}
      className={`flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[14px] no-underline transition-colors hover:bg-forest/[0.06] ${
        value === locale ? 'font-semibold text-forest-dark' : 'text-[#33403a]'
      }`}
    >
      <span aria-hidden="true" className="text-[12px] text-forest/60">
        {value === locale ? '◉' : '◎'}
      </span>
      {label}
    </button>
  );

  return (
    <div
      className={`${night ? 'nav-night ' : ''}fixed left-1/2 top-4 z-[100] w-[min(calc(100%-28px),1220px)] -translate-x-1/2 border border-white/50 bg-paper/[0.82] shadow-[0_12px_38px_rgba(31,48,37,0.07)] backdrop-blur-[18px] max-md:top-2 max-md:w-[calc(100%-24px)] ${
        // 展开后容器变高，999px 圆角会把它撑成一个盖住半屏的巨大椭圆
        menuOpen ? 'rounded-[26px]' : 'rounded-[999px]'
      }`}
    >
      <nav className="flex h-[72px] items-center justify-between gap-5 pl-6 pr-3.5 max-md:h-[62px] max-md:pl-4">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 font-display text-[21px] font-light tracking-[0.18em] text-forest-dark no-underline"
        >
          <ForestLogo size={26} className="shrink-0" onDark={night} />
          {t.brand}
        </Link>

        <div className="flex items-center gap-6 text-[16px] font-medium text-[#2f3d36] max-lg:hidden">
          {baseLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className="no-underline transition-colors hover:text-forest"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href={contactHref}
            className="rounded-full border border-forest/20 px-4 py-1.5 text-[16px] no-underline transition-colors hover:border-forest/45 hover:text-forest"
          >
            {t.links.contact}
          </Link>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {/* 语言：手机上收进汉堡菜单，顶栏这条只在宽屏出现 */}
          <div className="relative max-md:hidden">
            <button
              type="button"
              onClick={() => setLangOpen(!langOpen)}
              disabled={switching}
              aria-label={t.language.label}
              aria-expanded={langOpen}
              className="rounded-full border border-forest/15 px-3 py-1.5 text-[13px] font-medium text-[#33403a]/85 transition-colors hover:border-forest/35 hover:text-forest disabled:opacity-40"
            >
              {t.language.short}
            </button>
            {langOpen && (
              <div className="absolute right-0 top-[calc(100%+8px)] w-[148px] overflow-hidden rounded-2xl border border-forest/12 bg-white py-1 shadow-[0_14px_34px_rgba(31,48,37,0.12)]">
                {langOption('zh', t.language.zh)}
                {langOption('en', t.language.en)}
              </div>
            )}
          </div>

          {/*
            登录态未知时先不出这个链接，免得一个登录着的人看它闪一下。
            右边那个大按钮已经是「登录」时（老 cookie 那一档）也不出——
            否则一行里并排两个「登录」。
          */}
          {!pending && !memberId && !session?.legacy && (
            <Link
              href="/login"
              className="text-[15px] font-medium text-[#33403a]/85 no-underline transition-colors hover:text-forest max-md:hidden"
            >
              {t.login}
            </Link>
          )}
          {/*
            答案没回来之前，按钮占着位置但不可点：默认渲染成「种下一棵树」的话，
            回访的老成员一进来最大的那个按钮就指着注册向导，误点要填七步才被告知「已注册」。
          */}
          {pending ? (
            <span
              aria-hidden="true"
              className={`${ctaClass} max-md:min-h-[40px] max-md:px-4 max-md:text-[12.5px] pointer-events-none opacity-0`}
            >
              {t.ctaJoin}
              <span aria-hidden="true">↗</span>
            </span>
          ) : cta.type === 'route' ? (
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
            aria-label={t.menu}
            aria-expanded={menuOpen}
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </nav>

      {menuOpen && (
        /*
          两列卡片而不是一行一条：一行一条时右半边整块空着，
          面板还被拉到近半屏。两列把宽度用满、行数减半，
          汉字符号也和首页四条小径对得上。
        */
        <div className="hidden border-t border-forest/10 px-4 pb-3 pt-2.5 max-lg:block">
          <div className="grid grid-cols-2 gap-2">
            {menuItems.map((link, i) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center gap-3 rounded-2xl px-3.5 py-3 no-underline transition-colors active:bg-forest/10 ${
                  // 「联系我们」用描边而不是实底：它是次级入口，
                  // 和桌面端那颗胶囊是同一个意思
                  link.outline ? 'border border-forest/20' : 'bg-forest/[0.05]'
                } ${
                  // 总数是奇数时，最后一张占满整行，不留半个空格
                  i === menuItems.length - 1 && menuItems.length % 2 === 1 ? 'col-span-2' : ''
                }`}
              >
                <span
                  aria-hidden="true"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-paper-soft text-[14px] text-forest"
                  >
                  {link.icon}
                </span>
                <span className="text-[16px] font-medium text-[#33403a]">{link.label}</span>
              </Link>
            ))}
          </div>

          {/* 语言放在菜单最后一行：它不是常用动作，但要找得到 */}
          <div className="mt-2 flex items-center gap-2 rounded-2xl bg-forest/[0.05] px-4 py-3">
            <span className="text-[13px] text-[#33403a]/60">{t.language.label}</span>
            <div className="ml-auto flex gap-1.5">
              {(['zh', 'en'] as const).map(value => (
                <button
                  key={value}
                  type="button"
                  onClick={() => void switchTo(value)}
                  disabled={switching}
                  className={`rounded-full px-3 py-1.5 text-[13px] transition-colors disabled:opacity-40 ${
                    value === locale
                      ? 'bg-forest text-white'
                      : 'border border-forest/15 text-[#33403a]'
                  }`}
                >
                  {value === 'zh' ? t.language.zh : t.language.en}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
