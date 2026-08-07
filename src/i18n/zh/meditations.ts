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
};
