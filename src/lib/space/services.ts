import 'server-only';
import type { NodeCard } from '@/lib/supabase';
import { effectiveDraft } from './edits';
import { readSpace } from './store';

/**
 * 「一起做点什么」里当前对外显示的服务单。和 SpaceSite 第三章的判断一致：
 * 服务单是从「可以提供」「作品/产品」原话拆出来的——两段原话都空了，拆出来的服务也不再挂着。
 */

type OfferSource = Pick<NodeCard, 'offer' | 'product'>;

/** 「可以提供」「作品/产品」原话有没有内容（页面上的泛预约按钮也只在这时出现） */
export function hasOfferText(node: OfferSource): boolean {
  return !!(node.offer?.trim() || node.product?.trim());
}

/**
 * 当前对外显示的服务标题（和 SpaceSite 第三章一致）：
 * 还没确认的 AI 服务单，原话都空时不显示；本人确认过、改过的照常显示；本人说「不要」时没有。
 * 读不到画像时抛出（调用方按存储故障处理）
 */
export async function shownServiceTitles(memberId: string, node: OfferSource): Promise<string[]> {
  const rec = await readSpace(memberId);
  if (!rec.result && !rec.edits?.services) return [];
  const eff = effectiveDraft(rec.result?.draft ?? null, rec.edits);
  if (eff.marks.services === 'ai' && !hasOfferText(node)) return [];
  return eff.services.map(s => s.title).filter(Boolean);
}
