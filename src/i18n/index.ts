import type { Locale } from '@/lib/locale';
import { zh } from '@/i18n/zh';
import { en } from '@/i18n/en';

/**
 * 文案字典。
 *
 * zh 是唯一的源：所有中文都写在 zh 里，en 由 scripts/translate-i18n.mjs
 * 调 DeepSeek 生成后人工校对。类型以 zh 为准，en 少一个键就编译不过——
 * 这是防止「加了中文忘了加英文」的唯一可靠办法。
 *
 * 用法（服务端组件）：
 *   const t = dict(await getLocale());
 *   <h1>{t.home.heroTitle}</h1>
 *
 * 客户端组件不要自己判断语言：由服务端父组件把需要的文案当 props 传进去。
 * 让客户端去读 cookie 会先渲染一遍中文再闪成英文。
 */
export type Dictionary = typeof zh;

export function dict(locale: Locale): Dictionary {
  return locale === 'en' ? en : zh;
}

export { zh, en };
