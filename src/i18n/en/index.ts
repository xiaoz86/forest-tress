import type { zh } from '@/i18n/zh';
import { nav } from '@/i18n/en/nav';
import { home } from '@/i18n/en/home';
import { meditations } from '@/i18n/en/meditations';
import { philCoach } from '@/i18n/en/philCoach';
import { shares } from '@/i18n/en/shares';
import { creators } from '@/i18n/en/creators';
import { login } from '@/i18n/en/login';
import { creatorDetail } from '@/i18n/en/creatorDetail';
import { email } from '@/i18n/en/email';

// about 切片先不接，原因见 src/i18n/zh/index.ts 里的说明。

/** 英文文案。类型跟着 zh 走：缺一个键就编译不过。 */
export const en: typeof zh = {
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
