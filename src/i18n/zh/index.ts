import { nav } from '@/i18n/zh/nav';

/**
 * 中文文案的源。新增文案一律先写在这里，再跑 scripts/translate-i18n.mjs 生成英文。
 *
 * 只收「第一阶段那五屏」：导航页脚、首页、/about、phil-coach 介绍页、声音林列表。
 * 注册、付款、管理员后台仍然是写死的中文——那几处涉及正在跑的收款流程，
 * 分开一步走，别在同一次改动里既动文案又动付费路径。
 */
export const zh = {
  nav,
};
