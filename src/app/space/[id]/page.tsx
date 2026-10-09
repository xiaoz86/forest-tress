import type { Metadata, Viewport } from 'next';
import SpacePage from '@/components/space/SpacePage';
import { buildSpaceMetadata } from '@/lib/space/share';
import { isMemberId } from '@/lib/space/store';

export const dynamic = 'force-dynamic';
// 首屏贴底的按钮要避开 iPhone 的底部横条：env(safe-area-inset-bottom) 只有在 viewport-fit=cover 时才有值
export const viewport: Viewport = { viewportFit: 'cover' };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!isMemberId(id)) return { robots: { index: false, follow: false } };
  const e = (await searchParams).e;
  // ?e=：单独分享出去的一场活动，预览卡片换成这一场
  return buildSpaceMetadata(id.toLowerCase(), { event: typeof e === 'string' ? e : null });
}

/**
 * 个人空间：/space/<成员 id>。有短链的人也可以走 /@短链（src/app/s/[slug]），两边是同一个渲染。
 * 没发布时只有本人和管理员能看到；其他人 404，不暴露这个人有没有在做个人空间。
 */
export default async function Page({ params, searchParams }: Props) {
  const { id } = await params;
  return <SpacePage memberId={id} searchParams={await searchParams} via="id" />;
}
