import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import Nav from '@/components/Nav';
import HeroVideo from '@/components/HeroVideo';
import JoinSection from '@/components/JoinSection';
import RelationNetwork from '@/components/RelationNetwork';
import CreatorSection from '@/components/home/CreatorSection';
import type { ShowcaseNode } from '@/components/home/CreatorShowcase';
import EntranceSection from '@/components/home/EntranceSection';
import OriginSection from '@/components/home/OriginSection';
import PathSection from '@/components/home/PathSection';
import StorySection from '@/components/home/StorySection';
import ValueSection from '@/components/home/ValueSection';
import { buildRelationGraph } from '@/lib/network';
import type { NodeCard } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const CHIPS = ['呼吸', '看见', '同频', '相遇', '共创', '生长'];

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
  const creators = await fetchCreators();
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
        <div className="absolute inset-0 bg-black/45" />

        <div className="relative z-[2] max-w-[820px]">
          <h1
            className="mb-6 animate-fade-in font-serif text-[clamp(2rem,5vw,3.4rem)] font-bold leading-[1.4] tracking-wide text-white"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            连接万千
            <span className="mx-1 text-leaf">有温度</span>
            的超级创造者
          </h1>

          <div className="mx-auto mb-7 h-px w-12 animate-fade-in-delay-2 bg-white/35" />

          <p className="mx-auto mb-6 max-w-[620px] animate-fade-in-delay-2 text-[clamp(0.95rem,1.6vw,1.1rem)] leading-[2] text-white/70">
            我们既发现自己的无限可能，也被看见
            <br />
            在相遇中共同创造与成长
          </p>

          <p className="mx-auto mb-16 max-w-[560px] animate-fade-in-delay-2 text-[13.5px] leading-[1.9] text-white/50">
            让正在独立做事的人，找到真正同行的伙伴。
          </p>

          <div className="mb-14 flex animate-fade-in-delay-3 flex-wrap justify-center gap-x-8 gap-y-4">
            {CHIPS.map((c, i) => (
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
              走进这片森林
            </a>
          </div>
        </div>

        <div className="absolute bottom-10 left-1/2 flex -translate-x-1/2 animate-fade-in flex-col items-center gap-2 text-[10.5px] tracking-[3px] text-white/30">
          <span>SCROLL</span>
          <div className="h-8 w-px bg-gradient-to-b from-white/30 to-transparent" />
        </div>
      </section>

      {/* [1b] 这是什么 — 来这里会发生什么 */}
      <ValueSection />

      {/* [2] 我能做什么 — 四条小径，首页只给入口不展开产品 */}
      <EntranceSection />

      {/* [3] 森林里已经有什么人 — 真实节点，可轮播，点进个人页 */}
      <CreatorSection nodes={showcaseNodes} />

      {/* [4] 加入后会获得什么 — 连接怎么长出来 */}
      <PathSection />

      {/* [5] 真实发生过什么连接 — 故事 + 真实关系网 */}
      <StorySection>
        {showcaseGraph && showcaseGraph.neighbors.length > 0 && showcaseCenter && (
          <div className="mx-auto mt-16 max-w-[860px]">
            <div className="mb-7 text-center">
              <div className="inline-block text-[12px] font-bold uppercase leading-[1.8] tracking-[0.2em] text-forest">
                连接 · 共振
                <br />
                关系网络
              </div>
            </div>

            <div className="px-2 max-md:px-0">
              <RelationNetwork graph={showcaseGraph} isMember={false} animate />
            </div>

            <p className="mx-auto mt-6 max-w-[520px] text-center text-[13px] leading-[1.9] text-text-light">
              这是 <span className="font-medium text-forest-deep">{showcaseCenter.name}</span>{' '}
              加入后，森林里浮现出的 {showcaseGraph.neighbors.length} 棵可能相遇的树。
              <br />
              <Link
                href="/creators"
                className="mt-3 inline-block text-forest-mid underline-offset-4 hover:text-forest-deep hover:underline"
              >
                看看整片森林 →
              </Link>
            </p>
          </div>
        )}
      </StorySection>

      {/* [6] 为什么要做附近森林 */}
      <OriginSection />

      {/* 行动 — 种下你的种子 */}
      <section
        id="join"
        className="relative overflow-hidden bg-gradient-to-b from-paper-soft via-paper to-[#efe9dc] px-8 py-28 max-md:px-5 max-md:py-20"
      >
        <div className="pointer-events-none absolute left-1/2 top-0 h-px w-[min(760px,78vw)] -translate-x-1/2 bg-gradient-to-r from-transparent via-forest/15 to-transparent" />
        <div className="relative">
          <JoinSection />
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          Footer
      ════════════════════════════════════════════════════════════════ */}
      <footer className="bg-forest-deep px-8 py-14 text-white/55 max-md:px-5">
        <div className="mx-auto flex max-w-[860px] flex-col items-center gap-6 text-center">
          <div>
            <div className="mb-2 flex items-center justify-center gap-2.5 font-serif text-lg font-bold text-white">
              <svg viewBox="0 0 28 28" fill="none" width="22" height="22">
                <circle cx="14" cy="14" r="13" stroke="#a8c9a0" strokeWidth="1.5" />
                <path
                  d="M14 6 C14 6, 8 12, 8 17 C8 20.3 10.7 23 14 23 C17.3 23 20 20.3 20 17 C20 12 14 6 14 6Z"
                  fill="#8fb573"
                  opacity="0.6"
                />
              </svg>
              附近森林
            </div>
            <p className="max-w-[440px] text-[12.5px] leading-[1.7]">
              让独立的个体彼此连接、流动、共创。
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12px]">
            <Link href="/about" className="transition-colors hover:text-coral-soft">
              附近森林的来处
            </Link>
            <Link href="/creators" className="transition-colors hover:text-coral-soft">
              创造者森林
            </Link>
            <Link href="/login" className="transition-colors hover:text-coral-soft">
              登录
            </Link>
          </div>
          <div className="mt-2 w-full border-t border-white/10 pt-6 text-[11px] text-white/35">
            © 2026 附近森林生态社区
          </div>
        </div>
      </footer>
    </>
  );
}
