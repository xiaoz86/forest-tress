import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import '@/components/space/studio.css';
import '@/components/space/manage/manage.css';
import EventsPanel from '@/components/space/manage/EventsPanel';
import InboxPanel from '@/components/space/manage/InboxPanel';
import SharePanel from '@/components/space/manage/SharePanel';
import VisibilityPanel from '@/components/space/manage/VisibilityPanel';
import Unavailable from '@/components/space/Unavailable';
import { list } from '@/lib/space/db';
import { gateHost, isFail } from '@/lib/space/gate';
import { getSiteOrigin } from '@/lib/notify';
import { DRAFT_BLOCK_LABEL, effectiveDraft } from '@/lib/space/edits';
import { readSpace } from '@/lib/space/store';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '管理我的个人空间', robots: { index: false, follow: false } };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
};

const TABS = [
  { id: 'share', label: '发布与分享' },
  { id: 'visibility', label: '谁能看到' },
  { id: 'events', label: '活动与报名' },
  { id: 'inbox', label: '收件箱' },
] as const;
type Tab = (typeof TABS)[number]['id'];

/** 个人空间的管理页：只给本人和管理员。 */
export default async function ManagePage({ params, searchParams }: Props) {
  const { id } = await params;
  const g = await gateHost(id);
  if (isFail(g)) {
    if (g.status === 503) return <Unavailable what="成员资料" />;
    notFound();
  }
  const raw = (await searchParams).tab;
  const tab: Tab = TABS.some(t => t.id === raw) ? (raw as Tab) : 'share';

  // 标签上的小数字：没读的招呼、新的预约、等你处理的报名
  let counts = { inbox: 0, events: 0 };
  try {
    const [greetings, bookings, regs] = await Promise.all([
      list('greetings', r => r.memberId === g.memberId && !r.readAt),
      list('bookings', r => r.memberId === g.memberId && r.status === 'new'),
      list('registrations', r => r.memberId === g.memberId && (r.status === 'claimed' || r.status === 'waitlist')),
    ]);
    counts = { inbox: greetings.length + bookings.length, events: regs.length };
  } catch (err) {
    console.error('[space] manage counts', err);
  }

  // 还有哪些 AI 起稿本人没确认过：顶部提醒，发布前也提醒
  let pending: string[] = [];
  try {
    const rec = await readSpace(g.memberId);
    if (rec.result) pending = effectiveDraft(rec.result.draft, rec.edits).pending.map(b => DRAFT_BLOCK_LABEL[b]);
  } catch (err) {
    console.error('[space] manage pending', err);
  }

  const s = g.settings;
  // 管理员打开别人的管理页：能帮忙改、处理活动和收件箱，但发布要本人来
  const asAdmin = !g.viewer.isOwner;
  const you = asAdmin ? 'TA' : '你';
  return (
    <div className="st mg">
      <header className="st-head">
        <p className="st-kicker">{asAdmin ? '个人空间 · 管理（管理员）' : '个人空间 · 管理'}</p>
        <h1>{g.node.name} 的个人空间</h1>
        <p className="mg-status">
          <span className={`mg-pill ${s.published ? 'is-on' : ''}`}>
            {s.published ? '已发布' : `未发布 · 只有${asAdmin ? ' TA 本人' : '你'}和管理员能看到`}
          </span>
          {s.slug && <span className="mg-slug">nearby-forest.club/@{s.slug}</span>}
        </p>
        {asAdmin && (
          <p className="mg-admin" role="note">
            你正以管理员身份查看 {g.node.name} 的空间。可以帮 TA 改内容、处理活动和收件箱；
            {s.published ? '需要时也可以先下线。' : '发布要 TA 本人来——发布表示 TA 确认了这一版。'}
          </p>
        )}
        {pending.length > 0 && (
          <p className="mg-pending">
            还有 {pending.length} 处 AI 起稿等{you}确认：{pending.join('、')}。
            <a href={`/space/${g.memberId}?edit=1`}>去网站上逐个{asAdmin ? '查看' : '确认'} →</a>
          </p>
        )}
        <p className="mg-go">
          <a href={`/space/${g.memberId}?edit=1`}>在网站上编辑 →</a>
          <a href={`/space/${g.memberId}?tune=1`}>调风格 →</a>
          <a href={`/space/${g.memberId}`}>{asAdmin ? '预览 TA 的网站' : '预览我的网站'} →</a>
          <a href={`/space/${g.memberId}/studio`}>风格工作室 →</a>
        </p>
      </header>

      <nav className="mg-tabs" aria-label="管理">
        {TABS.map(t => {
          const n = t.id === 'inbox' ? counts.inbox : t.id === 'events' ? counts.events : 0;
          return (
            <a key={t.id} href={`/space/${g.memberId}/manage?tab=${t.id}`} aria-current={tab === t.id ? 'page' : undefined}
              className={tab === t.id ? 'is-on' : ''}>
              {t.label}{n > 0 && <b className="mg-badge">{n}</b>}
            </a>
          );
        })}
      </nav>

      <main className="mg-body">
        {tab === 'share' && (
          <SharePanel memberId={g.memberId} origin={getSiteOrigin()} initial={{ published: s.published, slug: s.slug }}
            pendingDrafts={pending.length} asAdmin={asAdmin} />
        )}
        {tab === 'visibility' && (
          <VisibilityPanel memberId={g.memberId}
            initial={{ visibility: s.visibility, greetingsOpen: s.greetingsOpen, bookingsOpen: s.bookingsOpen }} />
        )}
        {tab === 'events' && <EventsPanel memberId={g.memberId} hostName={g.node.name || ''} />}
        {tab === 'inbox' && <InboxPanel memberId={g.memberId} />}
      </main>
    </div>
  );
}
