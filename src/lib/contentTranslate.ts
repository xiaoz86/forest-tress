import type { Locale } from '@/lib/locale';
import generated from '@/i18n/generated/content-en.json';

/**
 * 内容译文查找表。
 *
 * 冥想分类名、音频标题、/about 的正文这些字不在代码里——它们在 Supabase
 * 和 content/*.md 里，是主理人自己编辑的东西。这里不去改那些原文，
 * 而是另存一份「原文 → 英文」的对照表（src/i18n/generated/content-en.json），
 * 渲染时按原文查一次。
 *
 * 为什么不在浏览器里异步翻：
 * - 人会先看见中文、隔一两秒突然变英文，那比全中文更难受
 * - 每次访问都要调一次模型，慢且花钱，而这些内容一个月也未必改一次
 * - DOM 里分不清哪些该翻（分类名）哪些不该翻（成员自己写的资料、姓名）
 * - 搜索引擎抓到的仍然是中文
 *
 * 对照表由 scripts/translate-content.mjs 生成并提交进仓库：运行时零延迟、
 * 零成本，译文还能人工改。主理人在后台改了内容之后重跑一次脚本即可；
 * 没跑之前新内容照旧显示中文——降级成现状，不会出错。
 */

const MAP: Record<string, string> = generated as Record<string, string>;

/** 有没有中文。没有的话（纯数字、英文、标点）不用查表，原样返回。 */
function hasChinese(text: string): boolean {
  return /[一-龥]/.test(text);
}

/**
 * 按原文取译文。查不到就返回原文——这条路必须永远安全：
 * 内容页少一句英文只是不完美，抛错就是整页白屏。
 */
export function tr(text: string | null | undefined, locale: Locale): string {
  if (!text) return text || '';
  if (locale !== 'en' || !hasChinese(text)) return text;
  return MAP[text.trim()] || text;
}

/** 数组版，省得在 JSX 里写一串 map。 */
export function trAll(texts: (string | null | undefined)[], locale: Locale): string[] {
  return texts.map(t => tr(t, locale));
}

/**
 * 把一坨已经解析好的内容（对象、数组、字符串随便嵌套）里的字符串逐个查表。
 *
 * **只翻值，不翻键**：/about 的正文是按中文小标题（「引言」「核心信念」）分段的，
 * 键翻了页面就找不到那一段了。
 */
export function trDeep<T>(value: T, locale: Locale): T {
  if (locale !== 'en') return value;
  if (typeof value === 'string') return tr(value, locale) as unknown as T;
  if (Array.isArray(value)) return value.map(v => trDeep(v, locale)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = trDeep(v, locale);
    }
    return out as unknown as T;
  }
  return value;
}

/** 对照表里现在有多少条，给脚本和调试用。 */
export function translationCount(): number {
  return Object.keys(MAP).length;
}
