import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import '@/components/space/studio.css';
import Unavailable from '@/components/space/Unavailable';
import StyleStudio, { type StudioProps } from '@/components/space/StyleStudio';
import { fetchMember, previewAccess } from '@/lib/space/access';
import { richness } from '@/lib/space/portrait';
import { readSpace, type SpaceRecord } from '@/lib/space/store';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '风格工作室 · 预览', robots: { index: false, follow: false } };

type Props = { params: Promise<{ id: string }> };

export default async function StudioPage({ params }: Props) {
  const { id } = await params;
  if (!(await previewAccess(id))) notFound();
  let node: Awaited<ReturnType<typeof fetchMember>>;
  try {
    node = await fetchMember(id);
  } catch {
    return <Unavailable what="成员资料" />;
  }
  if (!node) notFound();
  let rec: SpaceRecord;
  try {
    rec = await readSpace(id);
  } catch {
    return <Unavailable what="本地保存的画像和风格" />;
  }
  const rich = richness(node);

  const chips = (node.interests || '').split(/[、，,；;。\n]+/).map(s => s.trim()).filter(Boolean);
  // 白名单：只把风格工作室用得到的字段交给客户端，联系方式不进 payload
  const props: StudioProps = {
    memberId: id,
    name: node.name,
    avatarUrl: node.avatar_url || undefined,
    chips: chips.length ? chips.slice(0, 6) : (node.topics || []).slice(0, 6),
    fallbackTagline: (node.doing || '').split(/[，。,.；;]/)[0].slice(0, 24),
    humanCount: rich.humanCount,
    humanChars: rich.humanChars,
    otherChars: rich.otherChars,
    sparse: !rich.enough,
    result: rec.result ?? null,
    saved: rec.style ?? null,
    feel: rec.tune?.feel ?? {},
    feelNotes: (rec.tune?.notes ?? []).map(n => ({ said: n.said, dim: n.dim, dir: n.dir })),
  };
  return <StyleStudio {...props} />;
}
