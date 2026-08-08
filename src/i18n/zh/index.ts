import { nav } from '@/i18n/zh/nav';
import { home } from '@/i18n/zh/home';
import { meditations } from '@/i18n/zh/meditations';
import { philCoach } from '@/i18n/zh/philCoach';
import { shares } from '@/i18n/zh/shares';
import { creators } from '@/i18n/zh/creators';
import { login } from '@/i18n/zh/login';
import { creatorDetail } from '@/i18n/zh/creatorDetail';
import { email } from '@/i18n/zh/email';

// about 切片（zh/about.ts、en/about.ts）已经译好，但先不接进来：
// /about 的正文是从 content/*.md 里按中文小标题分段读出来的，不是写死在组件里的。
// 直接换成字典等于把那条 markdown 编辑链路断掉——改 md 页面不再变。
// 那一屏要单独设计：中文继续读 markdown，英文走字典。

/**
 * 中文文案的源。新增文案一律先写在这里，再跑
 *   node --env-file=.env.local scripts/translate-i18n.mjs <切片名>
 * 生成英文，然后人工过一遍调性最重的那几句。
 *
 * 只收「对外那几屏」：导航、首页、/about、声音林、phil-coach 介绍页、
 * 林间分享、创造者森林、登录页。
 * 管理员后台（/shares/admin、/meditations/admin、/meditations/orders）
 * 仍然是写死的中文——那几屏只有主理人自己用，翻了没人看。
 * /launch 也还没接：那一页一百多条，单独一轮做。
 *
 * 切片里不要加 as const：那会把值锁成字面量类型，英文字典一个字都赋不进去。
 */
export const zh = {
  nav,
  home,
  meditations,
  philCoach,
  shares,
  creators,
  creatorDetail,
  login,
  email,
};
