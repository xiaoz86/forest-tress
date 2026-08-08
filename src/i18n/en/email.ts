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

  loginLink: {
    subject: '🔐 Your Nearby Forest login link',
    heading: 'Log in to your node',
    body: (name: string) => `Click the button below to log in to ${name}’s page.`,
    cta: 'Log in',
    expiry: 'The link is valid for 7 days. If you didn’t request it, you can ignore this email.',
    profileLabel: 'Your page: ',

    textTitle: 'Log in to your node (Nearby Forest)',
    textLead: 'Open the link below to log in (valid for 7 days):',
    textIgnore: 'If you didn’t request this, you can ignore this email.',
    textProfile: (url: string) => `Your page: ${url}`,
  },
};
