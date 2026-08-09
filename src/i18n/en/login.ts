import type { login as zhLogin } from '@/i18n/zh/login';

export const login: typeof zhLogin = {
  metaTitle: 'Log in · Nearby Forest',
  metaDescription: 'Get a login code sent to the email you signed up with',

  eyebrow: 'Login',
  title: 'Log in to your node',
  lede1: 'Enter the email you signed up with, and we’ll send you a code.',
  lede2: 'Type the code back here to log in — in whichever browser you’re using.',

  emailPlaceholder: 'The email you signed up with',
  submit: 'Send code',
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

  code: {
    sentTo: (email: string) => `We sent a code to ${email}`,
    hint: 'Valid for 10 minutes. If it hasn’t arrived, check your spam folder.',
    placeholder: '6-digit code',
    submit: 'Log in',
    verifying: 'Logging in…',
    resend: 'Send again',
    resendIn: (seconds: number) => `You can send again in ${seconds}s`,
    changeEmail: 'Use a different email',
    error: {
      invalid: 'That code isn’t right, or it has expired. You can send a new one.',
      tooMany: 'That’s a lot of tries. Give it a few minutes.',
      network: 'Network trouble. Please try again shortly.',
    },
  },
};
