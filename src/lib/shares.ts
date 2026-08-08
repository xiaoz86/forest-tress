import { createClient } from '@supabase/supabase-js';
import { tr } from '@/lib/contentTranslate';
import type { Locale } from '@/lib/locale';

export type ShareMediaKind = 'video' | 'image' | 'poster';
export type ShareStatus = 'pending' | 'published' | 'rejected';

export type ShareEntry = {
  id: string;
  title: string;
  kicker: string;
  author: string;
  authorLabel: string;
  badgeLabel?: string;
  question: string;
  summary: string;
  note: string;
  tags: string[];
  mediaKind: ShareMediaKind;
  mediaUrl?: string;
  posterUrl?: string;
  href?: string;
  featured?: boolean;
  status?: ShareStatus;
  ownerId?: string;
  submittedAt?: string;
};

export type ShareContent = {
  eyebrow: string;
  title: string;
  intro: string;
  moreLabel: string;
  noteEyebrow: string;
  noteTitle: string;
  noteParagraphs: string[];
  footer: string;
  shares: ShareEntry[];
};

export const SHARE_CONTENT_ID = 'forest-shares';

export const DEFAULT_SHARE_CONTENT: ShareContent = {
  eyebrow: '林间分享',
  title: '积极希望，\n从一次围坐开始',
  intro:
    '那天，四位创始人聊了一个问题：最近还有什么，让你愿意再往前一点？没有急着给答案，只是把各自正在发生的东西，慢慢说出来。',
  moreLabel: '更多超级个体的分享',
  noteEyebrow: '手记',
  noteTitle: '那个问题被放在中间',
  noteParagraphs: [
    '“最近，有没有什么让你觉得还有一点希望？”',
    '有人说起一个正在变化的选择，有人说起身体里慢慢松开的紧张，也有人只是安静听着。',
    '回应没有急着变成建议。它只是把对方身上已经亮起来的地方，轻轻还给他。',
  ],
  footer: '片段还在整理。先把那天留下的气息，放在这里。',
  shares: [
    {
      id: 'founder-hope',
      title: '积极希望',
      kicker: '四位创始人团队的首次分享',
      author: '四位创始人团队',
      authorLabel: '首次分享',
      badgeLabel: '四位创始人团队 · 首次分享',
      question: '最近，还有什么让你愿意再往前一点？',
      summary:
        '四个人围坐下来，从一个很小的问题开始。有人说，有人听，有人把刚刚亮起来的地方轻轻还给对方。',
      note: '被听见的不是概念，而是一个人正在发生的东西。',
      tags: ['希望', '聆听', '回应'],
      mediaKind: 'video',
      featured: true,
      status: 'published',
    },
  ],
};

const MEDIA_KINDS: ShareMediaKind[] = ['video', 'image', 'poster'];
const STATUSES: ShareStatus[] = ['pending', 'published', 'rejected'];

function cleanText(value: unknown, fallback: string, max: number): string {
  if (typeof value !== 'string') return fallback;
  const text = value.trim();
  return (text || fallback).slice(0, max);
}

function cleanId(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const id = value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return id || fallback;
}

function cleanUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const url = value.trim();
  return /^https?:\/\//i.test(url) ? url.slice(0, 900) : undefined;
}

function cleanTags(value: unknown, fallback: string[]): string[] {
  const raw = Array.isArray(value) ? value : fallback;
  const tags: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const tag = item.trim().slice(0, 12);
    if (tag && !tags.includes(tag)) tags.push(tag);
    if (tags.length >= 8) break;
  }
  return tags.length ? tags : fallback;
}

function cleanParagraphs(value: unknown, fallback: string[]): string[] {
  const raw = Array.isArray(value) ? value : fallback;
  const paragraphs = raw
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim().slice(0, 220))
    .filter(Boolean)
    .slice(0, 6);
  return paragraphs.length ? paragraphs : fallback;
}

export function normalizeShareContent(input: unknown): ShareContent {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const fallback = DEFAULT_SHARE_CONTENT;
  const sharesRaw = Array.isArray(raw.shares) ? raw.shares : fallback.shares;
  const shares: ShareEntry[] = [];

  for (const item of sharesRaw) {
    const r = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const fallbackShare = fallback.shares[shares.length] || fallback.shares[0];
    const id = cleanId(r.id, `share-${shares.length + 1}`);
    if (shares.some(share => share.id === id)) continue;
    const mediaKind = typeof r.mediaKind === 'string' && MEDIA_KINDS.includes(r.mediaKind as ShareMediaKind)
      ? (r.mediaKind as ShareMediaKind)
      : fallbackShare.mediaKind;
    const status = typeof r.status === 'string' && STATUSES.includes(r.status as ShareStatus)
      ? (r.status as ShareStatus)
      : fallbackShare.status || 'published';
    const ownerId = typeof r.ownerId === 'string' ? r.ownerId.trim().slice(0, 80) : undefined;
    const submittedAt = typeof r.submittedAt === 'string' ? r.submittedAt.trim().slice(0, 48) : undefined;
    const author = cleanText(r.author, fallbackShare.author, 48);
    const authorLabel = cleanText(r.authorLabel, fallbackShare.authorLabel, 32);
    const badgeLabel = cleanText(r.badgeLabel, `${author} · ${authorLabel}`, 64);
    shares.push({
      id,
      title: cleanText(r.title, fallbackShare.title, 64),
      kicker: cleanText(r.kicker, fallbackShare.kicker, 48),
      author,
      authorLabel,
      badgeLabel,
      question: cleanText(r.question, fallbackShare.question, 120),
      summary: cleanText(r.summary, fallbackShare.summary, 260),
      note: cleanText(r.note, fallbackShare.note, 220),
      tags: cleanTags(r.tags, fallbackShare.tags),
      mediaKind,
      ...(cleanUrl(r.mediaUrl) ? { mediaUrl: cleanUrl(r.mediaUrl) } : {}),
      ...(cleanUrl(r.posterUrl) ? { posterUrl: cleanUrl(r.posterUrl) } : {}),
      ...(cleanUrl(r.href) ? { href: cleanUrl(r.href) } : {}),
      featured: typeof r.featured === 'boolean' ? r.featured : !!fallbackShare.featured,
      status,
      ...(ownerId ? { ownerId } : {}),
      ...(submittedAt ? { submittedAt } : {}),
    });
    if (shares.length >= 36) break;
  }

  if (shares.length === 0) shares.push(...fallback.shares);
  if (!shares.some(share => share.featured)) shares[0] = { ...shares[0], featured: true };

  return {
    eyebrow: cleanText(raw.eyebrow, fallback.eyebrow, 24),
    title: cleanText(raw.title, fallback.title, 56),
    intro: cleanText(raw.intro, fallback.intro, 320),
    moreLabel: cleanText(raw.moreLabel, fallback.moreLabel, 16),
    noteEyebrow: cleanText(raw.noteEyebrow, fallback.noteEyebrow, 24),
    noteTitle: cleanText(raw.noteTitle, fallback.noteTitle, 56),
    noteParagraphs: cleanParagraphs(raw.noteParagraphs, fallback.noteParagraphs),
    footer: cleanText(raw.footer, fallback.footer, 180),
    shares,
  };
}

export function getFeaturedShare(content: ShareContent): ShareEntry {
  const published = getPublishedShares(content);
  return published.find(share => share.featured) || published[0] || content.shares[0];
}

export function getPublishedShares(content: ShareContent): ShareEntry[] {
  return content.shares.filter(share => (share.status || 'published') === 'published');
}

export function getPendingShares(content: ShareContent): ShareEntry[] {
  return content.shares.filter(share => share.status === 'pending');
}

/**
 * 卡片下面那行小字，形如「联合创始人团队 · 首次分享」。
 *
 * 三个字段都是主理人在后台填的，所以逐段过 tr() 查对照表，
 * 而不是把拼好的整句拿去查——拼句在表里根本不存在，查了必然回落成中文。
 * 中间那个「·」两边都通用，不用翻。
 */
export function getShareBadgeLabel(share: ShareEntry, locale: Locale = 'zh'): string {
  if (share.badgeLabel) return tr(share.badgeLabel, locale);
  return `${tr(share.author, locale)} · ${tr(share.authorLabel, locale)}`;
}

export async function fetchShareContent(): Promise<ShareContent> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return DEFAULT_SHARE_CONTENT;

  const sb = createClient(supabaseUrl, serviceKey);
  const { data, error } = await sb
    .from('share_content')
    .select('payload')
    .eq('id', SHARE_CONTENT_ID)
    .maybeSingle();
  if (error || !data?.payload) return DEFAULT_SHARE_CONTENT;
  return normalizeShareContent(data.payload);
}
