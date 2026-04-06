import { getContent } from '@/lib/content';
import Nav from '@/components/Nav';
import HeroCanvas from '@/components/HeroCanvas';
import JoinForm from '@/components/JoinForm';

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

const avatarColorMap: Record<string, string> = {
  coral: 'from-coral-soft to-warmth',
  sky: 'from-sky to-[#a5cce0]',
  leaf: 'from-leaf to-sage',
  purple: 'from-[#b088c9] to-[#d4b4e8]',
  gold: 'from-gold to-gold-light',
};

export default function Home() {
  const origin = getContent('origin');
  const philosophy = getContent('philosophy');
  const voices = getContent('voices');
  const howItWorks = getContent('how-it-works');
  const nodeCard = getContent('node-card');
  const offline = getContent('offline');

  const philItems = parseItems(philosophy.content);
  const voiceItems = parseItems(voices.content);
  const stepItems = parseItems(howItWorks.content);
  const offlineItems = parseItems(offline.content);

  return (
    <>
      <Nav />

      {/* Hero */}
      <section className="relative min-h-screen flex flex-col justify-center items-center text-center bg-gradient-to-br from-forest-deep via-[#243d24] via-30% to-[#3d6b3d] overflow-hidden p-8">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_700px_500px_at_25%_75%,rgba(212,160,160,0.08)_0%,transparent_70%),radial-gradient(ellipse_600px_400px_at_75%_25%,rgba(139,181,115,0.12)_0%,transparent_70%)] pointer-events-none" />
        <HeroCanvas />
        <div className="relative z-[2] max-w-[820px]">
          <div className="inline-flex items-center gap-2 px-5 py-2 bg-white/[0.07] border border-white/10 rounded-full text-sage text-[0.82rem] tracking-[2px] mb-10 backdrop-blur-[10px] animate-fade-in-delay-1">
            <span className="w-1.5 h-1.5 bg-coral-soft rounded-full animate-pulse-heart" />
            一个关于爱与连接的生态社区
          </div>
          <h1 className="font-serif text-[clamp(2.6rem,6.5vw,5rem)] font-black text-white leading-[1.25] -tracking-[1px] mb-6 animate-fade-in-delay-2">
            让独立的个体<br />
            <span className="bg-gradient-to-br from-warmth via-coral-soft to-gold-light bg-clip-text text-transparent">在爱中连接</span><br />
            让附近重新生长
          </h1>
          <p className="font-serif text-[clamp(1rem,2.2vw,1.25rem)] text-white/65 leading-[1.9] mb-12 animate-fade-in-delay-3">
            这个世界有时候会很刻薄。如果可以的话，我希望用温暖和爱去创造一些东西。<br />
            帮助人们不那么孤独，不那么艰难。慢慢地，把这些人连接起来。
          </p>
          <div className="flex gap-4 justify-center flex-wrap animate-fade-in-delay-4">
            <a href="#join" className="inline-flex items-center gap-2 px-9 py-4 bg-gradient-to-br from-coral-soft to-warmth text-forest-deep font-bold text-base rounded-full no-underline transition-all shadow-[0_4px_24px_rgba(212,160,160,0.3)] hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(212,160,160,0.45)]">
              成为森林的一棵树
            </a>
            <a href="#origin" className="inline-flex items-center gap-2 px-9 py-4 bg-white/[0.06] text-white/85 font-medium text-base rounded-full no-underline border border-white/[0.12] backdrop-blur-[10px] transition-all hover:bg-white/10 hover:border-white/25">
              听听这个故事
            </a>
          </div>
        </div>
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/25 text-xs tracking-[2px] animate-fade-in">
          <span>探索</span>
          <div className="w-px h-10 bg-gradient-to-b from-white/25 to-transparent animate-scroll-bounce" />
        </div>
      </section>

      {/* Origin */}
      <section id="origin" className="py-30 px-10 bg-warm-cream relative overflow-hidden max-md:py-20 max-md:px-5">
        <div className="absolute -top-[200px] -right-[200px] w-[500px] h-[500px] bg-[radial-gradient(circle,rgba(212,160,160,0.15)_0%,transparent_70%)] pointer-events-none" />
        <div className="text-center max-w-[720px] mx-auto mb-20">
          <div className="inline-block text-xs tracking-[3px] text-moss uppercase mb-4 font-medium">{origin.frontmatter.label}</div>
          <h2 className="font-serif text-[clamp(2rem,4vw,2.8rem)] font-bold text-forest-deep leading-[1.35]">{origin.frontmatter.title}</h2>
        </div>
        <div className="max-w-[760px] mx-auto">
          <div className="font-serif text-[clamp(1.3rem,3vw,1.8rem)] font-semibold text-forest-deep leading-[1.7] mb-8 pl-7 border-l-[3px] border-coral-soft">
            这个时代，AI 正在快速改变世界。但越是在这样的时代，我越想回到一个更根本的问题：什么才是不会被替代的？
          </div>
          <p className="text-base text-text-secondary leading-[2] mb-6">
            也许不是某一种工具，而是一个人如何与人相处，如何倾听，如何理解，如何建立信任，如何共情，如何合作，如何在复杂世界里依然保有善意与责任感。
          </p>
          <p className="text-base text-text-secondary leading-[2] mb-6">
            当我想到孩子长大以后真正需要什么时，我想到的，也不是一项具体技能，而是人的特质——与人联结的能力，共情的能力，面对变化时依然保有学习力、判断力与创造力的能力。
          </p>
          <div className="font-serif text-lg font-semibold text-forest-deep leading-[1.8] py-7 px-8 bg-gradient-to-br from-love-pink/8 to-warmth/8 rounded-2xl border-l-[3px] border-coral-soft my-8">
            我的血液和价值愿景里一直相信：一个连接、有爱、可以持续生长的生态，无论现在还是未来，都是极其重要的。我们可以把它变为现实。于是，一个想法在我心里孕育产生了——<strong>去重新种下一片森林。</strong>
          </div>
          <p className="text-base text-text-secondary leading-[2] mb-6">
            今天，很多人的&ldquo;附近&rdquo;正在消失。我们拥有无数联系人，却很少有真正可以靠近、可以对话、可以彼此支持的人。&ldquo;附近&rdquo;的消失，不只是空间的变化，也是关系土壤的流失。
          </p>
          <p className="text-base text-text-secondary leading-[2] mb-6">
            Hannah Arendt 提到过一个意象：桌子。桌子让彼此之间既有距离，也有关系。书店、社区空间、沙龙、一次认真组织的对话——它们都像一张张小桌子。我们想做的，就是在一个越来越难对话的时代，重新创造一些&ldquo;桌子&rdquo;，让人们能够重新相遇、重新交谈、重新建立一点点理解。
          </p>
          <div className="flex items-center gap-4 mt-10 pt-8 border-t border-black/[0.06]">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-coral-soft to-warmth flex items-center justify-center text-xl">🌱</div>
            <div>
              <div className="font-serif font-semibold text-[0.95rem] text-forest-deep">附近森林发起人</div>
              <div className="text-[0.82rem] text-text-light mt-0.5">创造价值的背后都是爱的一种表达</div>
            </div>
          </div>
        </div>
      </section>

      {/* Philosophy */}
      <section id="philosophy" className="py-30 px-10 bg-white max-md:py-20 max-md:px-5">
        <div className="text-center max-w-[720px] mx-auto mb-20">
          <div className="inline-block text-xs tracking-[3px] text-moss uppercase mb-4 font-medium">{philosophy.frontmatter.label}</div>
          <h2 className="font-serif text-[clamp(2rem,4vw,2.8rem)] font-bold text-forest-deep leading-[1.35] mb-5">
            在技术加速的时代，<br />回到人，回到爱
          </h2>
          <p className="text-base text-text-secondary leading-[1.8]">{philosophy.frontmatter.description}</p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-7 max-w-[1200px] mx-auto">
          {philItems.map((item, i) => (
            <div key={i} className="group relative p-11 pb-10 px-8 bg-warm-cream rounded-3xl border border-moss/8 transition-all duration-400 overflow-hidden hover:-translate-y-1 hover:shadow-[0_16px_48px_rgba(26,46,26,0.06)]">
              <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-coral-soft to-leaf opacity-0 transition-opacity duration-400 group-hover:opacity-100" />
              <div className="w-[52px] h-[52px] bg-gradient-to-br from-love-pink/15 to-leaf/15 rounded-[14px] flex items-center justify-center mb-5 text-[1.4rem]">
                {item.icon as string}
              </div>
              <h3 className="font-serif text-xl font-bold text-forest-deep mb-2.5">{item.title as string}</h3>
              <p className="text-text-secondary leading-[1.7] text-[0.92rem]">{item.description as string}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Voices */}
      <section id="voices" className="py-30 px-10 bg-gradient-to-br from-forest-deep via-[#1f3a1f] to-forest-mid relative overflow-hidden max-md:py-20 max-md:px-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_500px_at_20%_80%,rgba(212,160,160,0.06),transparent),radial-gradient(circle_400px_at_80%_20%,rgba(232,201,160,0.05),transparent)] pointer-events-none" />
        <div className="text-center max-w-[720px] mx-auto mb-20 relative z-[2]">
          <div className="inline-block text-xs tracking-[3px] text-coral-soft uppercase mb-4 font-medium">{voices.frontmatter.label}</div>
          <h2 className="font-serif text-[clamp(2rem,4vw,2.8rem)] font-bold text-white leading-[1.35] mb-5">
            在这片森林里，<br />连接正在发生
          </h2>
          <p className="text-base text-white/55 leading-[1.8]">{voices.frontmatter.description}</p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-6 max-w-[1100px] mx-auto relative z-[2]">
          {voiceItems.map((item, i) => {
            const avatars = item.avatars as string[];
            const colors = item.avatarColors as string[];
            return (
              <div key={i} className="bg-white/[0.04] border border-white/[0.06] rounded-3xl py-9 px-7 backdrop-blur-[10px] transition-all hover:bg-white/[0.07] hover:border-white/10 hover:-translate-y-1">
                <div className="flex items-center gap-3 mb-5">
                  <div className="flex items-center">
                    {avatars.map((a, j) => (
                      <div key={j} className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white border-2 border-forest-deep/80 bg-gradient-to-br ${avatarColorMap[colors[j]] || 'from-coral-soft to-warmth'} ${j > 0 ? '-ml-3' : ''}`}>
                        {a}
                      </div>
                    ))}
                  </div>
                  <div className="w-7 h-7 rounded-full bg-love-pink/20 flex items-center justify-center text-[0.7rem] ml-2">💛</div>
                  <div className="text-xs text-coral-soft font-medium tracking-[1px]">{item.label as string}</div>
                </div>
                <div className="font-serif text-[0.98rem] text-white/80 leading-[1.8] mb-5 italic">{item.text as string}</div>
                <div className="flex justify-between items-center">
                  <div className="text-[0.82rem] text-white/50">{item.names as string}</div>
                  <div className="px-3 py-1 rounded-full text-[0.72rem] font-medium bg-love-pink/[0.12] text-coral-soft border border-love-pink/20">
                    {item.tag as string}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-30 px-10 bg-warm-cream max-md:py-20 max-md:px-5">
        <div className="text-center max-w-[720px] mx-auto mb-20">
          <div className="inline-block text-xs tracking-[3px] text-moss uppercase mb-4 font-medium">{howItWorks.frontmatter.label}</div>
          <h2 className="font-serif text-[clamp(2rem,4vw,2.8rem)] font-bold text-forest-deep leading-[1.35] mb-5">
            从个体到节点，<br />从节点到森林
          </h2>
          <p className="text-base text-text-secondary leading-[1.8]">{howItWorks.frontmatter.description}</p>
        </div>
        <div className="max-w-[900px] mx-auto relative">
          <div className="absolute left-9 top-0 bottom-0 w-0.5 bg-gradient-to-b from-coral-soft via-leaf to-mist max-md:left-5" />
          {stepItems.map((item, i) => (
            <div key={i} className="flex gap-10 mb-14 relative items-start max-md:gap-5">
              <div className={`shrink-0 w-[72px] h-[72px] rounded-full flex items-center justify-center font-serif text-2xl font-bold text-white relative z-[2] max-md:w-11 max-md:h-11 max-md:text-base
                ${i === 0
                  ? 'bg-gradient-to-br from-coral to-coral-soft shadow-[0_4px_20px_rgba(212,131,107,0.25)]'
                  : 'bg-gradient-to-br from-forest-mid to-forest-light shadow-[0_4px_20px_rgba(45,74,45,0.2)]'}`}>
                {item.step as string}
              </div>
              <div className="pt-3">
                <h3 className="font-serif text-[1.35rem] font-bold text-forest-deep mb-2">{item.title as string}</h3>
                <p className="text-text-secondary leading-[1.7] text-[0.94rem]">{item.description as string}</p>
                {item.tags && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {(item.tags as string[]).map((tag, j) => (
                      <span key={j} className="px-3.5 py-1 bg-cream text-forest-mid rounded-full text-[0.8rem] font-medium border border-mist">
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

      {/* Node Card */}
      <section id="node-card" className="py-30 px-10 bg-gradient-to-b from-white to-cream relative overflow-hidden max-md:py-20 max-md:px-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_600px_at_80%_80%,rgba(212,160,160,0.15),transparent)] pointer-events-none" />
        <div className="text-center max-w-[720px] mx-auto mb-20">
          <div className="inline-block text-xs tracking-[3px] text-coral-soft uppercase mb-4 font-medium">{nodeCard.frontmatter.label}</div>
          <h2 className="font-serif text-[clamp(2rem,4vw,2.8rem)] font-bold text-forest-deep leading-[1.35] mb-5">{nodeCard.frontmatter.title}</h2>
          <p className="text-base text-text-secondary leading-[1.8]">{nodeCard.frontmatter.description}</p>
        </div>
        <div className="max-w-[1100px] mx-auto grid grid-cols-2 gap-15 items-center relative z-[2] max-md:grid-cols-1 max-md:gap-10">
          {/* Demo Node Card */}
          <div className="bg-white border border-moss/10 rounded-3xl p-10 shadow-[0_8px_40px_rgba(26,46,26,0.06)] relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-coral-soft via-leaf to-sky" />
            <div className="flex items-center gap-4 mb-7">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-coral-soft to-warmth flex items-center justify-center font-serif text-2xl font-bold text-white">林</div>
              <div>
                <div className="font-serif text-[1.35rem] font-bold text-forest-deep">林小溪</div>
                <div className="text-[0.82rem] text-text-light mt-0.5">独立设计师 · 社区营造者 · 台北</div>
              </div>
            </div>
            <div className="mb-4">
              <div className="text-[0.72rem] text-moss tracking-[1.5px] uppercase mb-1 font-semibold">正在做的事</div>
              <div className="text-[0.92rem] text-text-secondary leading-[1.6]">运营一个关注社区空间设计的工作室，探索如何用设计激活社区关系。</div>
            </div>
            <div className="mb-4">
              <div className="text-[0.72rem] text-moss tracking-[1.5px] uppercase mb-1 font-semibold">关心的议题</div>
              <div className="flex flex-wrap gap-1.5 mt-1">
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-leaf/[0.12] text-moss border border-leaf/20">社区营造</span>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-leaf/[0.12] text-moss border border-leaf/20">空间设计</span>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-gold/10 text-earth border border-gold/20">可持续生活</span>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-love-pink/10 text-coral border border-love-pink/20">爱与连接</span>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-sky/10 text-sky border border-sky/20">人与AI</span>
              </div>
            </div>
            <div className="mb-4">
              <div className="text-[0.72rem] text-moss tracking-[1.5px] uppercase mb-1 font-semibold">可以提供</div>
              <div className="text-[0.92rem] text-text-secondary leading-[1.6]">社区空间策划经验、品牌视觉设计、工作坊组织</div>
            </div>
            <div className="mb-4">
              <div className="text-[0.72rem] text-moss tracking-[1.5px] uppercase mb-1 font-semibold">正在寻找</div>
              <div className="text-[0.92rem] text-text-secondary leading-[1.6]">关注社会创新的伙伴，想一起做有温度的事的人</div>
            </div>
            <div className="w-full h-px bg-black/5 my-4" />
            <div className="flex items-center gap-2 text-xs text-coral mb-3 font-semibold">💛 AI 推荐 · 有温度的匹配</div>
            <div className="flex flex-col gap-2">
              {[
                { avatar: '张', color: 'from-sky to-[#a5cce0]', name: '张远山', reason: '同关注社区营造 · 正在寻找设计合作伙伴', score: '92%' },
                { avatar: '陈', color: 'from-leaf to-sage', name: '陈思源', reason: '可持续生活实践者 · 想参与共创工作坊', score: '87%' },
                { avatar: '王', color: 'from-[#b088c9] to-[#d4b4e8]', name: '王晓晴', reason: 'AI产品设计师 · 也关注爱与连接的议题', score: '81%' },
              ].map((match, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 bg-cream rounded-lg border border-mist transition-all cursor-pointer hover:bg-white hover:shadow-[0_4px_16px_rgba(26,46,26,0.05)]">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 bg-gradient-to-br ${match.color}`}>{match.avatar}</div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-forest-deep">{match.name}</div>
                    <div className="text-[0.73rem] text-text-light mt-0.5">{match.reason}</div>
                  </div>
                  <div className="text-[0.73rem] text-coral font-semibold">{match.score}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Info Side */}
          <div>
            <h3 className="font-serif text-[1.7rem] font-bold mb-5 leading-[1.4] text-forest-deep">
              每个人都值得<br />被完整地看见
            </h3>
            <p className="text-text-secondary leading-[1.8] mb-4 text-[0.95rem]">
              在这里，你不是一个普通群成员，不是一个被动用户，而是一个有独特生命经验、价值与连接可能性的节点。
            </p>
            <p className="text-text-secondary leading-[1.8] mb-4 text-[0.95rem]">
              通过 AI，帮助节点之间形成有温度的匹配：
            </p>
            <ul className="list-none mt-6">
              {['与你同频共振的人', '可以支持你成长的伯乐', '你也许可以温暖的人', '适合你的圈层与活动', '一起共创的可能性'].map((f, i) => (
                <li key={i} className="flex items-start gap-3 mb-3.5 text-[0.92rem] text-text-secondary leading-[1.5]">
                  <span className="shrink-0 mt-px text-sm">💛</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Ecosystem */}
      <section className="py-30 px-10 bg-white max-md:py-20 max-md:px-5">
        <div className="text-center max-w-[720px] mx-auto mb-20">
          <div className="inline-block text-xs tracking-[3px] text-moss uppercase mb-4 font-medium">生态全景</div>
          <h2 className="font-serif text-[clamp(2rem,4vw,2.8rem)] font-bold text-forest-deep leading-[1.35] mb-5">一片开源的森林</h2>
          <p className="text-base text-text-secondary leading-[1.8]">像织一张网——一张由善意、理解和支持组成的网。每个人都在为这个生态贡献一点点爱。</p>
        </div>
        <div className="max-w-[1000px] mx-auto text-center">
          <div className="relative w-full max-w-[520px] mx-auto mb-15 aspect-square max-md:max-w-[300px]">
            <svg className="absolute inset-0 pointer-events-none z-[1]" viewBox="0 0 520 520">
              <line x1="260" y1="0" x2="494" y2="57" stroke="rgba(212,160,160,.15)" strokeWidth="1"/>
              <line x1="494" y1="57" x2="520" y2="208" stroke="rgba(168,201,160,.15)" strokeWidth="1"/>
              <line x1="520" y1="208" x2="480" y2="405" stroke="rgba(232,201,160,.12)" strokeWidth="1"/>
              <line x1="480" y1="405" x2="260" y2="520" stroke="rgba(139,181,115,.15)" strokeWidth="1"/>
              <line x1="260" y1="520" x2="40" y2="405" stroke="rgba(176,136,201,.12)" strokeWidth="1"/>
              <line x1="40" y1="405" x2="0" y2="208" stroke="rgba(212,160,160,.15)" strokeWidth="1"/>
              <line x1="0" y1="208" x2="26" y2="57" stroke="rgba(168,201,160,.12)" strokeWidth="1"/>
              <line x1="26" y1="57" x2="260" y2="0" stroke="rgba(232,201,160,.15)" strokeWidth="1"/>
              <line x1="260" y1="0" x2="260" y2="520" stroke="rgba(212,160,160,.06)" strokeWidth="1" strokeDasharray="4,8"/>
              <line x1="0" y1="208" x2="520" y2="208" stroke="rgba(168,201,160,.06)" strokeWidth="1" strokeDasharray="4,8"/>
            </svg>
            <div className="absolute inset-0 rounded-full border border-mist animate-ring-breathe" />
            <div className="absolute inset-[16%] rounded-full border border-sage animate-ring-breathe" style={{ animationDelay: '1s' }} />
            <div className="absolute inset-[33%] rounded-full border border-leaf bg-leaf/[0.04] animate-ring-breathe" style={{ animationDelay: '2s' }} />
            <div className="absolute inset-[43%] rounded-full bg-gradient-to-br from-forest-mid to-forest-light shadow-[0_8px_32px_rgba(45,74,45,0.2)] flex items-center justify-center">
              <div className="text-white font-serif font-bold text-[clamp(0.7rem,1.8vw,1.1rem)] text-center leading-[1.4]">爱与<br/>连接</div>
            </div>
            {[
              { pos: 'top-[-22px] left-1/2 -ml-[22px]', bg: 'from-coral-soft to-warmth', emoji: '💛' },
              { pos: 'top-[11%] right-[4%]', bg: 'from-gold to-gold-light', emoji: '📚' },
              { pos: 'top-[40%] right-[-22px]', bg: 'from-sky to-[#a5cce0]', emoji: '🤝' },
              { pos: 'bottom-[11%] right-[7%]', bg: 'from-leaf to-sage', emoji: '🌱' },
              { pos: 'bottom-[-22px] left-1/2 -ml-[22px]', bg: 'from-earth to-gold', emoji: '💡' },
              { pos: 'bottom-[11%] left-[7%]', bg: 'from-[#b088c9] to-[#d4b4e8]', emoji: '🎵' },
              { pos: 'top-[40%] left-[-22px]', bg: 'from-coral to-coral-soft', emoji: '🏡' },
              { pos: 'top-[11%] left-[4%]', bg: 'from-sage to-leaf', emoji: '🎨' },
            ].map((n, i) => (
              <div key={i} className={`absolute ${n.pos} w-11 h-11 rounded-full flex items-center justify-center text-lg shadow-[0_4px_16px_rgba(0,0,0,0.08)] border-2 border-white cursor-pointer transition-transform hover:scale-[1.2] z-[3] bg-gradient-to-br ${n.bg} max-md:w-[34px] max-md:h-[34px] max-md:text-sm`}>
                {n.emoji}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-6 max-w-[800px] mx-auto">
            {[
              { icon: '💛', title: '爱的传递', desc: '每个人的贡献都是爱的表达，在生态中流动' },
              { icon: '🌿', title: '节点机制', desc: '每个人都是独特节点，形成森林地图' },
              { icon: '🤖', title: 'AI 匹配', desc: '有温度的推荐，让同频的人相遇' },
              { icon: '🪑', title: '真实相遇', desc: '小桌子对话、沙龙、工作坊' },
            ].map((item, i) => (
              <div key={i} className="text-center p-5">
                <div className="text-[1.4rem] mb-2.5">{item.icon}</div>
                <h4 className="font-serif text-[1.05rem] font-bold text-forest-deep mb-1">{item.title}</h4>
                <p className="text-[0.82rem] text-text-secondary leading-[1.5]">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Offline Activities */}
      <section className="py-30 px-10 bg-cream max-md:py-20 max-md:px-5">
        <div className="text-center max-w-[720px] mx-auto mb-20">
          <div className="inline-block text-xs tracking-[3px] text-moss uppercase mb-4 font-medium">{offline.frontmatter.label}</div>
          <h2 className="font-serif text-[clamp(2rem,4vw,2.8rem)] font-bold text-forest-deep leading-[1.35] mb-5">{offline.frontmatter.title}</h2>
          <p className="text-base text-text-secondary leading-[1.8]">{offline.frontmatter.description}</p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-5 max-w-[1100px] mx-auto">
          {offlineItems.map((item, i) => (
            <div key={i} className="group bg-white rounded-2xl py-8 px-7 border border-moss/[0.06] transition-all cursor-pointer relative overflow-hidden hover:-translate-y-1 hover:shadow-[0_12px_36px_rgba(26,46,26,0.05)]">
              <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-gradient-to-r from-coral-soft to-leaf scale-x-0 transition-transform duration-400 group-hover:scale-x-100" />
              <div className="text-3xl mb-3.5">{item.emoji as string}</div>
              <h4 className="font-serif text-lg font-bold text-forest-deep mb-1.5">{item.title as string}</h4>
              <p className="text-sm text-text-secondary leading-[1.6]">{item.description as string}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Weave */}
      <section className="py-30 px-10 bg-gradient-to-b from-warm-cream to-white text-center max-md:py-20 max-md:px-5">
        <div className="text-center max-w-[720px] mx-auto mb-20">
          <div className="inline-block text-xs tracking-[3px] text-moss uppercase mb-4 font-medium">织一张网</div>
          <h2 className="font-serif text-[clamp(2rem,4vw,2.8rem)] font-bold text-forest-deep leading-[1.35]">让光继续传递</h2>
        </div>
        <div className="max-w-[680px] mx-auto">
          <p className="font-serif text-[clamp(1.2rem,2.5vw,1.6rem)] font-semibold text-forest-deep leading-[1.8] mb-8">
            这个生态并不是某一个人的项目。<br />它更像是一种关系网络，一种持续生长的生命系统。
          </p>
          <p className="text-base text-text-secondary leading-[2] mb-6">
            我希望自己可以做的，只是去体验、去学习、去探索。把这些经历分享出来，成为一个连接世界的载体，把光继续传递下去。
          </p>
          <p className="text-base text-text-secondary leading-[2] mb-6">
            慢慢地，让更多人找到彼此。也让这片森林，一点一点地长出来。
          </p>
          <div className="inline-block px-8 py-4 bg-gradient-to-br from-love-pink/10 to-leaf/10 rounded-2xl font-serif text-lg font-semibold text-forest-deep border border-love-pink/15 mt-4">
            在一个越来越容易让人孤立的世界里，重新织起一张有温度的网。
          </div>
        </div>
      </section>

      {/* Join Form */}
      <section id="join" className="py-30 px-10 bg-warm-cream max-md:py-20 max-md:px-5">
        <div className="text-center max-w-[720px] mx-auto mb-20">
          <div className="inline-block text-xs tracking-[3px] text-moss uppercase mb-4 font-medium">成为节点</div>
          <h2 className="font-serif text-[clamp(2rem,4vw,2.8rem)] font-bold text-forest-deep leading-[1.35] mb-5">
            如果你愿意，<br />一起成为最初的种子
          </h2>
          <p className="text-base text-text-secondary leading-[1.8]">一片森林，不会由一个人长出来。它需要最初的一批种子。填写你的节点信息，让自己被更完整地看见。</p>
        </div>
        <JoinForm />
      </section>

      {/* CTA */}
      <section className="py-30 px-10 bg-gradient-to-br from-forest-deep to-forest-mid text-center relative overflow-hidden max-md:py-20 max-md:px-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_400px_at_30%_60%,rgba(212,160,160,0.06),transparent),radial-gradient(circle_400px_at_70%_40%,rgba(232,201,160,0.05),transparent)] pointer-events-none" />
        <div className="relative z-[2] max-w-[650px] mx-auto">
          <h2 className="font-serif text-[clamp(1.8rem,4vw,2.8rem)] font-bold text-white mb-5 leading-[1.35]">
            用爱重新种下<br />一片森林
          </h2>
          <p className="text-white/55 text-base leading-[1.8] mb-10">
            也许一开始很小。也许只是几张桌子，几个节点，几次认真发生的对话。但我们相信，小事情不小。很多新的变化，本来就是从很小的地方长出来的。
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <a href="#join" className="inline-flex items-center gap-2 px-9 py-4 bg-gradient-to-br from-coral-soft to-warmth text-forest-deep font-bold text-base rounded-full no-underline transition-all shadow-[0_4px_24px_rgba(212,160,160,0.3)] hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(212,160,160,0.45)]">
              成为最初的种子
            </a>
            <a href="#" className="inline-flex items-center gap-2 px-9 py-4 bg-white/[0.06] text-white/85 font-medium text-base rounded-full no-underline border border-white/[0.12] backdrop-blur-[10px] transition-all hover:bg-white/10 hover:border-white/25">
              加入微信群
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-forest-deep py-14 px-10 text-white/50 max-md:px-5">
        <div className="max-w-[1100px] mx-auto flex justify-between items-start flex-wrap gap-10 max-md:flex-col">
          <div className="max-w-[320px]">
            <div className="font-serif text-lg font-bold text-white flex items-center gap-2.5 mb-3">
              <svg viewBox="0 0 28 28" fill="none" width="24" height="24">
                <circle cx="14" cy="14" r="13" stroke="#a8c9a0" strokeWidth="1.5"/>
                <path d="M14 6 C14 6, 8 12, 8 17 C8 20.3 10.7 23 14 23 C17.3 23 20 20.3 20 17 C20 12 14 6 14 6Z" fill="#8fb573" opacity="0.6"/>
              </svg>
              附近森林
            </div>
            <p className="text-[0.82rem] leading-[1.7]">让独立的个体在爱中彼此连接，流动，让附近生长。创造价值的背后，都是爱的一种表达。</p>
          </div>
          <div>
            <h4 className="text-white text-sm font-semibold mb-3.5">探索</h4>
            <ul className="list-none">
              {[
                { href: '#origin', label: '缘起' },
                { href: '#philosophy', label: '核心理念' },
                { href: '#voices', label: '连接故事' },
              ].map(link => (
                <li key={link.href} className="mb-2">
                  <a href={link.href} className="text-white/50 no-underline text-[0.82rem] transition-colors hover:text-coral-soft">{link.label}</a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-white text-sm font-semibold mb-3.5">参与</h4>
            <ul className="list-none">
              {[
                { href: '#join', label: '创建节点卡' },
                { href: '#', label: '线下活动' },
                { href: '#', label: '联系我们' },
              ].map((link, i) => (
                <li key={i} className="mb-2">
                  <a href={link.href} className="text-white/50 no-underline text-[0.82rem] transition-colors hover:text-coral-soft">{link.label}</a>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="max-w-[1100px] mx-auto mt-9 pt-5 border-t border-white/5 text-center text-xs">
          &copy; 2026 附近森林生态社区 · 让独立的个体在爱中彼此连接
        </div>
      </footer>
    </>
  );
}
