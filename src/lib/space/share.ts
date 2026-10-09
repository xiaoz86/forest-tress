import 'server-only';
import { createHash } from 'node:crypto';
import type { Metadata } from 'next';
import { getSiteOrigin } from '@/lib/notify';
import type { NodeCard } from '@/lib/supabase';
import { fetchMember, previewAccess } from './access';
import { list } from './db';
import { formatEventTime, formatFee, MODE_LABEL } from './eventTime';
import { coverUrlOf, isEventPublic, isStarted } from './events';
import { richness } from './portrait';
import { resolveThemeId, type RecommendInput } from './recommend';
import { effectiveDraft } from './edits';
import { getSettings, spaceMode } from './settings';
import { isMemberId, readSpace, type SpaceRecord } from './store';
import { coverLine } from './story';
import { getTheme, type SpaceTheme } from './themes';
import { tunedTheme } from './tune';
import type { SpaceSettings } from './types';

/**
 * 分享出去的一切：短链、名片二维码、分享预览（标题、摘要、封面图）。
 *
 * 分享预览只用**首屏就公开显示**的信息：名字、城市、一句话、正在做的第一句。
 * 联系方式、种子这些有可见性设置的东西，一律不进标题、摘要和分享图。
 */

export type SpaceUrls = {
  /** 访客打开的地址：有短链用短链 */
  pageUrl: string;
  shortUrl: string | null;
  /**
   * 名片二维码里的地址：/c/<成员 id>/<名片口令>，带口令，只给本人看。
   * 故意和短链无关——改了短链，已经印出去的名片照样能扫（card-scan 会跳到现在的地址）。
   */
  cardScanUrl: string;
  /** 分享图（1200×630）的地址，带版本号：内容一变地址就变，缓存不会把旧图留下 */
  ogImageUrl: string;
};

/**
 * 分享图的版本号：设置（含发布状态、短链）、画像、风格、首屏公开信息，任何一样变了都换一个。
 * 地址换了，浏览器和中间层缓存里的旧图就不会再被用到；取消发布也会让 updatedAt 变，旧地址对访客是 404。
 */
export function ogVersion(settings: SpaceSettings, rec?: SpaceRecord | null, node?: NodeCard | null): string {
  const parts = [
    settings.updatedAt,
    rec?.result?.generatedAt ?? '',
    rec?.style?.savedAt ?? '',
    rec?.style?.chosen ?? '',
    rec?.tune?.updatedAt ?? '',
  ];
  if (node && rec) {
    const f = shareFacts(node, rec);
    parts.push(f.name, f.city, f.tagline, f.now, f.roles.join(','), f.avatarUrl ?? '', themeOf(node, rec).id);
  }
  return createHash('sha256').update(parts.join('\u0000')).digest('base64url').slice(0, 10);
}

/**
 * rec、node 给了，分享图的版本号就把画像、风格、头像这些也算进去（buildSpaceMetadata、share-meta 用这种）；
 * 没给时只按设置算（只有设置接口这么调，管理页的分享预览用的是 share-meta 给的地址）。
 */
export function spaceUrls(memberId: string, settings: SpaceSettings, rec?: SpaceRecord | null, node?: NodeCard | null): SpaceUrls {
  const origin = getSiteOrigin();
  const id = encodeURIComponent(memberId);
  const k = encodeURIComponent(settings.cardToken);
  const shortUrl = settings.slug ? `${origin}/@${settings.slug}` : null;
  return {
    pageUrl: shortUrl ?? `${origin}/space/${id}`,
    shortUrl,
    cardScanUrl: `${origin}/c/${id}/${k}`,
    ogImageUrl: `${origin}/api/space/og?id=${id}&v=${ogVersion(settings, rec, node)}`,
  };
}

/** 去掉协议，给人看的短地址：nearby-forest.club/@xiaoz */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

/** 按码点截断（成员常用 emoji，不能切在代理对中间） */
export function clip(s: string, max: number): string {
  const cps = [...s.trim()];
  return cps.length <= max ? cps.join('') : cps.slice(0, max - 1).join('') + '…';
}

/**
 * 这个人网站当前用的主题——和 /space/[id] 页面同一套判断（选定的 > 推荐的第一套 > 默认），
 * 再叠上本人拨过的旋钮。名片图、分享图的颜色和字体都跟着它走。
 */
export function themeOf(node: NodeCard, rec: SpaceRecord): SpaceTheme {
  const sparse = !richness(node).enough;
  const input: RecommendInput | null = rec.result
    ? {
        mode: rec.style?.mode ?? (sparse ? 'fallback' : 'portrait'),
        portrait: rec.result.portrait,
        test: rec.style?.test ?? {},
        picks: rec.style?.picks ?? [],
        feel: rec.tune?.feel,
      }
    : rec.style
      ? { mode: 'fallback', portrait: null, test: rec.style.test, picks: rec.style.picks, feel: rec.tune?.feel }
      : null;
  return tunedTheme(getTheme(resolveThemeId(rec.style?.chosen, input)) ?? getTheme('forest')!, rec.tune);
}

export type ShareFacts = {
  name: string;
  city: string;
  /** 一句话（AI 起稿，本人发布即确认）；没有时用关键词 */
  tagline: string;
  roles: string[];
  /** 正在做的第一句 */
  now: string;
  avatarUrl: string | null;
};

/**
 * 首屏上公开显示的那几样，和 SpaceSite 的取法一致：本人改过、隐藏过的以本人为准（不能把他删掉的 AI 原句印上分享卡）。
 */
export function shareFacts(node: NodeCard, rec: SpaceRecord): ShareFacts {
  const draft = rec.result?.draft ?? null;
  const eff = effectiveDraft(draft, rec.edits);
  const tagline = eff.tagline.trim();
  const kw = draft?.keywords?.length ? draft.keywords : (node.keywords ?? []);
  const roles = eff.roles.map(r => r.trim()).filter(Boolean);
  const doing = node.doing?.trim() || '';
  return {
    name: (node.name || '').trim() || '一位森林成员',
    city: (node.city || '').trim(),
    tagline: tagline || (kw.length ? kw.slice(0, 4).join(' · ') : ''),
    roles,
    now: doing ? coverLine(doing, roles).now : '',
    avatarUrl: node.avatar_url?.trim() || null,
  };
}

/** 分享摘要：一句话 > 正在做的第一句；都没有时用城市 */
export function shareDescription(f: ShareFacts): string {
  const base = f.tagline || f.now;
  const withCity = base && f.city ? `${base}（${f.city}）` : base || (f.city ? `在${f.city}` : '');
  return clip(withCity || `${f.name}在附近森林的个人空间`, 60);
}

const QUIET: Metadata = { title: '附近森林', robots: { index: false, follow: false } };

/**
 * 单独分享出去的那一场活动（链接里的 ?e=前 8 位）。只认对所有人公开、正在报名的：
 * 「一起做点什么」设成只给成员看的，或者活动还是草稿、已取消、已结束，预览卡片里就不透出它。
 */
async function sharedEvent(memberId: string, settings: SpaceSettings, short: string | null | undefined) {
  if (!short || !/^[0-9a-f]{8}$/i.test(short) || settings.visibility.offer !== 'public') return null;
  try {
    const key = short.toLowerCase();
    const hits = await list('events', e => e.memberId === memberId && e.id.startsWith(key));
    // 已经开始的不算：卡片上写着「在附近森林报名」，点进去却报不了名
    return hits.find(e => isEventPublic(e) && !isStarted(e)) ?? null;
  } catch {
    return null;
  }
}

export async function buildSpaceMetadata(memberId: string, opts: { event?: string | null } = {}): Promise<Metadata> {
  const id = (memberId || '').trim().toLowerCase();
  if (!isMemberId(id)) return QUIET;
  let node: NodeCard | null;
  try {
    node = await fetchMember(id);
  } catch {
    return QUIET;
  }
  if (!node) return QUIET;
  const settings = await getSettings(id);
  const mode = spaceMode(settings, node);
  if (mode !== 'full') {
    // 没发布：访客那边整页 404，标题里也不能透出这个人在做个人空间；本人和管理员预览时给个认得出的标题
    const host = await previewAccess(id);
    if (!host) return QUIET;
    return { title: `${(node.name || '').trim() || '个人空间'} · 预览`, robots: { index: false, follow: false } };
  }
  let rec: SpaceRecord = {};
  try {
    rec = await readSpace(id);
  } catch {
    // 本地画像读坏了：标题摘要退回只用注册资料
  }
  const facts = shareFacts(node, rec);
  const urls = spaceUrls(id, settings, rec, node);

  // 分享的是其中一场活动：标题、摘要、预览图都换成这一场（发到微信、信息、Telegram 里看到的就是它）
  const ev = await sharedEvent(id, settings, opts.event);
  if (ev) {
    const short = ev.id.slice(0, 8);
    const evTitle = `${ev.title} · ${facts.name} 发起`;
    const place = ev.place ? `${MODE_LABEL[ev.mode]} · ${ev.place}` : MODE_LABEL[ev.mode];
    const evDesc = `${formatEventTime(ev.startsAt, ev.endsAt)}（北京时间）· ${place} · ${formatFee(ev.feeCents)}。在附近森林报名。`;
    const evUrl = `${urls.pageUrl}?e=${short}`;
    const cover = coverUrlOf(ev);
    const image = cover
      ? { url: `${getSiteOrigin()}${cover}`, alt: ev.title }
      : { url: urls.ogImageUrl, width: 1200, height: 630, alt: evTitle };
    return {
      title: evTitle,
      description: evDesc,
      alternates: { canonical: urls.pageUrl },
      openGraph: {
        type: 'website', url: evUrl, title: evTitle, description: evDesc,
        siteName: '附近森林', locale: 'zh_CN', images: [image],
      },
      twitter: { card: 'summary_large_image', title: evTitle, description: evDesc, images: [image.url] },
    };
  }

  const title = `${facts.name} · 附近森林`;
  const description = shareDescription(facts);
  return {
    title,
    description,
    alternates: { canonical: urls.pageUrl },
    openGraph: {
      type: 'website',
      url: urls.pageUrl,
      title,
      description,
      siteName: '附近森林',
      locale: 'zh_CN',
      images: [{ url: urls.ogImageUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [urls.ogImageUrl],
    },
  };
}
