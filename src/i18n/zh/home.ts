// 首页文案。原样从各个 section 里搬出来的，一个字都没改。
//
// 不要加 as const：那会把每个值锁成字面量类型，英文字典就一个字都赋不进去。
//
// 几个带 {占位符} 的句子是给客户端组件用的：那几段话里夹着人名和数字，
// 不能在服务端拼好，所以留成模板，由组件自己填。
//
// 装饰用的汉字符号（见 / 遇 / 生 / 息 / 伴 …）中英文都保留：
// 它们是 aria-hidden 的图形，和导航里那套符号是同一套，不跟着语言变。
export const home = {
  /** 浏览器标签页和搜索结果里的标题、描述 */
  metaTitle: '附近森林 · 生态社区',
  metaDescription:
    '让独立的个体彼此连接，流动，让附近生长。一个关于连接、对话、支持、共创与持续生长的生态社区。',

  hero: {
    titleLead: '连接万千',
    titleAccent: '有温度',
    titleTail: '的超级创造者',
    taglineTop: '我们既发现自己的无限可能，也被看见',
    taglineBottom: '在相遇中共同创造与成长',
    lede: '让正在独立做事的人，找到真正同行的伙伴。',
    chips: ['呼吸', '看见', '同频', '相遇', '共创', '生长'],
    cta: '走进这片森林',
  },

  value: {
    headingTop: '不是再认识更多人，',
    headingBottom: '而是遇见真正与你有关的人。',
    items: [
      {
        index: '01 · BE SEEN',
        symbol: '见',
        title: '被看见',
        body: '让别人看见的不只是你的身份，而是你正在投入的事情、积累的能力与真实的需要。',
      },
      {
        index: '02 · MEET NEARBY',
        symbol: '遇',
        title: '遇见同频',
        body: '从共同关心的议题出发，找到能够理解你，也可能与你形成互补的人。',
      },
      {
        index: '03 · GROW TOGETHER',
        symbol: '生',
        title: '共同生长',
        body: '一次对话、一个小组或一场共创，都可以让一颗种子真正向前生长一步。',
      },
    ],
  },

  entrances: {
    heading: '从适合你的那条小径进入。',
    items: [
      {
        icon: '息',
        title: '林间探索',
        body: '从正念声音、身心放松与自我关怀开始，把注意力重新带回此刻。',
        cta: '进入「林间探索」',
      },
      {
        icon: '伴',
        title: '回到自己',
        body: '一个会记得你的虚拟陪伴教练 phil-coach，支持你整理感受、看见选择，并找到下一步。',
        cta: '开始一次对话',
      },
      {
        icon: '见',
        title: '遇见附近',
        body: '浏览创造者节点，通过同频推荐、小桌子对话和主题活动认识彼此。',
        cta: '看看创造者森林',
      },
      {
        icon: '创',
        title: '个体创造',
        body: '让你的课程、内容、活动、作品或项目被看见，并找到可以支持它的人。',
        cta: '看看正在生长的事',
      },
    ],
  },

  creators: {
    headingTop: '森林里，已经有人',
    headingBottom: '在做这些事。',
    lede: '每一个节点都来自一个真实的人。你可以看见他们正在创造什么、能够提供什么，以及此刻希望遇见怎样的伙伴。',
    link: '进入创造者森林',
    showcase: {
      growing: '森林里正在生长',
      cityFallback: '附近',
      topicFallback: '创造者',
      seeking: '正在寻找',
      matchTitle: '一次可能值得开始的相遇',
      /** {a} {b} 是两个人的名字，{focus} 由下面两条之一填进来 */
      matchBody: '{a} 与 {b} 都在{focus}，森林会把这样的两个人放到彼此附近。',
      matchFocusTopic: '关注「{topic}」',
      matchFocusPlain: '做真实的事',
      /** 轮播圆点的无障碍标签，{n} 是第几组 */
      groupLabel: '看第 {n} 组创造者',
    },
  },

  paths: {
    headingTop: '连接不必用力，',
    headingBottom: '让关系沿着适合自己的速度生长。',
    steps: [
      {
        n: '01',
        title: '种下节点',
        body: '写下你正在做的事、关心的议题、可以提供与正在寻找的内容。',
      },
      {
        n: '02',
        title: '被彼此看见',
        body: '森林根据议题、方向与互补能力，推荐值得认真认识的人。',
      },
      {
        n: '03',
        title: '开始对话',
        body: '从一个具体问题开始，不急着交换资源，也不需要表演自己。',
      },
      {
        n: '04',
        title: '长出事情',
        body: '一次支持、一场活动、一件作品，或一个可以共同推进的项目。',
      },
    ],
    unfold: '摊开这四步',
    fold: '折回去',
  },

  stories: {
    heading: '有些连接，已经开始发生。',
    lede: '不是每次相遇都要变成合作。被认真听见、找到可以交流的人，本身也是附近重新出现的方式。',
    items: [
      {
        type: 'AI MATCH · 共创伙伴',
        quote:
          '我们因为都关注社区营造被 AI 推荐认识。第一次线上聊了两个小时，发现彼此在做的事情竟然可以互补。后来一起发起了一个城市空间改造项目。这种不是刻意社交、而是自然生长出来的合作，特别珍贵。',
        footer: '林小溪 × 张远山 · 从共同关心社区营造开始',
      },
      {
        type: 'SMALL TABLE · 彼此支持',
        quote:
          '在一次「此刻你在重新思考什么」的小桌子对话里，我说出了自己正在转型的迷茫。没想到对面的人也经历过类似的阶段。她没有给建议，只是认真地听完，然后说「我理解」。那三个字比任何方法论都温暖。',
        footer: '陈思源 × 王晓晴 · 一次关于转型的小桌子对话',
      },
      {
        type: 'READING GROUP · 共读共学',
        quote:
          '我们在共读小组里一起读了一个月的书。每周三晚上的讨论，从书里聊到生活，从观点聊到经历。读完那本书的时候，我发现自己不知不觉多了几个真正可以聊天的朋友。这就是附近吧。',
        footer: '李明朗 × 赵一舟 等 5 人 · 每周三晚上的共读',
      },
    ],
    /**
     * 引号跟着语言走，不能写死在组件里：
     * 中文用直角引号，英文用弯引号——「」套在英文句子外面很难看。
     */
    quoteOpen: '「',
    quoteClose: '」',
    /** 关系网那块：中间夹着最新加入的人的名字和一个数字，所以拆成三截 */
    networkLabelTop: '连接 · 共振',
    networkLabelBottom: '关系网络',
    networkLead: '这是 ',
    networkMid: ' 加入后，森林里浮现出的 ',
    networkTail: ' 棵可能相遇的树。',
    networkLink: '看看整片森林 →',
  },

  origin: {
    heading: '每个人都可以有自己的生长方式。',
    body: '附近森林不是一个只用来展示自己的橱窗，也不是另一个需要经营人设的社交广场。我们希望它是一片可以安顿自己、认识真实的人，也让正在做的事继续生长的空间。',
    quoteTop: '每一棵树都是独立的，',
    quoteBottom: '而根系在看不见的土地深处彼此连接。',
    link: '阅读附近森林的来处 →',
    /** 首页那颗理念片按钮和播放浮层 */
    film: {
      cta: '观看理念片',
      ariaOpen: '观看附近森林理念片',
      ariaClose: '关闭理念片',
      close: '关闭',
      /** 浮层顶部两行：品牌名 + 副题 */
      brand: '附近森林',
      subtitle: '理念片',
    },
  },

  join: {
    heading: '每一棵树，都从一颗种子开始',
    lede: '把正在发芽的自己，轻轻放进森林',
    /** 中间那截是加粗的 phil-coach，所以拆成三段 */
    benefitsLead: '种下后你会拥有：自己的节点卡与同频伙伴 AI 推荐、',
    benefitsAccent: '个性化 phil-coach',
    benefitsTail: '——记得你的专属虚拟陪伴教练，以及更多正在生长的服务',
    cta: '成为一棵树',
    ctaAria: '展开节点卡填写表单',
    loginLead: '填一张节点卡即加入森林；这也是注册。已经加入过了？',
    loginLink: '用邮箱登录',
    collapse: '收起表单',

    /**
     * 7 步注册向导（JoinForm）。
     *
     * topics 特别注意：这十二个标签的**中文值会入库**（node_cards.topics），
     * 之后原样显示在 /creators 的卡片上，和成员自己填的城市、简介混在一起。
     * 所以入库一律取 dict('zh') 那份中文，字典这里只负责「显示成什么语言」。
     * 英文用户选了 Health / Body-mind，存进去的仍是「健康 / 身心」，
     * 中文访客看到的还是中文——否则同一片森林里会半中半英。
     */
    wizard: {
      progress: (total: number) => `${total} 步完成你的节点卡，让森林看见你`,
      stepAria: (n: number) => `第 ${n} 步`,

      topics: {
        health: '健康 / 身心',
        lifeEd: '生命教育',
        aesthetics: '美学 / 设计',
        mindfulness: '正念 / 冥想',
        psychology: '心理 / 教练',
        content: '内容创作',
        business: '向善商业',
        community: '社区运营',
        family: '亲子 / 家庭',
        tech: 'AI / 技术',
        craft: '手作 / 花艺',
        reading: '阅读 / 写作',
      },

      step1: {
        title: '你是谁?',
        subtitle: '让森林里的人认识你',
        name: '你的名字 / 昵称',
        namePlaceholder: '怎么称呼你',
        city: '你在哪座城市',
        cityPlaceholder: '例如:沈阳、北京、成都',
        intro: '用一句话介绍自己',
        introPlaceholder: '你可以说说你现在在做什么、你关心什么、或者你是一个怎样的人',
      },

      step2: {
        title: '你的种子属于哪片土壤?',
        subtitle: '选择你关注的领域，可多选（最多 6 个）',
        hint: '至少选 1 个，最多 6 个',
      },

      step3: {
        title: '你想在森林里……',
        subtitle: '你的经验，你能提供的，你在寻找的',
        experience: '你的经验、优势与独特性',
        experiencePlaceholder: '你在哪些领域有经验?你的独特优势是什么?',
        offer: '你可以为别人提供什么?',
        offerPlaceholder: '例如:我可以分享正念冥想的经验、提供品牌设计咨询、组织读书会……',
        seek: '你正在寻找什么样的连接?',
        seekPlaceholder: '例如:想找一起共创线下活动的伙伴、想认识做生命教育的人、想被更多人看见我的手作产品……',
      },

      step4: {
        title: '你生命里的「美」是什么?',
        subtitle: '在附近森林，美不是标准答案，而是你真切的体验',
        /** 三句一组，中间要换行，所以分开写不要拼 */
        prose1: '美是甘甜的味道，是喝茶喝美了的那一刻。',
        prose2: '美是见识的多元，是走过不同的地方之后眼睛里装下的东西。',
        prose3: '美来自直觉、来自于心，脱离同质化，是你生命里那些无法被复制的真切体验。',
        /** 那一排小词，纯装饰 */
        words: { w1: '甘甜', w2: '多元', w3: '直觉', w4: '真切', w5: '不可复制' },
        /** 四张灵感卡，只展示不入库 */
        cards: {
          taste: { label: '一个味道', body: '清晨第一口茶的甘甜' },
          scene: { label: '一个画面', body: '黄昏时路边摊冒出的热气' },
          moment: { label: '一个瞬间', body: '陌生城市里一次偶遇的对话' },
          feeling: { label: '一种感受', body: '做完一件事后的安静满足' },
        },
        moment: '你生命中一个「美」的时刻——',
        momentPlaceholder: '一杯茶、一段路、一个人、一件事……什么让你觉得，这就是美?',
        create: '你想创造或守护的「美」是什么?',
        createPlaceholder: '也许是一个产品、一种体验、一个空间、一种生活方式……',
        hobby: '兴趣爱好',
        hobbyPlaceholder: '工作之外让你心动的事，如:徒步、烘焙、爵士乐、独立电影……',
        /** 提交时给两段回答各加的前缀，会跟着答案一起入库 */
        momentPrefix: '「时刻」',
        createPrefix: '「想创造或守护」',
      },

      step5: {
        title: '你心里的那颗种子是什么?',
        subtitle: '一个梦想、一个念头、一个还没开始的计划——都可以',
        placeholder: '例如:我想做一个关于生命教育的播客 / 我想开一间社区花店 / 我想把十年的瑜伽经验做成一门课 / 我还不确定，但我想找到方向……',
      },

      step6: {
        title: '你的作品 / 项目集（可选）',
        subtitle: '公众号、播客、产品、服务都可以 · 加入后会显示在你的个人页书架上',
        workNo: (n: number) => `作品 #${n}`,
        removeWork: (n: number) => `删除作品 ${n}`,
        titlePlaceholder: '标题（如:1on1 教练服务 / 播客《随机漫步的进化》）',
        descPlaceholder: '一句话描述（可选）',
        urlPlaceholder: '跳转链接（可选，https://...）',
        addFirst: '+ 添加你的第一个作品',
        addMore: '+ 再加一条',
        max: (n: number) => `最多 ${n} 条 · 加入后还能在个人页继续添加`,
        skip: '不知道写什么也可以直接跳过 —— 加入后随时可以在个人页添加和换封面。',
        cover: {
          add: '添加封面图（可选）',
          hint: '建议横版 16:9 · ≤ 5MB',
          replace: '点击更换',
          remove: '移除封面',
          uploadAria: (n: number) => `上传作品 ${n} 的封面`,
          changeAria: (n: number) => `更换作品 ${n} 的封面`,
          previewAlt: (n: number) => `作品 ${n} 封面预览`,
        },
      },

      step7: {
        title: '怎么联系你?',
        subtitle: '森林会用邮箱给你寄欢迎信和登录链接',
        photo: '形象照（可选）',
        photoUploadAria: '上传形象照',
        photoChangeAria: '更换形象照',
        photoAlt: '预览',
        photoHint: '上传一张你愿意被看见的照片',
        photoSpec: 'JPG / PNG / WebP / HEIC · ≤ 5MB',
        email: '邮箱',
        emailPlaceholder: '登录链接 / 通知会发到这里',
        emailHint: '必填 · 你之后用它找回个人页',
        wechat: '微信号（可选）',
        wechatPlaceholder: '方便森林里的人加你',
      },

      prev: '← 上一步',
      next: '下一步 →',
      lastStep: '最后一步 · 留下联系方式 →',
      submit: '🌱 种下我的种子',
      submitting: '正在种下…',

      done: {
        title: '你的种子已经种下了',
        sent: (email: string) => `欢迎邮件 + 登录链接正在发往 ${email}。`,
        sentHint: '请留意收件箱和垃圾邮件夹，点开链接即可继续编辑。',
        /** 节点建好了但信没发出去 */
        mailFailed: '节点已经建立，但欢迎邮件暂时未能送出。',
        mailFailedHint: (email: string) => `请稍后到登录页输入 ${email}，重新获取登录链接。`,
        /**
         * 只有从 phil-coach 的对话里被拦下来、跑完这七步的人才看得到这两句。
         * 那段对话一直在他自己的浏览器里存着，回去是原样的——把这件事说出来，
         * 他才敢点，不然会怕一走就没了。
         */
        backToCoach: '回到刚才的对话',
        backToCoachHint: '那段话还在，回去接着说就好。',
      },

      error: {
        emailTaken: '这个邮箱已经在森林里了。直接到 /login 输入它就能找回你的节点。',
        emailInvalid: '请填一个有效的邮箱。',
        submitFailed: '提交失败，请稍后重试',
        network: '网络异常，请稍后再试',
        badImage: '请上传 JPG / PNG / WebP / HEIC 图片',
        imageTooLarge: '图片过大，请压缩到 5MB 以内',
      },

      /** 走完七步之后的验证：确认这个邮箱确实是本人的，验过了才建号 */
      verify: {
        title: '最后一步：确认邮箱',
        sentTo: (email: string) => `验证码已发到 ${email}`,
        hint: '10 分钟内有效。没收到就看看垃圾邮件夹。',
        placeholder: '六位验证码',
        cta: '🌱 种下我的种子',
        verifying: '正在种下…',
        resend: '重新发送',
        resendIn: (seconds: number) => `${seconds} 秒后可重新发送`,
        back: '改一下邮箱',
        error: {
          code: '验证码不对，或者已经过期了。可以重新发送一个。',
          send: '没发出去，稍后再试一次。',
        },
      },
    },
  },

  footer: {
    tagline: '让独立的个体彼此连接、流动、共创。',
    about: '附近森林的来处',
    creators: '创造者森林',
    copyright: '© 2026 附近森林生态社区',
  },
};
