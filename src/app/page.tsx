import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import Link from 'next/link';
import Nav from '@/components/Nav';
import HeroVideo from '@/components/HeroVideo';
import MeditationSection from '@/components/MeditationSection';
import CoreExperienceSection from '@/components/CoreExperienceSection';
import JoinSection from '@/components/JoinSection';
import RelationNetwork from '@/components/RelationNetwork';
import { isAdminId } from '@/lib/admin';
import { fetchMeditationContent } from '@/lib/meditations';
import { buildRelationGraph } from '@/lib/network';
import { fetchShareContent } from '@/lib/shares';
import type { NodeCard } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const CHIPS = ['呼吸', '看见', '同频', '相遇', '共创', '生长'];

// 4 大土壤：让访客 3 秒内辨认出自己 —— 线条图标 + 统一森林绿
type TribeIcon = (props: { className?: string }) => React.ReactElement;

const IconHealth: TribeIcon = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <rect x="2.75" y="4.25" width="18.5" height="13.5" rx="2" />
    <path d="M6.5 11h2.2L10.3 8l2.4 6 1.4-3h3.4" />
    <path d="M8 21h8" />
    <path d="M12 17.75V21" />
  </svg>
);

const IconEducation: TribeIcon = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M2.5 9.5 12 5l9.5 4.5L12 14 2.5 9.5z" />
    <path d="M6.5 11.4v4.1c0 1.4 2.46 2.5 5.5 2.5s5.5-1.1 5.5-2.5v-4.1" />
    <path d="M21.5 9.5v5" />
    <path d="M21 14.5l-.5 1.5h1l-.5-1.5z" />
  </svg>
);

const IconLeaf: TribeIcon = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M20.5 3.5c-7 0-15 4-15 12.5 0 2 .5 3.5 1 4.5 1-0.5 2-1 2.5-2 3-5.5 8-7 11.5-7-3.5 1-7 3-10 8.5 0 0 .5 1 1.5 1 7 0 11-7 11-15.5 0-0.5 0-1.5-1.5-2z" />
    <path d="M5.5 20.5C7 17 10 13 16 11" />
  </svg>
);

const IconRocket: TribeIcon = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M4.5 19.5C3 21 2.5 22 2.5 22s1-.5 2.5-2c.85-.85.85-2.15 0-3a2.12 2.12 0 0 0-3 0c-.85.85-.85 2.15 0 3z" />
    <path d="M14 6c-2 1.5-3.5 3.5-4.5 6L7 15l2 2 3-2.5c2.5-1 4.5-2.5 6-4.5 3.5-4.5 3-9 3-9s-4.5-.5-7 2z" />
    <path d="M9 9.5H6L4 13l3 .5" />
    <path d="M14.5 15v3l-3.5 2 .5-3" />
    <circle cx="14.5" cy="9.5" r="1" />
  </svg>
);

const TRIBES: {
  eyebrow: string;
  Icon: TribeIcon;
  roles: string;
  tail: string;
}[] = [
  {
    eyebrow: '健康 · 生命',
    Icon: IconHealth,
    roles: '疗愈师、瑜伽教练、正念引导师、营养咨询师……',
    tail: '以及所有相信身心可以被温柔疗愈的你',
  },
  {
    eyebrow: '教育 · 成长',
    Icon: IconEducation,
    roles: '生命教育者、读书会主理人、家庭教练、独立讲师……',
    tail: '以及所有相信成长力量的你',
  },
  {
    eyebrow: '美 · 生命里的真切体验',
    Icon: IconLeaf,
    roles: '手作人、摄影师、花艺师、策展人、茶人……',
    tail: '以及所有用直觉感受生活的你',
  },
  {
    eyebrow: '向善商业 · OPC',
    Icon: IconRocket,
    roles: '想独立做事的人——有经验，有梦想……',
    tail: '以及所有正在寻找同路人的你',
  },
];

// 连接故事 — 3 段示意连接（来自 content/voices.md，inline 化避免运行时解析）
const VOICES: {
  avatars: [string, string];
  colors: [string, string];
  label: string;
  text: string;
  names: string;
  tag: string;
}[] = [
  {
    avatars: ['林', '张'],
    colors: ['coral', 'sky'],
    label: 'AI 匹配相遇',
    text:
      '我们因为都关注社区营造被 AI 推荐认识。第一次线上聊了两个小时，发现彼此在做的事情竟然可以互补。后来一起发起了一个城市空间改造项目。这种不是刻意社交、而是自然生长出来的合作，特别珍贵。',
    names: '林小溪 × 张远山',
    tag: '共创伙伴',
  },
  {
    avatars: ['陈', '王'],
    colors: ['leaf', 'purple'],
    label: '小桌子对话',
    text:
      "在一次 '此刻你在重新思考什么' 的小桌子对话里，我说出了自己正在转型的迷茫。没想到对面的人也经历过类似的阶段。她没有给建议，只是认真地听完，然后说 '我理解'。那三个字比任何方法论都温暖。",
    names: '陈思源 × 王晓晴',
    tag: '彼此支持',
  },
  {
    avatars: ['李', '赵'],
    colors: ['gold', 'coral'],
    label: '共读小组',
    text:
      '我们在共读小组里一起读了一个月的书。每周三晚上的讨论，从书里聊到生活，从观点聊到经历。读完那本书的时候，我发现自己不知不觉多了几个真正可以聊天的朋友。这就是附近吧。',
    names: '李明朗 × 赵一舟 等 5 人',
    tag: '共读共学',
  },
];

const VOICE_AVATAR_GRADIENTS: Record<string, string> = {
  coral: 'from-coral-soft to-warmth',
  sky: 'from-sky to-[#a5cce0]',
  leaf: 'from-leaf to-sage',
  purple: 'from-[#b088c9] to-[#d4b4e8]',
  gold: 'from-gold to-gold-light',
};
function voiceAvatarColor(key: string): string {
  return VOICE_AVATAR_GRADIENTS[key] || VOICE_AVATAR_GRADIENTS.coral;
}

// 想象：你会在森林里变成什么样
const IMAGINE = [
  { lead: '不再孤独地', tail: '做你想做的事' },
  { lead: '被同你共振的人', tail: '看见' },
  { lead: '把心里那颗种子，', tail: '变成可见的作品' },
  { lead: '和别人', tail: '互相滋养、互为贵人' },
  { lead: '在相遇中，', tail: '找到一起共创的人' },
];

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

export default async function Home() {
  const [creators, meditationContent, shareContent] = await Promise.all([
    fetchCreators(),
    fetchMeditationContent(),
    fetchShareContent(),
  ]);
  const cookieStore = await cookies();
  const memberId = cookieStore.get('nf_member')?.value || '';
  const isAdmin = isAdminId(memberId);
  const visible = creators.filter(n => !n.name?.startsWith('___'));

  const showcaseCenter =
    visible.find(n => (n.name || '').toLowerCase() === 'doratest') ||
    visible[0] ||
    null;

  const showcaseGraph =
    showcaseCenter && visible.length > 1
      ? buildRelationGraph(showcaseCenter, visible, 6)
      : null;

  return (
    <>
      <Nav />

      {/* ════════════════════════════════════════════════════════════════
          [1] 触动 — Hero
      ════════════════════════════════════════════════════════════════ */}
      <section className="relative min-h-screen flex flex-col justify-center items-center text-center bg-forest-deep overflow-hidden p-8">
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
          className="hidden motion-reduce:block absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/45" />

        <div className="relative z-[2] max-w-[820px]">
          {/* 品牌名 — 极窄字距 */}
          <div className="text-[11.5px] tracking-[0.7em] text-white/50 mb-8 pl-[0.7em] animate-fade-in">
            附 近 森 林
          </div>

          {/* 主 slogan — 单行，"有温度" 单点高亮，淡色分隔线 */}
          <h1
            className="font-serif text-[clamp(2rem,5vw,3.4rem)] font-bold text-white leading-[1.4] tracking-wide mb-6 animate-fade-in"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            连接万千
            <span className="mx-1 text-leaf">有温度</span>
            的超级个体
          </h1>

          <div className="w-12 h-px bg-white/35 mx-auto mb-7 animate-fade-in-delay-2" />

          {/* 副标 — 两行，无标点收尾 */}
          <p className="text-[clamp(0.95rem,1.6vw,1.1rem)] text-white/70 leading-[2] mb-16 animate-fade-in-delay-2 max-w-[620px] mx-auto">
            我们既发现自己的无限可能，也被看见<br />
            在相遇中共同创造与成长
          </p>

          {/* 关键词 — 宽字距浮动文字（流动感） */}
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-4 mb-14 animate-fade-in-delay-3">
            {CHIPS.map((c, i) => (
              <span
                key={c}
                className="animate-drift text-[13.5px] text-white/55 font-light"
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

          {/* CTA */}
          <div className="animate-fade-in-delay-4">
            <a
              href="#meditations"
              className="inline-flex items-center gap-2 px-9 py-4 bg-gradient-to-br from-coral-soft to-warmth text-forest-deep font-bold text-base rounded-full no-underline transition-all shadow-[0_4px_24px_rgba(212,160,160,0.3)] hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(212,160,160,0.45)]"
            >
              走进这片森林
            </a>
          </div>
        </div>

        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/30 text-[10.5px] tracking-[3px] animate-fade-in">
          <span>SCROLL</span>
          <div className="w-px h-8 bg-gradient-to-b from-white/30 to-transparent" />
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          [2] 安顿 — 主题冥想
      ════════════════════════════════════════════════════════════════ */}
      <MeditationSection content={meditationContent} isAdmin={isAdmin} />

      {/* ════════════════════════════════════════════════════════════════
          [3] 体验 — 核心体验
      ════════════════════════════════════════════════════════════════ */}
      <CoreExperienceSection content={shareContent} isAdmin={isAdmin} />

      {/* ════════════════════════════════════════════════════════════════
          [4] 辨认 — 在 3 秒内找到自己
      ════════════════════════════════════════════════════════════════ */}
      <section id="tribes" className="py-24 px-8 bg-[#faf8f2] max-md:py-16 max-md:px-5">
        <div className="max-w-[1080px] mx-auto">
          <div className="text-center mb-14">
            <h2
              className="text-[clamp(1.6rem,3.6vw,2.4rem)] font-semibold text-forest-deep leading-[1.4] tracking-[-0.01em] max-w-[640px] mx-auto"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              在这片森林里，<br className="md:hidden" />你会遇见……
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-5 max-md:grid-cols-1 max-md:gap-4">
            {TRIBES.map(({ eyebrow, Icon, roles, tail }, i) => (
              <div
                key={i}
                className="group relative p-9 max-md:p-7 rounded-lg bg-[#f0f5ec] border border-leaf/15 transition-all hover:-translate-y-0.5 hover:bg-[#ecf3e6] hover:border-leaf/30 hover:shadow-[0_10px_36px_rgba(45,74,45,0.06)]"
              >
                <Icon className="w-7 h-7 text-forest-mid mb-6" />
                <div className="text-[13.5px] font-semibold tracking-[0.06em] text-forest-mid mb-3">
                  {eyebrow}
                </div>
                <p className="text-[15px] text-forest-deep leading-[1.75] font-medium">
                  {roles}
                </p>
                <p className="mt-4 text-[13px] text-text-light leading-[1.75] italic">
                  {tail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          [5] 想象 — 你在这里会变成什么样（配真实示例）
      ════════════════════════════════════════════════════════════════ */}
      <section className="py-24 px-8 bg-white max-md:py-16 max-md:px-5">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-14">
            <div className="inline-block text-[11px] tracking-[3px] text-coral uppercase mb-3 font-medium">
              一棵树
            </div>
            <h2
              className="text-[clamp(1.6rem,3.6vw,2.4rem)] font-semibold text-forest-deep leading-[1.4] tracking-[-0.01em]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              一棵树，会慢慢显影
            </h2>
            <p className="mt-4 text-[13.5px] text-text-light max-w-[440px] mx-auto leading-[1.85]">
              名字、正在做的事、关心的议题，会在这里被轻轻放下。连接不急着发生，但可以先被看见。
            </p>
          </div>

          <div className="grid grid-cols-[1.05fr_1fr] gap-12 items-center max-md:grid-cols-1 max-md:gap-10">
            {/* 左：5 句未来画面 */}
            <ul className="space-y-5 max-md:space-y-4">
              {IMAGINE.map((line, i) => (
                <li
                  key={i}
                  className="group flex items-start gap-4 px-2 py-2"
                >
                  <span className="shrink-0 mt-2 w-1.5 h-1.5 rounded-full bg-coral-soft" />
                  <p className="text-[clamp(1.05rem,2.2vw,1.25rem)] font-serif text-forest-deep leading-[1.7]">
                    {line.lead}
                    <span className="bg-gradient-to-r from-coral to-coral-soft bg-clip-text text-transparent font-semibold">
                      {line.tail}
                    </span>
                    。
                  </p>
                </li>
              ))}
            </ul>

            {/* 右：示意节点卡 + AI 推荐 */}
            <SampleNodeCard />
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          [6] 连接故事 + 真实关系网 — 深绿夜空里看连接如何发生
      ════════════════════════════════════════════════════════════════ */}
      <section className="relative py-28 px-8 bg-gradient-to-br from-forest-deep via-[#1f3a1f] to-forest-mid overflow-hidden max-md:py-20 max-md:px-5">
        <div className="absolute inset-0 bg-[linear-gradient(160deg,rgba(255,255,255,0.045),transparent_42%,rgba(232,201,160,0.045))] pointer-events-none" />

        <div className="relative max-w-[1100px] mx-auto">
          <div className="text-center mb-14">
            <div className="inline-block text-[11px] tracking-[3px] text-coral-soft uppercase mb-4 font-medium">
              连接故事
            </div>
            <h2
              className="text-[clamp(1.7rem,3.6vw,2.4rem)] font-semibold text-white leading-[1.4] tracking-[-0.01em] max-w-[640px] mx-auto"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              在这片森林里，<br className="md:hidden" />连接正在发生
            </h2>
            <p className="mt-5 text-[14px] text-white/55 leading-[1.95] max-w-[560px] mx-auto">
              有些连接先从一句认真听见开始，然后慢慢长成合作、陪伴，或一段新的小路。
            </p>
          </div>

          {/* 3 张证言卡 */}
          <div className="grid grid-cols-3 gap-5 mb-16 max-lg:grid-cols-1 max-lg:max-w-[560px] max-lg:mx-auto max-md:gap-4">
            {VOICES.map((v, i) => (
              <article
                key={i}
                className="bg-white/[0.045] border border-white/[0.07] rounded-lg py-8 px-7 backdrop-blur-[10px] transition-all hover:bg-white/[0.08] hover:border-white/15"
              >
                <div className="flex items-center gap-3 mb-5">
                  <div className="flex items-center">
                    {v.avatars.map((a, j) => (
                      <div
                        key={j}
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 border-forest-deep/80 bg-gradient-to-br ${voiceAvatarColor(v.colors[j])} ${j > 0 ? '-ml-3' : ''}`}
                      >
                        {a}
                      </div>
                    ))}
                  </div>
                  <div className="h-px w-7 bg-coral-soft/35" />
                  <div className="text-[11px] text-coral-soft font-medium tracking-[1px]">
                    {v.label}
                  </div>
                </div>
                <div className="font-serif text-[0.94rem] text-white/85 leading-[1.85] mb-5 italic">
                  {v.text}
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-[0.78rem] text-white/50">{v.names}</div>
                  <div className="px-2.5 py-0.5 rounded-full text-[0.68rem] font-medium bg-love-pink/[0.12] text-coral-soft border border-love-pink/20">
                    {v.tag}
                  </div>
                </div>
              </article>
            ))}
          </div>

          {/* 真实关系网 — 同屏跟在证言卡下方，白卡在深绿底色上视觉很跳 */}
          {showcaseGraph && showcaseGraph.neighbors.length > 0 && showcaseCenter && (
            <div className="max-w-[860px] mx-auto">
              <div className="text-center mb-7">
                <div className="inline-block text-[11px] tracking-[3px] text-coral-soft/80 uppercase mb-3 font-medium">
                  正在发生
                </div>
                <h3
                  className="text-[clamp(1.2rem,2.8vw,1.65rem)] font-semibold text-white leading-[1.5] tracking-[-0.005em] max-w-[560px] mx-auto"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  你做的事，<br className="md:hidden" />需要被同它共振的人看见。
                </h3>
              </div>

              <div className="px-2 max-md:px-0">
                <RelationNetwork graph={showcaseGraph} isMember={false} darkBg />
              </div>

              <p className="mt-6 text-center text-[13px] text-white/60 leading-[1.9] max-w-[520px] mx-auto">
                这是 <span className="font-medium text-white">{showcaseCenter.name}</span> 加入后，森林里浮现出的 {showcaseGraph.neighbors.length} 棵可能相遇的树。
                <br />
                <Link
                  href="/creators"
                  className="inline-block mt-3 text-coral-soft hover:text-white underline-offset-4 hover:underline"
                >
                  看看整片森林 →
                </Link>
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          [7] 行动 — 种下你的种子
      ════════════════════════════════════════════════════════════════ */}
      <section
        id="join"
        className="relative py-28 px-8 bg-gradient-to-b from-[#faf8f2] via-[#f5f5ee] to-[#f0ede4] overflow-hidden max-md:py-20 max-md:px-5"
      >
        <div className="absolute top-0 left-1/2 h-px w-[min(760px,78vw)] -translate-x-1/2 bg-gradient-to-r from-transparent via-forest-deep/10 to-transparent pointer-events-none" />

        <div className="relative">
          <JoinSection />
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          Footer
      ════════════════════════════════════════════════════════════════ */}
      <footer className="bg-forest-deep py-14 px-8 text-white/55 max-md:px-5">
        <div className="max-w-[860px] mx-auto flex flex-col items-center text-center gap-6">
          <div>
            <div className="font-serif text-lg font-bold text-white flex items-center gap-2.5 justify-center mb-2">
              <svg viewBox="0 0 28 28" fill="none" width="22" height="22">
                <circle cx="14" cy="14" r="13" stroke="#a8c9a0" strokeWidth="1.5"/>
                <path d="M14 6 C14 6, 8 12, 8 17 C8 20.3 10.7 23 14 23 C17.3 23 20 20.3 20 17 C20 12 14 6 14 6Z" fill="#8fb573" opacity="0.6"/>
              </svg>
              附近森林
            </div>
            <p className="text-[12.5px] leading-[1.7] max-w-[440px]">
              让独立的个体彼此连接、流动、共创。
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12px]">
            <Link href="/about" className="hover:text-coral-soft transition-colors">附近森林的来处</Link>
            <Link href="/creators" className="hover:text-coral-soft transition-colors">创造者森林</Link>
            <Link href="/login" className="hover:text-coral-soft transition-colors">登录</Link>
          </div>
          <div className="pt-6 mt-2 border-t border-white/10 text-[11px] text-white/35 w-full">
            © 2026 附近森林生态社区
          </div>
        </div>
      </footer>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────
// 想象屏右侧：示意节点卡 + AI 推荐
// ──────────────────────────────────────────────────────────────────

const SAMPLE_TOPICS: { label: string; cls: string }[] = [
  { label: '社区营造', cls: 'bg-leaf/[0.10] text-moss border-leaf/20' },
  { label: '空间设计', cls: 'bg-leaf/[0.10] text-moss border-leaf/20' },
  { label: '可持续生活', cls: 'bg-gold/[0.10] text-earth border-gold/20' },
  { label: '爱与连接', cls: 'bg-love-pink/[0.10] text-coral border-love-pink/20' },
  { label: '人与 AI', cls: 'bg-sky/[0.10] text-[#4a7c9a] border-sky/20' },
];

const SAMPLE_MATCHES = [
  {
    avatar: '张',
    color: 'from-sky to-[#a5cce0]',
    name: '张远山',
    reason: '同关注社区营造 · 正在寻找设计合作伙伴',
    signal: '高共振',
  },
  {
    avatar: '陈',
    color: 'from-leaf to-sage',
    name: '陈思源',
    reason: '可持续生活实践者 · 想参与共创工作坊',
    signal: '可共创',
  },
  {
    avatar: '王',
    color: 'from-[#b088c9] to-[#d4b4e8]',
    name: '王晓晴',
    reason: 'AI 产品设计师 · 也关注爱与连接的议题',
    signal: '适合聊聊',
  },
];

function SampleNodeCard() {
  return (
    <div className="bg-white border border-moss/10 rounded-lg p-8 max-md:p-6 shadow-[0_12px_48px_rgba(26,46,26,0.06)] relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-coral-soft via-leaf to-sky" />

      {/* 头像 + 名字 */}
      <div className="flex items-center gap-4 mb-7">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-coral-soft to-warmth flex items-center justify-center font-serif text-2xl font-bold text-white shrink-0">
          林
        </div>
        <div className="min-w-0">
          <div className="font-serif text-[1.35rem] font-bold text-forest-deep truncate">
            林小溪
          </div>
          <div className="text-[0.82rem] text-text-light mt-0.5 truncate">
            独立设计师 · 社区营造者 · 台北
          </div>
        </div>
      </div>

      {/* 正在做 */}
      <SectionRow label="正在做的事">
        运营一个关注社区空间设计的工作室，探索如何用设计激活社区关系。
      </SectionRow>

      {/* 关心议题 */}
      <div className="mb-4">
        <div className="text-[0.72rem] text-moss tracking-[1.5px] uppercase mb-1.5 font-semibold">
          关心的议题
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SAMPLE_TOPICS.map(t => (
            <span
              key={t.label}
              className={`px-3 py-1 rounded-full text-[11px] font-medium border ${t.cls}`}
            >
              {t.label}
            </span>
          ))}
        </div>
      </div>

      <SectionRow label="可以提供">
        社区空间策划经验、品牌视觉设计、工作坊组织
      </SectionRow>
      <SectionRow label="正在寻找">
        关注社会创新的伙伴，想一起做有温度的事的人
      </SectionRow>

      <div className="w-full h-px bg-black/5 my-4" />

      {/* AI 推荐 */}
      <div className="flex items-center gap-2 text-[12px] text-coral mb-3 font-semibold tracking-wide">
        <span className="h-px w-6 bg-coral-soft/60" />
        AI 推荐 · 可能共振的人
      </div>
      <div className="space-y-2">
        {SAMPLE_MATCHES.map((m, i) => (
          <div
            key={i}
            className="flex items-center gap-3 p-2.5 bg-cream rounded-lg border border-mist transition-colors hover:bg-white"
          >
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 bg-gradient-to-br ${m.color}`}
            >
              {m.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-semibold text-forest-deep">
                {m.name}
              </div>
              <div className="text-[11px] text-text-light mt-0.5 truncate">
                {m.reason}
              </div>
            </div>
            <div className="text-[11.5px] text-coral font-semibold shrink-0">
              {m.signal}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="text-[0.72rem] text-moss tracking-[1.5px] uppercase mb-1 font-semibold">
        {label}
      </div>
      <div className="text-[0.92rem] text-text-secondary leading-[1.65]">
        {children}
      </div>
    </div>
  );
}
