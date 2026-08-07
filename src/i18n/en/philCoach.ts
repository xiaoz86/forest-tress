import type { philCoach as zhPhilCoach } from '@/i18n/zh/philCoach';

/**
 * phil-coach 介绍页的英文。几处不是直译，记一下为什么：
 *
 * - 「树洞」直译 tree hole 是个洞，不是那个意思。用 a hollow tree that answers back：
 *   英文里对着树洞说心事这个画面读得懂，而且「会回应」正是它和普通树洞的差别。
 * - 「知心大姐」没有对应的词。Big sister 在英文里更多是「管着你的姐姐」，
 *   这里要的是「什么都能对她说」，所以用 The confidante。
 * - 「三层聆听」是教练行业的既有说法，英文就是 three levels of listening，照用。
 * - 「遇见附近」在导航里是 People，但正文里 go People 读不通，
 *   展开成 meet the people nearby。
 * - 四重身份卡片上的三行字（byId）在中文里住在 src/lib/philCoach.ts，
 *   那个文件这轮不动，所以英文在这里按 role.id 覆盖。
 */
export const philCoach: typeof zhPhilCoach = {
  metaTitle: 'phil-coach · Nearby Forest',
  metaDescription:
    'phil-coach is a hollow tree in Nearby Forest that answers back: when you want to be heard, or to untangle a knot slowly, there is a conversation that walks you back to yourself.',

  backHome: 'Back home',

  hero: {
    eyebrow: 'phil-coach · a hollow tree that answers back',
    title: 'Someone with you, on the way back to yourself',
    lede: 'Sometimes what is missing is not an answer, but time enough to say a thing all the way through. Put the knot down. Once it has been heard, you begin to see what actually hurts, what you care about, where you want to go.',
    footnote:
      'This is one of the Nearby Forest paths for finding yourself. Before meeting anyone else, sit with yourself a while.',
  },

  intro: {
    eyebrow: 'First meeting',
    title: 'What is phil-coach?',
    origin:
      'A virtual coach planted in Nearby Forest. The “phil” comes from the Greek philia — the love between friends, equal and unpossessive.',
    listenBefore:
      'Treat it as a hollow tree that answers back: the happy, the sad, the things you cannot say out loud, all of it can go in. It has read a great deal of coaching and psychology, but the one thing it was taught most carefully is to ',
    listenAccent: 'hear you all the way out instead of rushing to an answer',
    listenAfter:
      '. It does not judge you and it will not decide for you — it trusts the answer is already in you, and only keeps you company while you find it.',
    howBefore:
      'Nothing to prepare: pick the path below that feels most like you right now, then talk the way you would to someone you trust — whatever comes, unshaped, typos and all. It asks one question at a time; ',
    howAccent: 'you do not have to answer well, only truly',
    howAfter:
      '. Stop whenever you want. Nothing here is saved; when you are done, it is gone.',
    disclaimer:
      'One thing to say up front: this is not therapy, and not medical care. If you are somewhere very low right now, please also reach for someone you trust or professional support — you deserve to be held by something sturdier.',
  },

  roles: {
    title: 'Four ways it comes close',
    note: 'You do not have to work out which one you need. It becomes whichever side the conversation asks for — and most of the time, it is simply listening.',
    sentenceEnd: '.',
    byId: {
      companion: {
        name: 'The confidante',
        when: 'When something is stirring in you, or you just want to tell someone about a thing that made you happy or sad',
        how: 'Catches you first. Stays while you pause, so the hurt, the tiredness, the joy and the tenderness are all allowed to be here, without being turned into a lesson',
      },
      coach: {
        name: 'The life coach',
        when: 'When something is stuck and you keep circling it — usually you are close to a deeper self. The quality of a life tends to follow the quality of the questions you keep asking yourself',
        how: 'It helps you ask better questions and find your own answers: what you actually want, why it matters, which step you are willing to take yourself',
      },
      advisor: {
        name: 'The advisor',
        when: 'When you already want to move forward and just need some structure, information, trade-offs and limits',
        how: 'Lays the loose threads out straight and offers a few views and possibilities; the choice still comes back to your hands',
      },
      mentor: {
        name: 'The mentor',
        when: 'When you want to hear how someone who has walked it did it, to see it done, or to go back over a real conversation',
        how: 'Listens to your read on it first, then shares experience and ways to practise. Not for copying — so you grow your own feel for it',
      },
    },
    boundaryLabel: 'Where the line with a human coach falls: ',
    boundaryBody:
      'Coaching talks about three levels of listening. At the first, you listen while thinking about what you will say next. At the second, all of your attention is on the other person. At the third, you also hear everything outside the words: the tremor in a voice, the pause between sentences, how a body is held, the energy moving in the room. In text, phil-coach can come close to the second level. The third — and making something with you out of a real relationship and a real life — still belongs to a human.',
    // 链接两边中文靠 mx-1 的间距就够了，英文还得有真的空格，
    // 否则复制出来和读屏念出来是 "Gomeet"。
    inviteBefore:
      'When you want a real person to hear you all the way through, there are companions growing in this forest. Go ',
    inviteLink: 'meet the people nearby',
    inviteAfter: ' and see.',
  },

  faq: {
    eyebrow: 'You might ask',
    title: 'Before you start, the things worth saying clearly',
    note: 'Privacy, limits, and how far it can actually go with you — you have a right to know before you say anything.',

    privacy: {
      question: 'Who sees what I say?',
      answer:
        'Conversations never appear on any public page, and no one else in the forest sees them. To write a reply, what you type passes through the Nearby Forest server in that moment and goes to a third-party AI model — for that one thing only.',
    },

    memory: {
      question: 'Is anything kept? Will it remember me next time?',
      p1: 'Conversations are not written to the Nearby Forest database; close the tab and it is gone, and next time it will not remember what you talked about. (So you do not lose half a conversation by going off to sign in, it is held for the moment in your own browser, cleared when the tab closes, never uploaded to us.) Honestly though: the model provider may keep data briefly under its own rules, so we do not promise zero retention end to end. Please do not write ID numbers, addresses, financial or medical details, and please look after other people’s privacy too. If something is worth keeping, use “keep this for yourself” below the conversation to take it with you.',
      p2Before:
        'One more thing said plainly: if you keep going after the first path, we will ask for a name to call you by and a WeChat ID — only so we know you, open free access, and invite you into the community. We keep ',
      p2Keep: 'who you are and when you came',
      p2Middle: ', but ',
      p2NotSaved: 'the conversations themselves are still not saved',
      p2After: ' (unless a member chooses to keep one).',
      p3Before:
        'One plan already on the way: in time, you will be able to let it remember. Once you ',
      p3Link: 'become a tree in the forest',
      p3After:
        ' (sign up), you can choose by hand to keep the part of a conversation that mattered — saved only with your explicit yes, into a record of your own growth. Next time, phil-coach picks the thread back up: “Last time you said you wanted to try sleeping earlier — how did that go?” Until this exists, every time it meets you is the first time.',
    },

    therapy: {
      question: 'How is this different from therapy?',
      answer:
        'Counselling and therapy are trained people working with psychological distress inside a stable relationship and a professional ethic. phil-coach does not diagnose, does not treat, does not handle crises; it suits everyday sorting-out and self-exploration. If the pain has been affecting your sleep, your work and your life, or you have thoughts of hurting yourself, please reach professional mental health support, local emergency services, and someone near you that you trust — that is not weakness, it is taking yourself seriously.',
    },
  },

  experience: {
    eyebrow: 'Sit here a while',
    title: 'Give yourself ten minutes',
  },

  outro: {
    title: 'Every tree deserves to be seen this way',
    body: 'The more you can hear yourself, the easier it is to meet people in the forest who are truly in tune with you. You know what you are looking for, and what you can bring to someone else. phil-coach stays beside this path, for whenever you want to come back and sit a while.',
    ctaJoin: 'Become a tree in the forest',
    ctaListen: 'Or go listen to the sounds in the forest',
  },
};
