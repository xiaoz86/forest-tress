import type { nav as zhNav } from '@/i18n/zh/nav';

/**
 * 品牌名和导航词是人工定的，不走机器翻译：
 * Nearby Forest 是这个产品的英文名，五条小径的名字要短、要像入口，
 * 直译（"Return to Yourself"、"Individual Creation"）在导航里又长又生硬。
 */
export const nav: typeof zhNav = {
  brand: 'Nearby Forest',
  links: {
    meditations: 'Listen',
    philCoach: 'Companion',
    shares: 'Creations',
    creators: 'People',
    about: 'About',
  },
  ctaJoin: 'Plant a tree',
  ctaMember: 'My page',
  login: 'Sign in',
  menu: 'Menu',
  language: {
    label: 'Language',
    zh: '简体中文',
    en: 'English',
    short: '中',
  },
};
