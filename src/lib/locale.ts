import { cookies, headers } from 'next/headers';

/**
 * 站点语言。
 *
 * 判断顺序：手动选过的 cookie > 访问来源国家 > 中文。
 * 手动优先是关键——人一旦自己选过，就不该再被 IP 覆盖回去；
 * 在中国用英文、在国外用中文，都是常见且合理的。
 */
export type Locale = 'zh' | 'en';

export const LOCALE_COOKIE = 'nf_lang';
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 一年

/**
 * 判为中文的地区。港澳台按简体中文处理——产品上算「中国」，
 * 繁简的差别等真有需求了再单独做，现在多分一档只会多一份要维护的文案。
 */
const CHINESE_REGIONS = new Set(['CN', 'HK', 'MO', 'TW']);

/**
 * Vercel 在边缘塞进来的访问者国家（两位国家码）。
 * 本地开发没有这个头，所以取不到时一律回落中文——
 * 宁可让英文用户手动切一次，也不要让中文用户莫名其妙看到英文。
 */
const COUNTRY_HEADER = 'x-vercel-ip-country';

export function localeFromCountry(country: string | null | undefined): Locale {
  if (!country) return 'zh';
  return CHINESE_REGIONS.has(country.toUpperCase()) ? 'zh' : 'en';
}

export function normalizeLocale(value: string | null | undefined): Locale | null {
  if (value === 'zh' || value === 'en') return value;
  return null;
}

/** 服务端唯一的语言入口。页面和组件都从这里拿，不要各自读 cookie。 */
export async function getLocale(): Promise<Locale> {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  const chosen = normalizeLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  if (chosen) return chosen;
  return localeFromCountry(headerList.get(COUNTRY_HEADER));
}

/** 调试和「为什么给我看英文」这类问题要用：把判断依据一起给出来。 */
export async function getLocaleDetail(): Promise<{
  locale: Locale;
  country: string | null;
  source: 'cookie' | 'country' | 'default';
}> {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  const country = headerList.get(COUNTRY_HEADER);
  const chosen = normalizeLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  if (chosen) return { locale: chosen, country, source: 'cookie' };
  if (country) return { locale: localeFromCountry(country), country, source: 'country' };
  return { locale: 'zh', country: null, source: 'default' };
}
