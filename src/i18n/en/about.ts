import type { about as zhAbout } from '@/i18n/zh/about';

export const about: typeof zhAbout = {
  metadata: {
    title: 'Where Nearby Forest comes from · Origins, beliefs, and ecology',
    description:
      'Why we built Nearby Forest, what we believe in, and how independent individuals connect, flow, and co-create with love.',
  },

  hero: {
    back: 'Home',
    label: 'Origins',
    title: 'Where Nearby Forest comes from',
    subtitle: 'Where this forest comes from, and where it is going.',
  },

  origin: {
    label: 'Origins',
    title: 'Why plant this forest',
    quotes: [
      'AI is changing the world fast. But the faster it moves, the more I find myself returning to a deeper question: what cannot be replaced?',
    ],
    body: [
      'Maybe it is not a tool. Maybe it is how one person meets another—how we listen, how we understand, how we build trust, how we empathize, how we collaborate, and how we hold on to kindness and responsibility in a complicated world.',
      'When I think about what my child will truly need as they grow up, I do not picture a specific skill. I picture human qualities—the ability to connect, to empathize, to keep learning, to keep making good judgments, and to keep creating, even when everything around them is shifting.',
    ],
    beliefs: [
      'An ecosystem that is connected, loving, and able to keep growing—this matters deeply, now and in the future. We can make it real. So an idea took root in me: **to plant a forest again.**',
    ],
    nearby: [
      'For many people today, the "nearby" is disappearing. We have endless contacts, yet very few people we can truly be close to, talk with, or lean on. The loss of the nearby is not just about physical space. It is the erosion of the soil where relationships grow.',
    ],
    table: [
      'Hannah Arendt once used the image of a table. A table creates both distance and connection between people. A bookstore, a community space, a salon, a conversation held with real care—they are all like small tables. In a time when real dialogue feels harder and harder, what we want to do is set out some tables again. So people can meet again, talk again, and slowly rebuild a little understanding.',
    ],
    signature: {
      name: 'Founder of Nearby Forest',
      // 中文“创造价值的背后都是爱的一种表达”在 origin 和 philosophy 里各出现一次，
      // 英文保持同一句，确保两处一致。
      tagline: 'Behind every act of creating value is an expression of love.',
    },
  },

  philosophy: {
    label: 'Our beliefs',
    titleLines: ['Every tree', 'grows in its own way.'],
    paragraphs: [
      'Every tree is unique. It grows at its own pace, in its own way. But no tree truly grows alone. Underground, out of sight, the roots quietly connect—holding each other up, nourishing each other.',
      'People are the same. Everyone walks a different path, yet everyone needs to be understood, and to do something together with people they trust.',
      'Nearby Forest is an attempt to do exactly that—to help people slow down, meet others on a similar wavelength, and turn ideas into something real, together.',
    ],
    highlight:
      'We want technology, especially AI, to help people understand themselves more deeply and draw closer to one another—not to replace the real, human encounter.',
    itemsLabel: 'Six things this forest believes in',
    items: [
      {
        title: 'Infrastructure of love',
        description:
          'Behind every act of creating value is an expression of love, a passing-on of care. We are building an ecosystem that can hold, organize, and carry love, kindness, support, and co-creation.',
      },
      {
        title: 'The disappearing nearby',
        description:
          'We seem connected to so many people, yet we may not truly have a "nearby." We want to replant the soil of relationships, so that understanding, familiarity, trust, and support can grow between people again.',
      },
      {
        title: 'Setting out tables again',
        description:
          'A table creates both distance and connection. In a time when real dialogue feels harder and harder, we want to set out some tables again, so that real encounters can happen.',
      },
      {
        title: 'Forest ecology',
        description:
          'Every tree grows on its own, but underground the roots are connected, and nutrients flow. A forest does not grow because of one tree. It grows because the whole ecology supports and grows together.',
      },
      {
        title: 'Decentralized co-creation',
        description:
          'An open, decentralized ecosystem. Value flows to those who genuinely create value and help others. Everyone is both a participant and a creator.',
      },
      {
        title: 'AI as an assistant, not the center',
        description:
          'Technology helps us discover people on a similar wavelength and see each other’s unique value, making connection easier. But the heart of any relationship is always the real, human encounter.',
      },
    ],
  },

  voices: {
    label: 'Stories of connection',
    titleLines: ['In this forest,', 'connection is already happening.'],
    description:
      'Some connections begin with one moment of truly being heard, and then slowly grow into collaboration, companionship, or a new small path.',
    items: [
      {
        avatars: ['Lin', 'Zhang'],
        label: 'Matched by AI',
        text: 'We were introduced by the AI because we both care about community building. Our first online chat lasted two hours, and we realized our work could complement each other. Later we launched an urban space renewal project together. This kind of collaboration—not forced networking, but something that grew naturally—is especially precious.',
        names: 'Lin Xiaoxi × Zhang Yuanshan',
        tag: 'Co-creators',
      },
      {
        avatars: ['Chen', 'Wang'],
        label: 'A small-table conversation',
        text: 'During a small-table conversation on "What are you rethinking right now?", I shared the disorientation I felt while making a career shift. I did not expect the person across from me to have gone through a similar phase. She did not offer advice. She just listened, carefully, and then said, "I understand." Those three words were warmer than any framework or method.',
        names: 'Chen Siyuan × Wang Xiaoqing',
        tag: 'Mutual support',
      },
      {
        avatars: ['Li', 'Zhao'],
        label: 'A reading group',
        text: 'We read a book together for a month in a reading group. Every Wednesday evening, the discussion moved from the book into life, from ideas into personal experience. By the time we finished the book, I realized I had quietly gained a few friends I could truly talk with. This is what "nearby" feels like.',
        names: 'Li Minglang × Zhao Yizhou and 4 others',
        tag: 'Reading and learning together',
      },
    ],
  },

  howItWorks: {
    label: 'How it works',
    titleLines: ['From one tree,', 'to a forest.'],
    description:
      'Not a process you are pushed through, but a way that connection quietly unfolds.',
    steps: [
      {
        title: 'Leave a trace of yourself',
        description:
          'A person writes down what they are working on, the topics they care about, the support they can offer, and the kind of connection they are looking for right now. These are not a profile. They are the root-threads you leave behind as you enter the forest.',
        tags: [],
      },
      {
        title: 'Find the right soil',
        description:
          'Similar topics, cities, and directions of practice gradually gather into small patches of soil. A person is not assigned to a spot. They settle in where it feels right for them.',
        tags: ['Topic circles', 'City circles', 'Co-creation groups'],
      },
      {
        title: 'Notice people who resonate',
        description:
          'The AI does one light thing: it brings people who might be on the same wavelength, who might support each other, who might do something together, into each other’s view. The decision to connect still belongs to the person.',
        tags: [],
      },
      {
        title: 'Leave a moment of approach',
        description:
          'A greeting, an invitation, a shared topic of interest—any of these can bring two strangers a little closer. The nearby is not manufactured. It grows out of one response after another.',
        tags: [],
      },
      {
        title: 'Meet in real life',
        description:
          'Online helps people be seen by each other. Offline lets trust have a chance to grow. Small-table conversations, city node meetups, co-creation workshops—these bring relationships into the real world.',
        tags: [],
      },
    ],
  },

  offline: {
    label: 'Offline happenings',
    title: 'Let love land in the real world',
    description:
      'Online handles discovery and connection. Offline handles trust and growth.',
    items: [
      {
        title: 'Small-table conversations',
        description:
          'Deep conversations for 3–6 people, around one topic. Slow talk. Careful listening. Like sitting around a real table.',
      },
      {
        title: 'City node meetups',
        description:
          'In your own city, meet the nodes nearby. Let the "nearby" truly happen.',
      },
      {
        title: 'Themed salons',
        description:
          'Discussion and sharing around a shared topic of concern. Perspectives collide, and understanding grows.',
      },
      {
        title: 'Reading and learning together',
        description:
          'Read a book together. Explore a field together. In shared learning, deeper connections form.',
      },
      {
        title: 'Micro world café',
        description:
          'A flowing conversation. Switch tables each round. Let different people meet, and let ideas cross-pollinate.',
      },
      {
        title: 'Co-creation workshops',
        description:
          'Turn ideas into action. Weave individual strengths together. Create new possibilities, together.',
      },
    ],
  },

  weave: {
    label: 'Weaving a net',
    title: 'Let the light keep traveling',
    leadLines: [
      'Nearby Forest is not something one person can make happen.',
      'It is something many people are making happen, together.',
    ],
    paragraphs: [
      'What I can do is very little: share what I have lived through and learned. If it happens to be useful to someone, that is the best thing I could ask for.',
      'Slowly, let more people find each other. And let this forest grow, little by little.',
    ],
    highlight:
      'In a world that makes it easy for people to stay apart, reconnect a few of them.',
  },

  community: {
    label: 'Community ties',
    title: 'The Nearby Forest ecosystem community growth group',
    paragraphs: [
      'The Nearby Forest ecosystem community growth group is a nearby space for the super-creators who have signed up and use Nearby Forest, and who are willing to grow alongside the community’s newest works—a place to gather and draw closer to one another.',
      'We hope this becomes a place where everyone can come closer to their nearby, connect and exchange, and also freely share ideas 💡.',
      'We also look forward to hearing any feedback about your experience using community works like PhilCoach.',
    ],
    contactLabel: 'Contact us',
    contactTitle: 'Start with a real hello',
    contactDescription:
      'If you want to learn more, join the community, or share how your experience has been, you can add the two founders on WeChat.',
    // 英文读者可能不知道 WeChat 是什么，这里补一句说明。
    qrNote:
      'Scan the QR codes with WeChat to add the founders as contacts.',
    qrXiaozAlt: 'WeChat QR code for adding Xiao Z as a contact',
    qrWendyAlt: 'WeChat QR code for adding Wendy as a contact',
  },

  cta: {
    title: 'Want to place your own tree in the forest?',
    button: 'Plant a tree',
  },

  footer: {
    brand: 'Nearby Forest',
    tagline: 'Let independent individuals connect, flow, and co-create.',
  },
};
