// 不要加 as const：那会把每个值锁成字面量类型，英文字典就一个字都赋不进去。
//
// 节点详情页 /creators/[id] 整屏。英文用户点开欢迎信里的登录链接，落地的就是这一页。
//
// 这一页上「成员自己填的」东西一律不翻：姓名、城市、正在做、经验、
// 可以提供、正在寻找、兴趣爱好、关注议题、作品标题与描述——那些是本人的话。
// 这里只收框架：栏目名、按钮、空状态、错误提示。
export const creatorDetail = {
  metaTitleFallback: '创造者 · 附近森林',
  metaTitle: (name: string) => `${name} · 创造者森林`,
  metaDescriptionFallback: '附近森林的一棵创造者之树',

  backToForest: '创造者森林',
  logout: '退出登录',
  login: '登录',
  /** 只有主理人看得到；名字是真人，不翻 */
  adminView: (name: string) => `管理员视角 · ${name}`,

  // 正文那几栏的标题
  section: {
    doing: '正在做',
    experience: '经验与独特性',
    offer: '可以提供',
    seeking: '正在寻找',
    interests: '兴趣爱好',
    moment: '一个美的时刻',
    create: '想创造或守护的美',
    seed: '心里的那颗种子',
  },

  contact: {
    title: '联系方式',
    /** 本人没填 */
    none: 'TA 还没有留下联系方式。',
    wechat: '微信',
    email: '邮箱',
    /** 没登录的访客看不到 */
    membersOnly: '联系方式只对社区成员可见。',
    membersOnlyHint: '填写一张你自己的节点卡，就能看到。',
    cta: '成为森林的一棵树',
  },

  network: {
    title: (name: string) => `${name} 周围的连接`,
    note: '森林始终只动态展示 9 个节点以内的关系，由近到远，从紧密到弱连接。',
    empty1: '这棵树还没有相邻的连接。',
    empty2: '当更多创造者加入时，关系网会自动生长。',
    aria: '关系网',
    nodeAria: (name: string) => `查看 ${name} 的详情`,
  },

  works: {
    title: '作品 / 项目',
    /** 中间那截是加粗的按钮名，所以拆成三段 */
    emptyBefore: '还没有作品。点下方 ',
    emptyAccent: '+ 添加作品',
    emptyAfter: '，让访客一眼看到你的公众号、播客、产品或服务。',
  },

  joinCta: {
    title: '也想被收进这片森林？',
    button: '成为森林的一棵树',
  },

  footer: {
    brand: '附近森林 · Nearby Forest',
    tagline: '让独立的个体彼此连接、流动、共创',
  },

  /**
   * 撮合徽标。matchType 是数据里的固定值（'同频' | '互补' | '同城'），
   * 不随语言变；这里只管显示成什么。
   */
  matchType: {
    同频: '同频',
    互补: '互补',
    同城: '同城',
  },

  // 注册完那一屏、以及节点页上的「AI 推荐」
  match: {
    found: (count: number) => `为你找到 ${count} 位可能同频的人`,
    foundNote: '基于你的节点信息，从现有森林里找到了这些可能链接的树',
    why: '为何匹配',
    coCreate: '可能共创',
    seeForest: '去看看整片森林',

    // 森林里还没有别人
    firstTitle: '你是这片森林的第一棵树',
    firstLine1: '森林的每一次起始都是如此安静。',
    firstLine2: '期待与后来的创造者在这里相遇。',
    firstCta: '去看看这片森林',

    // 加主理人微信那张卡
    hostTitle: (name: string) => `添加主理人${name}，进入社区群`,
    hostNote: '主理人会把你拉进社区群，让你更快和同频的人连接起来。',
    hostHint: '打开微信 → 添加朋友 → 粘贴微信号',
    copy: '复制',
    copied: '已复制 ✓',

    /**
     * 规则匹配拼出来的理由（大模型没配、返回空或出错时就走这条路）。
     * 中间那串词是成员自己填的议题/擅长，不翻；这里只翻框架。
     */
    reason: {
      sharedTopics: (topics: string) => `共同关注：${topics}`,
      sameCity: (city: string) => `同在 ${city}`,
      theyHelpYou: (words: string) => `TA 可以支持你：${words}`,
      youHelpThem: (words: string) => `你也许能帮到 TA：${words}`,
      /** 列举多个词时的分隔符，中英标点不同 */
      separator: '、',
    },
  },

  ai: {
    /** 括号里那截只有主理人看得到 */
    title: 'AI 为你推荐 · 仅你',
    titleAdmin: '（管理员）',
    titleTail: '可见',
    generatedAt: (time: string) => `生成于 ${time}`,
    generate: '让 AI 现在生成',
    regenerate: '重新生成',
    generating: '生成中…',
    emptyHint: '还没有 AI 推荐。点上方「让 AI 现在生成」按钮，根据你最新的节点信息生成 1-3 位最值得连接的成员。',
    emptyNote: '每次更新完个人资料后都可以重新生成一次。',
    error: {
      forbidden: '没有权限重新生成',
      columnMissing: '数据库尚未升级，请联系管理员',
      failed: '生成失败，请稍后再试',
    },
  },

  // 只有本人（或管理员）看得到的编辑入口
  editor: {
    ownerOnly: '只有你能看到这个编辑入口',
    adminMode: '管理员模式 · 你正在编辑 TA 的个人信息',
    open: '编辑个人信息',
    title: '编辑个人信息',
    saved: '已保存 ✓',
    cancel: '取消',
    save: '保存更改',
    saving: '保存中…',
      skyTitle: '出现在「附近星空」里',
      skyHint:
        '星空把所有人放在同一屏，并且会用 AI 从「优势」「可以提供」「在寻找」里推断谁和谁可以一起做点什么，把结论连同名字一起展示出来。关掉之后你仍然在创造者森林里，只是不出现在那片天上，也不参与这项分析。',
      skyOn: '愿意',
      skyOff: '不进入星空',
    field: {
      name: '名字 *',
      city: '城市',
      doing: '正在做',
      topics: '关注的议题（回车添加）',
      topicsPlaceholder: '如：社区营造、AI、爱与连接...',
      interests: '兴趣爱好',
      experience: '经验与独特性',
      offer: '可以提供',
      seeking: '正在寻找',
      product: '产品 / 项目（旧字段，建议改用作品书架）',
      wechat: '微信号',
      email: '邮箱 *',
      humanHint: '下面三段只会出现在「附近星空」的星光卡上。它们是这张卡里唯一无法被同质化的部分——留白也没关系，但填了就会被看见。',
      moment: '你生命里的一个美的时刻',
      create: '你想创造或守护的美',
      seed: '你心里的那颗种子',
    },
    error: {
      nameRequired: '名字不能为空',
      emailInvalid: '邮箱格式不正确',
      emailTaken: '这个邮箱已被其他成员占用',
      forbidden: '没有编辑权限',
      columnMissing: '数据库尚未升级，请联系管理员',
      nothingToUpdate: '没有改动',
      saveFailed: '保存失败，请稍后再试',
    },
  },

  avatar: {
    uploadAria: '上传形象照',
    changeAria: '更换形象照',
    adminUploadAria: (name: string) => `管理员替 ${name} 上传形象照`,
    adminChangeAria: (name: string) => `管理员替 ${name} 更换形象照`,
    upload: '上传照片',
    change: '更换照片',
    adminUpload: '管理员上传',
    adminChange: '管理员更换',
    uploading: '上传中…',
    hint: '点击上传你的形象照（可选）',
    adminHint: '点击为 TA 上传形象照（管理员）',
    adminNote: '管理员模式 · 点击头像更换',
    error: {
      forbidden: '只能上传你自己的形象照',
      badFileType: '请上传 JPG / PNG / WebP / HEIC 图片',
      fileTooLarge: '图片过大，请压缩到 5MB 以内',
      columnMissing: '数据库尚未升级，请联系管理员',
      missingId: '缺少身份信息',
      missingFile: '没有选中文件',
      uploadFailed: '上传失败，请稍后再试',
      saveFailed: '保存失败，请稍后再试',
    },
  },

  worksEditor: {
    ownerOnly: '只有你能看到这些编辑按钮',
    adminMode: '管理员模式 · 你正在编辑 TA 的作品',
    add: '+ 添加作品',
    newTitle: '新建作品',
    editTitle: '编辑作品',
    published: (count: number) => `已发布 ${count} 条`,
    noImage: '无图',
    noLinkNoDesc: '无链接 · 无描述',
    cancel: '取消',
    saving: '保存中…',
    save: '保存作品',
    saveChanges: '保存更改',
    /** 删除前的确认框 */
    confirmDelete: '删除这条作品？此操作不可撤销。',
    action: { cover: '更换封面', text: '编辑文字', remove: '删除' },
    field: {
      title: '标题',
      titlePlaceholder: '例：1on1 教练服务 / 播客《随机漫步的进化》',
      desc: '描述（可选，1-2 句话）',
      descPlaceholder: '一句话告诉访客这是什么',
      url: '跳转链接（可选）',
      coverNew: '封面图（可选，5MB 内）',
      coverEdit: '封面图（可选，留空则保留原图）',
      pick: '选择图片',
      replace: '更换图片',
      previewAlt: '预览',
    },
    error: {
      forbidden: '只有本人或管理员可以编辑作品',
      missingTitle: '请填写作品标题',
      badUrl: '链接需以 http:// 或 https:// 开头',
      badFileType: '请上传 JPG / PNG / WebP / HEIC 图片',
      fileTooLarge: '图片过大，请压缩到 5MB 以内',
      tooManyWorks: '作品数量已达上限',
      columnMissing: '数据库尚未升级，请联系管理员',
      uploadFailed: '上传失败，请稍后再试',
      saveFailed: '保存失败，请稍后再试',
      nodeNotFound: '找不到这棵树',
      workNotFound: '这条作品不存在或已被删除',
      nothingToUpdate: '没有可更新的内容',
      deleteFailed: '删除失败',
      coverFailed: '更换封面失败',
    },
  },
};
