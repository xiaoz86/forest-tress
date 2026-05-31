import Link from 'next/link';
import { getContent } from '@/lib/content';
import Nav from '@/components/Nav';

export const metadata = {
  title: '附近森林的来处 · 缘起、理念与生态',
  description:
    '为什么我们做附近森林，相信什么，怎么让独立的个体在爱中彼此连接、流动、共创。',
};

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

export default function AboutPage() {
  const origin = getContent('origin');
  const philosophy = getContent('philosophy');
  const voices = getContent('voices');
  const howItWorks = getContent('how-it-works');
  const offline = getContent('offline');

  const originSections = parseOriginSections(origin.content);
  const philItems = parseItems(philosophy.content);
  const voiceItems = parseItems(voices.content);
  const stepItems = parseItems(howItWorks.content);
  const offlineItems = parseItems(offline.content);

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
            <span>回首页</span>
          </Link>
        </div>
        <div className="max-w-[680px] mx-auto">
          <div className="inline-block text-[11px] tracking-[3px] text-moss uppercase mb-5 font-medium">
            来处
          </div>
          <h1
            className="text-[clamp(2rem,4vw,2.8rem)] font-semibold tracking-normal text-forest-deep leading-[1.25] max-md:text-[28px]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            附近森林的来处
          </h1>
          <p className="mt-5 text-[15px] text-text-secondary leading-[1.95] max-w-[560px] mx-auto">
            它不是一个急着说明自己的产品，<br />
            更像一张慢慢被重新摆出来的桌子。
          </p>
        </div>
      </header>

      {/* === 缘起 === */}
      <section id="origin" className="py-24 px-10 bg-white max-md:py-16 max-md:px-5">
        <div className="text-center max-w-[720px] mx-auto mb-14">
          <div className="inline-block text-xs tracking-[3px] text-moss uppercase mb-4 font-medium">{String(origin.frontmatter.label)}</div>
          <h2 className="font-serif text-[clamp(1.8rem,3.5vw,2.4rem)] font-bold text-forest-deep leading-[1.35]">{String(origin.frontmatter.title)}</h2>
        </div>
        <div className="max-w-[720px] mx-auto">
          {originSections['引言']?.map((text, i) => (
            <div key={`quote-${i}`} className="font-serif text-[clamp(1.2rem,2.6vw,1.6rem)] font-semibold text-forest-deep leading-[1.7] mb-8 pl-7 border-l border-coral-soft">
              {text}
            </div>
          ))}
          {originSections['正文']?.map((text, i) => (
            <p key={`text-${i}`} className="text-[15.5px] text-text-secondary leading-[2] mb-6">{text}</p>
          ))}
          {originSections['核心信念']?.map((text, i) => (
            <div key={`belief-${i}`} className="font-serif text-[1.05rem] font-semibold text-forest-deep leading-[1.8] py-6 px-7 bg-warm-cream/70 rounded-lg border-l border-coral-soft my-8"
              dangerouslySetInnerHTML={{ __html: text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
          ))}
          {originSections['消失的附近']?.map((text, i) => (
            <p key={`nearby-${i}`} className="text-[15.5px] text-text-secondary leading-[2] mb-6">{text}</p>
          ))}
          {originSections['重新创造桌子']?.map((text, i) => (
            <p key={`table-${i}`} className="text-[15.5px] text-text-secondary leading-[2] mb-6">{text}</p>
          ))}
          {originSections['署名'] && (
            <div className="flex items-center gap-4 mt-10 pt-8 border-t border-black/[0.06]">
              <div className="w-12 h-12 rounded-full bg-leaf/15 border border-leaf/20 flex items-center justify-center">
                <span className="h-2.5 w-2.5 rounded-full bg-leaf" />
              </div>
              <div>
                <div className="font-serif font-semibold text-[0.95rem] text-forest-deep">{originSections['署名'][0]}</div>
                {originSections['署名'][1] && <div className="text-[0.82rem] text-text-light mt-0.5">{originSections['署名'][1]}</div>}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* === 理念 === */}
      <section id="philosophy" className="py-24 px-10 bg-warm-cream max-md:py-16 max-md:px-5">
        <div className="text-center max-w-[720px] mx-auto mb-14">
          <div className="inline-block text-xs tracking-[3px] text-moss uppercase mb-4 font-medium">{String(philosophy.frontmatter.label)}</div>
          <h2 className="font-serif text-[clamp(1.8rem,3.5vw,2.4rem)] font-bold text-forest-deep leading-[1.35] mb-4">
            技术在加速，<br />人仍需要彼此靠近
          </h2>
          <p className="text-[15px] text-text-secondary leading-[1.8]">{String(philosophy.frontmatter.description)}</p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-7 max-w-[1100px] mx-auto">
          {philItems.map((item, i) => (
            <div key={i} className="group relative p-9 bg-white/70 rounded-lg border border-moss/10 transition-all duration-300 overflow-hidden hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_12px_36px_rgba(26,46,26,0.05)]">
              <div className="mb-5 flex items-center gap-3 text-[11px] font-semibold tracking-[0.18em] text-moss uppercase">
                <span className="h-px w-8 bg-coral-soft/60" />
                {String(i + 1).padStart(2, '0')}
              </div>
              <h3 className="font-serif text-lg font-bold text-forest-deep mb-2">{item.title as string}</h3>
              <p className="text-text-secondary leading-[1.7] text-[0.9rem]">{item.description as string}</p>
            </div>
          ))}
        </div>
      </section>

      {/* === 连接故事 === */}
      <section id="voices" className="py-24 px-10 bg-gradient-to-br from-forest-deep via-[#1f3a1f] to-forest-mid relative overflow-hidden max-md:py-16 max-md:px-5">
        <div className="absolute inset-0 bg-[linear-gradient(160deg,rgba(255,255,255,0.045),transparent_42%,rgba(232,201,160,0.045))] pointer-events-none" />
        <div className="text-center max-w-[720px] mx-auto mb-14 relative z-[2]">
          <div className="inline-block text-xs tracking-[3px] text-coral-soft uppercase mb-4 font-medium">{String(voices.frontmatter.label)}</div>
          <h2 className="font-serif text-[clamp(1.8rem,3.5vw,2.4rem)] font-bold text-white leading-[1.35] mb-4">
            在这片森林里，<br />连接正在发生
          </h2>
          <p className="text-[15px] text-white/55 leading-[1.8]">{String(voices.frontmatter.description)}</p>
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
                <div className="font-serif text-[0.94rem] text-white/80 leading-[1.8] mb-5 italic">{item.text as string}</div>
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
      <section id="how-it-works" className="py-24 px-10 bg-warm-cream max-md:py-16 max-md:px-5">
        <div className="text-center max-w-[720px] mx-auto mb-14">
          <div className="inline-block text-xs tracking-[3px] text-moss uppercase mb-4 font-medium">{String(howItWorks.frontmatter.label)}</div>
          <h2 className="font-serif text-[clamp(1.8rem,3.5vw,2.4rem)] font-bold text-forest-deep leading-[1.35] mb-4">
            从一棵树，<br />到一片森林
          </h2>
          <p className="text-[15px] text-text-secondary leading-[1.8]">{String(howItWorks.frontmatter.description)}</p>
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
                <h3 className="font-serif text-[1.25rem] font-bold text-forest-deep mb-2">{item.title as string}</h3>
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
      <section className="py-24 px-10 bg-cream max-md:py-16 max-md:px-5">
        <div className="text-center max-w-[720px] mx-auto mb-14">
          <div className="inline-block text-xs tracking-[3px] text-moss uppercase mb-4 font-medium">{String(offline.frontmatter.label)}</div>
          <h2 className="font-serif text-[clamp(1.8rem,3.5vw,2.4rem)] font-bold text-forest-deep leading-[1.35] mb-4">{String(offline.frontmatter.title)}</h2>
          <p className="text-[15px] text-text-secondary leading-[1.8]">{String(offline.frontmatter.description)}</p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-5 max-w-[1100px] mx-auto">
          {offlineItems.map((item, i) => (
            <div key={i} className="group bg-white/75 rounded-lg py-7 px-6 border border-moss/[0.08] transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_12px_36px_rgba(26,46,26,0.05)]">
              <div className="mb-4 flex items-center gap-3 text-[11px] font-semibold tracking-[0.18em] text-moss uppercase">
                <span className="h-px w-7 bg-coral-soft/60" />
                {String(i + 1).padStart(2, '0')}
              </div>
              <h4 className="font-serif text-base font-bold text-forest-deep mb-1.5">{item.title as string}</h4>
              <p className="text-[13px] text-text-secondary leading-[1.6]">{item.description as string}</p>
            </div>
          ))}
        </div>
      </section>

      {/* === 织一张网 === */}
      <section className="py-24 px-10 bg-gradient-to-b from-warm-cream to-white text-center max-md:py-16 max-md:px-5">
        <div className="text-center max-w-[720px] mx-auto mb-14">
          <div className="inline-block text-xs tracking-[3px] text-moss uppercase mb-4 font-medium">织一张网</div>
          <h2 className="font-serif text-[clamp(1.8rem,3.5vw,2.4rem)] font-bold text-forest-deep leading-[1.35]">让光继续传递</h2>
        </div>
        <div className="max-w-[680px] mx-auto">
          <p className="font-serif text-[clamp(1.1rem,2.2vw,1.4rem)] font-semibold text-forest-deep leading-[1.8] mb-8">
            这个生态并不是某一个人的项目。<br />它更像是一种关系网络，一种持续生长的生命系统。
          </p>
          <p className="text-[15px] text-text-secondary leading-[2] mb-6">
            我希望自己可以做的，只是去体验、去学习、去探索。把这些经历分享出来，成为一个连接世界的载体，把光继续传递下去。
          </p>
          <p className="text-[15px] text-text-secondary leading-[2] mb-6">
            慢慢地，让更多人找到彼此。也让这片森林，一点一点地长出来。
          </p>
          <div className="inline-block px-7 py-3.5 bg-white/70 rounded-lg font-serif text-[1rem] font-semibold text-forest-deep border border-moss/10 mt-4">
            在一个越来越容易让人孤立的世界里，重新织起一张有温度的网。
          </div>
        </div>
      </section>

      {/* === 回到主页 CTA === */}
      <section className="py-20 px-10 bg-forest-deep text-center max-md:py-14 max-md:px-5">
        <h2 className="font-serif text-[clamp(1.4rem,2.8vw,1.8rem)] font-bold text-white mb-6 leading-[1.4]">
          也想把自己这棵树，放进森林？
        </h2>
        <Link
          href="/#join"
          className="inline-flex items-center gap-2 px-8 py-3.5 bg-gradient-to-br from-coral-soft to-warmth text-forest-deep font-bold text-[15px] rounded-full no-underline shadow-[0_4px_24px_rgba(212,160,160,0.3)] hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(212,160,160,0.45)] transition-all"
        >
          种下一棵树
        </Link>
      </section>

      {/* === Footer === */}
      <footer className="bg-forest-deep py-10 px-8 text-white/45 text-center text-[11px] border-t border-white/5 max-md:px-5">
        <p>附近森林 · Nearby Forest</p>
        <p className="mt-1.5 text-white/30">让独立的个体彼此连接、流动、共创</p>
      </footer>
    </>
  );
}
