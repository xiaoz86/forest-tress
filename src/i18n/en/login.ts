import type { login as zhLogin } from '@/i18n/zh/login';

export const login: typeof zhLogin = {
  metaTitle: 'Log in · Nearby Forest',
  metaDescription: 'Get a login code sent to the email you signed up with',

  eyebrow: 'Login',
  title: 'Log in to your node',
  lede: 'Enter the email you signed up with, then type the code to log in.',

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

  newUser: {
    title: 'First time here—choose your way in',
    eyebrow: 'Join · 加入',
    back: 'Choose a different way',
    nameTitle: 'What should we call you?',
    body: 'Your email is confirmed. Leave a name for a light check-in, or complete a full node card now. Neither option sends another code.',
    namePlaceholder: 'What should we call you',
    lightJoin: 'Light check-in and continue',
    fullJoin: 'Complete my node card',
    joining: 'Joining…',
    note: 'A light check-in stores only your name and verified email. You can complete your profile later.',
    error: 'That check-in did not finish. Please try again shortly.',
    verificationExpired: 'That email confirmation has expired. Please send a new code.',
  },

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
