import type { creators as zhCreators } from '@/i18n/zh/creators';

export const creators: typeof zhCreators = {
  metaTitle: 'Creator Forest · Nearby Forest',

  // 作品书架入口
  shelf: {
    ariaLabel: 'View creator shelf',
    imageAlt: 'Nearby Forest · feature walkthrough',
    eyebrow: 'Creator Shelf',
    title: 'A shelf where works-in-progress live',
    body: 'Newsletters, podcasts, products, essays, and project fragments will slowly grow beside each tree.',
    cta: 'See what’s new',
  },

  // 一棵树都还没有时
  empty: {
    title: 'This forest is waiting for its first tree',
    line1: 'No one has left a trail yet.',
    line2: 'Maybe the first tree is you.',
    cta: 'Plant the first tree',
  },

  /** 已有几棵树。英文要分单复数，所以写成函数而不是拼接。 */
  treeCount: (count: number) =>
    count === 1
      ? '1 tree growing in the forest'
      : `${count} trees growing in the forest`,

  // 页尾那一屏
  cta: {
    title: 'Want to plant your own tree in the forest?',
    body: 'Leave a trail. Let the right people find their way here.',
    button: 'Plant a tree',
  },

  footerTagline: 'Independent individuals, connecting, flowing, creating together.',
};
