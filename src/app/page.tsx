import { createClient } from '@supabase/supabase-js';
import type { Metadata } from 'next';
import Link from 'next/link';
import Nav from '@/components/Nav';
import HeroVideo from '@/components/HeroVideo';
import ForestLogo from '@/components/ForestLogo';
import JoinSection from '@/components/JoinSection';
import RelationNetwork from '@/components/RelationNetwork';
import CreatorSection from '@/components/home/CreatorSection';
import type { ShowcaseNode } from '@/components/home/CreatorShowcase';
import EntranceSection from '@/components/home/EntranceSection';
import OriginSection from '@/components/home/OriginSection';
import PathSection from '@/components/home/PathSection';
import StorySection from '@/components/home/StorySection';
import ValueSection from '@/components/home/ValueSection';
import { dict } from '@/i18n';
import { getLocale } from '@/lib/locale';
import { toPublicGraph } from '@/lib/publicNode';
import { buildRelationGraph } from '@/lib/network';
import type { NodeCard } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * 标题和描述也跟着语言走。
 *
 * 根 layout 里那份是静态的 metadata，动不了——/launch 是 force-static，
 * 让 layout 去读 cookie 会直接构建失败。所以在页面这一层覆盖。
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = dict(await getLocale()).home;
  return { title: t.metaTitle, description: t.metaDescription };
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

/** 只把展示需要的字段交给客户端组件——联系方式之类不出现在页面数据里 */
function toShowcase(node: NodeCard): ShowcaseNode | null {
  if (!node.id) return null;
  return {
    id: node.id,
    name: node.name || '',
    city: node.city || '',
    doing: node.doing || '',
    seeking: node.seeking || '',
    topics: Array.isArray(node.topics) ? node.topics.filter(Boolean) : [],
    avatarUrl: node.avatar_url || undefined,
  };
}

export default async function Home() {
  const [creators, locale] = await Promise.all([fetchCreators(), getLocale()]);
  // 每一屏取自己那块字典，往下传。客户端组件（JoinSection、CreatorShowcase、
  // PathSteps）一律从这里拿文案，不自己读 cookie——那会先闪一遍中文。
  const d = dict(locale);
  const t = d.home;
  const visible = creators.filter(n => !n.name?.startsWith('___'));

  // 资料填得越完整，越适合当门面：先按「有没有说清正在做什么」排
  const showcaseNodes = visible
    .map(toShowcase)
    .filter((n): n is ShowcaseNode => !!n && !!n.name)
    .sort((a, b) => Number(!!b.doing) - Number(!!a.doing))
    .slice(0, 12);

  // 关系网的中心＝最新加入的那棵树（查询已按 created_at 倒序），
  // 所以每有人加入，这张图和下面那句说明都会自动跟着变
  const showcaseCenter = visible[0] || null;

  // 把森林里的人都放进关系网，别只截前 6 个；上限 9 是为了以后人多时不至于挤成一团
  const showcaseGraph =
    showcaseCenter && visible.length > 1
      ? buildRelationGraph(showcaseCenter, visible, Math.min(9, visible.length - 1))
      : null;

  return (
    <>
      <Nav />

      {/* ════════════════════════════════════════════════════════════════
          [1] 这是什么 — Hero
      ════════════════════════════════════════════════════════════════ */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-forest-deep p-8 text-center">
        {/*
          Hero 背景视频 — autoplay 必须 muted；jpg 作 poster，浏览器在 mp4
          下载完成前先显示静态图，等同于无 mp4 时优雅降级。
          移动端用户尊重 prefers-reduced-motion → 用 CSS 关掉动画但保留 poster。
        */}
        <HeroVideo />
        {/* prefers-reduced-motion 用户看到的兜底静态图 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/hero-forest.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 hidden h-full w-full object-cover motion-reduce:block"
        />
        <div className="absolute inset-0 bg-black/52" />

        <div className="relative z-[2] max-w-[1000px]">
          <h1
            className={`mb-6 animate-fade-in text-[clamp(2.6rem,5.6vw,4.5rem)] font-light leading-[1.14] text-white [text-shadow:0_2px_20px_rgba(0,0,0,0.42)] ${
              // 负字距是拉丁排版的习惯：字母之间天然有空隙，收紧才紧凑。
              // 汉字是全宽方块、本来就贴着，同样的 -0.02em 会把每个字压掉一点几个像素，
              // 笔画密的字（森、灌）开始粘连。所以按语言分开给。
              locale === 'en' ? 'tracking-[-0.02em]' : 'tracking-normal'
            }`}
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {/*
              中文靠 mx-1 给这三个字留一点气口——汉字之间本来没有空格。
              英文相反：词与词之间必须是真的空格（否则复制出来是 "whostill"，
              读屏也会把两个词连读），空格已经写在字典的字串里，
              再叠一层 mx-1 就把这一处的词距撑得比别处宽一倍。
            */}
            {t.hero.titleLead}
            <span className={locale === 'zh' ? 'mx-1 text-leaf' : 'text-leaf'}>
              {t.hero.titleAccent}
            </span>
            {t.hero.titleTail}
          </h1>

          <div className="mx-auto mb-7 h-px w-12 animate-fade-in-delay-2 bg-white/35" />

          {/*
            这两句英文比中文长一倍：中文各占一行，英文按中文的宽度和字号会各折成两行，
            整块被顶高，大标题第一行就钻到导航底下去了。
            所以英文单独给一套宽度和字号——中文那套一个字符不动。
          */}
          <p
            className={`mx-auto mb-6 animate-fade-in-delay-2 font-medium text-white/92 [text-shadow:0_1px_14px_rgba(0,0,0,0.4)] ${
              locale === 'en'
                ? 'max-w-[920px] text-[clamp(1.02rem,1.85vw,1.3rem)] leading-[1.75]'
                : 'max-w-[680px] text-[clamp(1.18rem,2.2vw,1.55rem)] leading-[1.9]'
            }`}
          >
            {t.hero.taglineTop}
            <br />
            {t.hero.taglineBottom}
          </p>

          <p className="mx-auto mb-16 max-w-[580px] animate-fade-in-delay-2 text-[16.5px] leading-[1.9] text-white/75 [text-shadow:0_1px_12px_rgba(0,0,0,0.4)]">
            {t.hero.lede}
          </p>

          <div className="mb-14 flex animate-fade-in-delay-3 flex-wrap justify-center gap-x-8 gap-y-4">
            {t.hero.chips.map((c, i) => (
              <span
                key={c}
                className="animate-drift text-[13.5px] font-light text-white/55"
                style={{
                  animationDelay: `${i * 0.9}s`,
                  letterSpacing: '0.4em',
                  paddingLeft: '0.4em', // 配平最后一字字距
                }}
              >
                {c}
              </span>
            ))}
          </div>

          <div className="flex animate-fade-in-delay-4 flex-wrap items-center justify-center gap-4">
            <a
              href="#entrances"
              className="inline-flex min-h-[52px] min-w-[168px] items-center justify-center gap-2 rounded-full bg-[#efc39d] px-9 text-base font-medium text-[#243026] no-underline shadow-[0_14px_34px_rgba(0,0,0,0.18)] transition-all hover:-translate-y-0.5 hover:bg-[#f5ceb0]"
            >
              {t.hero.cta}
            </a>
          </div>
        </div>

        <div className="absolute bottom-10 left-1/2 flex -translate-x-1/2 animate-fade-in flex-col items-center gap-2 text-[10.5px] tracking-[3px] text-white/30">
          <span>SCROLL</span>
          <div className="h-8 w-px bg-gradient-to-b from-white/30 to-transparent" />
        </div>
      </section>

      {/* [1b] 这是什么 — 来这里会发生什么 */}
      <ValueSection t={t.value} />

      {/* [2] 我能做什么 — 四条小径，首页只给入口不展开产品 */}
      <EntranceSection t={t.entrances} />

      {/* [3] 森林里已经有什么人 — 真实节点，可轮播，点进个人页 */}
      <CreatorSection nodes={showcaseNodes} t={t.creators} />

      {/* [4] 加入后会获得什么 — 连接怎么长出来 */}
      <PathSection t={t.paths} />

      {/* [5] 真实发生过什么连接 — 故事 + 真实关系网 */}
      <StorySection t={t.stories}>
        {showcaseGraph && showcaseGraph.neighbors.length > 0 && showcaseCenter && (
          <div className="mx-auto mt-16 max-w-[860px]">
            <div className="mb-7 text-center">
              <div className="inline-block text-[12px] font-bold uppercase leading-[1.8] tracking-[0.2em] text-forest">
                {t.stories.networkLabelTop}
                <br />
                {t.stories.networkLabelBottom}
              </div>
            </div>

            <div className="px-2 max-md:px-0">
              <RelationNetwork graph={toPublicGraph(showcaseGraph)} isMember={false} animate locale={locale} />
            </div>

            <p className="mx-auto mt-6 max-w-[520px] text-center text-[13px] leading-[1.9] text-text-light">
              {t.stories.networkLead}
              <span className="font-medium text-forest-deep">{showcaseCenter.name}</span>
              {t.stories.networkMid}
              {showcaseGraph.neighbors.length}
              {t.stories.networkTail}
              <br />
              <Link
                href="/creators"
                className="mt-3 inline-block text-forest-mid underline-offset-4 hover:text-forest-deep hover:underline"
              >
                {t.stories.networkLink}
              </Link>
            </p>
          </div>
        )}
      </StorySection>

      {/* [6] 为什么要做附近森林 */}
      <OriginSection t={t.origin} locale={locale} />

      {/* 行动 — 种下你的种子 */}
      <section
        id="join"
        className="relative overflow-hidden bg-gradient-to-b from-paper-soft via-paper to-[#efe9dc] px-8 py-28 max-md:px-7 max-md:py-20"
      >
        <div className="pointer-events-none absolute left-1/2 top-0 h-px w-[min(760px,78vw)] -translate-x-1/2 bg-gradient-to-r from-transparent via-forest/15 to-transparent" />
        <div className="relative">
          <JoinSection locale={locale} />
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          Footer
      ════════════════════════════════════════════════════════════════ */}
      <footer className="bg-forest-deep px-8 py-14 text-white/55 max-md:px-7">
        <div className="mx-auto flex max-w-[860px] flex-col items-center gap-6 text-center">
          <div>
            <div className="mb-2 flex items-center justify-center gap-2.5 font-display text-lg font-light tracking-[0.14em] text-white">
              <ForestLogo size={22} onDark />
              {/* 品牌名和「登录」跟导航共用一份，别在页脚另存一遍 */}
              {d.nav.brand}
            </div>
            <p className="max-w-[440px] text-[12.5px] leading-[1.7]">{t.footer.tagline}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12px]">
            <Link href="/about" className="transition-colors hover:text-coral-soft">
              {t.footer.about}
            </Link>
            <Link href="/creators" className="transition-colors hover:text-coral-soft">
              {t.footer.creators}
            </Link>
            <Link href="/login" className="transition-colors hover:text-coral-soft">
              {d.nav.login}
            </Link>
          </div>
          <div className="mt-2 w-full border-t border-white/10 pt-6 text-[11px] text-white/35">
            {t.footer.copyright}
          </div>
        </div>
      </footer>
    </>
  );
}
