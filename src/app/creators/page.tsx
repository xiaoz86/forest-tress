import { createClient } from '@supabase/supabase-js';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getContent } from '@/lib/content';
import Nav from '@/components/Nav';
import { dict } from '@/i18n';
import { tr } from '@/lib/contentTranslate';
import { getLocale } from '@/lib/locale';
import CreatorTree from '@/components/CreatorTree';
import type { NodeCard } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: dict(locale).creators.metaTitle,
    // 这句和 hero 一样来自 content/creators.md，走内容对照表
    description: tr('每一棵树都是一位正在创造的人', locale),
  };
}

async function fetchCreators(): Promise<NodeCard[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return [];

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data, error } = await supabase
    .from('node_cards')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as NodeCard[];
}

export default async function CreatorsPage() {
  const { frontmatter, content } = getContent('creators');
  const [creators, locale] = await Promise.all([fetchCreators(), getLocale()]);
  const t = dict(locale).creators;
  // hero 三句写在 content/creators.md 里，主理人自己改——走内容对照表，
  // 不搬进字典，否则那条 markdown 编辑链路就断了
  const intro = content.trim().split('\n\n');

  return (
    <>
      <Nav />

      {/* Hero */}
      <section className="relative pt-36 pb-20 px-10 bg-gradient-to-b from-forest-deep via-[#223b22] to-forest-mid text-center overflow-hidden max-md:px-7 max-md:pt-28 max-md:pb-14">
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(160deg,rgba(255,255,255,0.055),transparent_44%,rgba(232,201,160,0.045))]" />
        <div className="relative max-w-[760px] mx-auto">
          <div className="inline-block text-xs tracking-[3px] text-sage uppercase mb-4 font-medium">
            {tr(String(frontmatter.label || '创造者'), locale)}
          </div>
          <h1 className="font-serif text-[clamp(2.2rem,5vw,3.4rem)] font-light text-white leading-[1.2] mb-5">
            {tr(String(frontmatter.title || '创造者森林'), locale)}
          </h1>
          <p className="text-base text-white/70 leading-[1.9] max-md:text-sm">
            {tr(intro[0], locale)}
          </p>
          {intro[1] && (
            <p className="text-sm text-white/50 leading-[1.9] mt-4">{tr(intro[1], locale)}</p>
          )}
        </div>
      </section>

      {/* Forest Grid */}
      <section className="relative py-20 px-10 bg-warm-cream max-md:py-14 max-md:px-7">
        <div className="max-w-[1200px] mx-auto">
          {/* 作品书架入口 */}
          {creators.length > 0 && (
            <Link
              href="/launch"
              className="group block no-underline mb-12 max-md:mb-8"
              aria-label={t.shelf.ariaLabel}
            >
              <article className="flex items-stretch gap-5 p-3 max-md:flex-col max-md:gap-3 bg-white/75 rounded-lg border border-moss/10 shadow-[0_2px_24px_rgba(26,46,26,0.04)] hover:bg-white hover:shadow-[0_8px_36px_rgba(26,46,26,0.07)] hover:-translate-y-0.5 transition-all">
                {/* GIF 缩略 */}
                <div className="shrink-0 w-[180px] max-md:w-full max-md:h-40 rounded-md overflow-hidden bg-[#fafaf7] ring-1 ring-black/[0.04]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/launch-screenshots/feature-tour.gif"
                    alt={t.shelf.imageAlt}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
                {/* 文案 */}
                <div className="flex-1 flex flex-col justify-center py-2 pr-3 max-md:px-2 max-md:pb-3">
                  <div className="text-[11px] font-semibold tracking-[0.18em] text-moss uppercase mb-2">
                    {t.shelf.eyebrow}
                  </div>
                  <h3
                    className="text-[20px] font-medium tracking-[-0.005em] text-forest-deep mb-1.5 max-md:text-[18px]"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {t.shelf.title}
                  </h3>
                  <p className="text-[14px] leading-relaxed text-text-secondary mb-3 max-md:text-[13.5px]">
                    {t.shelf.body}
                  </p>
                  <span className="inline-flex items-center gap-1 text-[13px] font-medium text-forest-deep group-hover:text-forest-mid transition-colors">
                    {t.shelf.cta}
                    <span className="transition-transform group-hover:translate-x-0.5">→</span>
                  </span>
                </div>
              </article>
            </Link>
          )}

          {creators.length === 0 ? (
            <div className="text-center py-20">
              <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full border border-leaf/25 bg-leaf/15">
                <span className="h-2.5 w-2.5 rounded-full bg-leaf" />
              </div>
              <h2 className="font-serif text-2xl font-normal text-forest-deep mb-3">
                {t.empty.title}
              </h2>
              <p className="text-text-secondary mb-8 max-w-md mx-auto leading-relaxed">
                {t.empty.line1}
                <br />
                {t.empty.line2}
              </p>
              <Link
                href="/#join"
                className="inline-block px-8 py-3.5 bg-gradient-to-br from-coral-soft to-warmth text-forest-deep font-bold rounded-full no-underline shadow-[0_4px_24px_rgba(212,160,160,0.3)] hover:-translate-y-0.5 transition-transform"
              >
                {t.empty.cta}
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center mb-12">
                <p className="text-sm text-moss tracking-widest uppercase">
                  {t.treeCount(creators.length)}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-7 max-lg:grid-cols-2 max-md:grid-cols-1 max-md:gap-5">
                {creators.map(node => (
                  <Link
                    key={node.id}
                    href={node.id ? `/creators/${node.id}` : '/creators'}
                    className="no-underline block"
                  >
                    <CreatorTree node={node} locale={locale} />
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-10 bg-forest-deep text-center max-md:py-12 max-md:px-7">
        <h2 className="font-serif text-[clamp(1.5rem,3vw,2rem)] font-normal text-white mb-4">
          {t.cta.title}
        </h2>
        <p className="text-white/60 mb-8 text-sm">
          {t.cta.body}
        </p>
        <Link
          href="/#join"
          className="inline-block px-9 py-4 bg-gradient-to-br from-coral-soft to-warmth text-forest-deep font-bold rounded-full no-underline shadow-[0_4px_24px_rgba(212,160,160,0.3)] hover:-translate-y-0.5 transition-transform"
        >
          {t.cta.button}
        </Link>
      </section>

      {/* Footer */}
      <footer className="bg-forest-deep text-white/40 py-10 px-10 text-center text-xs border-t border-white/5">
        <p>附近森林 · Nearby Forest</p>
        <p className="mt-2">{t.footerTagline}</p>
      </footer>
    </>
  );
}
