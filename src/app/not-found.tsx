import type { Metadata } from 'next';
import Link from 'next/link';
import Nav from '@/components/Nav';
import { getLocale } from '@/lib/locale';

export async function generateMetadata(): Promise<Metadata> {
  const en = (await getLocale()) === 'en';
  return { title: en ? 'Page not found · Nearby Forest' : '页面不存在 · 附近森林', robots: { index: false, follow: false } };
}

/**
 * 全站的「页面不存在」。
 *
 * 最常见的来路是一个还没发布的个人网站空间：本人确认、发布之前，访客打开 TA 的链接就落在这里。
 * 所以不说「出错了」，也不透露这个人有没有在做空间——只给两条能走的路。
 */
export default async function NotFound() {
  const en = (await getLocale()) === 'en';
  return (
    <>
      <Nav />
      <main className="grid min-h-[100svh] place-items-center bg-paper px-7 pb-20 pt-32">
        <div className="max-w-[460px] text-center">
          <p className="mb-4 text-[12px] font-bold uppercase tracking-[0.2em] text-forest">404</p>
          <h1 className="mb-4 font-display text-[clamp(1.7rem,4vw,2.3rem)] font-normal leading-[1.3] text-ink">
            {en ? 'This page is not here' : '这一页不在这里'}
          </h1>
          <p className="mb-9 text-[15.5px] leading-[1.9] text-text-secondary">
            {en
              ? 'The link may be mistyped, or the page has not been published yet.'
              : '可能是链接打错了，也可能这一页还没有发布。'}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/creators"
              className="inline-flex min-h-11 items-center rounded-full bg-forest px-6 text-[15px] text-white no-underline transition-colors hover:bg-forest-dark">
              {en ? 'Meet the creators' : '去创造者平台'} →
            </Link>
            <Link href="/"
              className="inline-flex min-h-11 items-center rounded-full border border-forest/20 px-6 text-[15px] text-forest-dark no-underline transition-colors hover:border-forest/45">
              {en ? 'Home' : '回到首页'}
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
