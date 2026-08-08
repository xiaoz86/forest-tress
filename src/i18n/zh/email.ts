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

  loginLink: {
    subject: '🔐 你的附近森林登录链接',
    heading: '登录到你的节点',
    body: (name: string) => `点击下方按钮，即可登录到 ${name} 的个人页。`,
    cta: '点击登录',
    expiry: '链接 7 天内有效。如果不是你本人申请，请忽略。',
    profileLabel: '个人页：',

    textTitle: '登录到你的节点（附近森林）',
    textLead: '点击下方链接即可登录（7 天内有效）：',
    textIgnore: '如果不是你本人申请，请忽略此邮件。',
    textProfile: (url: string) => `个人页：${url}`,
  },
};
