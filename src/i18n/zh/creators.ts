// 不要加 as const：那会把每个值锁成字面量类型，英文字典就一个字都赋不进去。
//
// 只收「页面框架」的文字。hero 那几句来自 content/creators.md，
// 每棵树上的名字、城市、在做的事来自成员自己填的 node_cards——
// 前者走 content-en.json 对照表，后者一律不翻（那是本人的话）。
export const creators = {
  metaTitle: '创造者森林 · 附近森林',

  // 作品书架入口
  shelf: {
    ariaLabel: '查看创造者书架',
    imageAlt: '附近森林 · 功能巡览',
    eyebrow: '作品书架',
    title: '一页书架，放下正在生长的作品',
    body: '公众号、播客、产品、长文和项目片段，会慢慢在每棵树旁边长出来。',
    cta: '看看这次更新',
  },

  // 一棵树都还没有时
  empty: {
    title: '这片森林正在等待第一棵树',
    line1: '这里还在等待第一位创造者留下线索。',
    line2: '也许第一棵树就是你。',
    cta: '成为第一棵树',
  },

  /** 已有几棵树。英文要分单复数，所以写成函数而不是拼接。 */
  treeCount: (count: number) => `森林里已有 ${count} 棵树在生长`,

  // 页尾那一屏
  cta: {
    title: '也想把自己这棵树，放进森林？',
    body: '留下你的线索，让相似的人有机会慢慢靠近。',
    button: '种下一棵树',
  },

  footerTagline: '让独立的个体彼此连接、流动、共创',
};
