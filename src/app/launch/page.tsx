import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkHtml from 'remark-html';
import type { Metadata } from 'next';
import Link from 'next/link';
import NavClient from '@/components/NavClient';
import { zh } from '@/i18n/zh';

export const dynamic = 'force-static';

const ARTICLE = path.join(process.cwd(), 'docs', 'launch-announcement.md');

function loadArticle() {
  const raw = fs.readFileSync(ARTICLE, 'utf8');
  // 把仓库相对路径换成站点相对路径，让 Next 直接走 public/ 静态资源
  const normalized = raw.replace(/\.\.\/public\/launch-screenshots\//g, '/launch-screenshots/');
  return matter(normalized);
}

async function renderMarkdown(md: string): Promise<string> {
  const file = await remark()
    .use(remarkGfm)
    .use(remarkHtml, { sanitize: false })
    .process(md);
  return String(file);
}

export async function generateMetadata(): Promise<Metadata> {
  const { data } = loadArticle();
  return {
    title: typeof data.title === 'string' ? data.title : '附近森林',
    description: typeof data.description === 'string' ? data.description : undefined,
    openGraph: {
      title: typeof data.title === 'string' ? data.title : undefined,
      description: typeof data.description === 'string' ? data.description : undefined,
      images: ['/launch-screenshots/feature-tour.gif'],
    },
  };
}

export default async function LaunchPage() {
  const { content, data } = loadArticle();
  const html = await renderMarkdown(content);
  const dateText = typeof data.date === 'string' ? data.date : '';
  const audience = typeof data.audience === 'string' ? data.audience : '';

  return (
    <>
      {/*
        这页是 force-static 的发布公告，不能读 cookie（读了就静态不了）。
        所以直接用客户端导航、写死中文：一篇写给中文读者的公告，
        不值得为它把整页变成动态渲染。
      */}
      <NavClient locale="zh" t={zh.nav} />
      <main className="bg-white">
        {/* 文章头 */}
        <header className="pt-32 pb-10 px-6 text-center bg-gradient-to-b from-[#fafaf7] via-[#f5f5f0] to-white max-md:pt-24 max-md:pb-6">
          <div className="max-w-[760px] mx-auto">
            <div className="text-[11px] font-semibold tracking-[0.18em] text-moss uppercase mb-3">
              发布说明
            </div>
            <h1
              className="text-[40px] leading-[1.2] font-semibold tracking-[-0.02em] text-forest-deep max-md:text-[28px]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {typeof data.title === 'string' ? data.title : '附近森林'}
            </h1>
            {typeof data.description === 'string' && (
              <p className="mt-5 text-[16px] leading-relaxed text-text-secondary max-md:text-[14.5px]">
                {data.description}
              </p>
            )}
            {(dateText || audience) && (
              <p className="mt-5 text-[12px] tracking-wide text-text-light">
                {dateText}{dateText && audience ? ' · ' : ''}{audience}
              </p>
            )}
          </div>
        </header>

        {/* 文章正文 — 自渲染 prose 样式 */}
        <article
          className="launch-prose mx-auto max-w-[760px] px-6 pt-2 pb-16 max-md:px-7 max-md:pb-10"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        {/* 底部 CTA */}
        <section className="py-14 px-6 bg-[#fafaf7] text-center border-t border-black/[0.04]">
          <h2
            className="text-[22px] font-semibold tracking-[-0.01em] text-forest-deep mb-4 max-md:text-[20px]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            来种一棵属于你的树吧
          </h2>
          <Link
            href="/#join"
            className="inline-block px-7 py-3 bg-forest-deep text-white text-[14px] font-medium rounded-full no-underline hover:bg-forest-mid transition-colors"
          >
            成为森林的一棵树
          </Link>
        </section>

        <footer className="bg-white text-text-light py-10 px-6 text-center text-[11px] border-t border-black/[0.04]">
          <p>附近森林 · Nearby Forest</p>
          <p className="mt-1.5 text-text-light/70">让独立的个体彼此连接、流动、共创</p>
        </footer>
      </main>
    </>
  );
}
