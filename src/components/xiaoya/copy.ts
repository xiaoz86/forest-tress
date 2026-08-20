export type XiaoyaLocale = "zh" | "en";

export type XiaoyaSuggestion = {
  label: string;
  href?: string;
};

export const xiaoyaCopy = {
  zh: {
    launcher: "问问小芽",
    title: "小芽",
    subtitle: "AI 森林园丁",
    presence: "正在森林里",
    close: "关闭小芽",
    clear: "新对话",
    welcomeTitle: "嗨，我是小芽 🌱",
    welcomeBody:
      "我住在附近森林里。如果你刚刚来到这里，不知道先去哪里，可以问我；如果你正在种自己的那棵树，也可以叫我来一起看看。",
    welcomeHint: "你不需要一次做很多。我们可以先从一颗很小的种子开始。",
    suggestionsLabel: "你可以问",
    inputLabel: "想问小芽什么？",
    inputPlaceholder: "写下你的问题……",
    send: "发送",
    stop: "停止",
    thinking: "小芽正在想……",
    error: "小芽刚刚没接住这句话 🌱 可以再试一次。",
    retry: "再试一次",
    assistantName: "小芽",
    userName: "你",
  },
  en: {
    launcher: "Ask Xiaoya",
    title: "Xiaoya",
    subtitle: "AI Forest Gardener",
    presence: "In the forest",
    close: "Close Xiaoya",
    clear: "New chat",
    welcomeTitle: "Hi, I’m Xiaoya 🌱",
    welcomeBody:
      "I live in Nearby Forest. If you have just arrived and do not know where to begin, ask me. If you are growing your own tree, I can look at the next step with you.",
    welcomeHint: "You do not need to do everything at once. We can begin with one small seed.",
    suggestionsLabel: "You can ask",
    inputLabel: "What would you like to ask Xiaoya?",
    inputPlaceholder: "Write your question…",
    send: "Send",
    stop: "Stop",
    thinking: "Xiaoya is thinking…",
    error: "Xiaoya missed that thought just now 🌱 You can try again.",
    retry: "Try again",
    assistantName: "Xiaoya",
    userName: "You",
  },
} as const;

const pageSuggestions: Record<string, Record<XiaoyaLocale, string[]>> = {
  home: {
    zh: ["附近森林是什么？", "我刚来到这里，先从哪里开始？", "四条小径分别适合什么？"],
    en: ["What is Nearby Forest?", "I just arrived. Where should I begin?", "What are the four paths?"],
  },
  "forest-about": {
    zh: ["为什么叫附近森林？", "每个人是一棵树是什么意思？", "怎么参与生态社区？"],
    en: ["Why is it called Nearby Forest?", "What does ‘every person is a tree’ mean?", "How can I join the community?"],
  },
  "creator-directory": {
    zh: ["这里可以发现什么？", "怎么找到值得认识的人？", "为什么不是按热度排序？"],
    en: ["What can I discover here?", "How can I find people to know?", "Why is this not ranked by popularity?"],
  },
  "creator-profile": {
    zh: ["这张主页能让我了解什么？", "如何完善我的主页？", "我还没有作品怎么办？"],
    en: ["What can I learn from this profile?", "How can I improve my profile?", "What if I do not have a work yet?"],
  },
  "creator-profile-edit": {
    zh: ["“正在做”和“正在探索”怎么写？", "“我能提供”和“正在寻找”怎么区分？", "哪些资料会公开？"],
    en: ["How should I write ‘doing’ and ‘exploring’?", "How are ‘I can offer’ and ‘I am looking for’ different?", "Which details will be public?"],
  },
  "work-editor": {
    zh: ["作品介绍怎么写？", "还没完成可以发布吗？", "怎么描述为什么做这件事？"],
    en: ["How should I introduce my work?", "Can I publish something unfinished?", "How do I explain why I made it?"],
  },
  "meditation-grove": {
    zh: ["我该从哪条声音小径开始？", "引导冥想、睡眠系列和声音有什么不同？", "这些声音怎么使用？"],
    en: ["Which listening path should I begin with?", "How are guided meditation, sleep series and sounds different?", "How do I use these sounds?"],
  },
  "meditation-category": {
    zh: ["这一条小径适合什么时候听？", "怎么播放和留下感悟？", "音频或页面打不开怎么办？"],
    en: ["When is this path suitable to listen to?", "How do I play it and leave a reflection?", "What if the audio or page will not open?"],
  },
  "share-gallery": {
    zh: ["这里会分享哪些创造？", "作品、活动或服务如何出现在这里？", "为什么投稿需要审核？"],
    en: ["What kinds of creations are shared here?", "How can a work, event or service appear here?", "Why are submissions reviewed?"],
  },
  "share-submission": {
    zh: ["标题和简短描述怎么写？", "可以提交还未完成的想法吗？", "提交后会立刻公开吗？"],
    en: ["How should I write the title and short description?", "Can I submit an unfinished idea?", "Will it become public immediately?"],
  },
  "phil-coach": {
    zh: ["PhilCoach 和小芽有什么不同？", "PhilCoach 的记忆怎么管理？", "语音输入和朗读怎么用？"],
    en: ["How are PhilCoach and Xiaoya different?", "How do I manage PhilCoach memory?", "How do voice input and reading aloud work?"],
  },
  login: {
    zh: ["验证码没有收到怎么办？", "为什么要验证邮箱？", "第一次来应该登录还是注册？"],
    en: ["What if my verification code does not arrive?", "Why is email verification needed?", "Should a first-time visitor sign in or register?"],
  },
  "launch-announcement": {
    zh: ["这次发布了哪些功能？", "我可以先从哪里体验？", "如何完善并分享我的节点？"],
    en: ["What was included in this release?", "Where should I try first?", "How can I complete and share my node?"],
  },
  unknown: {
    zh: ["附近森林是什么？", "我刚来，先做什么？", "怎么找到功能入口？"],
    en: ["What is Nearby Forest?", "I am new. What should I do first?", "Where can I find each feature?"],
  },
};

export function getXiaoyaSuggestions(
  pageType: string,
  locale: XiaoyaLocale,
): XiaoyaSuggestion[] {
  const questions = pageSuggestions[pageType]?.[locale] ?? pageSuggestions.unknown[locale];
  return questions.slice(0, 3).map((label) => ({ label }));
}
