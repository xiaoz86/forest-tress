import { nav } from '@/i18n/zh/nav';
import { home } from '@/i18n/zh/home';
import { about } from '@/i18n/zh/about';
import { meditations } from '@/i18n/zh/meditations';

/**
 * 中文文案的源。新增文案一律先写在这里，再跑
 *   node --env-file=.env.local scripts/translate-i18n.mjs <切片名>
 * 生成英文，然后人工过一遍调性最重的那几句。
 *
 * 只收「对外那几屏」：导航、首页、/about、声音林。
 * 注册、付款、管理员后台仍然是写死的中文——那几处涉及正在跑的收款流程，
 * 分开一步走，别在同一次改动里既动文案又动付费路径。
 *
 * 切片里不要加 as const：那会把值锁成字面量类型，英文字典一个字都赋不进去。
 */
export const zh = {
  nav,
  home,
  about,
  meditations,
};
