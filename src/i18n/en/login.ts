import type { login as zhLogin } from '@/i18n/zh/login';

export const login: typeof zhLogin = {
  metaTitle: 'Log in · Nearby Forest',
  metaDescription: 'Get a login link sent to the email you signed up with',

  eyebrow: 'Login',
  title: 'Log in to your node',
  lede1: 'Enter the email you signed up with, and we’ll send a login link to it.',
  lede2: 'Click the link to come back to your own page.',

  emailPlaceholder: 'The email you signed up with',
  submit: 'Send login link',
  sending: 'Sending…',

  sent1: 'Your request has been handled. If that email belongs to a registered member, check your inbox and spam folder.',
  sent2: 'If nothing arrives, wait a minute and try again.',
  formError: 'That email doesn’t look right, or the service is briefly unavailable. Try again shortly.',

  linkError: {
    noSecret: 'Login isn’t configured yet—please contact the host',
    malformed: 'That login link is malformed. Please request a new one',
    badSig: 'That login link isn’t valid. Please request a new one',
    expired: 'That login link has expired. Please request a new one',
    unknown: 'That login link isn’t valid. Please request a new one',
  },

  benefits: 'Logging in is for members who have already joined: edit your profile, see AI suggestions for people in tune with you, and unlock a personalised phil-coach—your own companion coach that remembers you—along with more to come.',
  noAccount: { before: 'No node yet?', link: 'Fill in a node card and join the forest' },
};
