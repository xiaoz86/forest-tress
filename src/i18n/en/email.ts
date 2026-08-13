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
      body: 'Enter these six digits back on the page. If you already joined, you’ll log in; otherwise you can choose a light check-in or full registration.',
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
};
