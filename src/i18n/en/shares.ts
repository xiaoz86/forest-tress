import type { shares as zhShares } from '@/i18n/zh/shares';

export const shares: typeof zhShares = {
  metaTitle: 'Creations · Nearby Forest',
  metaDescription: 'Work, products, events, and moments from the people inside Nearby Forest.',

  heroTitle: 'More from the creators',
  heroLede: 'Some things only land when someone steps inside them first. Here, we’ll gather work, products, events, and experiences from people who bring warmth—one piece at a time.',

  submitCta: 'Share something',
  backHome: 'Home',
  manage: 'Manage shares',

  submit: {
    eyebrow: 'Bring a piece',

    signInTitle: 'Log in to your node first',
    signInBody:
      'Once you’re logged in, you can add your own work, product, event, or experience here, and the founding team will take a look.',
    signInCta: 'Log in',

    title: 'Add your piece',
    lede: 'It can be work, a product, an event, or just an experience. It goes to review first—nothing is published straight away.',

    field: {
      title: 'Title',
      tags: 'Tags (comma separated)',
      tagsPlaceholder: 'work, experience',
      question: 'The question it started from',
      summary: 'Short description',
      note: 'One more thing',
      href: 'External link (optional)',
      media: 'Main media',
      poster: 'Video poster (optional)',
    },

    submitting: 'Sending',
    submitCta: 'Submit for review',
    done: 'Got it. Once the founding team has reviewed it, it’ll show up here.',
    failed: 'That didn’t go through. Try again in a moment.',
  },
};
