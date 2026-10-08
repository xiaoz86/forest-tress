import 'server-only';
import type { NodeCard } from '@/lib/supabase';
import { generatePortrait, richness, type PortraitResult } from './portrait';
import { readSpace, writeSpace } from './store';

/**
 * 个人空间的 AI 起稿：一句话介绍、身份、我在意的、服务……由 AI 根据这个人的资料先写出来，
 * 本人之后在网站上逐块改、确认，再发布。
 *
 * 两个入口共用这里：本人在风格工作室点「形成画像」（等它写完），和空间第一次被打开时在后台补上（不等）。
 * - 同一个人同时只写一份：重复触发等同一个结果，不多调模型
 * - 后台补写全站最多同时 2 份；失败了 10 分钟内不再试（免得每打开一次就撞一次模型）
 * - 资料太少的人不自动起稿：没什么可依据的时候，AI 写出来的只会是编的——默认版本就只用他自己写的话
 * - 线上默认不自动起稿（每次都要调模型）；空间数据进了 Supabase（supabase-space.sql）之后，设 SPACE_AUTO_DRAFT=1 打开。
 *   本地默认开，设 0 关掉
 */

/** unsaved：写好了但没存进去（本人在工作室里照样能看到这一份，另外告诉他没存上） */
type Generated = (PortraitResult & { unsaved?: true }) | { error: string };

const inflight = new Map<string, Promise<Generated>>();
const failedAt = new Map<string, number>();
const RETRY_AFTER = 10 * 60 * 1000;
const MAX_BACKGROUND = 2;
let background = 0;

/** 写一份画像和起稿并存下。重复调用等同一个结果 */
export function draftNow(node: NodeCard & { id: string }): Promise<Generated> {
  const id = node.id.toLowerCase();
  let job = inflight.get(id);
  if (!job) {
    job = (async (): Promise<Generated> => {
      const result = await generatePortrait(node);
      if ('error' in result) {
        failedAt.set(id, Date.now());
        return result;
      }
      failedAt.delete(id);
      if (!(await writeSpace(id, { result }))) return { ...result, unsaved: true as const };
      return result;
    })().finally(() => inflight.delete(id));
    inflight.set(id, job);
  }
  return job;
}

function autoEnabled(): boolean {
  const flag = process.env.SPACE_AUTO_DRAFT;
  if (flag === '0') return false;
  if (flag === '1') return true;
  return process.env.NODE_ENV !== 'production';
}

/**
 * 空间被打开时调（放在 after() 里，不挡页面）：还没有起稿、资料够、没在写、最近没失败过，就在后台写一份。
 * 写好之后，下一次打开就能看到 AI 起稿。
 */
export async function draftInBackground(node: NodeCard): Promise<void> {
  if (!node.id || !autoEnabled()) return;
  const id = node.id.toLowerCase();
  if (inflight.has(id) || background >= MAX_BACKGROUND) return;
  const last = failedAt.get(id);
  if (last && Date.now() - last < RETRY_AFTER) return;
  if (!richness(node).enough) return;
  try {
    if ((await readSpace(id)).result) return;
  } catch {
    return;
  }
  background++;
  try {
    const r = await draftNow({ ...node, id });
    if ('error' in r) console.error('[space] auto draft failed', id, r.error);
    else if (r.unsaved) console.error('[space] auto draft not saved', id);
  } finally {
    background--;
  }
}
