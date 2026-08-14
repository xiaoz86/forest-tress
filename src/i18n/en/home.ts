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
  metaTitle: 'Nearby Forest · a living community',
  metaDescription:
    'A place where people doing their own work find each other, talk, and keep growing. Connection, conversation, support, and things made together.',

  hero: {
    // 前后各带一个空格：中文那版靠 CSS 的 mx-1 留气口，英文要的是真空格
    //
    // 上一版把「有温度」译成 "still feel like people"，把整句拧成了
    // 「还像个人的创造者」——原文没有这个对照意味，它说的是「带着温度的人」。
    // 绿色高亮落在 warmth 上，和中文版把「有温度」标绿是同一处。
    // 这四句是主理人自己定的稿，不要再润色。
    // 绿色高亮落在 warm-hearted 上，和中文版标绿「有温度」是同一处。
    titleLead: 'Connect with ',
    titleAccent: 'warm-hearted',
    titleTail: ' creators.',
    taglineTop: 'Here, we discover what’s possible within ourselves — and be truly seen.',
    taglineBottom:
      'Through meaningful encounters, we create, grow, and bring new possibilities to life together.',
    lede: 'Walk your own path. Be seen. Find your people. Create together.',
    // 术语表定的是 看见 = notice，这里跟着定：六个词都是动词，读下来是一串动作
    chips: ['Breathe', 'Notice', 'Resonate', 'Meet', 'Create', 'Grow'],
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
        body: 'Start from what you both care about, and find people who understand you, or who bring what you do not have.',
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
        cta: 'Start listening',
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
      matchFocusTopic: 'drawn to “{topic}”',
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
          'At a small table on ‘what are you rethinking right now’, I said out loud how lost I felt about changing direction. The person across from me had been through the same stretch. She gave no advice. She listened all the way through, then said, ‘I understand.’ Those two words were warmer than any method.',
        footer: 'Chen Siyuan × Wang Xiaoqing · A small table about changing direction',
      },
      {
        type: 'READING GROUP · READING TOGETHER',
        quote:
          'Our reading group spent a month on one book. Every Wednesday night the talk moved from the book to our lives, from opinions to what we had lived through. By the last page I had a few friends I could really talk to, and I never noticed it happening. This is what nearby means.',
        footer: 'Li Minglang × Zhao Yizhou and 3 others · Reading together on Wednesday nights',
      },
    ],
    // 外层引号用弯的；上面那段里的内引号相应降一级用单弯引号
    quoteOpen: '“',
    quoteClose: '”',
    networkLabelTop: 'Connection · Resonance',
    networkLabelBottom: 'The relationship network',
    networkLead: 'When ',
    networkMid: ' joined, the forest surfaced ',
    networkTail: ' trees worth meeting.',
    networkLink: 'See the whole forest →',
  },

  origin: {
    heading: 'Everyone can grow their own way.',
    body: 'Nearby Forest is not a shop window for showing yourself off, and not another social square where you have to keep a persona running. We want it to be a place where you can settle, meet real people, and let the work you are doing keep growing.',
    quoteTop: 'Every tree stands on its own,',
    quoteBottom: 'and the roots meet deep in the ground, where no one can see.',
    link: 'Read where Nearby Forest comes from →',
    film: {
      cta: 'Watch the film',
      ariaOpen: 'Watch the Nearby Forest film',
      ariaClose: 'Close the film',
      close: 'Close',
      brand: 'Nearby Forest',
      subtitle: 'The film',
    },
  },

  join: {
    heading: 'Every tree starts as a seed',
    lede: 'Let the part of you that is just sprouting settle into the forest',
    benefitsLead:
      'Plant it and you get your own node card, AI suggestions for people in tune with you, ',
    benefitsAccent: 'a phil-coach of your own',
    benefitsTail: ' that remembers you, and more still growing here',
    cta: 'Become a tree',
    ctaAria: 'Open the node card form',
    loginLead: 'One node card and you are in the forest; that is also how you sign up. Already here?',
    loginLink: 'Sign in with email',
    collapse: 'Hide the form',

    wizard: {
      progress: (total: number) => `${total} steps to finish your node card and let the forest see you`,
      stepAria: (n: number) => `Step ${n}`,

      // 显示成英文，入库仍是中文原值（见 zh 那份的说明）
      topics: {
        health: 'Health / Body-mind',
        lifeEd: 'Life education',
        aesthetics: 'Aesthetics / Design',
        mindfulness: 'Mindfulness / Meditation',
        psychology: 'Psychology / Coaching',
        content: 'Content creation',
        business: 'Business for good',
        community: 'Community building',
        family: 'Parenting / Family',
        tech: 'AI / Tech',
        craft: 'Craft / Floristry',
        reading: 'Reading / Writing',
      },

      step1: {
        title: 'Who are you?',
        subtitle: 'Let people in the forest get to know you',
        name: 'Your name / what you go by',
        namePlaceholder: 'What should we call you',
        city: 'Which city are you in',
        cityPlaceholder: 'e.g. Shenyang, Beijing, Chengdu',
        intro: 'Introduce yourself in one line',
        introPlaceholder: 'What you are doing now, what you care about, or simply what kind of person you are',
      },

      step2: {
        title: 'Which soil does your seed belong to?',
        subtitle: 'Pick the areas you care about—up to 6',
        hint: 'At least 1, at most 6',
      },

      step3: {
        title: 'What you are here for…',
        subtitle: 'Your experience, what you can offer, what you are looking for',
        experience: 'Your experience, strengths, and what makes you you',
        experiencePlaceholder: 'Where do you have experience? What is your particular strength?',
        offer: 'What can you offer others?',
        offerPlaceholder: 'e.g. I can share what I have learned about meditation, offer brand design advice, or run a reading group…',
        seek: 'What kind of connection are you looking for?',
        seekPlaceholder: 'e.g. partners to co-create an event with, people working in life education, or simply more eyes on the things I make…',
      },

      step4: {
        title: 'What is beauty, in your life?',
        subtitle: 'In Nearby Forest, beauty is not a right answer—it is what you have actually lived',
        prose1: 'Beauty is a sweetness on the tongue, the moment tea tastes exactly right.',
        prose2: 'Beauty is range—what your eyes have taken in from all the places you have been.',
        prose3: 'Beauty comes from instinct, from the heart; it steps away from sameness, and lives in the moments no one could copy.',
        words: { w1: 'Sweetness', w2: 'Range', w3: 'Instinct', w4: 'Realness', w5: 'Uncopyable' },
        cards: {
          taste: { label: 'A taste', body: 'The sweetness of the first sip of morning tea' },
          scene: { label: 'A scene', body: 'Steam rising from a street stall at dusk' },
          moment: { label: 'A moment', body: 'An unplanned conversation in an unfamiliar city' },
          feeling: { label: 'A feeling', body: 'The quiet fullness after finishing something' },
        },
        moment: 'One moment of beauty in your life—',
        momentPlaceholder: 'A cup of tea, a walk, a person, a thing… what made you think, this is it?',
        create: 'What beauty do you want to make, or protect?',
        createPlaceholder: 'Maybe a product, an experience, a space, a way of living…',
        hobby: 'What you love doing',
        hobbyPlaceholder: 'What moves you outside of work—hiking, baking, jazz, independent film…',
        momentPrefix: '[Moment] ',
        createPrefix: '[Want to make or protect] ',
      },

      step5: {
        title: 'What is the seed you are carrying?',
        subtitle: 'A dream, a thought, a plan not yet begun—any of it counts',
        placeholder: 'e.g. I want to make a podcast about life education / open a neighbourhood flower shop / turn ten years of yoga into a course / I am not sure yet, but I want to find a direction…',
      },

      step6: {
        title: 'Your work / projects (optional)',
        subtitle: 'A newsletter, podcast, product, or service · once you join, it shows up on your own shelf',
        workNo: (n: number) => `Work #${n}`,
        removeWork: (n: number) => `Remove work ${n}`,
        titlePlaceholder: 'Title (e.g. 1-on-1 coaching / the podcast “A Random Walk”)',
        descPlaceholder: 'One-line description (optional)',
        urlPlaceholder: 'Link (optional, https://…)',
        addFirst: '+ Add your first piece',
        addMore: '+ Add another',
        max: (n: number) => `${n} at most · you can keep adding on your own page after joining`,
        skip: 'You can skip this—after joining you can add pieces and change covers any time.',
        cover: {
          add: 'Add a cover image (optional)',
          hint: 'Landscape 16:9 works best · ≤ 5MB',
          replace: 'Click to replace',
          remove: 'Remove cover',
          uploadAria: (n: number) => `Upload a cover for work ${n}`,
          changeAria: (n: number) => `Replace the cover for work ${n}`,
          previewAlt: (n: number) => `Cover preview for work ${n}`,
        },
      },

      step7: {
        title: 'How can we reach you?',
        subtitle: 'The forest sends your welcome letter and login link by email',
        photo: 'Photo (optional)',
        photoUploadAria: 'Upload a photo',
        photoChangeAria: 'Replace photo',
        photoAlt: 'Preview',
        photoHint: 'A photo you are happy to be seen in',
        photoSpec: 'JPG / PNG / WebP / HEIC · ≤ 5MB',
        email: 'Email',
        emailPlaceholder: 'Login links and notices go here',
        emailHint: 'Required · this is how you get back to your page later',
        wechat: 'WeChat (optional)',
        wechatPlaceholder: 'So people in the forest can add you',
      },

      prev: '← Back',
      next: 'Next →',
      lastStep: 'Last step · how to reach you →',
      submit: '🌱 Plant my seed',
      submitting: 'Planting…',
      consent: 'By submitting you agree to let the forest keep your details, and use them to introduce you to people in tune with you.',

      done: {
        title: 'Your seed is planted',
        sent: (email: string) => `A welcome letter and login link are on their way to ${email}.`,
        sentHint: 'Check your inbox and spam folder—open the link to carry on editing.',
        mailFailed: 'Your node is created, but the welcome email could not be sent just now.',
        mailFailedHint: (email: string) => `Head to the login page shortly and enter ${email} to get a fresh login link.`,
        backToCoach: 'Back to your conversation',
        backToCoachHint: 'It’s still there—pick up where you left off.',
      },

      error: {
        emailTaken: 'That email is already in the forest. Go to /login and enter it to get back to your node.',
        emailInvalid: 'Please enter a valid email.',
        submitFailed: 'That didn’t submit. Please try again shortly',
        network: 'Network trouble. Please try again shortly',
        badImage: 'Please upload a JPG / PNG / WebP / HEIC image',
        imageTooLarge: 'That image is too large—please compress it to under 5MB',
      },

      verify: {
        title: 'Last step: confirm your email',
        sentTo: (email: string) => `We sent a code to ${email}`,
        hint: 'Valid for 10 minutes. If it hasn’t arrived, check your spam folder.',
        placeholder: '6-digit code',
        cta: '🌱 Plant my seed',
        verifying: 'Planting…',
        resend: 'Send again',
        resendIn: (seconds: number) => `You can send again in ${seconds}s`,
        back: 'Change the email',
        error: {
          code: 'That code isn’t right, or it has expired. You can send a new one.',
          send: 'That didn’t send. Try again in a moment.',
        },
      },
    },
  },

  footer: {
    tagline: 'Where independent people connect, move, and make things together.',
    about: 'Where Nearby Forest comes from',
    creators: 'The creator forest',
    copyright: '© 2026 Nearby Forest Community',
  },
};
