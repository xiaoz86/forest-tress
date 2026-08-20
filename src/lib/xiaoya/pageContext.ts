export type XiaoyaPageType =
  | 'home'
  | 'forest-about'
  | 'creator-directory'
  | 'creator-profile'
  | 'creator-profile-edit'
  | 'work-editor'
  | 'share-gallery'
  | 'share-submission'
  | 'meditation-grove'
  | 'meditation-category'
  | 'login'
  | 'phil-coach'
  | 'launch-announcement'
  | 'global'
  | 'unknown';

export type XiaoyaPageContext = {
  pathname: string;
  pageType: XiaoyaPageType;
  locale: 'zh-CN' | 'en';
  category?: string;
};

const SAFE_PATH_RE = /^\/[a-zA-Z0-9/_-]*$/;
const CREATOR_PATH_RE = /^\/creators\/[0-9a-f-]{8,64}$/i;

function normalizePathname(value: unknown): string {
  if (typeof value !== 'string') return '/';
  const withoutQuery = value.split(/[?#]/, 1)[0].trim();
  if (!withoutQuery.startsWith('/') || withoutQuery.startsWith('//')) return '/';
  if (withoutQuery.includes('\\') || !SAFE_PATH_RE.test(withoutQuery)) return '/';
  const normalized = withoutQuery.replace(/\/{2,}/g, '/').replace(/\/$/, '');
  return normalized || '/';
}

function safeCategory(searchParams?: URLSearchParams | string | null): string {
  try {
    const params = searchParams instanceof URLSearchParams
      ? searchParams
      : new URLSearchParams(typeof searchParams === 'string' ? searchParams : '');
    const category = params.get('category')?.trim() || '';
    return /^[a-z0-9_-]{1,40}$/i.test(category) ? category : '';
  } catch {
    return '';
  }
}

function pageTypeForPath(pathname: string, category: string): XiaoyaPageType {
  if (pathname === '/') return 'home';
  if (pathname === '/about') return 'forest-about';
  if (pathname === '/creators') return 'creator-directory';
  if (CREATOR_PATH_RE.test(pathname)) return 'creator-profile';
  if (pathname === '/login') return 'login';
  if (pathname === '/phil-coach') return 'phil-coach';
  if (pathname === '/meditations') return category ? 'meditation-category' : 'meditation-grove';
  if (pathname === '/shares') return 'share-gallery';
  if (pathname === '/launch') return 'launch-announcement';
  // Admin, order and unknown routes intentionally receive no detailed context.
  return 'unknown';
}

/**
 * Map a browser location to the small, non-sensitive context Xiaoya needs.
 * Search params are intentionally ignored in v1. The server calls this again,
 * so a client-provided pageType or entity id is never trusted.
 */
export function mapXiaoyaPageContext(
  pathname: unknown,
  _searchParams?: URLSearchParams | string | null,
  locale?: unknown,
): XiaoyaPageContext {
  const safePathname = normalizePathname(pathname);
  const category = safeCategory(_searchParams);
  return {
    pathname: safePathname,
    pageType: pageTypeForPath(safePathname, category),
    locale: locale === 'en' ? 'en' : 'zh-CN',
    ...(safePathname === '/meditations' && category ? { category } : {}),
  };
}

export function sanitizeXiaoyaPageContext(value: unknown): XiaoyaPageContext {
  const record = typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
  const search = typeof record.category === 'string'
    ? new URLSearchParams({ category: record.category })
    : null;
  return mapXiaoyaPageContext(record.pathname, search, record.locale);
}
