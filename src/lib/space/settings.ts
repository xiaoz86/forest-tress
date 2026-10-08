import 'server-only';
import { randomBytes } from 'node:crypto';
import type { NodeCard } from '@/lib/supabase';
import { get, list, now, transact } from './db';
import { hashOf } from './guard';
import { DEFAULT_VISIBILITY, slugProblem, type SpaceSettings, type VisibilityKey, AUDIENCES } from './types';

/**
 * 一个人的空间设置。还没存过的，按默认值给（不落盘）。
 *
 * 默认的名片口令由服务端密钥对成员 id 算出来，每次都一样——
 * 否则第一次保存设置之前，每打开一次名片图口令都不同，那时存下、印出去的名片永远拿不到「扫过名片」的身份。
 * 「换一个名片口令」时才随机生成。
 */
export function defaultSettings(id: string): SpaceSettings {
  return {
    id,
    published: false,
    publishedAt: null,
    slug: null,
    previousSlugs: [],
    visibility: { ...DEFAULT_VISIBILITY },
    cardToken: hashOf(`card:${id}`),
    greetingsOpen: true,
    bookingsOpen: true,
    payQr: null,
    blocked: [],
    updatedAt: now(),
  };
}

/** 存下来的设置行补上默认值（旧数据可能缺字段） */
export function withDefaults(id: string, cur: SpaceSettings | null | undefined): SpaceSettings {
  if (!cur) return defaultSettings(id);
  return {
    ...defaultSettings(id), ...cur,
    previousSlugs: cur.previousSlugs ?? [],
    visibility: { ...DEFAULT_VISIBILITY, ...cur.visibility },
  };
}

export async function getSettings(id: string): Promise<SpaceSettings> {
  return withDefaults(id, await get('settings', id));
}

/**
 * 访客能不能打开一个人的个人空间：
 * - full：本人发布了（发布 = 本人确认了 AI 起稿的那一版）
 * - none：还没发布——AI 起好的默认版本只有本人和管理员能看（创造者平台的卡片点进去是资料页）；
 *   或者这个人已经离开了森林
 * 发布是本人明确的决定：发布了的空间不因森林里的状态变化而消失（离开森林的除外）。
 */
export type SpaceMode = 'full' | 'none';
export function spaceMode(settings: SpaceSettings, node: Pick<NodeCard, 'status'>): SpaceMode {
  if (!settings.published) return 'none';
  return node.status === 'archived' ? 'none' : 'full';
}

export type SettingsPatch = Partial<Pick<SpaceSettings,
  'published' | 'slug' | 'visibility' | 'greetingsOpen' | 'bookingsOpen'>> & {
  /** 换一个名片口令：之前发出去的名片二维码就不再算「扫过名片」 */
  rotateCardToken?: boolean;
  /** 屏蔽 / 解除屏蔽：在同一个临界区里基于最新的名单改，并发时不会丢 */
  blockAdd?: string[];
  blockRemove?: string[];
};

const VALID_AUDIENCE = new Set(AUDIENCES.map(a => a.value));
const MAX_BLOCKED = 500;
const MAX_PREVIOUS_SLUGS = 5;

/**
 * 改设置。短链唯一性在同一个临界区里检查（也不能占用别人以前用过的短链），两个人同时抢一个短链只会成功一个。
 * 返回 { error } 时什么都没改。
 */
export async function saveSettings(id: string, patch: SettingsPatch): Promise<SpaceSettings | { error: string }> {
  return transact('settings', rows => {
    const i = rows.findIndex(r => r.id === id);
    const cur = withDefaults(id, i >= 0 ? rows[i] : null);
    const next: SpaceSettings = { ...cur, updatedAt: now() };

    if (patch.slug !== undefined) {
      const slug = patch.slug === null ? null : String(patch.slug).trim().toLowerCase();
      if (slug) {
        const problem = slugProblem(slug);
        if (problem) return { error: problem };
        const taken = rows.some(r => r.id !== id && (r.slug === slug || (r.previousSlugs ?? []).includes(slug)));
        if (taken) return { error: '这个短链已经有人用了' };
      }
      if ((slug || null) !== cur.slug) {
        // 旧短链留给自己：已经发出去的链接、印出去的名片继续能打开（跳到新地址）
        const prev = [...(cur.previousSlugs ?? []).filter(s => s !== slug)];
        if (cur.slug) prev.unshift(cur.slug);
        next.previousSlugs = prev.slice(0, MAX_PREVIOUS_SLUGS);
      }
      next.slug = slug || null;
    }
    if (patch.visibility) {
      const v = { ...cur.visibility };
      for (const [k, a] of Object.entries(patch.visibility)) {
        if (k in DEFAULT_VISIBILITY && VALID_AUDIENCE.has(a)) v[k as VisibilityKey] = a;
      }
      next.visibility = v;
    }
    if (typeof patch.published === 'boolean') {
      next.published = patch.published;
      if (patch.published && !cur.published) next.publishedAt = now();
    }
    if (typeof patch.greetingsOpen === 'boolean') next.greetingsOpen = patch.greetingsOpen;
    if (typeof patch.bookingsOpen === 'boolean') next.bookingsOpen = patch.bookingsOpen;
    if (patch.blockAdd?.length || patch.blockRemove?.length) {
      const set = new Set(cur.blocked);
      for (const k of patch.blockRemove ?? []) set.delete(k);
      for (const k of patch.blockAdd ?? []) set.add(k);
      if (set.size > MAX_BLOCKED) return { error: '屏蔽名单已经满了（500 条），先解除一些旧的再屏蔽' };
      next.blocked = [...set];
    }
    if (patch.rotateCardToken) next.cardToken = randomBytes(12).toString('base64url');

    if (i >= 0) rows[i] = next;
    else rows.push(next);
    return next;
  });
}

/**
 * 换收款码：在临界区里读旧值、写新值，返回被换下来的文件名（调用方负责删掉那个文件）。
 * next 为 null 表示删掉收款码。
 */
export async function swapPayQr(id: string, nextFile: string | null): Promise<{ prev: string | null }> {
  return transact('settings', rows => {
    const i = rows.findIndex(r => r.id === id);
    const cur = withDefaults(id, i >= 0 ? rows[i] : null);
    const prev = cur.payQr;
    const next = { ...cur, payQr: nextFile, updatedAt: now() };
    if (i >= 0) rows[i] = next;
    else rows.push(next);
    return { prev };
  });
}

export async function findBySlug(slug: string): Promise<SpaceSettings | null> {
  const s = slug.trim().toLowerCase();
  if (!s) return null;
  const row = (await list('settings', r => r.slug === s))[0];
  return row ? withDefaults(row.id, row) : null;
}

/**
 * 按短链找人，也认以前用过的短链。current=false 时调用方应该跳到现在的地址。
 */
export async function findBySlugOrPrevious(slug: string): Promise<{ settings: SpaceSettings; current: boolean } | null> {
  const s = slug.trim().toLowerCase();
  if (!s) return null;
  const rows = await list('settings', r => r.slug === s || (r.previousSlugs ?? []).includes(s));
  const hit = rows.find(r => r.slug === s) ?? rows[0];
  if (!hit) return null;
  return { settings: withDefaults(hit.id, hit), current: hit.slug === s };
}
