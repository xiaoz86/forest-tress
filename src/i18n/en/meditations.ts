import type { meditations as zhMeditations } from '@/i18n/zh/meditations';

export const meditations: typeof zhMeditations = {
  metaTitle: 'Forest Breath · Nearby Forest',
  metaDescription: 'Themed meditations and sound practices from Nearby Forest.',

  backHome: '← Home',
  backToAll: '← All sounds',

  /** 一条小径下面有几段声音。英文要分单复数，所以写成函数而不是拼接。 */
  soundCount: (count: number) => `${count} sound${count !== 1 ? 's' : ''}`,
  /** 一段都还没有时，胶囊里换成这句 */
  soundsComing: 'More sounds on the way',
  /** 影像专题下面有几支。量词不一样，不能拿 soundCount 顶着用。 */
  filmCount: (count: number) => `${count} film${count !== 1 ? 's' : ''}`,
  filmsComing: 'Films on the way',

  // 声音林（/meditations 不带参数时的列表页）
  grove: {
    eyebrow: 'Sounds of the Forest',
    guided: {
      eyebrow: 'Guided',
      title: 'Guided meditations',
      note: 'A voice to walk with. Pick one, go at your own pace.',
    },
    program: {
      eyebrow: 'Program',
      title: 'Sleep series',
      note: 'A journey with a sequence. Week by week, no rush.',
    },
    ambient: {
      eyebrow: 'Ambient',
      title: 'Sounds',
      note: 'No guidance. Handpan, singing bowls, rain. Just let it play.',
    },
    film: {
      eyebrow: 'Seeing',
      title: 'Films',
      // 这一组不是「视频区」，也不专属节气：人物、自然、练习、创作、
      // 社区纪录都会往里放。所以这句话说的是「用影像看」，不是「有视频」。
      note: 'Looking at people and the world through moving images. Portraits, nature, practice, making, seasons, community.',
    },
  },

  // 走进某一条小径之后的通用文字
  category: {
    otherPaths: 'Other paths',
    listenEyebrow: 'Listen',
    listenTitle: 'Sounds in this path',
    empty: 'This path is still growing. New sounds will appear here quietly.',
    sourceEyebrow: 'Source & style',
    benefitsEyebrow: 'What you might notice',
  },

  // 单段声音的卡片
  card: {
    /** 后台没填阶段时封面左上角那个标签 */
    stageFallback: 'Sound',
    ready: 'Ready',
    coming: 'Opening soon',
    /** 只给读屏用，标题本身还是后台存的中文 */
    open: (title: string) => `Open ${title}`,
  },

  // 陪伴营（kind === 'program'）的界面
  program: {
    /** 封面右边那行小字。分类名来自后台，所以整句写成函数 */
    series: (label: string, total: number) => `${label} · ${total} sessions`,
    /** 顶部总进度 */
    progress: (done: number, total: number) => `${done} / ${total} sounds`,
    /** 周块右上角。已解锁的周只显示数字，不带量词 */
    phaseProgress: (done: number, total: number) => `${done} / ${total}`,
    /** 还没解锁的周：说清楚要听完几段才开 */
    phaseLocked: (count: number, need: number) =>
      `${count} sounds · Unlocks after ${need} from the previous week`,
    free: 'Free',
    /** 这一段还没上传音频 */
    coming: 'Opening soon',
    notes: 'Reflections',
    /** 只给读屏用 */
    play: (title: string) => `Play ${title}`,
    audioFailed: 'Couldn’t load this sound. Refresh the page and try again.',
    // 吸底那条
    dock: {
      claimPending: 'Access is open. The host will confirm after checking the payment record, usually same day.',
      paid: 'Pick a sound to begin. Listening to 80% counts as done.',
      unlockTitle: (total: number) => `Unlock all ${total} sounds`,
      unlockSub: 'One-time payment. Come back anytime.',
      unlockCta: 'Unlock now',
    },
  },

  // 纯声音（kind === 'ambient'）
  ambient: {
    empty: 'These sounds are still being gathered. New ones will appear here quietly.',
    note: 'No voice. Let it play in the background, do something else.',
    /** 列表行末尾那个 ∞ 的 title */
    loopable: 'Loopable',
    looping: 'Looping',
    once: 'Play once',
    loopToggle: '∞ Loop',
  },

  // 影像（kind === 'film'）。有画面，所以看法和听不一样：
  // 一支一支放，配一条完整一年的节气路线。
  film: {
    eyebrow: 'Seeing',
    /** 影片列表上方那个衬线小标题，对应引导冥想那屏的「具体的声音」 */
    listTitle: 'Films in this path',
    empty: 'The films for this path are still being made. The first one will appear here quietly.',
    /** 选中的这支正好是此刻的节气时，标一下 */
    thisTerm: 'This term',
    /** 播放器下面那条节气路线 */
    termsEyebrow: 'Twenty-four terms',
    termsTitle: 'The whole year',
    /** 节气条上标当下位置的那个点 */
    now: 'Now',
    /** 还没做的那些节气，停上去说这句 */
    notYet: 'Not yet',
    /** 影片还没传上来 */
    coming: 'Opening soon',
    /** 只给读屏用，标题本身还是后台存的中文 */
    watch: (title: string) => `Play ${title}`,
    videoFailed: 'Couldn\u2019t load this film. Refresh the page and try again.',
    // 分享。手机上先叫系统面板，叫不出来就退成复制链接
    share: 'Share',
    shareCopied: 'Link copied',
    /** 剪贴板也用不了时（微信里常见），把链接摆出来让人自己长按复制 */
    shareManual: 'Couldn\u2019t copy — press and hold the link below',
    /** 节气条左边那一列 */
    season: { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' },
  },

  // 引导冥想卡片底下的播放器
  audio: {
    failed: 'Couldn’t load this sound. Refresh the page and try again.',
    coming: 'This sound is opening soon',
    writeNote: 'Write a reflection',
    noteCount: (count: number) => `${count} reflection${count !== 1 ? 's' : ''}`,
  },

  // 听后感悟
  notes: {
    placeholder: 'What remains after listening?',
    anonymousToggle: 'Post anonymously',
    /**
     * 勾没勾匿名各显示一句完整的话。
     * 不要拆成「会带上你的名字」+「，所有人可见」两段拼——
     * 英文的语序和中文不一样，拼出来会散架。
     */
    asAnonymous: 'Shown as “someone in the forest,” visible to everyone',
    asNamed: 'Shown with your name, visible to everyone',
    publishing: 'Posting…',
    publish: 'Write a reflection',
    loading: 'Loading…',
    empty: 'No reflections yet.',
    withdraw: 'Withdraw',
    /** 匿名者的显示名 */
    anonName: 'someone in the forest',
    /** 「登录」是个链接，所以句子拆成前后两截 */
    signInPrompt: { link: 'Log in', after: ' to write a reflection.' },
    time: {
      justNow: 'just now',
      minutes: (n: number) => `${n} minute${n !== 1 ? 's' : ''} ago`,
      hours: (n: number) => `${n} hour${n !== 1 ? 's' : ''} ago`,
      days: (n: number) => `${n} day${n !== 1 ? 's' : ''} ago`,
      date: (y: number, m: number, d: number) => `${y}.${m}.${d}`,
    },
    error: {
      tooMany: 'You’ve written 5 reflections on this sound. Take a break.',
      tooLong: (max: number) => `${max} characters max.`,
      notLoggedIn: 'Log in first.',
      locked: 'This sound hasn’t been unlocked yet.',
      failed: 'Couldn’t post. Try again in a moment.',
    },
  },

  // 解锁与付款。钱走支付宝收款码，付完回来传一张截图。
  unlock: {
    loading: 'Loading…',
    /** 还锁着几段 */
    lockedCount: (n: number) => `${n} sound${n !== 1 ? 's' : ''} left`,
    headline: 'Sign up for Nearby Forest to unlock the full journey',
    signUpCta: 'Sign up & unlock',
    haveAccount: 'Already signed up? Log in',
    requestCta: 'I want to unlock',
    busy: 'Processing…',

    // 申请之后、主理人确认之前的那一段
    badge: {
      waiting: 'Awaiting confirmation',
      proofReceived: 'Screenshot received',
      /** 传了截图、权限已经先开出去了 */
      openedNow: 'Open · pending check',
    },
    title: {
      openedNow: 'Three weeks of sounds are now open',
      proofReceived: 'Screenshot received, waiting for host confirmation',
      toPay: (yuan: string) => `Scan the Alipay QR code to pay ¥${yuan}, then upload a screenshot`,
    },
    body: {
      openedNow: 'The screenshot has been sent to the host. They’ll check it against the payment record, usually same day. If something doesn’t match, the request may be rejected—the reason will appear here.',
      judgedBefore: 'A previous request was rejected, so this one will open after the host checks the record, usually same day.',
    },

    qrAlt: 'Alipay QR code',
    qrCaption: 'Scan with Alipay',
    /** 三步说明。第二步不再重复「当场就能听」——按钮旁边已经有一句了 */
    steps: {
      pay: (yuan: string) => `1. Scan the Alipay QR code to pay ¥${yuan}`,
      upload: '2. Come back and upload a payment screenshot',
      confirm: '3. The host checks the record and confirms',
    },
    /** 收款码没配好时的兜底，中间夹着一个指向 /about#community 的链接 */
    noQr: {
      before: 'The QR code hasn’t been set up yet. Go to the',
      link: 'About',
      after: 'page to add the host on WeChat and send the screenshot there.',
    },

    uploadCta: 'Paid — upload a screenshot',
    uploadAgain: 'Replace screenshot',
    uploading: 'Received, opening…',
    uploadHint: 'You can listen right after uploading',
    proofPrivacy: 'Only the host can see the screenshot, used to check the payment record.',

    // 被驳回
    rejected: {
      badge: 'Not approved',
      title: 'This request was not approved',
      retry: 'Apply again',
    },

    error: {
      notLoggedIn: 'Log in first.',
      createFailed: 'Couldn’t create the request. Try again in a moment.',
      badFileType: 'Images only (jpg / png / webp). Take a screenshot on your phone and try again.',
      fileTooLarge: 'File is too large (max 8 MB). Compress it and try again.',
      tooSoon: 'You just uploaded one. Wait a minute before replacing it.',
      /** 钱已经付出去了，这里不能只说「再试」就没了下文 */
      uploadFailed: 'Couldn’t upload. Try again. If it still fails, go to the About page to add the host on WeChat and send the screenshot directly.',
      uploadNetwork: 'Couldn’t upload. Try again in a moment.',
    },
  },
};
