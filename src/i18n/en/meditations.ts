import type { meditations as zhMeditations } from '@/i18n/zh/meditations';

/**
 * 声音林的英文。几处不是直译，记一下为什么：
 *
 * - 「引导冥想」这一组的 eyebrow 本来就是 Guided，标题再翻成 Guided meditations
 *   就成了同一个词说两遍。改成 With a voice——和它下面那句「有人声带着走」是一路的。
 * - 「声音」这一组同理：eyebrow 是 Ambient，标题用 Just sound。
 * - 「具体的声音」不是 Specific sounds（那是目录口气）。这一栏在页面上的意思是
 *   「铺垫说完了，下面是声音本身」，所以 The sounds themselves。
 * - 段数分单复数：1 sound / 3 sounds，不能一律 sounds。
 */
export const meditations: typeof zhMeditations = {
  metaTitle: 'Breathing in the forest · Nearby Forest',
  metaDescription: 'Guided meditations and sound practices from Nearby Forest.',

  backHome: '← Back home',
  backToAll: '← All sounds',

  soundCount: (count: number) => (count === 1 ? '1 sound' : `${count} sounds`),
  soundsComing: 'Sounds on the way',

  grove: {
    eyebrow: 'Sounds of the Forest',
    guided: {
      eyebrow: 'Guided',
      title: 'With a voice',
      note: 'A voice leads the way. Pick a sound anytime, listen at your own pace.',
    },
    program: {
      eyebrow: 'Program',
      title: 'Sleep series',
      note: 'A whole journey, in order. One week at a time, with no rush to finish.',
    },
    ambient: {
      eyebrow: 'Ambient',
      title: 'Just sound',
      note: 'No guidance. Handpan, singing bowls, rain — just let it play.',
    },
  },

  category: {
    otherPaths: 'Other Paths',
    listenEyebrow: 'Listen',
    listenTitle: 'The sounds themselves',
    empty: 'This path is still growing. As new sounds appear, they will be placed here quietly.',
    sourceEyebrow: 'Origins and character',
    benefitsEyebrow: 'What may shift',
  },

  card: {
    stageFallback: 'Sound',
    ready: 'Ready',
    coming: 'Soon',
    open: (title: string) => `Open ${title}`,
  },
};
