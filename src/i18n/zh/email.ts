// 不要加 as const：那会把每个值锁成字面量类型，英文字典就一个字都赋不进去。
//
// 只收**发给用户本人**的两封信：注册后的欢迎信、重新申请的登录链接。
// 其余几封（新成员通知、投稿待审、phil-coach 反馈、付款截图）都是发给主理人的，
// 收件人只有中文使用者，一律留在 notify.ts 里写死中文，不进这里。
//
// 语言按发信那一刻的 locale 走（cookie 优先，其次来源国家）——
// 也就是这个人当时在站上看到的语言，收到的信就是哪种语言。
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
};
