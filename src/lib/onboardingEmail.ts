/**
 * 「附近森林致你的一封信」——注册后收到的那封长信。
 *
 * 中英两版都是创始人自己写的，不是互译。这里只做排版，不改她们的话。
 * 改文案请直接改下面 ZH / EN 两个对象里的字符串，不要绕道 AI 重写或互翻——
 * 这封信的价值就在于它是人写的，两种语言各有各的语气。
 *
 * 邮件客户端（尤其 Outlook 和 QQ 邮箱）对 CSS 支持很差：
 * 全部用内联样式，不用 flex / grid / 变量，宽度写死 600px。
 */
import { EMAIL_FONT, EMAIL_FONT_LINK, EMAIL_SERIF } from '@/lib/emailTheme';
import type { Locale } from '@/lib/locale';

const SITE = 'https://nearby-forest.club';

/**
 * 这封信走站上的「人文内容」那一栈（--font-serif），不走主字体：
 * 它和宣言、理念、创造者故事、冥想文案是同一类东西，不是界面。
 *
 * 字体必须写在每一个出文字的元素上，不能只写在 <body> 上等继承。
 * Outlook（Windows）用 Word 的排版引擎，凡是自己没声明 font-family 的元素
 * 一律重置成 Times New Roman；Gmail 也会剥掉一部分 body 级样式。
 * 所以下面每个样式常量都自带 F。
 */
const F = `font-family:${EMAIL_SERIF};`;

/**
 * 按钮上的字仍走主字体。站上把按钮划归 UI（--font-sans），不划归人文内容——
 * 一颗小圆角按钮里塞衬线字，字重一上去就糊。正文是信，按钮是界面。
 */
const F_UI = `font-family:${EMAIL_FONT};`;

type Section = {
  heading: string;
  /** 段落。字符串里可以带 <strong> / <br> / <a href="…">，其余一律纯文本 */
  paragraphs: string[];
  /** 段末那颗按钮（可选） */
  link?: { label: string; href: string };
  /**
   * 小节内部再分块，每块可以自己带一颗按钮。
   *
   * 03「向内生长，也向外连接」一节里有三条路（冥想 / 21 天睡眠 / 创造者），
   * 各自要一颗按钮，单个 link 装不下。用 groups 就不必把它拆成三个编号小节，
   * 主理人写的是一节，读者看到的也该是一节。
   */
  groups?: { paragraphs: string[]; link?: { label: string; href: string } }[];
};

type Letter = {
  subject: string;
  /** 头图上的大标题和那行副题 */
  h1: string;
  tagline: string;
  greeting: (name: string) => string;
  intro: string[];
  /** 竖线引出来的那句 */
  quote: string;
  /** 登录区块：只有新注册的人才会看到 */
  loginCta: string;
  loginNote: string;
  sections: Section[];
  /** 「向内生长，也向外连接」那一段 */
  /**
   * 「向内生长，也向外连接」那一块。
   * 中文版主理人把它并进了编号小节（03），所以中文这里是空的；
   * 英文版仍是结尾的独立一块。两版各自成文，不强行对齐。
   */
  bothWays?: { heading: string; paragraphs: string[]; cta: { label: string; href: string } };
  /** 早期说明 + 邀请反馈 */
  earlyDays: string[];
  /** 「写在最后」那种小标题。中文版有，英文版仍是直接接段落，所以可选 */
  earlyDaysHeading?: string;
  /** 「也许是一次认识」那种换行列举 */
  maybes: string[];
  feedback: string[];
  /** 结尾四句英文口号，两版共用 */
  motto: string;
  farewell: string;
  signature: { brand: string; founderLabel: string; founder: string; coFounderLabel: string; coFounder: string; contactLabel: string };
  /** 纯文本版里的分隔线标题 */
  textBothWays: string;
  textLoginPrefix: (link: string) => string;
};

// ──────────────────────────────────────────────────────────────
// 中文（主理人 2026-08-14 改版：七个编号小节收成四个，冥想 / 21 天睡眠 /
// AI 撮合并进 03 一节；新增不编号的「从一件小事开始」；结尾接上共创社群）
// ──────────────────────────────────────────────────────────────
const ZH: Letter = {
  subject: '附近森林致你的第一封信｜走进自我，分享创造，相遇同行人 🌳',
  h1: '欢迎来到附近森林 🌳',
  tagline: '走进自我，分享创造，相遇同行人',
  greeting: name => (name ? `嗨，亲爱的创造者${name}：` : '嗨，亲爱的创造者：'),
  intro: [
    '欢迎来到「附近森林」。🌳',
    '如果你已经注册了这里，也许你会好奇：<strong>附近森林究竟可以用来做什么？</strong>',
    '也许我们表面看来它像个展示个人主页、发布作品的平台网站。如果是这样，也许忽视了发现它的可能性，诚挚的邀请你走近来，并通过接下来给你的一封信向你展开。我们相信会在这样一片真正的森林里相遇。',
  ],
  quote: '<strong>希望这封信，将会成为是你走进这片森林的开始探索的地图。</strong>',
  loginCta: '进入我的节点',
  loginNote: `链接 7 天内有效。过期了可以到 ${SITE}/login 重新获取。`,
  sections: [
    {
      heading: '🌱 01｜种下属于你的「一棵树」',
      paragraphs: [
        '在附近森林，每一位创造者都可以拥有自己的个人空间。',
        '你可以介绍和分享自己，也可以逐渐发布和管理自己正在创造的事情：作品、项目、服务、活动、课程，或者一个刚刚萌芽的想法。',
        '如果你是一名教练，可以发布自己的教练服务与预约；如果你正在组织一场线下活动，可以向外分享，让森林里的伙伴发现并参与；如果你正在创造产品、内容、课程或其他作品，也可以慢慢找到它在这可能的生长方式。',
        '<strong>它不需要一开始就很完整。</strong>',
        '你可以把这里当作一棵正在生长的树——随着你不断变化，它也和你一起生长。',
      ],
    },
    {
      // 标题整行已经是粗体，里面再套 <strong> 会被 escape() 打成字面标签。
      heading: '💬 02｜PhilCoach：一个随时可以聊聊的 ACC+ Virtual Coach',
      paragraphs: [
        '我们也希望附近森林始终有一位生态「伙伴」能够陪伴每个人<strong>回到自己</strong>。',
        '目前已经上线的 <strong>PhilCoach</strong>，是我们找到的一种陪伴方式。它是一个融合了<strong>知心伙伴 × Life Coach × 导师</strong>角色的虚拟教练（非 AI 教练）。',
        '当你面对一个暂时想不清楚的问题、一段情绪、职业与人生选择，或者只是某个晚上突然很想找个人聊聊时，都可以打开 PhilCoach。',
        '它不会只是急着给你一个标准答案。我们更希望它能够陪你梳理正在发生的事情，通过提问、回应与对话，帮助你慢慢看见：<strong>我真正关心的是什么？现在困住我的是什么？我有哪些还没有看见的可能性？下一步，我真正愿意做什么？</strong>',
        '有时候，我们需要的并不是更多答案。而是一个空间，让自己重新听见自己。<strong>因为凡流经你的，也终将留驻于你。</strong>',
        '希望透过陪伴和向内探寻的对话，能与你一起探索关于我们生命中那些真正重要的东西，新的发现与新的可能性，一起探索关于心灵、正在经历的人生与爱的课题。愿每一次对话，都能陪伴我们更加真实地认识自己，也在这片森林里，和自己的空间里度过一个美好的时光。',
      ],
      link: { label: '打开 PhilCoach', href: `${SITE}/phil-coach` },
    },
    {
      /**
       * 主理人把冥想、21 天睡眠、AI 撮合三块并进了这一节（原来是 04 / 05 / 06 三个编号小节）。
       * 一节里有三条路、各要一颗按钮，所以用 groups 而不是拆成三节。
       */
      heading: '🧘 03｜向内生长，也向外连接',
      paragraphs: ['你可以把附近森林理解为两个方向：'],
      groups: [
        {
          paragraphs: [
            '<strong>🧘 向内——回到自己。</strong>',
            '如果 PhilCoach 是一位陪伴对话的虚拟教练伙伴，那在平凡的日常里，能否再走进一步？呼吸，也许是我们向内看见和连接感受的桥梁。',
            '诚然，我们正在逐渐整理和设计不同主题的正念与冥想练习，希望它不只是一个「冥想音频库」，而是能够在不同生活状态下，陪伴你找到适合自己的练习。',
            '当你感到疲惫、焦虑、脑子停不下来，或者只是想在一天结束的时候重新回到身体，都可以来到这里。哪怕只有几分钟。',
            '<strong>暂停一下，呼吸一下，重新感受自己。</strong>',
          ],
          link: { label: '去正念冥想空间', href: `${SITE}/meditations` },
        },
        {
          paragraphs: [
            '<strong>🌙 21 天改善睡眠冥想陪伴</strong>',
            '睡眠，是我们每天都需要却常常被忽略的事情。这也是我们最近特别想认真陪伴大家的一件事。',
            '它不是要求你必须「完成 21 天打卡」的挑战，而更像是一段温和的陪伴：每天睡前，留一点时间给自己。通过呼吸、身体放松、正念觉察和不同主题的睡前冥想，慢慢回到生命的本然与休息的存在状态。',
            '我们希望这 21 天带来的，不只是「更快睡着」。更重要的是：<strong>让身体慢慢知道——一天可以结束了，我可以暂时放下，安心休息。</strong>',
            '如果你最近睡前思绪很多、工作结束后很难真正停下来，或者想重新建立更稳定的睡眠与休息习惯，都可以从这里开始。',
          ],
          link: { label: '走进 21 天睡眠陪伴', href: `${SITE}/meditations?category=sleep` },
        },
        {
          paragraphs: [
            '<strong>✨ 向外——走进森林。</strong>',
            '可以以怎样的方式打开这张地图，或许你可以从建立自己的创造者主页，分享作品与正在做的事情，通过 AI 和社区发现同频伙伴，找到你属于你的线索，让真实的相遇、连接与共同创造发生，成为你开始生长的起点。',
            'AI 伙伴「小芽」的身影正融入附近森林，是社区中非常重要的一个部分。',
            '随着越来越多创造者加入，小芽会基于大家公开的个人介绍、兴趣、正在做的事情、作品与需求，持续寻找森林里<strong>可能真正值得彼此认识的人</strong>。',
            '她不会只告诉你：「你们兴趣相似。」而会进一步尝试回答：<strong>为什么推荐你们认识？你们之间有哪些共同点？彼此可能带来什么价值？有没有什么值得一起聊聊，甚至共同创造的事情？</strong>',
            '也许你正在做一个项目，而森林里刚好有人拥有你需要的经验；也许两个人做着完全不同的事情，却有相似的价值观；也许你发布了一场活动，恰好有人一直在寻找这样的体验。',
            '一次 AI 推荐，可能最后变成一次咖啡、一场合作、一个共同项目，或者一段长期同行的关系。',
            '<strong>我们希望 AI 做的，不是替代人与人的连接，而是让那些原本可能擦肩而过的人，更容易看见彼此。</strong>',
            '而且，这张关系地图会持续生长。随着新的创造者来到森林，以及大家不断更新自己的状态、作品和正在做的事情，AI 也会重新理解这片森林，为你发现<strong>此刻与你距离更近、可能值得认识的人。</strong>',
          ],
          link: { label: '去看看森林里的创造者', href: `${SITE}/creators` },
        },
      ],
    },
    {
      heading: '🌿 04｜让你的创造，被真正需要它的人看见',
      paragraphs: [
        '我们正设计，让 AI 也可以逐渐帮助附近森林的创造者理解：<strong>谁可能对我的作品感兴趣？哪些人正在寻找我能够提供的东西？大家对哪些内容、活动或服务更感兴趣？我的创造正在回应怎样的真实需求？</strong>',
        '当你发布教练服务、课程、活动、作品或项目时，我们希望附近森林不只是提供一个「发布入口」。未来，它也能够逐渐帮助你理解需求、发现潜在参与者，并促成真实的报名、体验、合作与连接。',
        '值得被更多人看见的线下活动和创造，我们也会通过附近森林进行 <strong>Highlight</strong> 与分享。',
      ],
    },
    {
      /** 这一节没有编号：它不是又一项功能，是「现在就可以做的第一件事」 */
      heading: '🗺️ 从一件小事开始',
      paragraphs: [
        '一个人可以是一棵完整的树。但当根系开始相遇，我们也许会发现：<strong>原来，我们身旁还有和我们一样的同路人，及可以共创的同盟伙伴。</strong>',
        '如果你已经来到附近森林，现在可以从一件很小的事情开始：',
        '· <strong>完善你的创造者主页</strong>，让别人知道你是谁、你关心什么、正在创造什么<br>· <strong>体验一次 PhilCoach 对话或冥想</strong>，给自己一点向内的空间<br>· 或者，<strong>去看看森林里的其他创造者</strong>——也许某个人正在做的事情，刚好与你产生奇妙的交集',
      ],
    },
  ],
  earlyDaysHeading: '写在最后',
  earlyDays: [
    '附近森林目前仍然很早期。我们还会继续迭代 AI 连接、创造者作品与活动、个性化推荐、PhilCoach 与冥想体验，也正在为之后的<strong>小程序版本</strong>做准备。',
    '所以，你现在看到的不是一个已经完成的样子。<strong>更像是一片刚刚开始生长的森林。</strong>而你，是最早来到这里、种下一棵树的人之一，希望我们可以让你知道，当你完成注册时也并不是结束，而才刚刚开始进入，你可以找到伙伴，我们会在<a href="https://nearby-forest.club/about#contact">社区生态生长共创社群</a>里相聚连接，相信会继续生长出新的可能性。',
  ],
  /** 主理人这一版把「也许是一次认识…」那组换行列举撤掉了，留空即不渲染 */
  maybes: [],
  feedback: [
    '我们也很希望听见你的声音。如果你在使用附近森林、PhilCoach、正念冥想，或者参与 21 天改善睡眠冥想陪伴的过程中，有任何感受、想法、建议，甚至只是一个突然冒出来的 💡 Idea，都欢迎来找我们聊聊。',
    '<strong>这片森林并不是由我们设计完成之后，再交给大家使用。</strong>我们更希望，它是在每一个来到这里的人参与、反馈、连接与创造的过程中，<strong>一起慢慢长出来的。在陪伴大家的同时，她也和大家一样，正生长出不一样的可能性。</strong>',
  ],
  motto: 'Grow your own way.<br>Be seen.<br>Find your people.<br>Create together.',
  farewell: '愿我们在森林里相遇。🌳',
  signature: {
    brand: '附近森林 · Nearby Forest',
    founderLabel: '创始人 / Founder',
    founder: '<strong style="color:#2a2a2a;">小 Z</strong>（曾华青）',
    coFounderLabel: '联合创始人 / Co-Founder',
    coFounder: '<strong style="color:#2a2a2a;">Wendy</strong> Wu',
    contactLabel: '关于 & 联系我们 & 加入森林社群：',
  },
  textBothWays: '向内生长，也向外连接',
  textLoginPrefix: link => `进入我的节点（7 天内有效）：${link}`,
};

// ──────────────────────────────────────────────────────────────
// English（主理人自己写的一版，不是中文那版的翻译）
// ──────────────────────────────────────────────────────────────
const EN: Letter = {
  subject: 'A Letter from Nearby Forest｜Look Within. Share What You Create. Meet Your People.',
  h1: 'A Letter from Nearby Forest 🌳',
  tagline: 'Look Within. Share What You Create. Meet Your People.',
  greeting: name => (name ? `Dear ${name},` : 'Dear Creator,'),
  intro: [
    'Welcome to <strong>Nearby Forest</strong>. 🌳',
    'If you’ve already joined us, you may be wondering: <strong>What exactly can I do here?</strong>',
    'Nearby Forest is not meant to be just another platform for creating a profile or showcasing your work. We imagine it as a living forest —',
  ],
  quote: '<strong>a place where each of us can grow in our own way, look within, reach out to others, be seen, build meaningful connections, and create something new together.</strong>',
  loginCta: 'Enter my node',
  loginNote: `The link is valid for 7 days. If it expires, get a new one at ${SITE}/login.`,
  sections: [
    {
      heading: '🌱 01 | Plant Your Own Tree',
      paragraphs: [
        'Every creator in Nearby Forest has a space of their own.',
        'Here, you can introduce who you are and gradually share what you are creating — your work, projects, services, events, courses, or even an idea that is just beginning to take shape.',
        'If you are a coach, you can share your coaching services and invite people to book a session. If you are hosting an offline event, you can share it with the forest and invite others to join. If you are building a product, creating content, developing a course, or working on something meaningful to you, you can let it grow here.',
        '<strong>It doesn’t have to be perfect or complete.</strong>',
        'Think of your space as a tree that is still growing. As you change, explore, and create, it can grow with you.',
      ],
    },
    {
      heading: '✨ 02 | Let AI Help Meaningful Connections Happen',
      paragraphs: [
        'This is one of the most important ideas behind Nearby Forest.',
        'As more creators join the community, AI will learn from the public profiles, interests, projects, work, and needs people choose to share. It will then help discover <strong>people in the forest who may genuinely be worth meeting.</strong>',
        'Instead of simply saying: “You have similar interests,” we want AI to go a little further: <strong>Why might the two of you want to meet? What do you have in common? What might you bring to each other? What could you explore, talk about, or even create together?</strong>',
        'Perhaps you are building a project and someone in the forest has exactly the experience you need. Perhaps two people work in completely different fields but share the same values. Perhaps you publish an event, and someone else has been looking for exactly that kind of experience.',
        'One AI recommendation might eventually become a coffee conversation, a collaboration, a new project, or even a long-term friendship.',
        '<strong>We don’t want AI to replace human connection. We want it to help people who might otherwise pass each other by actually find one another.</strong>',
        'And this map of relationships will never be static. As new creators enter the forest, and as people update their profiles, work, interests, and what they are currently exploring, AI will continue to rediscover the forest around you — helping you find the people who may be closest to where you are right now.',
      ],
    },
    {
      heading: '🌿 03 | Let Your Work Be Seen by the People Who Need It',
      paragraphs: [
        'Over time, AI will also help creators better understand: <strong>Who might be interested in what I create? Who is looking for something I can offer? What kinds of content, events, or services are people interested in? What real needs might my work be responding to?</strong>',
        'When you share a coaching service, course, event, project, or piece of work, we hope Nearby Forest can become more than simply a place to publish it. We want it to gradually help you understand people’s needs, discover potential participants, and turn online discovery into real conversations, registrations, experiences, collaborations, and connections.',
        'We will also <strong>highlight and share meaningful events and creations</strong> with the wider Nearby Forest community.',
      ],
    },
    {
      heading: '💬 04 | PhilCoach — An AI Virtual Coach You Can Talk To',
      paragraphs: [
        'Connection with others matters. But so does the relationship we have with ourselves.',
        'That is why we created <strong>PhilCoach</strong>, now available in Nearby Forest. PhilCoach is an AI virtual coach that brings together the qualities of a <strong>trusted companion × life coach × advisor × mentor</strong>.',
        'You can come to PhilCoach when you’re facing a question you haven’t figured out yet, moving through difficult emotions, thinking about your career or life direction, or simply wanting someone to talk to at the end of the day.',
        'Rather than rushing to give you a ready-made answer, PhilCoach is designed to help you slow down, explore what is happening, and ask: <strong>What truly matters to me? What is holding me back right now? What possibilities haven’t I seen yet? What is one next step I genuinely want to take?</strong>',
        'Sometimes, what we need is not another answer. <strong>We need a space where we can hear ourselves again.</strong>',
      ],
      link: { label: 'Open PhilCoach', href: `${SITE}/phil-coach` },
    },
    {
      heading: '🧘 05 | Meditation — A Quiet Space to Come Back to Yourself',
      paragraphs: [
        'Our meditation space is also now available in Nearby Forest.',
        'We are gradually creating and organizing mindfulness and meditation practices for different moments in life. Rather than building just another library of meditation audio, we hope to help each person find practices that fit what they are actually experiencing.',
        'When you feel tired or overwhelmed, when your mind refuses to slow down, or when you simply want to reconnect with your body at the end of the day, you can come here. Even for just a few minutes.',
        '<strong>Pause. Breathe. Come back to yourself.</strong>',
      ],
      link: { label: 'Enter the meditation space', href: `${SITE}/meditations` },
    },
    {
      heading: '🌙 06 | 21 Days of Sleep Meditation & Gentle Support',
      paragraphs: [
        'Sleep is another part of life we want to care for with intention. That is why we are introducing our <strong>21-Day Sleep Meditation Journey</strong> in Nearby Forest.',
        'It is not a challenge that asks you to complete 21 perfect days or keep up with another daily streak. Think of it instead as <strong>21 days of gentle companionship.</strong>',
        'Each night, you give yourself a little time before sleep. Through breathing, body relaxation, mindful awareness, and guided sleep meditations, you can gradually discover a bedtime rhythm that feels right for you.',
        'Our hope is not simply to help you “fall asleep faster.” It is to help your body gradually recognize: <strong>The day is over. I can let go for now. I can rest.</strong>',
        'If your mind tends to stay busy at night, if you find it difficult to truly switch off after work, or if you simply want to rebuild a healthier rhythm of rest, this can be a gentle place to begin.',
      ],
      link: { label: 'Begin the 21-day journey', href: `${SITE}/meditations?category=sleep` },
    },
  ],
  bothWays: {
    heading: '🌳 Grow Inward. Connect Outward.',
    paragraphs: [
      'You can think of Nearby Forest as growing in two directions.',
      '<strong>Inward — come back to yourself.</strong> Through PhilCoach, mindfulness practices, and the 21-Day Sleep Meditation Journey, explore yourself more deeply, care for your inner world, and rediscover your own rhythm.',
      '<strong>Outward — step into the forest.</strong> Build your creator profile, share what you are making, discover people through AI and the community, and allow meaningful connections and co-creation to happen.',
      'A single tree can grow beautifully on its own. But when roots begin to meet beneath the surface, perhaps we discover something else: <strong>We don’t have to build everything alone.</strong>',
      'If you’ve already joined Nearby Forest, you can begin with something small.',
      '· <strong>Complete your creator profile.</strong> Let the forest know who you are, what you care about, and what you are creating.<br>· <strong>Have a conversation with PhilCoach or try a meditation.</strong> Give yourself a little space to look inward.<br>· Or simply <strong>wander through the forest and discover other creators.</strong> Someone you haven’t met yet may be creating something that unexpectedly connects with your own journey.',
    ],
    cta: { label: 'Wander through the forest', href: `${SITE}/creators` },
  },
  earlyDays: [
    'Nearby Forest is still at a very early stage. We will continue developing AI-powered connections, creator projects and events, personalized recommendations, PhilCoach, and meditation experiences. We are also preparing a <strong>Mini Program version</strong> to make the forest easier to access and explore.',
    'What you see today is not a finished platform. <strong>It is a forest that has only just begun to grow.</strong> And you are one of the first people to plant a tree here.',
    'We are curious to see what might emerge as more warm-hearted creators become visible and connected — and as AI helps us discover relationships that might otherwise remain unseen.',
  ],
  maybes: [
    'Maybe it begins with a conversation.',
    'Maybe an event.',
    'Maybe a project created together.',
    'Or maybe, at a particular moment in your life, you simply meet someone who truly gets you.',
  ],
  feedback: [
    'We would also love to hear from you. If you have any thoughts, feedback, suggestions, or even a small 💡 idea while exploring Nearby Forest, PhilCoach, our meditation practices, or the 21-Day Sleep Meditation Journey, please come and talk to us.',
    '<strong>We don’t want to finish building this forest and then hand it over to everyone.</strong> We hope it will grow through the participation, feedback, connections, and creations of everyone who enters it.',
  ],
  motto: 'Grow your own way.<br>Be seen.<br>Find your people.<br>Create together.',
  farewell: 'See you somewhere in the forest. 🌳',
  signature: {
    brand: 'Nearby Forest · 附近森林',
    founderLabel: 'Founder',
    founder: '<strong style="color:#2a2a2a;">Rowan</strong> (HuaQing Zeng)',
    coFounderLabel: 'Co-Founder',
    coFounder: '<strong style="color:#2a2a2a;">Wendy</strong>',
    contactLabel: 'About · Contact Us · Join the Forest Community:',
  },
  textBothWays: 'Grow Inward. Connect Outward.',
  textLoginPrefix: link => `Enter my node (valid for 7 days): ${link}`,
};

const LETTERS: Record<Locale, Letter> = { zh: ZH, en: EN };

export function onboardingSubject(locale: Locale): string {
  return LETTERS[locale].subject;
}

/** 兼容旧调用点：默认中文 */
export const ONBOARDING_SUBJECT = ZH.subject;

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 段落里允许 <strong>、<br> 和 <a href="…">，其余尖括号转义。
 *
 * 这些字符串全是这个文件里写死的，不接任何外部输入，所以放行这几个标签
 * 不构成注入面。href 里的 & 已经被 escape 成 &amp;——那正是 HTML 属性里
 * 该有的写法，浏览器和邮件客户端都会解回原样。
 */
function richText(s: string): string {
  return escape(s)
    .replace(/&lt;strong&gt;/g, '<strong>')
    .replace(/&lt;\/strong&gt;/g, '</strong>')
    .replace(/&lt;br&gt;/g, '<br>')
    .replace(/&lt;strong style="color:#2a2a2a;"&gt;/g, '<strong style="color:#2a2a2a;">')
    .replace(/&lt;a href="([^"]+)"&gt;/g, `<a href="$1" style="color:#2d4a2d;font-weight:600;${F}">`)
    .replace(/&lt;\/a&gt;/g, '</a>');
}

const P = `margin:0 0 14px;font-size:15px;line-height:1.95;color:#2a2a2a;${F}`;
const MUTED = `margin:0 0 14px;font-size:15px;line-height:1.95;color:#4a4a4a;${F}`;
const BTN =
  `display:inline-block;padding:10px 22px;background:#2d4a2d;color:#fff;text-decoration:none;border-radius:999px;font-weight:600;font-size:14px;${F_UI}`;
/** 小节标题。字重 700，栈里 Manrope 只到 700，正好 */
const H2 = `margin:0 0 14px;font-size:17px;font-weight:700;color:#2d4a2d;line-height:1.5;${F}`;

const btnHtml = (l: { label: string; href: string }) =>
  `<p style="margin:16px 0 0;${F}"><a href="${l.href}" style="${BTN}">${escape(l.label)} →</a></p>`;

function sectionHtml(s: Section): string {
  const body = s.paragraphs.map(p => `<p style="${P}">${richText(p)}</p>`).join('\n      ');
  const link = s.link ? btnHtml(s.link) : '';
  // 小节内部的分块之间留一条淡分隔线，读者才看得出「这是同一节里的另一条路」
  const groups = (s.groups || [])
    .map(
      g => `
      <div style="margin-top:22px;padding-top:20px;border-top:1px solid rgba(45,74,45,0.10);">
        ${g.paragraphs.map(p => `<p style="${P}">${richText(p)}</p>`).join('\n        ')}
        ${g.link ? btnHtml(g.link) : ''}
      </div>`,
    )
    .join('');
  return `
    <tr><td style="padding:26px 32px 0;">
      <h2 style="${H2}">${escape(s.heading)}</h2>
      ${body}
      ${link}
      ${groups}
    </td></tr>`;
}

/**
 * @param name      成员自己填的称呼，用于抬头
 * @param locale    收信人的语言
 * @param magicLink 登录链接。**只给新注册的人带**——他们刚建号，需要一个回去的门。
 *                  群发已有成员时一律不传：他们早就能登录，再放一个按钮是多余的。
 */
export function buildOnboardingHtml(name: string, locale: Locale, magicLink?: string): string {
  const t = LETTERS[locale];
  const greeting = escape(t.greeting(name.trim()));

  const loginBlock = magicLink
    ? `
    <tr><td style="padding:22px 32px 0;">
      <div style="border:1px solid rgba(45,74,45,0.16);border-radius:14px;padding:18px 20px;background:#f7faf5;">
        <a href="${magicLink}" style="${BTN}">${escape(t.loginCta)}</a>
        <p style="margin:10px 0 0;font-size:12px;color:#8a8a8a;${F}">${escape(t.loginNote)}</p>
      </div>
    </td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="${locale === 'en' ? 'en' : 'zh-CN'}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(t.subject)}</title>
${EMAIL_FONT_LINK}</head>
<body style="margin:0;padding:24px 12px;background:#f0f5ec;font-family:${EMAIL_SERIF};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 4px 28px rgba(26,46,26,0.08);">

    <!--
      Logo 单独占一条米色带，不压在下面那片深绿上：这张 PNG 自带米色底，
      放在深绿渐变里会是一块突兀的米色方砖，而圆角在 Outlook 桌面版不生效，
      指望 border-radius 把它磨圆是靠不住的。带子的底色取的就是图自己的
      #f5f1e8——只有两边严丝合缝，那个方块的边才看不出来。

      用 PNG 不用站上那两个 SVG——Gmail、Outlook、QQ 邮箱都不渲染 SVG。
      /apple-icon.png 是 Next 的 metadata 路由，线上已经是可直接取的 200，
      不依赖这次部署。宽高写死：图没加载出来时，占位不会把版面撑塌。
      默认屏蔽图片的客户端会显示 alt——所以 logo 不承载任何必要信息。
    -->
    <tr><td style="padding:26px 32px;background:#f5f1e8;text-align:center;">
      <img src="${SITE}/apple-icon.png" width="64" height="64" alt="附近森林"
        style="display:inline-block;width:64px;height:64px;border:0;outline:none;text-decoration:none;">
    </td></tr>

    <tr><td style="padding:26px 32px 24px;background:linear-gradient(135deg,#2d4a2d,#4a7c4a);color:#fff;">
      <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:0.75;margin-bottom:8px;${F}">附近森林 · Nearby Forest</div>
      <h1 style="margin:0;font-size:22px;font-weight:700;line-height:1.45;${F}">${escape(t.h1)}</h1>
      <p style="margin:10px 0 0;font-size:14px;line-height:1.8;opacity:0.85;${F}">${escape(t.tagline)}</p>
    </td></tr>

    <tr><td style="padding:28px 32px 0;">
      <p style="${P}">${greeting}</p>
      ${t.intro.map(p => `<p style="${P}">${richText(p)}</p>`).join('\n      ')}
      <p style="${MUTED}border-left:3px solid rgba(45,74,45,0.28);padding-left:16px;">${richText(t.quote)}</p>
    </td></tr>
${loginBlock}
${t.sections.map(sectionHtml).join('\n')}

    ${t.bothWays ? `<tr><td style="padding:30px 32px 0;">
      <hr style="border:none;border-top:1px solid rgba(45,74,45,0.12);margin:0 0 24px;">
      <h2 style="${H2}">${escape(t.bothWays.heading)}</h2>
      ${t.bothWays.paragraphs.map(p => `<p style="${P}">${richText(p)}</p>`).join('\n      ')}
      <p style="margin:18px 0 0;"><a href="${t.bothWays.cta.href}" style="${BTN}">${escape(t.bothWays.cta.label)} →</a></p>
    </td></tr>` : ''}

    <tr><td style="padding:26px 32px 0;">
      <hr style="border:none;border-top:1px solid rgba(45,74,45,0.12);margin:0 0 22px;">
      ${t.earlyDaysHeading ? `<h2 style="${H2}">${escape(t.earlyDaysHeading)}</h2>` : ''}
      ${t.earlyDays.map(p => `<p style="${P}">${richText(p)}</p>`).join('\n      ')}
      ${t.maybes.length ? `<p style="${MUTED}">${t.maybes.map(escape).join('<br>')}</p>` : ''}
      ${t.feedback.map(p => `<p style="${P}">${richText(p)}</p>`).join('\n      ')}
    </td></tr>

    <tr><td style="padding:26px 32px 0;text-align:center;">
      <div style="border-radius:14px;background:#f7faf5;padding:20px;">
        <p style="margin:0;font-size:15px;line-height:2;font-weight:600;color:#2d4a2d;${F}">
          ${t.motto}
        </p>
      </div>
      <p style="margin:18px 0 0;font-size:15px;color:#2a2a2a;${F}">${escape(t.farewell)}</p>
    </td></tr>

    <tr><td style="padding:26px 32px 30px;">
      <hr style="border:none;border-top:1px solid rgba(45,74,45,0.12);margin:0 0 20px;">
      <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#2d4a2d;${F}">${escape(t.signature.brand)}</p>
      <p style="margin:10px 0 0;font-size:13px;line-height:1.9;color:#6a6a6a;${F}">
        ${escape(t.signature.founderLabel)}<br>${t.signature.founder}
      </p>
      <p style="margin:8px 0 0;font-size:13px;line-height:1.9;color:#6a6a6a;${F}">
        ${escape(t.signature.coFounderLabel)}<br>${t.signature.coFounder}
      </p>
      <p style="margin:16px 0 0;font-size:13px;color:#6a6a6a;${F}">
        ${escape(t.signature.contactLabel)}<a href="${SITE}/about#contact" style="color:#2d4a2d;${F}">${SITE}/about#contact</a>
      </p>
    </td></tr>

  </table>
</body>
</html>`;
}

/** 纯文本版：去掉标签，但链接不能丢——把 href 摊在文字后面的括号里 */
const strip = (s: string) =>
  s
    .replace(/<a href="([^"]+)">([^<]*)<\/a>/g, '$2（$1）')
    .replace(/<\/?strong[^>]*>/g, '')
    .replace(/<br>/g, '\n');

/** 纯文本版：有些客户端不显示 HTML，也让反垃圾评分好看一些 */
export function buildOnboardingText(name: string, locale: Locale, magicLink?: string): string {
  const t = LETTERS[locale];
  const lines: string[] = [t.greeting(name.trim()), ''];
  for (const p of t.intro) lines.push(strip(p), '');
  lines.push(strip(t.quote));
  if (magicLink) lines.push('', t.textLoginPrefix(magicLink));

  for (const s of t.sections) {
    lines.push('', '─────────────────────', s.heading, '');
    for (const p of s.paragraphs) lines.push(strip(p), '');
    if (s.link) lines.push(`${s.link.label}: ${s.link.href}`);
    for (const g of s.groups || []) {
      lines.push('');
      for (const p of g.paragraphs) lines.push(strip(p), '');
      if (g.link) lines.push(`${g.link.label}: ${g.link.href}`);
    }
  }

  if (t.bothWays) {
    lines.push('', '─────────────────────', t.textBothWays, '');
    for (const p of t.bothWays.paragraphs) lines.push(strip(p), '');
    lines.push(`${t.bothWays.cta.label}: ${t.bothWays.cta.href}`, '');
  }
  lines.push('', '─────────────────────');
  if (t.earlyDaysHeading) lines.push(t.earlyDaysHeading, '');
  for (const p of t.earlyDays) lines.push(strip(p), '');
  if (t.maybes.length) lines.push(...t.maybes, '');
  for (const p of t.feedback) lines.push(strip(p), '');
  lines.push(
    '',
    strip(t.motto),
    t.farewell,
    '',
    t.signature.brand,
    `${t.signature.founderLabel} ${strip(t.signature.founder)}`,
    `${t.signature.coFounderLabel} ${strip(t.signature.coFounder)}`,
    `${t.signature.contactLabel}${SITE}/about#contact`,
  );
  return lines.join('\n');
}
