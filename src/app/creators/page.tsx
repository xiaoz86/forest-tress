import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { getContent } from '@/lib/content';
import Nav from '@/components/Nav';
import CreatorTree from '@/components/CreatorTree';
import type { NodeCard } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '创造者森林 · 附近森林',
  description: '每一棵树都是一位正在创造的人',
};

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

export default async function CreatorsPage() {
  const { frontmatter, content } = getContent('creators');
  const creators = await fetchCreators();
  const intro = content.trim().split('\n\n');

  return (
    <>
      <Nav />

      {/* Hero */}
      <section className="relative pt-36 pb-16 px-10 bg-gradient-to-b from-forest-deep via-forest-mid to-forest-light text-center overflow-hidden max-md:px-5 max-md:pt-28">
        {/* 装饰背景 */}
        <div className="absolute inset-0 opacity-20 pointer-events-none bg-[radial-gradient(circle_at_30%_20%,rgba(143,181,115,0.4)_0%,transparent_50%),radial-gradient(circle_at_70%_70%,rgba(212,131,107,0.3)_0%,transparent_50%)]" />
        <div className="relative max-w-[760px] mx-auto">
          <div className="inline-block text-xs tracking-[3px] text-sage uppercase mb-4 font-medium">
            {String(frontmatter.label || '创造者')}
          </div>
          <h1 className="font-serif text-[clamp(2.2rem,5vw,3.4rem)] font-bold text-white leading-[1.2] mb-5">
            {String(frontmatter.title || '创造者森林')}
          </h1>
          <p className="text-base text-white/70 leading-[1.9] max-md:text-sm">
            {intro[0]}
          </p>
          {intro[1] && (
            <p className="text-sm text-white/50 leading-[1.9] mt-4">{intro[1]}</p>
          )}
        </div>
      </section>

      {/* Forest Grid */}
      <section className="relative py-20 px-10 bg-warm-cream max-md:py-14 max-md:px-5">
        <div className="max-w-[1200px] mx-auto">
          {creators.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-6xl mb-6">🌱</div>
              <h2 className="font-serif text-2xl font-bold text-forest-deep mb-3">
                这片森林正在等待第一棵树
              </h2>
              <p className="text-text-secondary mb-8 max-w-md mx-auto leading-relaxed">
                还没有创造者填写节点卡。
                <br />
                也许第一棵树就是你。
              </p>
              <Link
                href="/#join"
                className="inline-block px-8 py-3.5 bg-gradient-to-br from-coral-soft to-warmth text-forest-deep font-bold rounded-full no-underline shadow-[0_4px_24px_rgba(212,160,160,0.3)] hover:-translate-y-0.5 transition-transform"
              >
                成为第一棵树
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center mb-12">
                <p className="text-sm text-moss tracking-widest uppercase">
                  当前共 {creators.length} 棵树在生长
                </p>
              </div>
              <div className="grid grid-cols-3 gap-7 max-lg:grid-cols-2 max-md:grid-cols-1 max-md:gap-5">
                {creators.map(node => (
                  <CreatorTree key={node.id} node={node} />
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-10 bg-forest-deep text-center max-md:py-12 max-md:px-5">
        <h2 className="font-serif text-[clamp(1.5rem,3vw,2rem)] font-bold text-white mb-4">
          也想成为森林中的一棵树？
        </h2>
        <p className="text-white/60 mb-8 text-sm">
          填写节点卡，让你的存在被看见，也看见同频的人。
        </p>
        <Link
          href="/#join"
          className="inline-block px-9 py-4 bg-gradient-to-br from-coral-soft to-warmth text-forest-deep font-bold rounded-full no-underline shadow-[0_4px_24px_rgba(212,160,160,0.3)] hover:-translate-y-0.5 transition-transform"
        >
          成为森林的一棵树
        </Link>
      </section>

      {/* Footer */}
      <footer className="bg-forest-deep text-white/40 py-10 px-10 text-center text-xs border-t border-white/5">
        <p>附近森林 · Nearby Forest</p>
        <p className="mt-2">让独立的个体彼此连接、流动、共创</p>
      </footer>
    </>
  );
}
