import type { nav as zhNav } from '@/i18n/zh/nav';

/**
 * 品牌名和导航词人工定，不走机器翻译。
 *
 * 上一版为了短把原意丢了：「回到自己」译成 Companion（那是陪伴，不是回到自己）、
 * 「遇见附近」译成 People（附近没了）、「生态社区」译成 About（变成了「关于我们」）。
 * 这一版以忠于原意为先——导航词长一点没关系，指错方向才是问题。
 */
export const nav: typeof zhNav = {
  brand: 'Nearby Forest',
  links: {
    meditations: 'Explore',
    philCoach: 'Within',
    shares: 'Create',
    creators: 'Sky',
    about: 'About',
    contact: 'Contact us',
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
