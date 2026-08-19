import type { email as zhEmail } from '@/i18n/zh/email';

export const email: typeof zhEmail = {
  welcome: {
    subject: '🌱 Welcome to Nearby Forest',
    eyebrow: 'Nearby Forest · Welcome',
    heading: (name: string) => `🌱 ${name}, you are now a tree in the forest`,
    profileLead: 'This page is yours:',
    linkLead:
      'The login link below brings you back any time to edit your details and see the connections AI has found for you:',
    cta: 'Log in to my node',
    expiry:
      'The link is valid for 7 days. If it expires before you use it, get a new one any time at nearby-forest.club/login.',
    footer: 'This email was sent automatically by nearby-forest.club.',

    textGreeting: (name: string) => `Welcome to Nearby Forest, ${name}.`,
    textProfile: (url: string) => `Your page: ${url}`,
    textLink: (url: string) => `Login link (valid for 7 days): ${url}`,
    textBody: 'Open the login link to come back, edit your details, and see your AI suggestions.',
    textExpiry: 'If the link expires, get a new one at nearby-forest.club/login.',
  },


  code: {
    login: {
      subject: (code: string) => `${code} is your Nearby Forest login code`,
      heading: 'Your login code',
      body: 'Enter these six digits back on the page you came from, and you’re in.',
      expiry: 'The code is valid for 10 minutes and can only be used once.',
      ignore: 'If this wasn’t you, you can ignore this email.',
      textTitle: 'Your Nearby Forest login code',
    },
    verify: {
      subject: (code: string) => `${code} is your Nearby Forest email code`,
      heading: 'Confirm this email',
      body: 'Enter these six digits back on the page. If you already joined, you’ll log in; if not, we’ll take you through joining.',
      expiry: 'The code is valid for 10 minutes and can only be used once.',
      ignore: 'If this wasn’t you, you can ignore this email.',
      textTitle: 'Your Nearby Forest email verification code',
    },
    signup: {
      subject: (code: string) => `${code} is your Nearby Forest sign-up code`,
      heading: 'Confirm this email',
      body: 'Enter these six digits back on the sign-up page, and your tree is planted.',
      expiry: 'The code is valid for 10 minutes and can only be used once.',
      ignore: 'If this wasn’t you, you can ignore this email.',
      textTitle: 'Your Nearby Forest sign-up code',
    },
    textCode: (code: string) => `Code: ${code}`,
    textExpiry: 'Valid for 10 minutes, single use.',
  },

  peerIntro: {
    subject: (name: string) => `🌱 ${name} just joined the forest — you two might click`,
    eyebrow: 'Nearby Forest · Worth knowing',
    heading: (name: string) => `🌱 ${name} has come to the forest`,
    lead: (peerName: string) => `${peerName}, here is someone we think you might want to meet`,
    whyTitle: (name: string) => `Why we're introducing ${name} to you`,
    coCreateLabel: 'Something you could build together: ',
    cardTitle: 'Their node card',
    cta: (name: string) => `Visit ${name}'s page`,
    contactNote:
      'Their contact details live on their page, visible once you sign in — we don’t hand out someone else’s WeChat in an email.',
    whyYou: 'You’re getting this because you and they look like a good match.',
    unsubscribe: 'Stop receiving these introductions',

    fields: {
      name: 'Name',
      city: 'City',
      doing: 'Working on',
      topics: 'Topics',
      experience: 'Background',
      offer: 'Can offer',
      seeking: 'Looking for',
      product: 'Product / project',
    },

    textTitle: 'Nearby Forest · Someone worth knowing',
    textLead: (peerName: string, name: string) =>
      `${peerName}, ${name} has come to the forest, and we think you might want to meet them.`,
    textMatchType: (v: string) => `Match type: ${v}`,
    textWhy: (v: string) => `Why: ${v}`,
    textCoCreate: (v: string) => `Could build together: ${v}`,
    textCardTitle: '── Their node card ──',
    textCta: (url: string) => `Visit their page: ${url}`,
    textUnsubscribe: (url: string) => `Stop receiving these introductions: ${url}`,
  },
};
