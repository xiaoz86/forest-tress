import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import Nav from '@/components/Nav';
import JoinForm from '@/components/JoinForm';
import RelationNetwork from '@/components/RelationNetwork';
import { buildRelationGraph } from '@/lib/network';
import type { NodeCard } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const CHIPS = ['呼吸', '看见', '同频', '相遇', '共创', '生长'];

// 4 大土壤：让访客 3 秒内辨认出自己
const TRIBES = [
  {
    eyebrow: '健康 · 生命',
    icon: '🌿',
    roles: '疗愈师 · 瑜伽教练 · 正念引导师 · 营养咨询师',
    tail: '以及所有相信身心可以被温柔疗愈的你',
    gradient: 'from-leaf/15 via-leaf/8 to-transparent',
    accent: 'text-forest-mid',
    ring: 'border-leaf/25',
  },
  {
    eyebrow: '教育 · 成长',
    icon: '🌱',
    roles: '生命教育者 · 读书会主理人 · 家庭教练 · 独立讲师',
    tail: '以及所有相信成长力量的你',
    gradient: 'from-sky/15 via-sky/8 to-transparent',
    accent: 'text-[#4a7c9a]',
    ring: 'border-sky/25',
  },
  {
    eyebrow: '美 · 生命里的真切体验',
    icon: '🌸',
    roles: '手作人 · 摄影师 · 花艺师 · 策展人 · 茶人',
    tail: '以及所有用直觉感受生活的你',
    gradient: 'from-warmth/15 via-warmth/8 to-transparent',
    accent: 'text-coral',
    ring: 'border-coral-soft/30',
  },
  {
    eyebrow: '向善商业 · OPC',
    icon: '🌳',
    roles: '想独立做事的人 — 有经验，有梦想',
    tail: '以及所有正在寻找同路人的你',
    gradient: 'from-gold/15 via-gold-light/8 to-transparent',
    accent: 'text-earth',
    ring: 'border-gold/25',
  },
];

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
  const creators = await fetchCreators();
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/hero-forest.jpg"
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/45" />

        <div className="relative z-[2] max-w-[760px]">
          <div className="inline-block text-[11px] tracking-[3px] text-coral-soft/90 uppercase mb-7 font-medium animate-fade-in">
            附近森林 · OPC 时代的有氧链接
          </div>

          <h1
            className="font-serif text-[clamp(2.2rem,5.5vw,4rem)] font-bold text-white leading-[1.25] tracking-[-0.01em] mb-7 animate-fade-in-delay-2"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            连接万千<br />
            <span className="bg-gradient-to-r from-warmth via-coral-soft to-gold-light bg-clip-text text-transparent">
              有温度的超级个体
            </span>
          </h1>

          <p className="text-[clamp(0.95rem,1.6vw,1.15rem)] text-white/75 leading-[1.95] mb-12 animate-fade-in-delay-3 max-w-[620px] mx-auto">
            我们既发现自己的无限可能，<br />
            也被看见，在相遇中共同创造与成长。
          </p>

          <div className="flex flex-wrap justify-center gap-2 mb-12 animate-fade-in-delay-3">
            {CHIPS.map(c => (
              <span
                key={c}
                className="px-4 py-1.5 bg-white/8 backdrop-blur-sm border border-white/12 rounded-full text-[12.5px] text-white/85 font-medium tracking-wide"
              >
                {c}
              </span>
            ))}
          </div>

          <div className="animate-fade-in-delay-4">
            <a
              href="#join"
              className="inline-flex items-center gap-2 px-9 py-4 bg-gradient-to-br from-coral-soft to-warmth text-forest-deep font-bold text-base rounded-full no-underline transition-all shadow-[0_4px_24px_rgba(212,160,160,0.3)] hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(212,160,160,0.45)]"
            >
              在森林里种下一棵树
            </a>
          </div>
        </div>

        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/30 text-[10.5px] tracking-[3px] animate-fade-in">
          <span>SCROLL</span>
          <div className="w-px h-8 bg-gradient-to-b from-white/30 to-transparent" />
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          [2] 辨认 — 在 3 秒内找到自己
      ════════════════════════════════════════════════════════════════ */}
      <section id="tribes" className="py-24 px-8 bg-[#faf8f2] max-md:py-16 max-md:px-5">
        <div className="max-w-[1080px] mx-auto">
          <div className="text-center mb-14">
            <div className="inline-block text-[11px] tracking-[3px] text-moss uppercase mb-3 font-medium">
              辨认
            </div>
            <h2
              className="text-[clamp(1.6rem,3.6vw,2.4rem)] font-semibold text-forest-deep leading-[1.4] tracking-[-0.01em] max-w-[640px] mx-auto"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              在这片森林里，<br className="md:hidden" />你会遇见……
            </h2>
            <p className="mt-4 text-[14px] text-text-light leading-[1.85] max-w-[440px] mx-auto">
              扫一眼就知道：这里有和你一样的人。
            </p>
          </div>

          <div className="grid grid-cols-2 gap-5 max-md:grid-cols-1 max-md:gap-4">
            {TRIBES.map((t, i) => (
              <div
                key={i}
                className={`relative p-8 max-md:p-6 rounded-3xl bg-white border ${t.ring} bg-gradient-to-br ${t.gradient} transition-transform hover:-translate-y-0.5`}
              >
                <div className="flex items-start gap-4">
                  <div className="text-[2rem] leading-none shrink-0">{t.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-[12px] font-semibold tracking-[0.15em] uppercase ${t.accent} mb-2`}>
                      {t.eyebrow}
                    </div>
                    <p className="text-[14px] text-forest-deep leading-[1.7] font-medium">
                      {t.roles}
                    </p>
                    <p className="mt-3 text-[13px] text-text-secondary leading-[1.7] italic">
                      {t.tail}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          [3] 想象 — 你在这里会变成什么样
      ════════════════════════════════════════════════════════════════ */}
      <section className="py-24 px-8 bg-white max-md:py-16 max-md:px-5">
        <div className="max-w-[760px] mx-auto">
          <div className="text-center mb-14">
            <div className="inline-block text-[11px] tracking-[3px] text-coral uppercase mb-3 font-medium">
              想象
            </div>
            <h2
              className="text-[clamp(1.6rem,3.6vw,2.4rem)] font-semibold text-forest-deep leading-[1.4] tracking-[-0.01em]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              在这片森林里……
            </h2>
          </div>

          <ul className="space-y-5 max-w-[620px] mx-auto">
            {IMAGINE.map((line, i) => (
              <li
                key={i}
                className="group flex items-start gap-4 px-4 py-3"
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
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          [4] 真实关系网 — 它真的在发生
      ════════════════════════════════════════════════════════════════ */}
      {showcaseGraph && showcaseGraph.neighbors.length > 0 && showcaseCenter && (
        <section className="py-24 px-8 bg-[#fafaf7] max-md:py-16 max-md:px-5">
          <div className="max-w-[860px] mx-auto">
            <div className="text-center mb-10">
              <div className="inline-block text-[11px] tracking-[3px] text-moss uppercase mb-3 font-medium">
                正在发生
              </div>
              <h2
                className="text-[clamp(1.5rem,3.5vw,2.2rem)] font-semibold text-forest-deep leading-[1.4] tracking-[-0.01em] max-w-[600px] mx-auto"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                你做的事，<br className="md:hidden" />
                需要被同它共振的人看见。
              </h2>
            </div>

            <div className="bg-white rounded-3xl border border-black/[0.06] p-6 max-md:p-3 shadow-[0_4px_28px_rgba(0,0,0,0.04)]">
              <RelationNetwork graph={showcaseGraph} isMember={false} />
            </div>

            <p className="mt-7 text-center text-[13px] text-text-light leading-[1.9] max-w-[520px] mx-auto">
              这是 <span className="font-medium text-forest-deep">{showcaseCenter.name}</span> 加入森林后，被 AI 替 ta 找到的 {showcaseGraph.neighbors.length} 棵相遇的树。
              <br />
              <Link
                href="/creators"
                className="inline-block mt-3 text-forest-mid hover:text-forest-deep underline-offset-4 hover:underline"
              >
                看看整片森林 →
              </Link>
            </p>
          </div>
        </section>
      )}

      {/* ════════════════════════════════════════════════════════════════
          [5] 行动 — 种下你的种子
      ════════════════════════════════════════════════════════════════ */}
      <section
        id="join"
        className="relative py-28 px-8 bg-gradient-to-b from-[#faf8f2] via-[#f5f5ee] to-[#f0ede4] overflow-hidden max-md:py-20 max-md:px-5"
      >
        {/* 装饰光晕 */}
        <div className="absolute -top-40 -left-40 w-[480px] h-[480px] rounded-full bg-leaf/[0.06] blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-[520px] h-[520px] rounded-full bg-coral-soft/[0.06] blur-3xl pointer-events-none" />

        <div className="relative">
          <div className="text-center max-w-[640px] mx-auto mb-14">
            <div className="inline-flex items-center gap-2 text-[11px] tracking-[3px] text-moss uppercase mb-4 font-medium">
              <span>🌱</span>
              <span>种下一颗种子</span>
              <span>🌱</span>
            </div>
            <h2
              className="text-[clamp(1.7rem,3.8vw,2.5rem)] font-semibold text-forest-deep leading-[1.35] tracking-[-0.01em]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              你的种子，<br className="md:hidden" />
              <span className="bg-gradient-to-r from-coral to-coral-soft bg-clip-text text-transparent">
                值得一片土壤
              </span>
            </h2>
            <p className="mt-5 text-[14.5px] text-text-secondary leading-[1.9] max-w-[440px] mx-auto">
              这不是注册表单 —— 是把你最完整的样子种下来。<br />
              森林会替你寻路。
            </p>
          </div>

          <JoinForm />
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
