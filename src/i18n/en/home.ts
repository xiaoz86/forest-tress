import type { home as zhHome } from '@/i18n/zh/home';

/**
 * 首页英文。不是逐句直译——中文那几句是主理人一句句改出来的，
 * 字对字搬过来会变成一个平庸的冥想 App 的首页。
 *
 * 定下来的译法：小径 path、声音 sound、陪伴营 companion program、
 * 主理人 host、正念 mindfulness、觉察 awareness，phil-coach 不翻。
 *
 * 装饰用的汉字符号（见 / 遇 / 生 / 息 / 伴 / 创）不翻：它们是 aria-hidden
 * 的图形，和导航里那套是同一套，跟着语言变反而认不出来了。
 *
 * hero 那三句和「有温度」的处理留给主理人定稿——见 handTranslated。
 */
export const home: typeof zhHome = {
  hero: {
    titleLead: 'Thousands of creators who',
    titleAccent: 'still feel',
    titleTail: 'like people',
    taglineTop: 'We find what we are capable of, and we are seen.',
    taglineBottom: 'We meet, we make things, we grow.',
    lede: 'For people doing their own work, who would rather not do it alone.',
    chips: ['Breathe', 'See', 'Resonate', 'Meet', 'Create', 'Grow'],
    cta: 'Walk into the forest',
  },

  value: {
    headingTop: 'Not more people to meet.',
    headingBottom: 'The ones who actually matter to you.',
    items: [
      {
        index: '01 · BE SEEN',
        symbol: '见',
        title: 'Be seen',
        body: 'Let people see more than your title: the work you are putting yourself into, the skill you have built, and what you actually need.',
      },
      {
        index: '02 · MEET NEARBY',
        symbol: '遇',
        title: 'Find your people',
        body: 'Start from what you both care about, and find people who understand you, or who fill in what you lack.',
      },
      {
        index: '03 · GROW TOGETHER',
        symbol: '生',
        title: 'Grow together',
        body: 'One conversation, one small group, one thing made together: any of them can move a seed a real step forward.',
      },
    ],
  },

  entrances: {
    heading: 'Come in by the path that suits you.',
    items: [
      {
        icon: '息',
        title: 'Listen',
        body: 'Start with mindfulness sounds, rest, and care for yourself. Attention comes back to now.',
        cta: 'Enter Listen',
      },
      {
        icon: '伴',
        title: 'Companion',
        body: 'phil-coach is a companion that remembers you. It helps you sort out what you feel, see the choices in front of you, and find the next step.',
        cta: 'Start a conversation',
      },
      {
        icon: '见',
        title: 'People',
        body: 'Browse the creators already here, and meet through matches, small-table conversations, and gatherings.',
        cta: 'See the creator forest',
      },
      {
        icon: '创',
        title: 'Creations',
        body: 'Put your course, writing, event, work, or project where it can be seen, and find the people who will support it.',
        cta: 'See what is growing',
      },
    ],
  },

  creators: {
    headingTop: 'People here are already',
    headingBottom: 'doing these things.',
    lede: 'Every node is a real person. You can see what they are making, what they can offer, and who they hope to meet right now.',
    link: 'Enter the creator forest',
    showcase: {
      growing: 'Growing in the forest',
      cityFallback: 'Nearby',
      topicFallback: 'Creator',
      seeking: 'Looking for',
      matchTitle: 'A meeting that might be worth starting',
      matchBody: '{a} and {b} are both {focus}. The forest puts two people like this near each other.',
      matchFocusTopic: 'drawn to "{topic}"',
      matchFocusPlain: 'making something real',
      groupLabel: 'See creator group {n}',
    },
  },

  paths: {
    headingTop: 'Connection does not need forcing.',
    headingBottom: 'Let it grow at the speed that suits you.',
    steps: [
      {
        n: '01',
        title: 'Plant your node',
        body: 'Write down what you are working on, what you care about, what you can offer, and what you are looking for.',
      },
      {
        n: '02',
        title: 'Be seen by each other',
        body: 'The forest suggests people worth knowing properly, going by topic, by direction, and by the skills that complement yours.',
      },
      {
        n: '03',
        title: 'Start talking',
        body: 'Begin with one concrete question. No rush to swap resources, and no need to perform.',
      },
      {
        n: '04',
        title: 'Something grows',
        body: 'A hand when you need it, an event, a piece of work, or a project you can carry forward together.',
      },
    ],
    unfold: 'Unfold these four steps',
    fold: 'Fold it back',
  },

  stories: {
    heading: 'Some connections have already begun.',
    lede: 'Not every meeting has to turn into a collaboration. Being heard properly, and finding someone you can talk to, is already the nearby coming back.',
    items: [
      {
        type: 'AI MATCH · CO-CREATORS',
        quote:
          'The AI put us together because we both care about community building. Our first call ran two hours, and we found that our work fit together. Later we started a project to remake a piece of city space. Nothing about it was networking. It grew on its own, and that is rare.',
        footer: 'Lin Xiaoxi × Zhang Yuanshan · Started from a shared interest in community building',
      },
      {
        type: 'SMALL TABLE · MUTUAL SUPPORT',
        quote:
          'At a small table on "what are you rethinking right now", I said out loud how lost I felt about changing direction. The person across from me had been through the same stretch. She gave no advice. She listened all the way through, then said, "I understand." Those two words were warmer than any method.',
        footer: 'Chen Siyuan × Wang Xiaoqing · A small table about changing direction',
      },
      {
        type: 'READING GROUP · READING TOGETHER',
        quote:
          'Our reading group spent a month on one book. Every Wednesday night the talk moved from the book to our lives, from opinions to what we had lived through. By the last page I had a few friends I could really talk to, and I never noticed it happening. This is what nearby means.',
        footer: 'Li Minglang × Zhao Yizhou and 3 others · Reading together on Wednesday nights',
      },
    ],
    networkLabelTop: 'Connection · Resonance',
    networkLabelBottom: 'The relationship network',
    networkLead: 'When ',
    networkMid: ' planted a tree, ',
    networkTail: ' others appeared in the forest that might be worth meeting.',
    networkLink: 'See the whole forest →',
  },

  origin: {
    heading: 'Everyone can grow their own way.',
    body: 'Nearby Forest is not a shop window for showing yourself off, and not another social square where you have to keep a persona running. We want it to be a place where you can settle, meet real people, and let the work you are doing keep growing.',
    quoteTop: 'Every tree stands on its own,',
    quoteBottom: 'and the roots meet deep in the ground, where no one can see.',
    link: 'Read where Nearby Forest comes from →',
  },

  join: {
    heading: 'Every tree starts as a seed',
    lede: 'Gently put the part of you that is just sprouting into the forest',
    benefitsLead:
      'Plant it and you get your own node card, AI suggestions for people in tune with you, ',
    benefitsAccent: 'a phil-coach of your own',
    benefitsTail: ' that remembers you, and more still growing here',
    cta: 'Become a tree',
    ctaAria: 'Open the node card form',
    loginLead: 'One node card and you are in the forest; that is also how you sign up. Already here?',
    loginLink: 'Sign in with email',
    collapse: 'Hide the form',
  },

  footer: {
    tagline: 'Where independent people connect, move, and make things together.',
    about: 'Where Nearby Forest comes from',
    creators: 'The creator forest',
    copyright: '© 2026 Nearby Forest Community',
  },
};
