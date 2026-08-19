// 不要加 as const：那会把每个值锁成字面量类型，英文字典就一个字都赋不进去。
//
// 只收**发给用户本人**的信：注册后的欢迎信、登录/注册验证码、
// 以及「有新成员可能和你同频」那封撮合介绍信。
// 其余几封（新成员通知、投稿待审、phil-coach 反馈、付款截图）都是发给主理人的，
// 收件人只有中文使用者，一律留在 notify.ts 里写死中文，不进这里。
//
// 语言按发信那一刻的 locale 走（cookie 优先，其次来源国家）——
// 也就是这个人当时在站上看到的语言，收到的信就是哪种语言。
//
// 撮合介绍信是个例外，它的语言不能这么定：那封信由**别人注册**触发，
// 发信那一刻的 locale 是注册者的，不是收件人的。所以它读收件人自己存下来的
// node_cards.locale——信随收件人走，不随触发者走。
export const email = {
  welcome: {
    subject: '🌱 欢迎加入附近森林',
    /** 顶部那行小字，两边都保留品牌名 */
    eyebrow: '附近森林 · Welcome',
    /** 名字是本人填的，不翻；整句写成函数，英文语序和中文不一样 */
    heading: (name: string) => `🌱 ${name}，你已成为森林的一棵树`,
    profileLead: '这是你专属的个人页：',
    linkLead: '下面这条「登录链接」可以让你随时回到个人页编辑信息、查看 AI 为你生成的连接推荐：',
    cta: '点击登录我的节点',
    expiry: '链接 7 天内有效。如未点击就过期，可随时回到 nearby-forest.club/login 重新获取。',
    footer: '这封邮件由 nearby-forest.club 自动发送。',

    // 纯文本版（有些邮件客户端不显示 HTML）
    textGreeting: (name: string) => `欢迎加入附近森林，${name}。`,
    textProfile: (url: string) => `你的个人页：${url}`,
    textLink: (url: string) => `登录链接（7 天内有效）：${url}`,
    textBody: '点击登录链接即可回到个人页继续编辑信息、查看 AI 推荐。',
    textExpiry: '如链接过期，可在 nearby-forest.club/login 重新获取。',
  },


  /** 邮箱验证码登录：把码发过去，人在自己的浏览器里填 */
  /**
   * 邮箱验证码。同一套码用在两个场景，文案必须分开——
   * 注册的人收到「登录验证码」会懵：我还没有账号，登录什么？
   */
  code: {
    login: {
      subject: (code: string) => `${code} 是你的附近森林登录验证码`,
      heading: '你的登录验证码',
      body: '把下面这六位数字填回刚才那个页面，就能登录。',
      expiry: '验证码 10 分钟内有效，只能用一次。',
      ignore: '如果不是你本人在登录，忽略这封信就好。',
      textTitle: '你的附近森林登录验证码',
    },
    verify: {
      subject: (code: string) => `${code} 是你的附近森林邮箱验证码`,
      heading: '确认一下这个邮箱',
      /**
       * 这封信登录页和 phil-coach 浮层共用（都走 /api/login），所以不能提「轻登记」——
       * 那个选择只在浮层里有，登录页验证完是直接进注册向导的。措辞得对两边都成立。
       */
      body: '把下面这六位数字填回刚才的页面。验证后，如果你已注册会直接登录；如果还没注册，会接着带你加入。',
      expiry: '验证码 10 分钟内有效，只能用一次。',
      ignore: '如果不是你本人在操作，忽略这封信就好。',
      textTitle: '你的附近森林邮箱验证码',
    },
    signup: {
      subject: (code: string) => `${code} 是你的附近森林注册验证码`,
      heading: '确认一下这个邮箱',
      body: '把下面这六位数字填回注册页面，你的这棵树就种下了。',
      expiry: '验证码 10 分钟内有效，只能用一次。',
      ignore: '如果不是你本人在注册，忽略这封信就好。',
      textTitle: '你的附近森林注册验证码',
    },
    /** 两个场景共用 */
    textCode: (code: string) => `验证码：${code}`,
    textExpiry: '10 分钟内有效，只能用一次。',
  },

  /**
   * 「有新成员可能和你同频」。由别人注册触发，收件人没主动要过这封信——
   * 所以它必须先说清楚为什么来，再给名片，末尾还要给一条随时能关掉的路。
   */
  peerIntro: {
    subject: (name: string) => `🌱 ${name} 来到了森林，可能和你同频`,
    eyebrow: '附近森林 · 可能值得认识',
    heading: (name: string) => `🌱 ${name} 来到了森林`,
    /** 抬头下面那行，带上收件人自己的名字 */
    lead: (peerName: string) => `${peerName}，这是我们觉得你可能会想认识的人`,
    whyTitle: (name: string) => `为什么把 ${name} 介绍给你`,
    coCreateLabel: '可能一起做的事：',
    cardTitle: 'TA 的节点卡',
    cta: (name: string) => `去看看 ${name} 的主页`,
    /** 为什么不在邮件里直接给微信——口径要和 /creators/[id] 一致 */
    contactNote: '联系方式在 TA 的主页上，登录后可见——我们不在邮件里直接给出别人的微信。',
    whyYou: '你收到这封信，是因为你和 TA 被判断为可能同频。',
    unsubscribe: '不想再收到这类推荐',

    // 卡片字段标签
    fields: {
      name: '名字',
      city: '城市',
      doing: '在做',
      topics: '关注议题',
      experience: '经验与独特性',
      offer: '可以提供',
      seeking: '寻找的连接',
      product: '产品/项目',
    },

    // 纯文本版
    textTitle: '附近森林 · 可能值得认识的人',
    textLead: (peerName: string, name: string) =>
      `${peerName}，${name} 来到了森林，我们觉得你可能会想认识 TA。`,
    textMatchType: (v: string) => `匹配类型：${v}`,
    textWhy: (v: string) => `为什么推荐：${v}`,
    textCoCreate: (v: string) => `可能一起做的事：${v}`,
    textCardTitle: '── TA 的节点卡 ──',
    textCta: (url: string) => `去看看 TA 的主页：${url}`,
    textUnsubscribe: (url: string) => `不想再收到这类推荐：${url}`,
  },
};
