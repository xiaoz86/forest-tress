import type { about as zhAbout } from '@/i18n/zh/about';

/**
 * /about 的英文。机器初翻后逐句改过，改动的原则记在这儿，免得下次又被"顺"回去：
 *
 * - 中文的长句拆成英文短句。理念那几段尤其明显：一句 60 字的中文摊成英文
 *   会长到读不下去，断开反而更接近中文读起来的呼吸。
 * - 那三段"连接故事"是人说的话，不是文案，所以留口语，别修得太整齐。
 * - avatars 不能直接搬名字：头像是 36px 的圆，塞 "Zhang" 会溢出，改成两个字母。
 */
export const about: typeof zhAbout = {
  metadata: {
    title: 'Where Nearby Forest comes from · Origins, beliefs, and ecology',
    description:
      'Why we made Nearby Forest, what we believe, and how love lets independent individuals connect, flow, and co-create.',
  },

  hero: {
    back: 'Home',
    // 「来处」和「缘起」是两个词，两个 eyebrow 在同一页上下相邻，
    // 都译成 Origins 会看着像复制粘贴。这里留 Origins，下面那个换掉。
    label: 'Origins',
    title: 'Where Nearby Forest comes from',
    subtitle: 'How this forest began, and where it is going.',
  },

  origin: {
    label: 'How it began',
    title: 'Why plant this forest',
    quotes: [
      'AI is changing the world fast. But the faster it moves, the more I find myself going back to a more basic question: what cannot be replaced?',
    ],
    body: [
      'Maybe it is not any one tool. Maybe it is how a person is with other people—how we listen, how we understand, how we build trust, how we empathize, how we work together, and how we hold on to kindness and responsibility in a complicated world.',
      'When I think about what my child will really need as they grow up, it is not a particular skill I picture. It is human qualities—the ability to connect with people, to empathize, and to keep learning, keep judging clearly, keep creating, even when everything around them is changing.',
    ],
    beliefs: [
      'An ecosystem that is connected, loving, and able to keep growing matters enormously—now, and in the future. We can make it real. So an idea took root in me: **to plant a forest again.**',
    ],
    nearby: [
      'For many people today, the "nearby" is disappearing. We have endless contacts, yet very few people we can truly get close to, talk with, or lean on. Losing the nearby is not only a change in space. It is the soil of relationships washing away.',
    ],
    table: [
      // 「既有距离，也有关系」直译成 both distance and connection 很硬。
      // holds people apart and holds them together 同一个动词两个方向，
      // 中文那点意思正好在英文里也成立。这句在理念卡片里复用，保持一致。
      'Hannah Arendt once used the image of a table. A table holds people apart and holds them together. A bookstore, a community space, a salon, one conversation put together with care—each of them is a small table. In a time when talking to each other keeps getting harder, we want to set out some "tables" again, so people can meet again, talk again, and rebuild a little understanding.',
    ],
    signature: {
      name: 'Founder of Nearby Forest',
      // 「创造价值的背后都是爱的一种表达」在署名和理念卡片里各出现一次，
      // 英文用同一句，两处必须一致。
      tagline: 'Behind every act of creating value is an expression of love.',
    },
  },

  philosophy: {
    // 「生态理念」直译 Our beliefs，会和下面的 itemsLabel 撞。
    label: 'How this forest grows',
    titleLines: ['Every tree', 'grows in its own way'],
    paragraphs: [
      'Every tree is unique. It grows at its own pace, in its own way. But no tree grows alone. Underground, out of sight, the roots quietly connect—holding each other up, nourishing each other.',
      'People are the same. Everyone walks a different path. But everyone needs to be understood, and needs to make something with people they trust.',
      'Nearby Forest is trying to do exactly that—help people slow down, meet others on the same wavelength, and turn ideas into something real, together.',
    ],
    highlight:
      'We want technology, especially AI, to help people understand themselves more deeply and get closer to each other—not to replace real encounters between people.',
    itemsLabel: 'Six things this forest believes in',
    items: [
      {
        title: 'Infrastructure of love',
        description:
          'Behind every act of creating value is an expression of love—love passed on, love connecting people. We are making love, kindness, support, and co-creation into something an ecosystem can hold, organize, and pass on.',
      },
      {
        title: 'The disappearing nearby',
        description:
          'We look connected to a lot of people, yet we may not really have a "nearby" at all. We want to replant the soil of relationships, so that understanding, familiarity, trust, and support can grow between people again.',
      },
      {
        title: 'Setting out tables again',
        description:
          'A table holds people apart and holds them together. In a time when talking to each other keeps getting harder, we want to set out some tables again, so real encounters can happen.',
      },
      {
        title: 'Forest ecology',
        description:
          'Every tree grows on its own, but underground the roots are connected and nutrients move between them. A forest does not grow on one tree. It grows because everything in it holds each other up and grows together.',
      },
      {
        title: 'Decentralized co-creation',
        description:
          'An open, decentralized ecosystem. Value flows to the people who genuinely create value and help others. Everyone is a participant and a creator at once.',
      },
      {
        title: 'AI is an assistant, not the center',
        description:
          'Technology helps us find people on the same wavelength and notice what is unique in each other. It makes connection easier. But the heart of a relationship is always a real encounter between two people.',
      },
    ],
  },

  voices: {
    label: 'Stories of connection',
    titleLines: ['In this forest,', 'connection is happening'],
    description:
      'Some connections start with one sentence, really heard. From there they grow into collaboration, companionship, or a new small path.',
    items: [
      {
        // 中文用姓的单字做头像，英文用名字首字母两位——36px 的圆放不下 "Zhang"。
        avatars: ['LX', 'ZY'],
        label: 'Matched by AI',
        text: 'The AI suggested we meet because we both care about community building. Our first call online ran two hours, and it turned out that what each of us was doing fit together. Later we started an urban space renewal project. Collaboration like this—not forced networking, but something that grew on its own—is rare, and precious.',
        names: 'Lin Xiaoxi × Zhang Yuanshan',
        tag: 'Co-creators',
      },
      {
        avatars: ['CS', 'WX'],
        label: 'A small-table conversation',
        // 中文「那三个字」指的是「我理解」——英文 "I understand" 是两个词，
        // 照搬 three words 会当场对不上。
        text: 'At a small-table conversation on "What are you rethinking right now?", I said out loud how lost I felt in the middle of changing careers. I did not expect the person across from me to have been through something similar. She did not give advice. She just listened all the way through, then said, "I understand." Those two words were warmer than any framework.',
        names: 'Chen Siyuan × Wang Xiaoqing',
        tag: 'Mutual support',
      },
      {
        avatars: ['LM', 'ZY'],
        label: 'A reading group',
        text: 'We read one book together over a month in a reading group. Every Wednesday evening the discussion moved from the book into life, from ideas into what we had actually lived. By the time we finished, I had picked up a few friends I could really talk to, without noticing it happen. This, I think, is what "nearby" means.',
        // 「等5人」是连署名的两位一共五人，不是再加五人。
        names: 'Li Minglang × Zhao Yizhou and 3 others',
        tag: 'Reading together',
      },
    ],
  },

  howItWorks: {
    label: 'How it works',
    titleLines: ['From one tree,', 'to a forest'],
    description:
      'Not a process you get pushed through, but the way connection happens on its own time.',
    steps: [
      {
        title: 'Leave a trace of yourself',
        description:
          'You write down what you are working on, the topics you care about, the support you can offer, and the connection you are looking for right now. This is not a profile. These are the root threads you leave behind as you walk into the forest.',
        tags: [],
      },
      {
        title: 'Find the right soil',
        description:
          'Similar topics, similar cities, similar directions of practice gather into small patches of soil. You are not assigned a place. You settle where it fits.',
        tags: ['Topic circles', 'City circles', 'Co-creation groups'],
      },
      {
        title: 'Notice people who resonate',
        description:
          "The AI does one light thing. It brings people into each other's view: people who might be on the same wavelength, who might support each other, who might build something together. The decision to connect still belongs to you.",
        tags: [],
      },
      {
        title: 'Make one move closer',
        description:
          'A greeting, an invitation, a topic you both care about—any of these can bring two strangers a little closer. The nearby is not manufactured. It grows out of one response after another.',
        tags: [],
      },
      {
        title: 'Meet for real',
        description:
          'Online helps people be seen. Offline gives trust a chance to grow. Small-table conversations, city node meetups, co-creation workshops—this is where relationships land in the real world.',
        tags: [],
      },
    ],
  },

  offline: {
    label: 'In person',
    title: 'Let love land in the real world',
    description: 'Online is for finding and connecting. Offline is for trust and growth.',
    items: [
      {
        title: 'Small-table conversations',
        description:
          'A deep conversation for 3–6 people, around one topic. Slow talk. Careful listening. Like sitting at a real table.',
      },
      {
        title: 'City node meetups',
        description: 'In your own city, meet the nodes nearby. Let the "nearby" actually happen.',
      },
      {
        title: 'Themed salons',
        description:
          'Talk and share around a topic everyone cares about. Perspectives collide. Understanding grows.',
      },
      {
        title: 'Reading and learning together',
        description:
          'Read a book together. Explore a field together. Learning side by side, the connection goes deeper.',
      },
      {
        title: 'Micro world café',
        description:
          'A flowing conversation. Switch tables each round. Different people meet, and ideas cross-pollinate.',
      },
      {
        title: 'Co-creation workshops',
        description:
          'Turn ideas into action. Weave separate strengths into one. Make new possibilities together.',
      },
    ],
  },

  weave: {
    label: 'Weaving a net',
    title: 'Let the light keep traveling',
    leadLines: [
      'Nearby Forest is not something one person can build.',
      'It is something many people are building together.',
    ],
    paragraphs: [
      'What I can do is very little: share what I have lived through and what I have learned. If it happens to be useful to someone, that is the best thing I could ask for.',
      'Little by little, let more people find each other. And let this forest grow.',
    ],
    highlight: 'In a world where it is easy to stay apart, bring some people back together.',
  },

  community: {
    label: 'Community ties',
    title: 'The community growing the Nearby Forest ecosystem',
    paragraphs: [
      "This is a nearby of its own—a group for the super-creators who have signed up for Nearby Forest and use it, and who want to grow alongside the community's newest work. A place to gather, and to come closer to one another.",
      'We hope it is a place to come closer to your own nearby and connect with people, and also a place to share ideas 💡 freely.',
      // 中文原文写的就是 PhilCoach，不是 phil-coach，英文照抄不改。
      'And we would love to hear how using PhilCoach and other community work actually feels to you.',
    ],
    contactLabel: 'Contact us',
    contactTitle: 'Start with a real hello',
    contactDescription:
      'If you want to know more, join the community, or tell us how using it has felt, you can add the two founders on WeChat.',
    // 中文读者不用解释微信是什么，zh 那边留空、这一句就不渲染；
    // 英文读者需要，所以这里说清楚这两张码是干什么用的。
    qrNote:
      'WeChat is the messaging app most people in China use. Open it, scan a code, and the founder shows up as a contact.',
    qrXiaozAlt: 'WeChat QR code for adding Xiao Z as a contact',
    qrWendyAlt: 'WeChat QR code for adding Wendy as a contact',
  },

  cta: {
    title: 'Want to put your own tree in this forest?',
    button: 'Plant a tree',
  },

  footer: {
    brand: 'Nearby Forest',
    tagline: 'Let independent individuals connect, flow, and co-create.',
  },
};
