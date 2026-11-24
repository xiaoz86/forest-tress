// 不要加 as const：那会把每个值锁成字面量类型，英文字典就一个字都赋不进去。
//
// 只收「页面框架」的文字。眉标题（eyebrow）、每条分享的标题、简介、标签
// 都存在 Supabase 的 share_content 里，主理人自己编辑——那些走
// content-en.json 那条对照表（scripts/translate-content.mjs 生成），
// 不在这里翻。
export const shares = {
  metaTitle: '社区广场 · 附近森林',
  metaDescription: '附近森林成员发起的活动，和每个人的 Aha Moment：作品、产品、体验与灵感的片段。',

  heroTitle: '更多超级个体的分享',
  heroLede: '有些价值，需要先被人真实地进入。这里会慢慢放下有温度的超级个体带来的作品、产品、活动和体验。',

  /** 社区广场（原「个体创造」）：「发起吧」是各个个人空间里正在报名的活动，「Aha Moment」是下面这套投稿 */
  square: {
    eyebrow: '社区广场',
    title: '看看大家正在发起什么',
    lede: '成员在自己的个人网站空间里发起的活动，和每个人带来的 Aha Moment，都汇在这里。',
    tabEvents: '发起吧',
    tabAha: 'Aha Moment',
    sortLabel: '排序',
    sortNew: '最新',
    sortSoon: '即将开始',
    create: '去创作',
    createAha: 'Aha!',
    createArticle: '写文章',
    createEvent: '发起活动',
    online: '线上活动',
    beijing: '（北京时间）',
    deadline: '报名截止倒计时：',
    free: '免费',
    signedUp: '已报名人数：',
    unlimited: '不限',
    full: '已满，可排队',
    emptyEvents: '广场上还没有正在报名的活动。',
    emptyEventsHint: '发布了个人网站空间的成员，在自己的空间里发起活动，这里就会出现。',
    emptyAha: '还没有 Aha Moment。第一条也许就是你的。',
    hintAha: '分享一个 Aha：一个作品、产品、体验，或者一闪而过的灵感。提交后由创始人团队看过再公开。',
    hintArticle: '只需写下标题和正文。提交后，创始人团队会先审核。',
  },

  submitCta: '带来我的分享',
  backHome: '回到首页',
  manage: '管理分享',

  // 页面最底下那块投稿区。没登录时只显示上面一截，登录后才展开整张表单。
  submit: {
    eyebrow: '带来分享',

    // 没登录
    signInTitle: '先登录你的节点',
    signInBody: '登录后，你可以把自己的作品、产品、体验或一篇文章放进 Aha Moment，等待创始人团队审核。想发起活动，登录后去自己的个人空间。',
    signInCta: '去登录',

    // 登录之后
    title: '把你的片段放进来',
    lede: '可以是作品、产品、活动，也可以是一段体验。它会先进入审核，不会立刻公开。',

    article: {
      title: '写文章',
      body: '正文 · Markdown',
      view: '正文显示方式',
      insertImage: '插入图片',
      insertVideo: '插入视频',
      image: '图片',
      video: '视频',
      uploading: '正在上传…',
      formats: '请选择非空文件：JPG、PNG、WebP 图片最大 10 MB，MP4、WebM 视频最大 50 MB。',
      uploadFailed: '上传失败，请重新选择文件再试一次。',
      loginRequired: '登录已过期，请先保留草稿，再重新登录上传。',
      write: '写作',
      preview: '预览',
      placeholder: '在这里写下或粘贴 Markdown 正文。',
      emptyPreview: '写下正文后，就能在这里查看排版。',
      tooLong: '正文超出字数上限，请缩短后再提交。',
      options: '摘要、标签、外链与附件（可选）',
      summary: '摘要（留空将从正文摘取）',
      missing: '请写下正文，或在下方填写摘要和文章链接。',
      external: '分享已发表的文章，也可以只填摘要和外部链接。',
    },

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
    done: '已收到。创始人团队审核后，会出现在社区广场的 Aha Moment 里。',
    /**
     * 接口只回一个英文错误码（submit-failed 这种），原来直接把它丢在页面上。
     * 投稿人看不懂那种字符串，这里统一换成一句人话。
     */
    failed: '没提交上去，稍后再试一次。',
  },
};
