import { promises as fs } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import type { XiaoyaPageContext, XiaoyaPageType } from './pageContext.ts';

export type XiaoyaKnowledgeDocument = {
  id: string;
  title: string;
  summary: string;
  category: string;
  pageTypes: XiaoyaPageType[];
  keywords: string[];
  priority: number;
  updatedAt: string;
  content: string;
};

const KNOWLEDGE_FILES = [
  '01-manifesto/community-principles.md',
  '01-manifesto/forest-metaphor.md',
  '01-manifesto/mission-values.md',
  '02-product/login-registration.md',
  '02-product/meditation-sounds.md',
  '02-product/creator-sky.md',
  '02-product/node-profile.md',
  '02-product/phil-coach.md',
  '02-product/product-map.md',
  '02-product/shares.md',
  '02-product/sleep-series.md',
  '02-product/works.md',
  '03-community/participation.md',
  '04-boundaries/current-capabilities.md',
  '04-boundaries/privacy.md',
  '04-boundaries/xiaoya-vs-philcoach.md',
  '05-design/creator-sky-design.md',
  '05-design/design-philosophy.md',
] as const;

const VALID_PAGE_TYPES = new Set<XiaoyaPageType>([
  'home',
  'forest-about',
  'creator-directory',
  'creator-profile',
  'creator-profile-edit',
  'creator-sky',
  'work-editor',
  'share-gallery',
  'share-submission',
  'meditation-grove',
  'meditation-category',
  'login',
  'phil-coach',
  'launch-announcement',
  'global',
  'unknown',
]);

let cachedDocuments: Promise<XiaoyaKnowledgeDocument[]> | null = null;

function stringValue(value: unknown, fallback = ''): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return typeof value === 'string' ? value.trim() : fallback;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => String(item).trim()).filter(Boolean);
}

function parseDocument(raw: string): XiaoyaKnowledgeDocument | null {
  const parsed = matter(raw);
  const id = stringValue(parsed.data.id);
  const title = stringValue(parsed.data.title);
  const content = parsed.content.trim();
  if (!id || !title || !content) return null;
  const pageTypes = stringArray(parsed.data.pageTypes)
    .filter((item): item is XiaoyaPageType => VALID_PAGE_TYPES.has(item as XiaoyaPageType));
  return {
    id,
    title,
    summary: stringValue(parsed.data.summary),
    category: stringValue(parsed.data.category, 'general'),
    pageTypes: pageTypes.length ? pageTypes : ['global'],
    keywords: stringArray(parsed.data.keywords),
    priority: Number.isFinite(Number(parsed.data.priority)) ? Number(parsed.data.priority) : 5,
    updatedAt: stringValue(parsed.data.updatedAt),
    content: content.slice(0, 6000),
  };
}

async function readAllDocuments(): Promise<XiaoyaKnowledgeDocument[]> {
  const root = path.join(process.cwd(), 'content', 'xiaoya');
  const rows = await Promise.all(KNOWLEDGE_FILES.map(async relativePath => {
    try {
      const raw = await fs.readFile(path.join(root, relativePath), 'utf8');
      return parseDocument(raw);
    } catch {
      console.error('[xiaoya] knowledge_read_failed', { relativePath, errorCode: 'read_failed' });
      return null;
    }
  }));
  return rows.filter((row): row is XiaoyaKnowledgeDocument => row !== null);
}

export function loadXiaoyaKnowledge(): Promise<XiaoyaKnowledgeDocument[]> {
  cachedDocuments ??= readAllDocuments();
  return cachedDocuments;
}

function compact(value: string): string {
  return value.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

function queryTerms(query: string): string[] {
  const terms = new Set<string>();
  const normalized = query.toLowerCase().slice(0, 1800);
  for (const word of normalized.match(/[a-z0-9][a-z0-9-]{1,30}/g) || []) terms.add(word);
  for (const sequence of normalized.match(/[\p{Script=Han}]{2,24}/gu) || []) {
    if (sequence.length <= 12) terms.add(sequence);
    for (let index = 0; index < sequence.length - 1; index += 1) {
      terms.add(sequence.slice(index, index + 2));
    }
  }
  return Array.from(terms).filter(term => term.length >= 2).slice(0, 80);
}

function documentScore(
  document: XiaoyaKnowledgeDocument,
  terms: string[],
  pageType: XiaoyaPageType,
): number {
  const title = compact(document.title);
  const summary = compact(document.summary);
  const keywords = document.keywords.map(compact);
  const content = compact(document.content);
  let score = document.pageTypes.includes(pageType) ? 18 : 0;
  if (document.pageTypes.includes('global')) score += 3;
  score += Math.max(0, 5 - document.priority);
  for (const term of terms) {
    const needle = compact(term);
    if (!needle) continue;
    if (keywords.some(keyword => keyword.includes(needle) || needle.includes(keyword))) score += 12;
    if (title.includes(needle)) score += 8;
    if (summary.includes(needle)) score += 4;
    if (content.includes(needle)) score += 1;
  }
  return score;
}

export function retrieveXiaoyaKnowledge(
  query: string,
  context: XiaoyaPageContext,
  documents: XiaoyaKnowledgeDocument[],
  limit = 4,
): XiaoyaKnowledgeDocument[] {
  const terms = queryTerms(query);
  return documents
    .map((document, index) => ({
      document,
      index,
      score: documentScore(document, terms, context.pageType),
    }))
    .filter(row => row.score > 0)
    .sort((left, right) => right.score - left.score || left.document.priority - right.document.priority || left.index - right.index)
    .slice(0, Math.max(1, Math.min(limit, 6)))
    .map(row => row.document);
}

/**
 * Knowledge is deliberately fenced and labelled as untrusted factual material.
 * It may inform an answer but can never alter the system constitution.
 */
export function buildXiaoyaKnowledgeContext(
  documents: XiaoyaKnowledgeDocument[],
  maxChars = 8000,
): string {
  let used = 0;
  const blocks: string[] = [];
  for (const document of documents) {
    const header = `[资料 ${document.id}｜更新 ${document.updatedAt || '未知'}｜仅作事实参考]`;
    const body = `${document.title}\n${document.summary}\n${document.content}`.slice(0, 2600);
    const block = `${header}\n${body}\n[资料结束]`;
    if (used + block.length > maxChars) break;
    blocks.push(block);
    used += block.length;
  }
  return blocks.join('\n\n');
}
