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
import type { NodeCard, Work, AIRecommendation } from '@/lib/supabase';
import { readMemberId } from '@/lib/session';

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
  if (!me) return { title: '创造者 · 附近森林' };
  return {
    title: `${me.name} · 创造者森林`,
    description: me.doing || '附近森林的一棵创造者之树',
  };
}

export default async function CreatorDetail({ params }: Props) {
  const { id } = await params;
  const all = await fetchAll();
  const me = all.find(n => n.id === id);
  if (!me) notFound();

  const graph = buildRelationGraph(me, all, 8);
  const memberId = await readMemberId();
  const isMember = Boolean(memberId);
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
            <span>创造者森林</span>
          </Link>
        </div>
        {/* 已登录提示（自己的页面） / 游客可登录入口 */}
        <div className="absolute top-24 right-6 max-md:top-20 max-md:right-4 text-[12.5px]">
          {isOwner ? (
            <a
              href={`/api/logout?back=/creators/${me.id}`}
              className="text-text-light hover:text-forest-mid transition-colors"
            >
              退出登录
            </a>
          ) : isAdmin ? (
            <span className="text-moss font-medium">管理员视角 · 小 Z</span>
          ) : isMember ? null : (
            <Link
              href="/login"
              className="text-text-light hover:text-forest-mid transition-colors"
            >
              登录
            </Link>
          )}
        </div>

        <div className="max-w-[680px] mx-auto">
          {/* 头像（本人或管理员可上传，其他人只看） */}
          <div className="flex justify-center">
            {canEditAvatar ? (
              <AvatarUploader
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
            className="mt-7 text-[44px] leading-[1.1] font-semibold tracking-[-0.02em] text-forest-deep max-md:text-[34px]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {me.name}
          </h1>

          {/* 城市副标题 */}
          {me.city && (
            <p className="mt-3 text-[15px] text-text-light tracking-wide">
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
        <div className="max-w-[680px] mx-auto px-6 py-16 max-md:py-10 max-md:px-5">
          {canEditProfile && (
            <div className="mb-10 max-md:mb-7">
              <ProfileEditor node={me} mode={isOwner ? 'owner' : 'admin'} />
            </div>
          )}
          {isOwner && (
            <div className="mb-10 max-md:mb-7">
              <PhilMemoriesManager />
            </div>
          )}
          <div className="space-y-12 max-md:space-y-9">
            <Section label="正在做" body={me.doing} />
            <WorksSection
              nodeId={me.id!}
              works={works}
              legacyText={me.product}
              canEdit={canEditWorks}
              isOwner={isOwner}
            />
            <Section label="经验与独特性" body={me.experience} />
            <Section label="可以提供" body={me.offer} />
            <Section label="正在寻找" body={me.seeking} tone="coral" />
            <Section label="兴趣爱好" body={me.interests} />
          </div>
        </div>

        {canSeeRecommendations && (
          <div className="max-w-[680px] mx-auto px-6 pb-12 max-md:px-5 max-md:pb-8">
            <div className="rounded-2xl bg-gradient-to-br from-love-pink/8 via-warmth/8 to-leaf/6 border border-coral-soft/25 p-6 max-md:p-5">
              <AIRecommendations
                nodeId={me.id!}
                initial={recommendations}
                generatedAt={me.ai_recommendations_at}
                mode={isOwner ? 'owner' : 'admin'}
              />
            </div>
          </div>
        )}

        {/* 联系方式 — 卡片化 */}
        <div className="max-w-[680px] mx-auto px-6 pb-16 max-md:px-5 max-md:pb-10">
          <div className="rounded-2xl bg-[#fafaf7] border border-black/[0.06] p-7 max-md:p-5">
            <div className="text-[11px] font-semibold tracking-[0.18em] text-text-light uppercase mb-4">
              联系方式
            </div>
            {isMember ? (
              <ContactBlock node={me} />
            ) : (
              <GatedContact />
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
              className="text-[24px] font-semibold tracking-[-0.01em] text-forest-deep max-md:text-[20px]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {me.name} 周围的连接
            </h2>
            <p className="mt-2 text-[13px] text-text-light leading-relaxed max-w-md mx-auto">
              森林始终只动态展示 9 个节点以内的关系，由近到远，从紧密到弱连接。
            </p>
          </div>

          {graph.neighbors.length === 0 ? (
            <p className="text-center py-12 text-text-light text-[13px]">
              这棵树还没有相邻的连接。
              <br />
              当更多创造者加入时，关系网会自动生长。
            </p>
          ) : (
            <div className="bg-white rounded-2xl border border-black/[0.06] p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] max-md:p-3">
              <RelationNetwork graph={graph} isMember={isMember} />
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      {!isOwner && (
        <section className="py-14 px-6 bg-white text-center max-md:py-10 border-t border-black/[0.04]">
          <h2
            className="text-[22px] font-semibold tracking-[-0.01em] text-forest-deep mb-3"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            也想被收进这片森林？
          </h2>
          <Link
            href="/#join"
            className="inline-block mt-2 px-7 py-3 bg-forest-deep text-white text-[14px] font-medium rounded-full no-underline hover:bg-forest-mid transition-colors"
          >
            成为森林的一棵树
          </Link>
        </section>
      )}

      <footer className="bg-white text-text-light py-10 px-6 text-center text-[11px] border-t border-black/[0.04]">
        <p>附近森林 · Nearby Forest</p>
        <p className="mt-1.5 text-text-light/70">让独立的个体彼此连接、流动、共创</p>
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
      <p className="text-[15.5px] leading-[1.85] text-text-secondary whitespace-pre-wrap">
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
}: {
  nodeId: string;
  works: Work[];
  legacyText?: string | null;
  canEdit: boolean;
  isOwner: boolean;
}) {
  const hasWorks = works.length > 0;
  const hasLegacy = !!(legacyText && legacyText.trim());
  // 完全没有作品、也没有遗留文本、且当前访客不能编辑 → 整段隐藏
  if (!hasWorks && !hasLegacy && !canEdit) return null;

  return (
    <section>
      <div className="text-[11px] font-semibold tracking-[0.18em] uppercase mb-3 text-moss">
        作品 / 项目
      </div>

      {hasWorks ? (
        <WorksCarousel works={works} />
      ) : hasLegacy ? (
        <p className="text-[15.5px] leading-[1.85] text-text-secondary whitespace-pre-wrap">
          {legacyText}
        </p>
      ) : canEdit ? (
        <p className="text-[13px] text-text-light">
          还没有作品。点下方 <span className="font-medium text-forest-deep">+ 添加作品</span>，让访客一眼看到你的公众号、播客、产品或服务。
        </p>
      ) : null}

      {canEdit && (
        <WorksEditor
          nodeId={nodeId}
          works={works}
          mode={isOwner ? 'owner' : 'admin'}
        />
      )}
    </section>
  );
}

function ContactBlock({ node }: { node: NodeCard }) {
  if (!node.wechat && !node.email) {
    return (
      <p className="text-[13px] text-text-light">
        TA 还没有留下联系方式。
      </p>
    );
  }
  return (
    <dl className="space-y-3 text-[14px]">
      {node.wechat && (
        <div className="flex items-baseline gap-4">
          <dt className="text-text-light w-12 shrink-0 text-[12px] tracking-wide">微信</dt>
          <dd className="font-mono text-forest-deep font-medium break-all">{node.wechat}</dd>
        </div>
      )}
      {node.email && (
        <div className="flex items-baseline gap-4">
          <dt className="text-text-light w-12 shrink-0 text-[12px] tracking-wide">邮箱</dt>
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

function GatedContact() {
  return (
    <div className="text-center py-3">
      <p className="text-[13.5px] text-text-secondary leading-relaxed mb-5">
        联系方式只对社区成员可见。
        <br />
        填写一张你自己的节点卡，就能看到。
      </p>
      <Link
        href="/#join"
        className="inline-block px-6 py-2.5 bg-forest-deep text-white text-[13px] font-medium rounded-full no-underline hover:bg-forest-mid transition-colors"
      >
        成为森林的一棵树
      </Link>
    </div>
  );
}
