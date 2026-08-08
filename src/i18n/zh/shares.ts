// 不要加 as const：那会把每个值锁成字面量类型，英文字典就一个字都赋不进去。
//
// 只收「页面框架」的文字。眉标题（eyebrow）、每条分享的标题、简介、标签
// 都存在 Supabase 的 share_content 里，主理人自己编辑——那些走
// content-en.json 那条对照表（scripts/translate-content.mjs 生成），
// 不在这里翻。
export const shares = {
  metaTitle: '林间分享 · 附近森林',
  metaDescription: '附近森林里超级个体的作品、产品、活动与体验片段。',

  heroTitle: '更多超级个体的分享',
  heroLede: '有些价值，需要先被人真实地进入。这里会慢慢放下有温度的超级个体带来的作品、产品、活动和体验。',

  submitCta: '带来我的分享',
  backHome: '回到首页',
  manage: '管理分享',

  // 页面最底下那块投稿区。没登录时只显示上面一截，登录后才展开整张表单。
  submit: {
    eyebrow: '带来分享',

    // 没登录
    signInTitle: '先登录你的节点',
    signInBody: '登录后，你可以把自己的作品、产品、活动或体验放进林间分享，等待创始人团队审核。',
    signInCta: '去登录',

    // 登录之后
    title: '把你的片段放进来',
    lede: '可以是作品、产品、活动，也可以是一段体验。它会先进入审核，不会立刻公开。',

    field: {
      title: '标题',
      tags: '标签（逗号分隔）',
      /** 标签输入框里的示例，不是真的标签 */
      tagsPlaceholder: '作品，体验',
      question: '从哪个问题开始',
      summary: '简短描述',
      note: '补充一句',
      href: '外部链接（可选）',
      media: '主媒体',
      poster: '视频海报（可选）',
    },

    submitting: '提交中',
    submitCta: '提交审核',
    done: '已收到。创始人团队审核后，会出现在林间分享里。',
    /**
     * 接口只回一个英文错误码（submit-failed 这种），原来直接把它丢在页面上。
     * 投稿人看不懂那种字符串，这里统一换成一句人话。
     */
    failed: '没提交上去，稍后再试一次。',
  },
};
