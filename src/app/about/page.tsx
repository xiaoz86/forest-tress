import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getContent } from '@/lib/content';
import Nav from '@/components/Nav';
import { tr, trDeep } from '@/lib/contentTranslate';
import { getLocale } from '@/lib/locale';

export async function generateMetadata(): Promise<Metadata> {
  const zh = {
    title: '附近森林的来处 · 缘起、理念与生态',
    description:
      '为什么我们做附近森林，相信什么，怎么让独立的个体在爱中彼此连接、流动、共创。',
  };
  const en = {
    title: 'Where Nearby Forest comes from · Origin, beliefs, ecosystem',
    description:
      'Why we are building Nearby Forest, what we believe, and how independent people connect, flow, and create together in love.',
  };
  return (await getLocale()) === 'en' ? en : zh;
}

// Parse simple YAML-like list items from markdown content
function parseItems(content: string): Array<Record<string, string | string[]>> {
  const items: Array<Record<string, string | string[]>> = [];
  let current: Record<string, string | string[]> | null = null;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') && trimmed.includes(':')) {
      if (current) items.push(current);
      current = {};
      const colonIdx = trimmed.indexOf(':', 2);
      const key = trimmed.slice(2, colonIdx).trim();
      const val = trimmed.slice(colonIdx + 1).trim();
      if (val.startsWith('[') && val.endsWith(']')) {
        current[key] = val.slice(1, -1).split(',').map(s => s.trim().replace(/"/g, ''));
      } else {
        current[key] = val.replace(/^["']|["']$/g, '');
      }
    } else if (current && trimmed.includes(':') && !trimmed.startsWith('#') && !trimmed.startsWith('-')) {
      const colonIdx = trimmed.indexOf(':');
      const key = trimmed.slice(0, colonIdx).trim();
      const val = trimmed.slice(colonIdx + 1).trim();
      if (val.startsWith('[') && val.endsWith(']')) {
        current[key] = val.slice(1, -1).split(',').map(s => s.trim().replace(/"/g, ''));
      } else {
        current[key] = val.replace(/^["']|["']$/g, '');
      }
    }
  }
  if (current) items.push(current);
  return items;
}

function parseOriginSections(content: string): Record<string, string[]> {
  const sections: Record<string, string[]> = {};
  let currentSection = '';
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('## ')) {
      currentSection = trimmed.slice(3).trim();
      sections[currentSection] = [];
    } else if (currentSection && trimmed) {
      sections[currentSection].push(trimmed);
    }
  }
  return sections;
}

const avatarColorMap: Record<string, string> = {
  coral: 'from-coral-soft to-warmth',
  sky: 'from-sky to-[#a5cce0]',
  leaf: 'from-leaf to-sage',
  purple: 'from-[#b088c9] to-[#d4b4e8]',
  gold: 'from-gold to-gold-light',
};

export default async function AboutPage() {
  const locale = await getLocale();

  /*
    中文继续读 content/*.md，一个字不动——那是主理人自己维护的正文，
    改 md 页面就要跟着变，这条链路不能断。
    英文不改原文，而是把解析出来的每一句拿去查译文表
    （src/i18n/generated/content-en.json，由 scripts/translate-content.mjs 生成）。
    查不到就照旧显示中文：主理人刚改完还没重跑脚本时，降级成现状而不是出错。
  */
  const origin = getContent('origin');
  const philosophy = getContent('philosophy');
  const voices = getContent('voices');
  const howItWorks = getContent('how-it-works');
  const offline = getContent('offline');

  // 先按中文原文分段（段落的键是「引言」「核心信念」这些中文小标题），再逐句查表
  const originSections = trDeep(parseOriginSections(origin.content), locale);
  const philItems = trDeep(parseItems(philosophy.content), locale);
  const voiceItems = trDeep(parseItems(voices.content), locale);
  const stepItems = trDeep(parseItems(howItWorks.content), locale);
  const offlineItems = trDeep(parseItems(offline.content), locale);
  const fm = (c: { frontmatter: Record<string, unknown> }) => trDeep(c.frontmatter, locale);

  return (
    <>
      <Nav />

      {/* === Hero === */}
      <header className="relative pt-32 pb-20 px-6 text-center bg-[linear-gradient(180deg,#faf8f2_0%,#f4f1e8_100%)] max-md:pt-28 max-md:pb-14">
        <div className="absolute top-24 left-6 max-md:top-20 max-md:left-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[13px] text-text-light hover:text-forest-mid transition-colors"
          >
            <span>←</span>
            <span>{tr('回首页', locale)}</span>
          </Link>
        </div>
        <div className="max-w-[680px] mx-auto">
          <div className="inline-block text-[11px] tracking-[3px] text-moss uppercase mb-5 font-medium">
            {tr('来处', locale)}
          </div>
          <h1
            className="text-[clamp(2rem,4vw,2.8rem)] font-light tracking-normal text-forest-deep leading-[1.25] max-md:text-[28px]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {tr('附近森林的来处', locale)}
          </h1>
          <p className="mt-5 text-[16px] text-text-secondary leading-[1.95] max-w-[560px] mx-auto">
            {tr('关于这片森林从哪里来，往哪里去。', locale)}
          </p>
        </div>
      </header>

      {/* === 缘起 === */}
      <section id="origin" className="py-24 px-10 bg-white max-md:py-16 max-md:px-7">
        <div className="text-center max-w-[720px] mx-auto mb-14">
          <div className="inline-block text-xs tracking-[3px] text-moss uppercase mb-4 font-medium">{String(fm(origin).label)}</div>
          <h2 className="font-serif text-[clamp(1.8rem,3.5vw,2.4rem)] font-normal text-forest-deep leading-[1.35]">{String(fm(origin).title)}</h2>
        </div>
        <div className="max-w-[720px] mx-auto">
          {originSections['引言']?.map((text, i) => (
            <div key={`quote-${i}`} className="font-serif text-[clamp(1.2rem,2.6vw,1.6rem)] font-normal text-forest-deep leading-[1.7] mb-8 pl-7 border-l border-coral-soft">
              {text}
            </div>
          ))}
          {originSections['正文']?.map((text, i) => (
            <p key={`text-${i}`} className="text-[16px] text-text-secondary leading-[2] mb-6">{text}</p>
          ))}
          {originSections['核心信念']?.map((text, i) => (
            <div key={`belief-${i}`} className="font-serif text-[1.05rem] font-light text-forest-deep leading-[1.8] py-6 px-7 bg-warm-cream/70 rounded-lg border-l border-coral-soft my-8"
              dangerouslySetInnerHTML={{ __html: text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
          ))}
          {originSections['消失的附近']?.map((text, i) => (
            <p key={`nearby-${i}`} className="text-[16px] text-text-secondary leading-[2] mb-6">{text}</p>
          ))}
          {originSections['重新创造桌子']?.map((text, i) => (
            <p key={`table-${i}`} className="text-[16px] text-text-secondary leading-[2] mb-6">{text}</p>
          ))}
          {originSections['署名'] && (
            <div className="flex items-center gap-4 mt-10 pt-8 border-t border-black/[0.06]">
              <div className="w-12 h-12 rounded-full bg-leaf/15 border border-leaf/20 flex items-center justify-center">
                <span className="h-2.5 w-2.5 rounded-full bg-leaf" />
              </div>
              <div>
                <div className="font-serif font-light text-[0.95rem] text-forest-deep">{originSections['署名'][0]}</div>
                {originSections['署名'][1] && <div className="text-[0.82rem] text-text-light mt-0.5">{originSections['署名'][1]}</div>}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* === 理念 === */}
      <section id="philosophy" className="py-24 px-10 bg-warm-cream max-md:py-16 max-md:px-7">
        <div className="text-center max-w-[760px] mx-auto mb-10">
          <div className="inline-block text-xs tracking-[3px] text-moss uppercase mb-4 font-medium">{tr('生态理念', locale)}</div>
          <h2 className="font-serif text-[clamp(1.8rem,3.5vw,2.4rem)] font-normal text-forest-deep leading-[1.35] mb-4">{tr('每一棵树，', locale)}<br />{tr('都以自己的方式生长', locale)}</h2>
        </div>
        <div className="max-w-[760px] mx-auto mb-14">
          <p className="text-[16px] text-text-secondary leading-[2] mb-6">{tr('每一棵树都是独一无二的。它按自己的节奏、用自己的方式生长；但没有哪一棵树真正独自长成。看不见的地下，根系悄然相连，彼此支撑，也彼此滋养。', locale)}</p>
          <p className="text-[16px] text-text-secondary leading-[2] mb-6">{tr('人也一样。每个人的路不同，但都需要被理解，也需要和信任的人一起做些什么。', locale)}</p>
          <p className="text-[16px] text-text-secondary leading-[2] mb-8">{tr('附近森林就是在试着做这件事——让人慢下来，遇到同频的人，一起把想法变成真实的事。', locale)}</p>
          <div className="font-serif text-[1.05rem] font-light text-forest-deep leading-[1.8] py-6 px-7 bg-white/70 rounded-lg border-l border-coral-soft">{tr('我们希望科技，尤其是人工智能，帮助人更深地理解自己、靠近他人，而不是取代人与人之间真实的相遇。', locale)}</div>
        </div>
        <div className="text-center text-[11px] tracking-[0.2em] text-moss uppercase mb-7 font-semibold">{tr('这片森林相信的六件事', locale)}</div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-7 max-w-[1100px] mx-auto">
          {philItems.map((item, i) => (
            <div key={i} className="group relative p-9 bg-white/70 rounded-lg border border-moss/10 transition-all duration-300 overflow-hidden hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_12px_36px_rgba(26,46,26,0.05)]">
              <div className="mb-5 flex items-center gap-3 text-[11px] font-semibold tracking-[0.18em] text-moss uppercase">
                <span className="h-px w-8 bg-coral-soft/60" />
                {String(i + 1).padStart(2, '0')}
              </div>
              <h3 className="font-serif text-lg font-light text-forest-deep mb-2">{item.title as string}</h3>
              <p className="text-text-secondary leading-[1.7] text-[0.9rem]">{item.description as string}</p>
            </div>
          ))}
        </div>
      </section>

      {/* === 连接故事 === */}
      <section id="voices" className="py-24 px-10 bg-gradient-to-br from-forest-deep via-[#1f3a1f] to-forest-mid relative overflow-hidden max-md:py-16 max-md:px-7">
        <div className="absolute inset-0 bg-[linear-gradient(160deg,rgba(255,255,255,0.045),transparent_42%,rgba(232,201,160,0.045))] pointer-events-none" />
        <div className="text-center max-w-[720px] mx-auto mb-14 relative z-[2]">
          <div className="inline-block text-xs tracking-[3px] text-coral-soft uppercase mb-4 font-medium">{String(fm(voices).label)}</div>
          <h2 className="font-serif text-[clamp(1.8rem,3.5vw,2.4rem)] font-normal text-white leading-[1.35] mb-4">{tr('在这片森林里，', locale)}<br />{tr('连接正在发生', locale)}</h2>
          <p className="text-[16px] text-white/55 leading-[1.8]">{String(fm(voices).description)}</p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-6 max-w-[1100px] mx-auto relative z-[2]">
          {voiceItems.map((item, i) => {
            const avatars = item.avatars as string[];
            const colors = item.avatarColors as string[];
            return (
              <div key={i} className="bg-white/[0.04] border border-white/[0.06] rounded-lg py-8 px-7 backdrop-blur-[10px] transition-all hover:bg-white/[0.07] hover:border-white/10">
                <div className="flex items-center gap-3 mb-5">
                  <div className="flex items-center">
                    {avatars.map((a, j) => (
                      <div key={j} className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 border-forest-deep/80 bg-gradient-to-br ${avatarColorMap[colors[j]] || 'from-coral-soft to-warmth'} ${j > 0 ? '-ml-3' : ''}`}>
                        {a}
                      </div>
                    ))}
                  </div>
                  <div className="h-px w-7 bg-coral-soft/35 ml-1" />
                  <div className="text-[11px] text-coral-soft font-medium tracking-[1px]">{item.label as string}</div>
                </div>
                <div className="font-serif font-normal text-[0.94rem] text-white/80 leading-[1.8] mb-5 italic">{item.text as string}</div>
                <div className="flex justify-between items-center">
                  <div className="text-[0.78rem] text-white/50">{item.names as string}</div>
                  <div className="px-2.5 py-0.5 rounded-full text-[0.68rem] font-medium bg-love-pink/[0.12] text-coral-soft border border-love-pink/20">
                    {item.tag as string}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* === 运作方式 === */}
      <section id="how-it-works" className="py-24 px-10 bg-warm-cream max-md:py-16 max-md:px-7">
        <div className="text-center max-w-[720px] mx-auto mb-14">
          <div className="inline-block text-xs tracking-[3px] text-moss uppercase mb-4 font-medium">{String(fm(howItWorks).label)}</div>
          <h2 className="font-serif text-[clamp(1.8rem,3.5vw,2.4rem)] font-normal text-forest-deep leading-[1.35] mb-4">{tr('从一棵树，', locale)}<br />{tr('到一片森林', locale)}</h2>
          <p className="text-[16px] text-text-secondary leading-[1.8]">{String(fm(howItWorks).description)}</p>
        </div>
        <div className="max-w-[840px] mx-auto relative">
          <div className="absolute left-[23px] top-2 bottom-6 w-px bg-gradient-to-b from-coral-soft via-leaf to-mist max-md:left-[21px]" />
          {stepItems.map((item, i) => (
            <div key={i} className="flex gap-10 mb-12 relative items-start max-md:gap-5">
              <div className={`shrink-0 w-12 h-12 rounded-full flex items-center justify-center font-semibold text-[13px] relative z-[2] max-md:w-11 max-md:h-11
                ${i === 0
                  ? 'bg-coral-soft/20 text-coral border border-coral-soft/35'
                  : 'bg-leaf/15 text-moss border border-leaf/25'}`}>
                {item.step as string}
              </div>
              <div className="pt-3">
                <h3 className="font-serif text-[1.25rem] font-normal text-forest-deep mb-2">{item.title as string}</h3>
                <p className="text-text-secondary leading-[1.7] text-[0.92rem]">{item.description as string}</p>
                {item.tags && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {(item.tags as string[]).map((tag, j) => (
                      <span key={j} className="px-3 py-1 bg-cream text-forest-mid rounded-full text-[0.78rem] font-medium border border-mist">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* === 线下活动 === */}
      <section className="py-24 px-10 bg-cream max-md:py-16 max-md:px-7">
        <div className="text-center max-w-[720px] mx-auto mb-14">
          <div className="inline-block text-xs tracking-[3px] text-moss uppercase mb-4 font-medium">{String(fm(offline).label)}</div>
          <h2 className="font-serif text-[clamp(1.8rem,3.5vw,2.4rem)] font-normal text-forest-deep leading-[1.35] mb-4">{String(fm(offline).title)}</h2>
          <p className="text-[16px] text-text-secondary leading-[1.8]">{String(fm(offline).description)}</p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-5 max-w-[1100px] mx-auto">
          {offlineItems.map((item, i) => (
            <div key={i} className="group bg-white/75 rounded-lg py-7 px-6 border border-moss/[0.08] transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_12px_36px_rgba(26,46,26,0.05)]">
              <div className="mb-4 flex items-center gap-3 text-[11px] font-semibold tracking-[0.18em] text-moss uppercase">
                <span className="h-px w-7 bg-coral-soft/60" />
                {String(i + 1).padStart(2, '0')}
              </div>
              <h4 className="font-serif text-base font-light text-forest-deep mb-1.5">{item.title as string}</h4>
              <p className="text-[13px] text-text-secondary leading-[1.6]">{item.description as string}</p>
            </div>
          ))}
        </div>
      </section>

      {/* === 织一张网 === */}
      <section className="pt-24 pb-10 px-10 bg-gradient-to-b from-warm-cream to-white text-center max-md:pt-16 max-md:pb-10 max-md:px-7">
        <div className="text-center max-w-[720px] mx-auto mb-14">
          <div className="inline-block text-xs tracking-[3px] text-moss uppercase mb-4 font-medium">{tr('织一张网', locale)}</div>
          <h2 className="font-serif text-[clamp(1.8rem,3.5vw,2.4rem)] font-normal text-forest-deep leading-[1.35]">{tr('让光继续传递', locale)}</h2>
        </div>
        <div className="max-w-[680px] mx-auto">
          <p className="font-serif text-[clamp(1.1rem,2.2vw,1.4rem)] font-normal text-forest-deep leading-[1.8] mb-8">{tr('附近森林不是一个人能做成的事。', locale)}<br />{tr('它是很多人一起在做的一件事。', locale)}</p>
          <p className="text-[16px] text-text-secondary leading-[2] mb-6">{tr('我能做的其实很少：把自己经历过的、学到的东西分享出来。如果刚好对谁有一点用，那就是最好的事了。', locale)}</p>
          <p className="text-[16px] text-text-secondary leading-[2] mb-6">{tr('慢慢地，让更多人找到彼此。也让这片森林，一点一点地长出来。', locale)}</p>
          <div className="inline-block px-7 py-3.5 bg-white/70 rounded-lg font-serif text-[1rem] font-light text-forest-deep border border-moss/10 mt-4">{tr('在一个容易让人各自待着的世界里，重新把一些人连在一起。', locale)}</div>
        </div>
      </section>

      {/* === 社群联结 === */}
      <section id="community" className="scroll-mt-24 pt-12 pb-24 px-10 bg-white max-md:pt-10 max-md:pb-16 max-md:px-7">
        <div className="text-center max-w-[780px] mx-auto mb-14">
          <div className="inline-block text-xs tracking-[3px] text-moss uppercase mb-4 font-medium">{tr('社群联结', locale)}</div>
          <h2 className="font-serif text-[clamp(1.8rem,3.5vw,2.4rem)] font-normal text-forest-deep leading-[1.35] mb-8">{tr('附近森林生态社区生长社群', locale)}</h2>
          <div className="text-left text-[16px] text-text-secondary leading-[2]">
            <p className="mb-5">{tr('附近森林生态社区生长社群，是给注册和使用附近森林、愿意陪伴社区最新作品一起成长的超级创造者们，一个相聚、走近彼此的附近社群。', locale)}</p>
            <p className="mb-5">{tr('我们希望这里既是大家走近附近、交流联结的地方，也是可以自在共享想法💡的地方。', locale)}</p>
            <p>{tr('也期待听到大家使用 PhilCoach 等社区作品时，任何体验上的反馈。', locale)}</p>
          </div>
        </div>

        {/* 导航栏「联系我们」直接落到这里，所以要有自己的锚点。
            scroll-mt 给悬浮导航留出高度，否则标题会被顶栏盖住。 */}
        <div id="contact" className="scroll-mt-28 text-center max-w-[720px] mx-auto mb-10">
          <div className="inline-block text-xs tracking-[3px] text-moss uppercase mb-4 font-medium">{tr('联系我们', locale)}</div>
          <h3 className="font-serif text-[clamp(1.45rem,3vw,1.9rem)] font-normal text-forest-deep leading-[1.4] mb-4">{tr('从一次真实的招呼开始', locale)}</h3>
          <p className="text-[16px] text-text-secondary leading-[1.9]">{tr('想进一步了解、加入社群，或分享使用中的感受，可以添加两位创始人的微信。', locale)}</p>
        </div>

        <div className="grid grid-cols-2 gap-7 max-w-[820px] mx-auto max-md:grid-cols-1">
          <figure className="rounded-xl border border-moss/10 bg-warm-cream/55 p-7 text-center max-md:p-5">
            <div className="relative mx-auto aspect-[888/970] w-full max-w-[340px] overflow-hidden rounded-[18px]">
              <Image
                src="/community/founder-xiaoz-wechat.png"
                alt="用于添加小 Z 为好友的微信二维码"
                width={888}
                height={1131}
                sizes="(max-width: 768px) calc(100vw - 80px), 340px"
                className="absolute inset-x-0 top-0 h-auto w-full"
                unoptimized
              />
            </div>
          </figure>

          <figure className="rounded-xl border border-moss/10 bg-warm-cream/55 p-7 text-center max-md:p-5">
            <div className="relative mx-auto aspect-[888/970] w-full max-w-[340px] overflow-hidden rounded-[18px]">
              <Image
                src="/community/founder-wendy-wechat.jpg"
                alt="用于添加 Wendy 为好友的微信二维码"
                width={888}
                height={1134}
                sizes="(max-width: 768px) calc(100vw - 80px), 340px"
                className="absolute inset-x-0 top-0 h-auto w-full"
                unoptimized
              />
            </div>
          </figure>
        </div>
      </section>

      {/* === 回到主页 CTA === */}
      <section className="py-20 px-10 bg-forest-deep text-center max-md:py-14 max-md:px-7">
        <h2 className="font-serif text-[clamp(1.4rem,2.8vw,1.8rem)] font-normal text-white mb-6 leading-[1.4]">{tr('也想把自己这棵树，放进森林？', locale)}</h2>
        <Link
          href="/#join"
          className="inline-flex items-center gap-2 px-8 py-3.5 bg-gradient-to-br from-coral-soft to-warmth text-forest-deep font-bold text-[16px] rounded-full no-underline shadow-[0_4px_24px_rgba(212,160,160,0.3)] hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(212,160,160,0.45)] transition-all"
        >{tr('种下一棵树', locale)}</Link>
      </section>

      {/* === Footer === */}
      <footer className="bg-forest-deep py-10 px-8 text-white/45 text-center text-[11px] border-t border-white/5 max-md:px-7">
        <p>附近森林 · Nearby Forest</p>
        <p className="mt-1.5 text-white/30">{tr('让独立的个体彼此连接、流动、共创', locale)}</p>
      </footer>
    </>
  );
}
