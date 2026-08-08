import type { creatorDetail as zhCreatorDetail } from '@/i18n/zh/creatorDetail';

export const creatorDetail: typeof zhCreatorDetail = {
  metaTitleFallback: 'Creator · Nearby Forest',
  metaTitle: (name: string) => `${name} · Creator Forest`,
  metaDescriptionFallback: 'A creator’s tree in Nearby Forest',

  backToForest: 'Creator Forest',
  logout: 'Log out',
  login: 'Log in',
  adminView: (name: string) => `Admin view · ${name}`,

  section: {
    doing: 'Working on',
    experience: 'Experience & strengths',
    offer: 'Can offer',
    seeking: 'Looking for',
    interests: 'Loves doing',
  },

  contact: {
    title: 'Get in touch',
    none: 'They haven’t left contact details yet.',
    wechat: 'WeChat',
    email: 'Email',
    membersOnly: 'Contact details are only visible to community members.',
    membersOnlyHint: 'Fill in a node card of your own and you’ll see them.',
    cta: 'Become a tree in the forest',
  },

  network: {
    title: (name: string) => `Around ${name}`,
    note: 'The forest shows at most 9 nodes at a time, nearest first, from close ties out to loose ones.',
    empty1: 'This tree has no neighbours yet.',
    empty2: 'As more creators join, the network grows on its own.',
    aria: 'Relationship network',
    nodeAria: (name: string) => `See ${name}’s page`,
  },

  works: {
    title: 'Work / Projects',
    emptyBefore: 'Nothing here yet. Tap ',
    emptyAccent: '+ Add a piece',
    emptyAfter: ' below so visitors can see your newsletter, podcast, product, or service at a glance.',
  },

  joinCta: {
    title: 'Want a place in this forest too?',
    button: 'Become a tree in the forest',
  },

  footer: {
    brand: 'Nearby Forest · 附近森林',
    tagline: 'Independent individuals, connecting, flowing, creating together',
  },

  matchType: {
    同频: 'In tune',
    互补: 'Complementary',
    同城: 'Same city',
  },

  match: {
    found: (count: number) =>
      count === 1
        ? 'Found 1 person who may be in tune with you'
        : `Found ${count} people who may be in tune with you`,
    foundNote: 'Based on your node, these are trees in the forest you might connect with',
    why: 'Why you match',
    coCreate: 'What you might make together',
    seeForest: 'See the whole forest',

    firstTitle: 'You are the first tree in this forest',
    firstLine1: 'Every forest begins this quietly.',
    firstLine2: 'We look forward to the creators who come after you.',
    firstCta: 'Take a look around the forest',

    hostTitle: (name: string) => `Add ${name}, the host, to join the community group`,
    hostNote: 'The host will bring you into the community group, so you can meet people in tune with you sooner.',
    hostHint: 'Open WeChat → Add contact → Paste the ID',
    copy: 'Copy',
    copied: 'Copied ✓',
  },

  ai: {
    title: 'AI suggestions · visible only to you',
    titleAdmin: ' (admin)',
    titleTail: '',
    generatedAt: (time: string) => `Generated ${time}`,
    generate: 'Generate now',
    regenerate: 'Generate again',
    generating: 'Generating…',
    emptyHint:
      'No AI suggestions yet. Tap “Generate now” above and we’ll find 1–3 members most worth connecting with, based on your latest node.',
    emptyNote: 'You can generate again any time you update your profile.',
    error: {
      forbidden: 'You don’t have permission to generate again',
      columnMissing: 'The database hasn’t been upgraded yet—please contact the host',
      failed: 'That didn’t generate. Please try again shortly',
    },
  },

  editor: {
    ownerOnly: 'Only you can see this edit button',
    adminMode: 'Admin mode · you are editing their profile',
    open: 'Edit profile',
    title: 'Edit profile',
    saved: 'Saved ✓',
    cancel: 'Cancel',
    save: 'Save changes',
    saving: 'Saving…',
    field: {
      name: 'Name *',
      city: 'City',
      doing: 'Working on',
      topics: 'Topics you follow (press Enter to add)',
      topicsPlaceholder: 'e.g. community building, AI, love and connection…',
      interests: 'Loves doing',
      experience: 'Experience & what makes you you',
      offer: 'Can offer',
      seeking: 'Looking for',
      product: 'Product / project (legacy field—use the work shelf instead)',
      wechat: 'WeChat ID',
      email: 'Email *',
    },
    error: {
      nameRequired: 'Name can’t be empty',
      emailInvalid: 'That email doesn’t look right',
      emailTaken: 'That email is already taken by another member',
      forbidden: 'You don’t have permission to edit',
      columnMissing: 'The database hasn’t been upgraded yet—please contact the host',
      nothingToUpdate: 'Nothing changed',
      saveFailed: 'That didn’t save. Please try again shortly',
    },
  },

  avatar: {
    uploadAria: 'Upload a photo',
    changeAria: 'Replace photo',
    adminUploadAria: (name: string) => `Upload a photo for ${name} (admin)`,
    adminChangeAria: (name: string) => `Replace the photo for ${name} (admin)`,
    upload: 'Upload photo',
    change: 'Replace photo',
    adminUpload: 'Upload (admin)',
    adminChange: 'Replace (admin)',
    uploading: 'Uploading…',
    hint: 'Tap to upload your photo (optional)',
    adminHint: 'Tap to upload a photo for them (admin)',
    adminNote: 'Admin mode · tap the photo to replace it',
    error: {
      forbidden: 'You can only upload your own photo',
      badFileType: 'Please upload a JPG / PNG / WebP / HEIC image',
      fileTooLarge: 'That image is too large—please compress it to under 5MB',
      columnMissing: 'The database hasn’t been upgraded yet—please contact the host',
      missingId: 'Missing identity information',
      missingFile: 'No file selected',
      uploadFailed: 'That didn’t upload. Please try again shortly',
      saveFailed: 'That didn’t save. Please try again shortly',
    },
  },

  worksEditor: {
    ownerOnly: 'Only you can see these edit buttons',
    adminMode: 'Admin mode · you are editing their work',
    add: '+ Add a piece',
    newTitle: 'New piece',
    editTitle: 'Edit piece',
    published: (count: number) => (count === 1 ? '1 published' : `${count} published`),
    noImage: 'No image',
    noLinkNoDesc: 'No link · no description',
    cancel: 'Cancel',
    saving: 'Saving…',
    save: 'Save piece',
    saveChanges: 'Save changes',
    confirmDelete: 'Delete this piece? This can’t be undone.',
    action: { cover: 'Replace cover', text: 'Edit text', remove: 'Delete' },
    field: {
      title: 'Title',
      titlePlaceholder: 'e.g. 1-on-1 coaching / the podcast “A Random Walk”',
      desc: 'Description (optional, 1–2 sentences)',
      descPlaceholder: 'Tell visitors in one line what this is',
      url: 'Link (optional)',
      coverNew: 'Cover image (optional, under 5MB)',
      coverEdit: 'Cover image (optional—leave empty to keep the current one)',
      pick: 'Choose image',
      replace: 'Replace image',
      previewAlt: 'Preview',
    },
    error: {
      forbidden: 'Only the owner or an admin can edit this work',
      missingTitle: 'Please give the piece a title',
      badUrl: 'The link needs to start with http:// or https://',
      badFileType: 'Please upload a JPG / PNG / WebP / HEIC image',
      fileTooLarge: 'That image is too large—please compress it to under 5MB',
      tooManyWorks: 'You’ve reached the limit for pieces',
      columnMissing: 'The database hasn’t been upgraded yet—please contact the host',
      uploadFailed: 'That didn’t upload. Please try again shortly',
      saveFailed: 'That didn’t save. Please try again shortly',
      nodeNotFound: 'That tree could not be found',
      workNotFound: 'That piece doesn’t exist, or has been deleted',
      nothingToUpdate: 'Nothing to update',
      deleteFailed: 'That didn’t delete',
      coverFailed: 'The cover didn’t change',
    },
  },
};
