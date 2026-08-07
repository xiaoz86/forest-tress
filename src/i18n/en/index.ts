import type { zh } from '@/i18n/zh';
import { nav } from '@/i18n/en/nav';
import { home } from '@/i18n/en/home';
import { about } from '@/i18n/en/about';
import { meditations } from '@/i18n/en/meditations';

/** 英文文案。类型跟着 zh 走：缺一个键就编译不过。 */
export const en: typeof zh = {
  nav,
  home,
  about,
  meditations,
};
