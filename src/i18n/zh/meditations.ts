// 不要加 as const：那会把每个值锁成字面量类型（'具体的声音' 而不是 string），
// 英文字典就一个字都赋不进去。键的完整性由 typeof 检查，值要保持 string。
//
// 只收「页面框架」的文字。分类名、音频标题、简介、阶段（stage）都存在 Supabase 的
// meditation_content 里，代码里翻不了——英文用户看到的是英文框架 + 中文内容。
export const meditations = {
  metaTitle: '林间呼吸 · 附近森林',
  metaDescription: '附近森林的主题冥想与声音练习。',

  backHome: '← 回到首页',
  backToAll: '← 所有声音',

  /** 一条小径下面有几段声音。英文要分单复数，所以写成函数而不是拼接。 */
  soundCount: (count: number) => `${count} 段声音`,
  /** 一段都还没有时，胶囊里换成这句 */
  soundsComing: '声音开放中',
  /** 影像专题下面有几支。量词不一样，不能拿 soundCount 顶着用。 */
  filmCount: (count: number) => `${count} 支影片`,
  filmsComing: '影像开放中',

  // 声音林（/meditations 不带参数时的列表页）
  grove: {
    eyebrow: 'Sounds of the Forest',
    guided: {
      eyebrow: 'Guided',
      title: '引导冥想',
      note: '有人声带着走。随时挑一段，按自己的节奏听。',
    },
    program: {
      eyebrow: 'Program',
      title: '睡眠-系列',
      note: '有次序的一整段旅程。一周一周走，不急着走完。',
    },
    ambient: {
      eyebrow: 'Ambient',
      title: '声音',
      note: '没有引导。手碟、颂钵、雨声，放着就好。',
    },
    film: {
      eyebrow: 'Seeing',
      title: '看见',
      // 这一组不是「视频区」，也不专属节气：人物、自然、练习、创作、
      // 社区纪录都会往里放。所以这句话说的是「用影像看」，不是「有视频」。
      note: '用影像看人和世界。人物、自然、练习、创作、节气、社区纪录。',
    },
  },

  // 走进某一条小径之后的通用文字
  category: {
    otherPaths: 'Other Paths',
    listenEyebrow: 'Listen',
    listenTitle: '具体的声音',
    empty: '这一条小径还在生长。等新的声音出现，会安静地放进来。',
    sourceEyebrow: '来源与特色',
    benefitsEyebrow: '可能带来的变化',
  },

  // 单段声音的卡片
  card: {
    /** 后台没填阶段时封面左上角那个标签 */
    stageFallback: '声音',
    ready: '可收听',
    coming: '开放中',
    /** 只给读屏用，标题本身还是后台存的中文 */
    open: (title: string) => `打开${title}`,
  },

  // 陪伴营（kind === 'program'）的界面
  program: {
    /** 封面右边那行小字。分类名来自后台，所以整句写成函数 */
    series: (label: string, total: number) => `${label} · 系列 ${total} 节`,
    /** 顶部总进度 */
    progress: (done: number, total: number) => `${done} / ${total} 段`,
    /** 周块右上角。已解锁的周只显示数字，不带量词 */
    phaseProgress: (done: number, total: number) => `${done} / ${total}`,
    /** 还没解锁的周：说清楚要听完几段才开 */
    phaseLocked: (count: number, need: number) =>
      `${count} 段 · 上一周听完 ${need} 段后开放`,
    free: '免费',
    /** 这一段还没上传音频 */
    coming: '开放中',
    notes: '感悟',
    /** 只给读屏用 */
    play: (title: string) => `播放${title}`,
    audioFailed: '这段声音暂时没能打开，刷新页面再试一次',
    // 吸底那条
    dock: {
      claimPending: '已经开好了。主理人对完收款记录就转正，一般当天。',
      paid: '选一段开始听。听到八成就算走完。',
      unlockTitle: (total: number) => `解锁完整 ${total} 段`,
      unlockSub: '一次付清，之后随时回来听',
      unlockCta: '立即解锁',
    },
  },

  // 纯声音（kind === 'ambient'）
  ambient: {
    empty: '这一片声音还在收集。等新的进来，会安静地放进去。',
    note: '没有人说话。放着就好，做别的事也可以。',
    /** 列表行末尾那个 ∞ 的 title */
    loopable: '可循环',
    looping: '循环播放中',
    once: '播完即停',
    loopToggle: '∞ 循环',
  },

  // 影像（kind === 'film'）。有画面，所以看法和听不一样：
  // 一支一支放，配一条完整一年的节气路线。
  film: {
    eyebrow: 'Seeing',
    /** 影片列表上方那个衬线小标题，对应引导冥想那屏的「具体的声音」 */
    listTitle: '具体的影像',
    empty: '这个专题的影像还在做。第一支放进来的时候，会安静地出现在这里。',
    /** 选中的这支正好是此刻的节气时，标一下 */
    thisTerm: '本期',
    /** 播放器下面那条节气路线 */
    termsEyebrow: 'Twenty-four terms',
    termsTitle: '一整年的路线',
    /** 节气条上标当下位置的那个点 */
    now: '此刻',
    /** 还没做的那些节气，停上去说这句 */
    notYet: '还没到',
    /** 影片还没传上来 */
    coming: '影像开放中',
    /** 只给读屏用，标题本身还是后台存的中文 */
    watch: (title: string) => `播放${title}`,
    videoFailed: '这支影像暂时没能打开，刷新页面再试一次',
    // 分享。手机上先叫系统面板，叫不出来就退成复制链接
    share: '分享',
    shareCopied: '链接已复制',
    /** 剪贴板也用不了时（微信里常见），把链接摆出来让人自己长按复制 */
    shareManual: '复制不了，长按下面这行自己复制',
    /** 节气条左边那一列 */
    season: { spring: '春', summer: '夏', autumn: '秋', winter: '冬' },
  },

  // 引导冥想卡片底下的播放器
  audio: {
    failed: '这段声音暂时没能打开，刷新页面再试一次。',
    coming: '这段声音正在开放中',
    writeNote: '写下感悟',
    noteCount: (count: number) => `${count} 条感悟`,
  },

  // 听后感悟
  notes: {
    placeholder: '听完之后，心里剩下什么？',
    anonymousToggle: '匿名发布',
    /**
     * 勾没勾匿名各显示一句完整的话。
     * 不要拆成「会带上你的名字」+「，所有人可见」两段拼——
     * 英文的语序和中文不一样，拼出来会散架。
     */
    asAnonymous: '会显示为「森林里的一个人」，所有人可见',
    asNamed: '会带上你的名字，所有人可见',
    publishing: '发布中',
    publish: '写下感悟',
    loading: '正在读…',
    empty: '还没有人写下感悟。',
    withdraw: '撤回',
    /** 匿名者的显示名 */
    anonName: '森林里的一个人',
    /** 「登录」是个链接，所以句子拆成前后两截 */
    signInPrompt: { link: '登录', after: ' 之后可以写下自己的感悟。' },
    time: {
      justNow: '刚刚',
      minutes: (n: number) => `${n} 分钟前`,
      hours: (n: number) => `${n} 小时前`,
      days: (n: number) => `${n} 天前`,
      date: (y: number, m: number, d: number) => `${y}.${m}.${d}`,
    },
    error: {
      tooMany: '这一段你已经写了 5 条，先歇一歇。',
      tooLong: (max: number) => `最多 ${max} 字。`,
      notLoggedIn: '需要先登录。',
      locked: '这一段还没解锁。',
      failed: '没发出去，过一会再试。',
    },
  },

  // 解锁与付款。钱走支付宝收款码，付完回来传一张截图。
  unlock: {
    loading: '正在读…',
    /** 还锁着几段 */
    lockedCount: (n: number) => `还有 ${n} 段`,
    headline: '注册附近森林，解锁完整旅程',
    signUpCta: '注册并解锁',
    haveAccount: '已注册？登录',
    requestCta: '我要解锁',
    busy: '处理中',

    // 申请之后、主理人确认之前的那一段
    badge: {
      waiting: '等待确认',
      proofReceived: '已收到截图',
      /** 传了截图、权限已经先开出去了 */
      openedNow: '已开通 · 等核对',
    },
    title: {
      openedNow: '三周的声音已经开好了',
      proofReceived: '截图收到了，等主理人确认',
      toPay: (yuan: string) => `支付宝扫码付 ¥${yuan}，然后传张截图`,
    },
    body: {
      openedNow: '截图已经发给主理人了。对着收款记录核一眼就转正，通常当天；万一对不上会驳回，原因会写在这里。',
      judgedBefore: '上一次的申请被驳回过，所以这次要等主理人对完账再开，通常当天。',
    },

    qrAlt: '支付宝收款码',
    qrCaption: '支付宝扫码',
    /** 三步说明。第二步不再重复「当场就能听」——按钮旁边已经有一句了 */
    steps: {
      pay: (yuan: string) => `1. 支付宝扫码付 ¥${yuan}`,
      upload: '2. 回来传一张付款截图',
      confirm: '3. 主理人对完收款记录，这一单就转正',
    },
    /** 收款码没配好时的兜底，中间夹着一个指向 /about#community 的链接 */
    noQr: {
      before: '收款码还没配好。可以先到',
      link: '生态社区',
      after: '页加主理人微信，把付款截图发过去。',
    },

    uploadCta: '付好了，传张截图',
    uploadAgain: '换一张截图',
    uploading: '收到了，正在打开…',
    uploadHint: '传完当场就能听',
    proofPrivacy: '截图只有主理人看得到，用来和收款记录核对。',

    // 被驳回
    rejected: {
      badge: '未通过',
      title: '这次申请没有通过',
      retry: '重新申请',
    },

    error: {
      notLoggedIn: '需要先登录。',
      createFailed: '没能创建申请，过一会再试。',
      badFileType: '只收图片（jpg / png / webp）。用手机截图再试一次。',
      fileTooLarge: '图太大了（8MB 以内），压一下再传。',
      tooSoon: '刚传过一张，等一分钟再换。',
      /** 钱已经付出去了，这里不能只说「再试」就没了下文 */
      uploadFailed: '没能传上去。再试一次；还是不行就到「生态社区」页加主理人微信，把截图直接发过去。',
      uploadNetwork: '没能传上去，过一会再试。',
    },
  },
};
