import type { Metadata, Viewport } from 'next';
import { notFound, redirect } from 'next/navigation';
import SpacePage from '@/components/space/SpacePage';
import { fetchMember, previewAccess } from '@/lib/space/access';
import { findBySlugOrPrevious, spaceMode } from '@/lib/space/settings';
import { buildSpaceMetadata } from '@/lib/space/share';
import { SLUG_RE, type SpaceSettings } from '@/lib/space/types';

export const dynamic = 'force-dynamic';
// 首屏贴底的按钮要避开 iPhone 的底部横条（和 /space/[id] 一样）
export const viewport: Viewport = { viewportFit: 'cover' };

type SearchParams = Record<string, string | string[] | undefined>;
type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
};

/**
 * 短链 nearby-forest.club/@slug（next.config 把 /@slug rewrite 到这里）。
 * 也认这个人以前用过的短链（previousSlugs）：跳到现在的地址。
 */
async function lookup(raw: string): Promise<{ settings: SpaceSettings; current: boolean } | null> {
  let slug = raw;
  try {
    slug = decodeURIComponent(raw);
  } catch {
    return null;
  }
  slug = slug.trim().toLowerCase();
  if (!SLUG_RE.test(slug)) return null;
  return findBySlugOrPrevious(slug);
}

function withQuery(path: string, sp: SearchParams): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string') q.append(k, v);
    else v?.forEach(x => q.append(k, x));
  }
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const hit = await lookup((await params).slug);
  // 旧短链：页面本身会跳走，这里不给这个人的标题
  if (!hit?.current) return { title: '附近森林', robots: { index: false, follow: false } };
  return buildSpaceMetadata(hit.settings.id);
}

export default async function ShortLinkPage({ params, searchParams }: Props) {
  const hit = await lookup((await params).slug);
  if (!hit) notFound();
  const { settings } = hit;
  if (!hit.current) {
    // 对访客「不存在」的空间（没发布、或人已经不在森林里）：旧短链也不能把 TA 带到新地址（会透出新短链）
    if (!(await previewAccess(settings.id))) {
      let node: Awaited<ReturnType<typeof fetchMember>> = null;
      try {
        node = await fetchMember(settings.id);
      } catch {
        notFound();
      }
      if (!node || spaceMode(settings, node) === 'none') notFound();
    }
    // 用临时跳转（307）：短链可以再改回来，浏览器记住的永久跳转会绕成死循环
    redirect(withQuery(settings.slug ? `/@${settings.slug}` : `/space/${settings.id}`, await searchParams));
  }
  return <SpacePage memberId={settings.id} searchParams={await searchParams} via="slug" />;
}
