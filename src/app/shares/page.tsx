/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import Nav from '@/components/Nav';
import { dict } from '@/i18n';
import { tr } from '@/lib/contentTranslate';
import { getLocale, type Locale } from '@/lib/locale';
import ShareSubmitForm from '@/components/ShareSubmitForm';
import CreateMenu from '@/components/square/CreateMenu';
import { isAdminId } from '@/lib/admin';
import { getAuthenticatedMemberId } from '@/lib/session';
import { fetchShareContent, getPublishedShares, getShareBadgeLabel, type ShareEntry } from '@/lib/shares';
import Image from 'next/image';
import { createClient } from '@supabase/supabase-js';
import { canSeeContacts } from '@/lib/memberTrust';
import { canOptimize } from '@/lib/space/image';
import { formatEventTime, formatFee, MODE_LABEL, MODE_LABEL_EN } from '@/lib/space/eventTime';
import { countdown, listSquareEvents, type SquareEvent } from '@/lib/space/square';
import type { NodeCard } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/** 「仅森林成员可见」的活动：看的是邮箱验证过没有（和资料页、星空同一个口径，见 canSeeContacts） */
async function isVerifiedMember(id: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  try {
    const { data } = await createClient(url, key).from('node_cards').select('*').eq('id', id)
      .abortSignal(AbortSignal.timeout(8000)).maybeSingle();
    return canSeeContacts((data as NodeCard | null) ?? null);
  } catch {
    return false;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const t = dict(await getLocale()).shares;
  return { title: t.metaTitle, description: t.metaDescription };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

/**
 * 社区广场（原「个体创造 / 林间分享」）。两个标签：
 * - 发起吧：各个个人空间里正在报名的活动（lib/space/square.ts）。点一条进到发起人空间里的那场活动报名
 * - Aha Moment：成员投稿、创始人团队审核过的作品 / 产品 / 体验 / 灵感片段（原来的林间分享）
 * 右上「去创作」：Aha! 和写文章都落到同一个投稿表单（各给一句提示）；发起活动去自己空间的「活动与报名」。
 */
export default async function SharesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const tab: 'events' | 'aha' = one(sp.tab) === 'aha' ? 'aha' : 'events';
  const sort: 'new' | 'soon' = one(sp.sort) === 'soon' ? 'soon' : 'new';
  const kind = one(sp.kind) === 'article' ? 'article' : 'aha';
  const [content, memberId, locale] = await Promise.all([
    fetchShareContent(),
    getAuthenticatedMemberId(),
    getLocale(),
  ]);
  // 没登录时点了「发起活动」：登录完回到这里，再送去自己空间的活动管理
  if (one(sp.create) === 'event' && memberId) redirect(`/space/${memberId}/manage?tab=events`);
  const t = dict(locale).shares;
  const q = t.square;
  const en = locale === 'en';
  const isAdmin = isAdminId(memberId);
  const publishedShares = getPublishedShares(content);
  const events = await listSquareEvents(
    { viewerId: memberId || '', isMember: !!memberId && (await isVerifiedMember(memberId)), isAdmin },
    sort,
  );

  const href = (next: Record<string, string>) => {
    const u = new URLSearchParams({ tab, sort, ...next });
    if (u.get('tab') === 'events') u.delete('tab');
    if (u.get('sort') === 'new') u.delete('sort');
    const s = u.toString();
    return `/shares${s ? `?${s}` : ''}`;
  };
  // 没登录：先去登录，登录完回到这里要去的地方（不再落到资料页、把「我要发起活动」弄丢）
  const eventHref = memberId ? `/space/${memberId}/manage?tab=events` : '/login?next=/shares%3Fcreate%3Devent';
  const loginBack = `/login?next=${encodeURIComponent(`${href({ tab: 'aha', kind })}#submit`)}`;

  return (
    <>
      <Nav />
      <main className="min-h-screen bg-[linear-gradient(180deg,#fff_0%,#faf8f2_100%)] px-8 pb-24 pt-32 max-md:px-4 max-md:pt-28">
        <div className="mx-auto max-w-[1040px]">
          <header className="mb-8 max-md:mb-6 max-md:px-3">
            <div className="mb-3 text-[11px] font-medium tracking-[3px] text-[#9a4a2c] uppercase">{q.eyebrow}</div>
            <h1 className="m-0 text-[clamp(1.9rem,3.6vw,2.8rem)] font-light leading-[1.25] text-forest-deep" style={{ fontFamily: 'var(--font-display)' }}>
              {q.title}
            </h1>
            <p className="mt-4 mb-0 max-w-[640px] text-[15px] leading-[1.9] text-text-secondary">{q.lede}</p>
          </header>

          {/* 工具条：标签 · 排序 · 去创作 */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-forest-deep/[0.08] bg-white/85 px-4 py-3 shadow-[0_6px_30px_rgba(26,46,26,0.05)]">
            <nav className="flex flex-wrap gap-2" aria-label={q.eyebrow}>
              {([['events', q.tabEvents, events.length], ['aha', q.tabAha, publishedShares.length]] as const).map(([id, label, n]) => (
                <Link key={id} href={href({ tab: id })} aria-current={tab === id ? 'page' : undefined}
                  className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-4 text-[17px] no-underline transition-colors max-[359px]:px-3 max-[359px]:text-[15px] ${tab === id ? 'bg-forest-deep text-white' : 'bg-[#f3f1ea] text-forest-deep hover:bg-[#ebe7dc]'}`}>
                  {label}<span className={`text-[12px] ${tab === id ? 'text-white/75' : 'text-text-secondary'}`}>{n}</span>
                </Link>
              ))}
            </nav>
            {/* 右边一组在窄屏上整颗换行，不把字挤成一个字一行 */}
            <div className="flex flex-wrap items-center gap-2">
              {tab === 'events' && (
                <div className="flex shrink-0 whitespace-nowrap rounded-xl border border-forest-deep/10 p-0.5 text-[13px]" role="group" aria-label={q.sortLabel}>
                  {([['new', q.sortNew], ['soon', q.sortSoon]] as const).map(([id, label]) => (
                    <Link key={id} href={href({ sort: id })} aria-current={sort === id ? 'true' : undefined}
                      className={`rounded-[10px] px-3 py-1.5 no-underline ${sort === id ? 'bg-[#f3f1ea] text-forest-deep font-medium' : 'text-text-secondary'}`}>
                      {label}
                    </Link>
                  ))}
                </div>
              )}
              {/* 去创作：原生 details 下拉，补上 Esc / 点外面 / 焦点移走时收起 */}
              <CreateMenu label={<><span aria-hidden className="text-[18px] leading-none">+</span>{q.create}</>}>
                  <a href={`${href({ tab: 'aha', kind: 'aha' })}#submit`} className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-forest-deep no-underline hover:bg-[#f3f1ea]">
                    <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full bg-[#f1e6cf] text-[13px]">✦</span>{q.createAha}
                  </a>
                  <a href={`${href({ tab: 'aha', kind: 'article' })}#submit`} className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-forest-deep no-underline hover:bg-[#f3f1ea]">
                    <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full bg-[#e4eadb] text-[13px]">文</span>{q.createArticle}
                  </a>
                  <a href={eventHref} className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-forest-deep no-underline hover:bg-[#f3f1ea]">
                    <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full bg-[#fde6d4] text-[13px]">聚</span>{q.createEvent}
                  </a>
              </CreateMenu>
              {isAdmin && (
                <Link href="/shares/admin" className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-xl border border-coral-soft/40 px-3 text-[13px] text-[#9a4a2c] no-underline">
                  {t.manage}
                </Link>
              )}
            </div>
          </div>

          {tab === 'events' ? (
            events.length ? (
              <ul className="m-0 mt-4 list-none overflow-hidden rounded-2xl border border-forest-deep/[0.08] bg-white/90 p-0">
                {events.map(e => <EventRow key={e.id} e={e} q={q} en={en} />)}
              </ul>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-forest-deep/15 bg-white/70 px-6 py-14 text-center">
                <p className="m-0 text-[17px] text-forest-deep">{q.emptyEvents}</p>
                <p className="mx-auto mt-2 mb-6 max-w-[460px] text-[14px] leading-[1.8] text-text-secondary">{q.emptyEventsHint}</p>
                <a href={eventHref} className="inline-flex min-h-11 items-center rounded-full bg-forest-deep px-5 text-[14px] text-white no-underline">{q.createEvent} →</a>
              </div>
            )
          ) : (
            <>
              {publishedShares.length ? (
                <div className="mt-6 grid grid-cols-3 gap-7 max-lg:grid-cols-2 max-md:grid-cols-1">
                  {publishedShares.map(share => (
                    <ShareCard key={share.id} share={share} locale={locale} />
                  ))}
                </div>
              ) : (
                <p className="mt-6 text-center text-[15px] text-text-secondary">{q.emptyAha}</p>
              )}
              <section id="submit" className="mt-16 scroll-mt-28">
                <p className="mb-4 rounded-xl bg-[#f3f1ea] px-4 py-3 text-[14px] leading-[1.8] text-forest-deep">
                  {kind === 'article' ? q.hintArticle : q.hintAha}
                </p>
                <ShareSubmitForm isLoggedIn={!!memberId} locale={locale} kind={kind} loginHref={loginBack} />
              </section>
            </>
          )}
        </div>
      </main>
    </>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0 text-text-light" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
const ICON_DATE = 'M7 3v3M17 3v3M4 9h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z';
const ICON_PLACE = 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z';
const ICON_TIME = 'M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9';

/** 「发起吧」的一条：封面 · 标题 · 时间 · 地点 · 报名截止 · 发起人 · 费用 · 已报名人数 */
function EventRow({ e, q, en }: { e: SquareEvent; q: ReturnType<typeof dict>['shares']['square']; en: boolean }) {
  const modes = en ? MODE_LABEL_EN : MODE_LABEL;
  const place = e.mode === 'online'
    ? `${q.online}${e.place ? ` - ${e.place}` : ''}`
    : e.mode === 'both' ? `${modes.both}${e.place ? ` · ${e.place}` : ''}` : e.place || modes.offline;
  const hostName = e.host.name || (en ? 'A forest member' : '一位森林成员');
  const full = e.left === 0;
  return (
    <li className="border-b border-forest-deep/[0.07] last:border-b-0">
      <div className="relative flex gap-5 px-6 py-5 transition-colors hover:bg-[#faf8f2] has-[a:focus-visible]:bg-[#faf8f2] max-md:gap-3.5 max-md:px-4">
        {/* 整行可点。焦点框画在里面：外面那层 ul 有 overflow-hidden，画在外面会被裁掉只剩一条线 */}
        <a href={e.href} className="absolute inset-0 z-[1] rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-forest" aria-label={e.title} />
        <div className="relative h-[136px] w-[136px] shrink-0 overflow-hidden rounded-xl bg-[#e4eadb] max-md:h-[92px] max-md:w-[92px]">
          {e.coverUrl ? (
            <img src={e.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : e.host.avatarUrl ? (
            <Image src={e.host.avatarUrl} alt="" fill sizes="136px" className="object-cover" unoptimized={!canOptimize(e.host.avatarUrl)} />
          ) : (
            <span className="grid h-full w-full place-items-center text-[40px] text-forest-deep/40" style={{ fontFamily: 'var(--font-display)' }}>
              {[...e.title.trim()][0] || '·'}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-[19px] font-medium leading-[1.4] text-forest-deep max-md:text-[16px]">{e.title}</h2>
          <p className="mt-2 mb-0 flex items-start gap-2 text-[14.5px] text-text-secondary max-md:text-[13px]">
            <Icon d={ICON_DATE} /><span>{formatEventTime(e.startsAt, e.endsAt, undefined, en)}<span className="whitespace-nowrap">{q.beijing}</span></span>
          </p>
          <p className="mt-1.5 mb-0 flex items-start gap-2 text-[14.5px] text-text-secondary max-md:text-[13px]">
            <Icon d={ICON_PLACE} /><span className="min-w-0 break-words">{place}</span>
          </p>
          <p className="mt-1.5 mb-0 flex items-center gap-2 text-[14.5px] text-text-secondary max-md:text-[13px]">
            <Icon d={ICON_TIME} /><span>{q.deadline}<span className="whitespace-nowrap font-medium text-[#b84f36]">{countdown(e.startsAt, en)}</span></span>
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 max-md:mt-3">
            {/* 发起人：点它去 TA 的空间（压在整行链接上面） */}
            <a href={e.host.href} className="relative z-[2] inline-flex items-center gap-2 text-[14px] text-text-secondary no-underline hover:text-forest-deep">
              <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-[#e4eadb]">
                {e.host.avatarUrl && <Image src={e.host.avatarUrl} alt="" fill sizes="32px" className="object-cover" unoptimized={!canOptimize(e.host.avatarUrl)} />}
              </span>
              {hostName}
            </a>
            <span className={`inline-flex min-w-[72px] justify-center rounded-md px-3 py-1 text-[13px] font-medium ${e.feeCents ? 'bg-[#fde6d4] text-[#9a4a2c]' : 'bg-forest-mid text-white'}`}>
              {e.feeCents ? formatFee(e.feeCents) : q.free}
            </span>
            <span className="ml-auto text-[13.5px] text-text-secondary max-md:ml-0">
              {full ? q.full : <>{q.signedUp}{e.taken}/{e.capacity ?? q.unlimited}</>}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}

/**
 * 卡片上的字全是主理人在后台填的，代码里翻不了——每一段都过 tr()
 * 查 content-en.json 那张对照表。表里没有的会原样回落成中文，
 * 所以后台新加了分享之后要重跑一次 scripts/translate-content.mjs。
 */
function ShareCard({ share, locale }: { share: ShareEntry; locale: Locale }) {
  const inner = (
    <article className="group overflow-hidden rounded-lg border border-forest-deep/10 bg-white/72 shadow-[0_14px_50px_rgba(26,46,26,0.06)]">
      <ShareMedia share={share} locale={locale} />
      <div className="p-6">
        <div className="mb-4 flex items-center gap-3 text-[11px] tracking-[0.16em] text-coral uppercase">
          <span className="h-px w-7 bg-coral-soft/60" />
          {tr(share.kicker, locale)}
        </div>
        <h2 className="text-[1.35rem] font-normal leading-[1.45] text-forest-deep">
          {tr(share.title, locale)}
        </h2>
        <p className="mt-3 text-[13.5px] leading-[1.85] text-text-secondary">
          {tr(share.summary, locale)}
        </p>
        <div className="mt-5 text-[12px] text-text-light">
          {getShareBadgeLabel(share, locale)}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {share.tags.map(tag => (
            <span key={tag} className="rounded-full border border-forest-deep/10 px-3 py-1 text-[12px] text-forest-deep/55">
              {tr(tag, locale)}
            </span>
          ))}
        </div>
      </div>
    </article>
  );

  if (!share.href) return inner;
  return (
    <a href={share.href} target="_blank" rel="noreferrer" className="block no-underline">
      {inner}
    </a>
  );
}

function ShareMedia({ share, locale }: { share: ShareEntry; locale: Locale }) {
  if (share.mediaKind === 'video' && share.mediaUrl) {
    return (
      <video
        controls
        preload="metadata"
        poster={share.posterUrl || undefined}
        className="aspect-video w-full object-cover bg-[#173018]"
      >
        <source src={share.mediaUrl} />
      </video>
    );
  }

  if ((share.mediaKind === 'image' || share.mediaKind === 'poster') && share.mediaUrl) {
    return <img src={share.mediaUrl} alt={tr(share.title, locale)} className="aspect-video w-full object-cover bg-[#173018]" />;
  }

  if (share.posterUrl) {
    return <img src={share.posterUrl} alt={tr(share.title, locale)} className="aspect-video w-full object-cover bg-[#173018]" />;
  }

  return (
    <div className="relative aspect-video w-full bg-[linear-gradient(135deg,#132413_0%,#263f26_55%,#6b7b62_100%)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.12),transparent_34%)]" />
    </div>
  );
}
