import type { Locale } from '@/lib/locale';

/**
 * `beauty` 这一列的存储格式。
 *
 * 它一列存两段——注册第 4 步的「一个美的时刻」和「想创造或守护的美」——
 * 靠前缀分隔。拆和拼**必须放在一起**：分开写迟早会漂，而漂掉的后果是
 * 用户编辑一次，两段内容被搅成一段。
 *
 * 前缀原本散落在 i18n 的 home.step4 里。那是个误放：它不是给人看的文案，
 * 是**入库的格式**。放在 i18n 里意味着改一次翻译就可能改掉存储格式，
 * 而且中英两套前缀让 splitBeauty 只认中文那套——英文注册的人一旦编辑资料，
 * 整段会被当成「时刻」，「想创造或守护」那段就没了。
 */

const PREFIX = {
  zh: { moment: '「时刻」', create: '「想创造或守护」' },
  en: { moment: '[Moment] ', create: '[Want to make or protect] ' },
} as const;

/** 两套前缀都要认得。库里已有的行全是中文那套，但英文那套随时可能出现。 */
const MOMENT_RE = /(?:「时刻」|\[Moment\]\s*)/;
const CREATE_RE = /(?:「想创造或守护」|\[Want to make or protect\]\s*)/;

/**
 * 按前缀拆成两段。任一段缺失就返回空串，调用方据此决定显不显示。
 *
 * 两个前缀都找不到时，把整段当作「时刻」——那多半是迁移前手工写进去的，
 * 宁可归错一栏，也不能把内容丢掉。
 */
export function splitBeauty(beauty: string | undefined): { moment: string; create: string } {
  const raw = (beauty || '').trim();
  if (!raw) return { moment: '', create: '' };

  const m = raw.match(new RegExp(`${MOMENT_RE.source}([\\s\\S]*?)(?=${CREATE_RE.source}|$)`));
  const c = raw.match(new RegExp(`${CREATE_RE.source}([\\s\\S]*)$`));
  const moment = m ? m[1].trim() : '';
  const create = c ? c[1].trim() : '';

  if (!moment && !create) return { moment: raw, create: '' };
  return { moment, create };
}

/**
 * 拼回一列。空段自动跳过——只填了一段的人不该在库里留下一个空前缀，
 * 那会让 splitBeauty 下次读出一个空字符串而不是「没填」。
 */
export function joinBeauty(moment: string, create: string, locale: Locale = 'zh'): string {
  const p = PREFIX[locale === 'en' ? 'en' : 'zh'];
  return [
    moment.trim() ? `${p.moment}${moment.trim()}` : '',
    create.trim() ? `${p.create}${create.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * 单段的字数上限。
 *
 * /api/profile 把整列 clip 到 800，而拼回去时还要加上前缀和分隔符——
 * 英文前缀较长，两段各 370 时总长约 777，刚好留出余量。
 * 不在这里 clip，只把数字给表单做 maxLength：真正的裁剪由接口负责，
 * 两处都裁会让人以为自己删掉了内容。
 */
export const BEAUTY_PART_MAX = 370;
