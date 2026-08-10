import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';
import Avatar from '@/components/Avatar';
import AvatarUploader from '@/components/AvatarUploader';
import RelationNetwork from '@/components/RelationNetwork';
import WorksCarousel from '@/components/WorksCarousel';
import WorksEditor from '@/components/WorksEditor';
import AIRecommendations from '@/components/AIRecommendations';
import ProfileEditor from '@/components/ProfileEditor';
import PhilMemoriesManager from '@/components/PhilMemoriesManager';
import { buildRelationGraph } from '@/lib/network';
import { isAdminId } from '@/lib/admin';
import { getAuthenticatedMemberId } from '@/lib/session';
import { canSeeContacts } from '@/lib/memberTrust';
import { toPublicGraph } from '@/lib/publicNode';
import { dict } from '@/i18n';
import { getLocale, type Locale } from '@/lib/locale';
import type { NodeCard, Work, AIRecommendation } from '@/lib/supabase';

/** 主理人本名，不随语言变 */
const ADMIN_NAME = '小 Z';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
};

async function fetchAll(): Promise<NodeCard[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return [];
  const supabase = createClient(supabaseUrl, serviceKey);
  const { data, error } = await supabase.from('node_cards').select('*');
  if (error || !data) return [];
  return data as NodeCard[];
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const all = await fetchAll();
  const me = all.find(n => n.id === id);
  const t = dict(await getLocale()).creatorDetail;
  if (!me) return { title: t.metaTitleFallback };
  return {
    // 名字和「正在做」都是本人填的，不翻
    title: t.metaTitle(me.name),
    description: me.doing || t.metaDescriptionFallback,
  };
}

export default async function CreatorDetail({ params }: Props) {
  const { id } = await params;
  const all = await fetchAll();
  const me = all.find(n => n.id === id);
  if (!me) notFound();

  const graph = buildRelationGraph(me, all, 8);

  const [memberId, locale] = await Promise.all([getAuthenticatedMemberId(), getLocale()]);
  const t = dict(locale).creatorDetail;
  /**
   * 能不能看别人的联系方式，看的是「邮箱验证过没有」，不只是「登录了没有」。
   * 注册流程不验证邮箱，只认登录态的话，任何人编个邮箱就能抄走整份通讯录。
   * 老成员按已验证对待，见 canSeeContacts。
   */
  const viewer = memberId ? all.find(n => n.id === memberId) ?? null : null;
  const isMember = canSeeContacts(viewer);
  const isOwner = memberId === me.id;
  const isAdmin = isAdminId(memberId);
  const canEditAvatar = isOwner || isAdmin;
  const canEditWorks = isOwner || isAdmin;
  const canEditProfile = isOwner || isAdmin;
  const canSeeRecommendations = isOwner || isAdmin;
  const works: Work[] = Array.isArray(me.works) ? me.works : [];
  const recommendations: AIRecommendation[] = Array.isArray(me.ai_recommendations)
    ? me.ai_recommendations
    : [];

  const tags = (me.keywords && me.keywords.length > 0)
    ? me.keywords.slice(0, 8)
    : (me.topics || []).slice(0, 8);

  return (
    <>
      <Nav />

      {/* Apple-style hero — 极简留白 + 大头像 + 大字名 */}
      <header className="relative pt-32 pb-20 px-6 text-center bg-gradient-to-b from-[#fafaf7] via-[#f5f5f0] to-[#faf8f2] max-md:pt-28 max-md:pb-12">
        {/* 顶部返回 */}
        <div className="absolute top-24 left-6 max-md:top-20 max-md:left-4">
          <Link
            href="/creators"
            className="inline-flex items-center gap-1.5 text-[13px] text-text-light hover:text-forest-mid transition-colors"
          >
            <span>←</span>
            <span>{t.backToForest}</span>
          </Link>
        </div>
        {/* 已登录提示（自己的页面） / 游客可登录入口 */}
        <div className="absolute top-24 right-6 max-md:top-20 max-md:right-4 text-[12.5px]">
          {isOwner ? (
            <a
              href={`/api/logout?back=/creators/${me.id}`}
              className="text-text-light hover:text-forest-mid transition-colors"
            >
              {t.logout}
            </a>
          ) : isAdmin ? (
            <span className="text-moss font-medium">{t.adminView(ADMIN_NAME)}</span>
          ) : isMember ? null : (
            <Link
              href="/login"
              className="text-text-light hover:text-forest-mid transition-colors"
            >
              {t.login}
            </Link>
          )}
        </div>

        <div className="max-w-[680px] mx-auto">
          {/* 头像（本人或管理员可上传，其他人只看） */}
          <div className="flex justify-center">
            {canEditAvatar ? (
              <AvatarUploader locale={locale}
                id={me.id!}
                currentUrl={me.avatar_url}
                name={me.name}
                size={128}
                mode={isOwner ? 'owner' : 'admin'}
              />
            ) : (
              <Avatar name={me.name} url={me.avatar_url} size={128} />
            )}
          </div>

          {/* 姓名 — Apple 风 display */}
          <h1
            className="mt-7 text-[44px] leading-[1.1] font-light tracking-[-0.02em] text-forest-deep max-md:text-[34px]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {me.name}
          </h1>

          {/* 城市副标题 */}
          {me.city && (
            <p className="mt-3 text-[16px] text-text-light tracking-wide">
              {me.city}
            </p>
          )}

          {/* 关键词（轨道卡上的同款，但水平铺开） */}
          {tags.length > 0 && (
            <div className="mt-7 flex flex-wrap justify-center gap-1.5">
              {tags.map(t => (
                <span
                  key={t}
                  className="inline-block px-3 py-1 bg-white/80 backdrop-blur-sm border border-black/[0.06] rounded-full text-[12px] text-forest-deep font-medium shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* 主体 — 干净的白底 */}
      <main className="bg-white">
        <div className="max-w-[680px] mx-auto px-6 py-16 max-md:py-10 max-md:px-7">
          {canEditProfile && (
            <div className="mb-10 max-md:mb-7">
              <ProfileEditor locale={locale} node={me} mode={isOwner ? 'owner' : 'admin'} />
            </div>
          )}
          {isOwner && (
            <div className="mb-10 max-md:mb-7">
              <PhilMemoriesManager locale={locale} />
            </div>
          )}
          <div className="space-y-12 max-md:space-y-9">
            <Section label={t.section.doing} body={me.doing} />
            <WorksSection
              t={t}
              locale={locale}
              nodeId={me.id!}
              works={works}
              legacyText={me.product}
              canEdit={canEditWorks}
              isOwner={isOwner}
            />
            <Section label={t.section.experience} body={me.experience} />
            <Section label={t.section.offer} body={me.offer} />
            <Section label={t.section.seeking} body={me.seeking} tone="coral" />
            <Section label={t.section.interests} body={me.interests} />
          </div>
        </div>

        {canSeeRecommendations && (
          <div className="max-w-[680px] mx-auto px-6 pb-12 max-md:px-7 max-md:pb-8">
            <div className="rounded-2xl bg-gradient-to-br from-love-pink/8 via-warmth/8 to-leaf/6 border border-coral-soft/25 p-6 max-md:p-5">
              <AIRecommendations locale={locale}
                nodeId={me.id!}
                initial={recommendations}
                generatedAt={me.ai_recommendations_at}
                mode={isOwner ? 'owner' : 'admin'}
              />
            </div>
          </div>
        )}

        {/* 联系方式 — 卡片化 */}
        <div className="max-w-[680px] mx-auto px-6 pb-16 max-md:px-7 max-md:pb-10">
          <div className="rounded-2xl bg-[#fafaf7] border border-black/[0.06] p-7 max-md:p-5">
            <div className="text-[11px] font-semibold tracking-[0.18em] text-text-light uppercase mb-4">
              {t.contact.title}
            </div>
            {isMember ? (
              <ContactBlock node={me} t={t} />
            ) : (
              <GatedContact t={t} />
            )}
          </div>
        </div>
      </main>

      {/* 关系网 */}
      <section className="bg-[#fafaf7] py-16 px-6 max-md:py-10 max-md:px-4 border-t border-black/[0.04]">
        <div className="max-w-[1000px] mx-auto">
          <div className="text-center mb-8">
            <div className="text-[11px] font-semibold tracking-[0.18em] text-text-light uppercase mb-2">
              Relation Network
            </div>
            <h2
              className="text-[24px] font-normal tracking-[-0.01em] text-forest-deep max-md:text-[20px]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {t.network.title(me.name)}
            </h2>
            <p className="mt-2 text-[13px] text-text-light leading-relaxed max-w-md mx-auto">
              {t.network.note}
            </p>
          </div>

          {graph.neighbors.length === 0 ? (
            <p className="text-center py-12 text-text-light text-[13px]">
              {t.network.empty1}
              <br />
              {t.network.empty2}
            </p>
          ) : (
            <div className="bg-white rounded-2xl border border-black/[0.06] p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] max-md:p-3">
              <RelationNetwork locale={locale} graph={toPublicGraph(graph)} isMember={isMember} />
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      {!isOwner && (
        <section className="py-14 px-6 bg-white text-center max-md:py-10 border-t border-black/[0.04]">
          <h2
            className="text-[22px] font-normal tracking-[-0.01em] text-forest-deep mb-3"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {t.joinCta.title}
          </h2>
          <Link
            href="/#join"
            className="inline-block mt-2 px-7 py-3 bg-forest-deep text-white text-[14px] font-medium rounded-full no-underline hover:bg-forest-mid transition-colors"
          >
            {t.joinCta.button}
          </Link>
        </section>
      )}

      <footer className="bg-white text-text-light py-10 px-6 text-center text-[11px] border-t border-black/[0.04]">
        <p>{t.footer.brand}</p>
        <p className="mt-1.5 text-text-light/70">{t.footer.tagline}</p>
      </footer>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────
// 内部子组件
// ──────────────────────────────────────────────────────────────────

function Section({
  label,
  body,
  tone = 'leaf',
}: {
  label: string;
  body?: string | null;
  tone?: 'leaf' | 'coral';
}) {
  if (!body || !body.trim()) return null;
  const accent = tone === 'coral' ? 'text-coral' : 'text-moss';
  return (
    <section>
      <div className={`text-[11px] font-semibold tracking-[0.18em] uppercase mb-3 ${accent}`}>
        {label}
      </div>
      <p className="text-[16px] leading-[1.85] text-text-secondary whitespace-pre-wrap">
        {body}
      </p>
    </section>
  );
}

function WorksSection({
  nodeId,
  works,
  legacyText,
  canEdit,
  isOwner,
  t,
  locale,
}: {
  nodeId: string;
  works: Work[];
  legacyText?: string | null;
  canEdit: boolean;
  isOwner: boolean;
  t: ReturnType<typeof dict>['creatorDetail'];
  /** 里面的 WorksEditor 是客户端组件，按约定只收 locale */
  locale: Locale;
}) {
  const hasWorks = works.length > 0;
  const hasLegacy = !!(legacyText && legacyText.trim());
  // 完全没有作品、也没有遗留文本、且当前访客不能编辑 → 整段隐藏
  if (!hasWorks && !hasLegacy && !canEdit) return null;

  return (
    <section>
      <div className="text-[11px] font-semibold tracking-[0.18em] uppercase mb-3 text-moss">
        {t.works.title}
      </div>

      {hasWorks ? (
        <WorksCarousel works={works} />
      ) : hasLegacy ? (
        <p className="text-[16px] leading-[1.85] text-text-secondary whitespace-pre-wrap">
          {legacyText}
        </p>
      ) : canEdit ? (
        <p className="text-[13px] text-text-light">
          {t.works.emptyBefore}<span className="font-medium text-forest-deep">{t.works.emptyAccent}</span>{t.works.emptyAfter}
        </p>
      ) : null}

      {canEdit && (
        <WorksEditor locale={locale}
          nodeId={nodeId}
          works={works}
          mode={isOwner ? 'owner' : 'admin'}
        />
      )}
    </section>
  );
}

function ContactBlock({ node, t }: { node: NodeCard; t: ReturnType<typeof dict>['creatorDetail'] }) {
  if (!node.wechat && !node.email) {
    return (
      <p className="text-[13px] text-text-light">
        {t.contact.none}
      </p>
    );
  }
  return (
    <dl className="space-y-3 text-[14px]">
      {node.wechat && (
        <div className="flex items-baseline gap-4">
          <dt className="text-text-light w-12 shrink-0 text-[12px] tracking-wide">{t.contact.wechat}</dt>
          <dd className="font-mono text-forest-deep font-medium break-all">{node.wechat}</dd>
        </div>
      )}
      {node.email && (
        <div className="flex items-baseline gap-4">
          <dt className="text-text-light w-12 shrink-0 text-[12px] tracking-wide">{t.contact.email}</dt>
          <dd>
            <a
              href={`mailto:${node.email}`}
              className="text-forest-deep font-medium break-all underline-offset-4 hover:underline"
            >
              {node.email}
            </a>
          </dd>
        </div>
      )}
    </dl>
  );
}

function GatedContact({ t }: { t: ReturnType<typeof dict>['creatorDetail'] }) {
  return (
    <div className="text-center py-3">
      <p className="text-[13.5px] text-text-secondary leading-relaxed mb-5">
        {t.contact.membersOnly}
        <br />
        {t.contact.membersOnlyHint}
      </p>
      <Link
        href="/#join"
        className="inline-block px-6 py-2.5 bg-forest-deep text-white text-[13px] font-medium rounded-full no-underline hover:bg-forest-mid transition-colors"
      >
        {t.contact.cta}
      </Link>
    </div>
  );
}
