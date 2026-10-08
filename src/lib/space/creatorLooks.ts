import 'server-only';
import type { NodeCard } from '@/lib/supabase';
import { list } from './db';
import { defaultSettings, spaceMode } from './settings';
import { themeOf } from './share';
import { readSpaces, type SpaceRecord } from './store';
import { getTheme, type ThemeTokens } from './themes';
import type { SpaceSettings } from './types';

/**
 * 创造者平台的卡片：每个人的卡长成他自己空间的样子。
 *
 * - 颜色、字体、照片处理、照片边缘：来自他网站现在用的主题（选定的 > 推荐的），叠上他拨过的旋钮——
 *   和访客点进去看到的空间是同一套
 * - 照片的裁切：他在空间里点过的焦点
 * - 点哪去：发布了（本人确认过）的，去他的个人空间（有短链用短链）；还没发布的，AI 默认版本只有本人和管理员能看，
 *   访客点进去是平台资料页（见 settings.ts spaceMode）
 *
 * 任何一步读不到（比如线上还没有空间存储）都不要紧：退回默认主题、去资料页，列表页绝不能因此打不开。
 */

export type CreatorLook = {
  themeId: string;
  tokens: ThemeTokens;
  focus: { x: number; y: number } | null;
  /** 他的个人空间地址；还没发布时为 null（卡片去资料页） */
  spaceHref: string | null;
};

/**
 * nodes 要传完整的资料（没按可见性裁过的）：推荐哪套主题要看资料写了多少，
 * 用裁过的会让访客看到的卡片和他点进去的空间不是同一套。
 */
export async function creatorLooks(nodes: NodeCard[]): Promise<Map<string, CreatorLook>> {
  const out = new Map<string, CreatorLook>();
  let rows = new Map<string, SpaceSettings>();
  try {
    rows = new Map((await list('settings')).map(r => [r.id, r]));
  } catch (err) {
    console.error('[space] creator looks: settings unavailable', err);
  }
  let records = new Map<string, SpaceRecord>();
  try {
    records = await readSpaces(nodes.map(n => n.id || '').filter(Boolean));
  } catch (err) {
    console.error('[space] creator looks: records unavailable', err);
  }
  nodes.forEach(node => {
    if (!node.id) return;
    // 读不到这个人的空间记录：用默认主题
    const rec: SpaceRecord = records.get(node.id.toLowerCase()) ?? {};
    // 没存过设置的人按默认：没发布
    const settings = rows.get(node.id) ?? defaultSettings(node.id);
    const mode = spaceMode(settings, node);
    const spaceHref = mode === 'none' ? null : settings.slug ? `/@${settings.slug}` : `/space/${node.id}`;
    // 卡片和点进去的那一页同一套主题；还没发布、去资料页的用森林的默认配色（AI 推荐的主题本人还没认）
    const theme = spaceHref ? themeOf(node, rec) : getTheme('forest')!;
    out.set(node.id, {
      themeId: theme.id,
      tokens: theme.tokens,
      focus: rec.edits?.cover ?? null,
      spaceHref,
    });
  });
  return out;
}
