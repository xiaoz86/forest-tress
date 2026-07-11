// phil-coach —— 附近森林里，陪每棵树回到自己的同行者。
// 这里放产品文案与对话入口脚本；真实回复由 /api/phil-coach 动态生成。

export type PhilRole = {
  id: string;
  name: string;
  when: string;
  how: string;
};

/** phil-coach 的四重身份——融为一体地支持一棵树 */
export const PHIL_ROLES: PhilRole[] = [
  {
    id: 'companion',
    name: '知心大姐',
    when: '心里有情绪，或者只是想把一件开心、难过的事说给人听',
    how: '先把你接住。陪你停一停，让委屈、疲惫、开心和柔软都可以在，不急着把它们变成道理',
  },
  {
    id: 'coach',
    name: '生命教练',
    when: '有些事卡住了，绕来绕去，其实是在碰一个更深的自己',
    how: '陪你从故事里听见自己：你真正想要什么，为什么重要，哪一步是你愿意亲手走的',
  },
  {
    id: 'advisor',
    name: '顾问',
    when: '你已经想往前走，只是需要一点结构、信息、利弊和边界',
    how: '把散开的线头摆清楚，给你几个看法和可能性；最后怎么选，仍然回到你手里',
  },
  {
    id: 'mentor',
    name: '导师',
    when: '你想听一个走过的人怎么做，想看示范，或复盘一场真实对话',
    how: '先听你的判断，再分享经验与练习方式。不是让你照抄，而是帮你长出自己的手感',
  },
];

/** 一个引导步骤：coach 说一句话；若 input 为 true，则等你写下回应 */
export type Beat = {
  coach: string;
  input?: boolean;
  placeholder?: string;
};

export type PhilPath = {
  id: string;
  label: string;
  hint: string;
  /** 主色调，用于卡片渐变 */
  mood: 'companion' | 'clarity' | 'choice' | 'mirror';
  /** 给大模型的小径意图提示（不展示给用户） */
  llmHint?: string;
  beats: Beat[];
};

/** 四条自我探索小径——每条都是一段可以一个人走完的十分钟 */
export const PHIL_PATHS: PhilPath[] = [
  {
    id: 'heard',
    label: '我想被听见',
    hint: '心里堵着点什么，先不急着解决',
    mood: 'companion',
    llmHint:
      '这条小径以陪伴为主：接住、命名、允许情绪在场，基本不给建议、不推进解决；情绪被看见后，才轻轻问 ta 想不想多说一点或往前走。',
    beats: [
      {
        coach: '很开心，能够与你开启一段对话。你想要和我聊些什么？',
        input: true,
        placeholder: '我想和你说说…',
      },
      { coach: '我听见了。能把它说出来，已经是在照顾自己了。' },
      {
        coach: '如果不急着处理它，只给这个感受起个名字，它更像什么？委屈、疲惫、失望，还是别的什么？',
        input: true,
        placeholder: '它更像是…',
      },
      {
        coach: '它在身体里有位置吗？也许是胸口、喉咙、胃，或者某个说不清的地方。那里是紧的、沉的，还是空的？',
        input: true,
        placeholder: '在我的…，感觉像…',
      },
      { coach: '先让它在那里。不赶走，也不放大。很多情绪只是太久没有被认真看见。' },
      {
        coach: '如果这个感受会说话，它最想让你知道什么？它也许正在替你守着某个很在乎的东西。',
        input: true,
        placeholder: '它想让我知道…',
      },
      { coach: '你今天愿意停下来听自己说话，这就已经很珍贵了。可以把这段留给自己，像留下一盏小灯。' },
    ],
  },
  {
    id: 'untangle',
    label: '我有点乱，想理理',
    hint: '很多事挤在一起，想看清方向',
    mood: 'clarity',
    llmHint:
      '这条小径帮 ta 从一团乱里看清：先陪 ta 把最占地方的事说出来，再探索 ta 自己真正想要什么、为什么重要，最后才轻轻落到一小步。不替 ta 整理，让 ta 自己长出方向。',
    beats: [
      {
        coach: '很开心，能够与你开启一段对话。你想要和我聊些什么？',
        input: true,
        placeholder: '我最近有点乱的是…',
      },
      { coach: '嗯，我们先把它放在这里，看清楚一点。' },
      {
        coach: '在这件事里，你最想要的其实是什么？先不管别人期待什么，只听你自己那一边。',
        input: true,
        placeholder: '我真正想要的是…',
      },
      {
        coach: '它为什么对你重要？如果它真的发生了，你的生活、关系，或你看自己的方式，会有什么不一样？',
        input: true,
        placeholder: '因为…',
      },
      {
        coach: '为了这件事，你已经有的资源是什么？可能是一点经验、一个人、一点勇气，或者一个还没放弃的念头。',
        input: true,
        placeholder: '我已经有的是…',
      },
      {
        coach: '想象它只是往前走了一小步。那个画面里，你是什么状态？身体更松一点，还是还有哪里紧着？',
        input: true,
        placeholder: '那个画面里，我…',
      },
      {
        coach: '如果今天只做一件很小的事，小到不需要鼓足很大勇气，那会是什么？',
        input: true,
        placeholder: '我可以先…',
      },
      { coach: '你看，乱不是一下子消失的，但里面已经露出一点方向了。刚才那一步，是你自己说出来的。' },
    ],
  },
  {
    id: 'choice',
    label: '我在一个选择前纠结',
    hint: '两边都放不下，来回权衡',
    mood: 'choice',
    llmHint:
      '这条小径陪 ta 看清选择：探索纠结底下守护的价值、什么可控什么不可控、身体对各选项的反应；可以提议小而可逆的试探，但绝不替 ta 选。',
    beats: [
      {
        coach: '很开心，能够与你开启一段对话。你想要和我聊些什么？',
        input: true,
        placeholder: '我在纠结的是…',
      },
      {
        coach: '先放下“应该怎么选”。这个纠结底下，你真正在守护什么？自由、安稳、成长、关系，还是某个更深的价值？',
        input: true,
        placeholder: '我在守护的是…',
      },
      {
        coach: '这件事里，哪些真的在你手里？哪些你只能影响、但不能决定？我们先把不在你手里的，轻轻放到旁边。',
        input: true,
        placeholder: '我能决定的是…；不在我手里的是…',
      },
      {
        coach: '想象五年后的你回头看今天。那个更远一点的你，会希望此刻的你更看重什么？',
        input: true,
        placeholder: '五年后的我会说…',
      },
      {
        coach: '再听一下身体。说到其中一个选项时，你是更舒展，还是更收紧？另一个呢？',
        input: true,
        placeholder: '说到…时我舒展；说到…时我收紧',
      },
      { coach: '身体不一定替你做决定，但它常常诚实地告诉你：哪里有生命力，哪里在用力撑。' },
      {
        coach: '有没有一个很小、可逆的试探，能让你离答案近一点，而不必现在就把整个人押上去？',
        input: true,
        placeholder: '我可以先小小地试…',
      },
      { coach: '你不一定要今天就做决定。但你已经更靠近自己在乎的东西了，这比立刻选一个答案更重要。' },
    ],
  },
  {
    id: 'mirror',
    label: '我想认识此刻的自己',
    hint: '停下来，照见现在的自己',
    mood: 'mirror',
    llmHint:
      '这条小径是照见自己：陪 ta 看见此刻状态、亮起来的时刻（潜能共鸣）与拦住 ta 的内在声音；对那个声音做温和的分离与理解（它想保护什么），最后回到 ta 更大的自己。',
    beats: [
      {
        coach: '很开心，能够与你开启一段对话。你想要和我聊些什么？',
        input: true,
        placeholder: '我想聊聊此刻的自己…',
      },
      {
        coach: '如果这个词是一种天气，会是什么样的天气？晴、雾、雨、风，或者某种说不清的天色。',
        input: true,
        placeholder: '像…的天气',
      },
      {
        coach: '最近有没有一个很小的时刻，你感觉自己亮了一下、活过来了一点？那时你在做什么，和谁在一起，或者正在靠近什么？',
        input: true,
        placeholder: '那时我在…',
      },
      { coach: '那个时刻可以先被记住。它不一定宏大，但它在告诉你：有些东西会让你更像自己。' },
      {
        coach: '那个亮起来的时刻，触动你的是什么价值？自由、创造、爱、真实、被需要，还是别的什么？',
        input: true,
        placeholder: '触动我的是…',
      },
      {
        coach: '当你想更靠近那个方向时，有没有一个声音会拦住你、否定你、让你退回去？它通常怎么说？',
        input: true,
        placeholder: '那个声音说…',
      },
      { coach: '看见它，就已经和它拉开了一点距离。它不是全部的你，更像是一个想保护你、但有点用力过猛的部分。' },
      {
        coach: '如果由那个更大的、更笃定的你来回应它，你会对它说什么？可以温柔，也可以坚定。',
        input: true,
        placeholder: '我想对它说…',
      },
      { coach: '刚才这几步，不是为了给自己下结论，而是让你重新看见自己一点。每一次看见，都会让你多一点自由。' },
    ],
  },
];

export function getPhilPath(id: string): PhilPath | undefined {
  return PHIL_PATHS.find(p => p.id === id);
}
