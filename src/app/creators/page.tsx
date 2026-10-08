import { createClient } from '@supabase/supabase-js';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getContent } from '@/lib/content';
import Nav from '@/components/Nav';
import { dict } from '@/i18n';
import { tr } from '@/lib/contentTranslate';
import { getLocale } from '@/lib/locale';
import { fetchListedNodes } from '@/lib/nodeVisibility';
import CreatorTree from '@/components/CreatorTree';
import { isAdminId } from '@/lib/admin';
import { canSeeContacts } from '@/lib/memberTrust';
import { getAuthenticatedMemberId } from '@/lib/session';
import { creatorLooks } from '@/lib/space/creatorLooks';
import { applySpaceVisibilityMany } from '@/lib/space/platformVisibility';
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

  // 只取在森林里的那些。空卡（轻登记刚建、还没填）和收起来的、离开的都不在此列——
  // 判定在 lib/nodeVisibility.ts，不要在这里自己拼 filter
  return fetchListedNodes(createClient(supabaseUrl, serviceKey));
}

export default async function CreatorsPage() {
  const { frontmatter, content } = getContent('creators');
  const [listed, locale, meId] = await Promise.all([fetchCreators(), getLocale(), getAuthenticatedMemberId()]);
  // 卡上的关键词会从「经历」「可以提供」里抽：本人在个人空间里把这些设得更严时，卡片照着裁（和星空、资料页一致）
  const viewerNode = meId ? listed.find(n => n.id === meId) ?? null : null;
  const creators = await applySpaceVisibilityMany(listed, {
    viewerId: meId, isMember: canSeeContacts(viewerNode), isAdmin: isAdminId(meId),
  });
  // 每张卡长成这个人空间的样子；发布了个人空间的，点进去就是他的空间
  const looks = await creatorLooks(listed);
  const t = dict(locale).creators;
  const sp = dict(locale).creatorDetail.space;
  // 页头的小标题、标题、导语写在 content/creators.md 里，主理人自己改——走内容对照表，
  // 不搬进字典，否则那条 markdown 编辑链路就断了
  const lede = content.trim().split('\n\n')[0];
  // 已经开放个人网站的排在前面（各自仍按加入时间）：点进去就是一个真正的网站，也让「发布」这件事被看见
  const ordered = [...creators].sort(
    (a, b) => Number(!!(b.id && looks.get(b.id)?.spaceHref)) - Number(!!(a.id && looks.get(a.id)?.spaceHref)),
  );
  // 自己就在森林里的成员：页头右边给一个回到「我的网站空间」的入口
  const myLook = viewerNode?.id ? looks.get(viewerNode.id) : undefined;
  const mySpaceHref = viewerNode?.id ? myLook?.spaceHref ?? `/space/${viewerNode.id}` : null;

  return (
    <>
      <Nav />

      {/*
        首屏让人先看到人：页头压成一段（和社区广场同一套），卡片紧跟着上来——
        桌面上第一排卡片整排在首屏里，手机上第一张卡片整张在首屏里。
        原来那块深绿大 hero 和「作品书架」大卡片把卡片挤到了首屏以外。
      */}
      <main className="bg-[linear-gradient(180deg,#fff_0%,#faf8f2_100%)] px-10 pb-20 pt-32 max-md:px-7 max-md:pb-14 max-md:pt-28">
        <div className="mx-auto max-w-[1200px]">
          <header className="mb-8 flex items-end justify-between gap-8 max-lg:flex-col max-lg:items-start max-lg:gap-4 max-md:mb-6">
            <div className="min-w-0 max-w-[820px] flex-1">
              <p className="m-0 mb-3 text-[11px] font-medium uppercase tracking-[3px] text-forest-light">
                {tr(String(frontmatter.label || '创造者平台'), locale)}
              </p>
              <h1 className="m-0 text-balance font-serif text-[clamp(1.9rem,3.4vw,2.75rem)] font-normal leading-[1.2] text-forest-deep">
                {tr(String(frontmatter.title || '创造者平台'), locale)}
              </h1>
              {lede && (
                <p className="mb-0 mt-3 max-w-[680px] text-[15px] leading-[1.8] text-text-secondary max-md:text-[14px]">
                  {tr(lede, locale)}
                </p>
              )}
            </div>
            {creators.length > 0 && (
              <div className="flex shrink-0 flex-col items-end gap-2 text-right max-lg:items-start max-lg:text-left">
                <p className="m-0 text-[13px] tracking-[0.12em] text-forest-light">{t.treeCount(creators.length)}</p>
                {mySpaceHref && (
                  <a
                    href={mySpaceHref}
                    className="inline-flex min-h-10 items-center gap-2 rounded-full border border-forest-deep/10 bg-white/85 py-1 pl-1.5 pr-4 text-[13px] text-forest-deep no-underline transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-mid"
                  >
                    <span className={`rounded-full px-2 py-0.5 text-[11.5px] ${myLook?.spaceHref ? 'bg-[#e4eadb] text-[#2f513d]' : 'bg-[#f1e6cf] text-[#6d5424]'}`}>
                      {myLook?.spaceHref ? sp.statusLive : sp.statusDraft}
                    </span>
                    {sp.titleOwn} →
                  </a>
                )}
              </div>
            )}
          </header>

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
                className="inline-block px-8 py-3.5 bg-gradient-to-br from-coral-soft to-warmth text-forest-deep font-medium rounded-full no-underline shadow-[0_4px_24px_rgba(212,160,160,0.3)] hover:-translate-y-0.5 transition-transform"
              >
                {t.empty.cta}
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-7 max-lg:grid-cols-2 max-md:grid-cols-1 max-md:gap-5">
                {ordered.map(node => {
                  const look = node.id ? looks.get(node.id) : undefined;
                  return (
                    <Link
                      key={node.id}
                      href={look?.spaceHref ?? (node.id ? `/creators/${node.id}` : '/creators')}
                      // 整张卡是一个链接：读屏先听到「谁、去哪」，而不是先念一串关键词
                      aria-label={`${node.name || t.tree.unnamed}${node.city ? `，${node.city}` : ''} · ${look?.spaceHref ? t.tree.visitSpace : t.tree.closer}`}
                      className="no-underline block rounded-[14px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest-mid"
                    >
                      <CreatorTree node={node} locale={locale} look={look} />
                    </Link>
                  );
                })}
              </div>

              {/* 作品书架：从首屏的大卡片退到卡片下面的一行（它是上线手记 /launch 唯一的入口，留着） */}
              <Link
                href="/launch"
                className="group mt-14 flex items-baseline gap-3 border-t border-forest-deep/10 pt-6 text-[13.5px] leading-[1.7] text-text-secondary no-underline max-md:mt-10 max-md:flex-col max-md:gap-1.5"
              >
                <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-forest-light">{t.shelf.eyebrow}</span>
                <span className="flex-1">{t.shelf.body}</span>
                <span className="shrink-0 whitespace-nowrap font-medium text-forest-deep group-hover:text-forest-mid">
                  {t.shelf.cta} <span aria-hidden className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
                </span>
              </Link>
            </>
          )}
        </div>
      </main>

      {/* 邀请种一棵树：已经在森林里的成员不用再看（导航上也已经是「个人中心」） */}
      {!viewerNode && (
      <section className="py-16 px-10 bg-forest-deep text-center max-md:py-12 max-md:px-7">
        <h2 className="font-serif text-[clamp(1.5rem,3vw,2rem)] font-normal text-white mb-4">
          {t.cta.title}
        </h2>
        <p className="text-white/60 mb-8 text-sm">
          {t.cta.body}
        </p>
        <Link
          href="/#join"
          className="inline-block px-9 py-4 bg-gradient-to-br from-coral-soft to-warmth text-forest-deep font-medium rounded-full no-underline shadow-[0_4px_24px_rgba(212,160,160,0.3)] hover:-translate-y-0.5 transition-transform"
        >
          {t.cta.button}
        </Link>
      </section>
      )}

      {/* Footer */}
      <footer className="bg-forest-deep text-white/55 py-10 px-10 text-center text-xs border-t border-white/5">
        <p>附近森林 · Nearby Forest</p>
        <p className="mt-2">{t.footerTagline}</p>
      </footer>
    </>
  );
}
