import type { sky as zhSky } from '@/i18n/zh/sky';

export const sky: typeof zhSky = {
  metaTitle: 'Creator Sky · Nearby Forest',
  metaDescription:
    'Every star is someone growing. See the people creating, and the connections that have not happened yet.',

  hero: {
    eyebrow: 'CREATOR SKY · ABOVE NEARBY FOREST',
    title: 'Creator Sky',
    lead1: 'Every star is someone growing.',
    lead2: 'See the people creating, and the connections that have not happened yet.',
    status: 'Tonight, {n} stars are shining above Nearby Forest.',
    empty: 'The forest is just beginning. The first tree could be yours.',
    ctaRoam: 'Wander the sky',
    ctaMine: 'Find my star',
    searchPlaceholder: 'Look for a star: name, city, what they’re doing',
    searchLabel: 'Search creators',
  },

  search: {
    found: '{n} found',
    none: 'No star like that in this sky yet.',
    reset: 'See all {n}',
  },

  lens: {
    eyebrow: 'SAME SKY · DIFFERENT LENSES',
    title: 'Look again, from another angle.',
    sub: 'Everyone has been here in this sky all along.',
    tabsLabel: 'Viewing lenses',
    see: 'See',
    near: {
      tab: 'Close to you tonight',
      title: 'Close to you tonight',
      body: 'What you care about is drifting together. Tonight, these few are worth a second look.',
    },
    constellation: {
      tab: 'Constellations forming',
      title: 'Constellations forming',
      body: 'Shared attention draws people closer. {labels} is taking shape.',
      bodyFallback:
        'Shared attention draws people closer. Some stars are already turning toward each other.',
    },
    rising: {
      tab: 'Newly risen',
      title: 'Newly risen',
      body: 'People who arrived recently. Their light has just cleared the horizon, still finding its place.',
    },
  },

  panel: {
    subtitle: 'a creator, growing',
    close: 'Close',
    doing: 'Working on',
    offer: 'Can offer',
    seeking: 'Open to connecting about',
    moment: 'A moment of beauty in their life',
    create: 'What they want to create or protect',
    seed: 'The seed they carry',
    orbit: 'Their orbit',
    viewProfile: 'Visit their forest page',
    approach: 'Move closer',
    whyTitle: 'Why you two might click',
    whyShared: 'You’re both exploring {topic}.',
    whyThem: 'They’re {doing}.',
    whyEnd: 'It could start with a single conversation.',
    starLabel: 'Move closer to {name}, {city}',
    starLabelNoCity: 'Move closer to {name}',
  },

  closing: {
    quote: 'Trees root downward. Stars shine upward.',
    title: 'There can be a light here for you too.',
    body: 'Share what you’re working on — someone may be looking for exactly this.',
    cta: 'Light my own star',
    toForest: 'Or walk into the Creator Forest →',
  },

  note: 'Each star’s position, size and brightness are generated stably from the creator’s ID. Size only simulates apparent brightness in a night sky — it does not indicate popularity, payment, tier or recommendation weight.',
};
