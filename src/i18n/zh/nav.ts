// 不要加 as const：那会把每个值锁成字面量类型（'附近森林' 而不是 string），
// 英文字典就一个字都赋不进去。键的完整性由 typeof 检查，值要保持 string。
export const nav = {
  brand: '附近森林',
  links: {
    meditations: '林间探索',
    philCoach: '回到自己',
    shares: '个体创造',
    creators: '遇见附近',
    about: '生态社区',
  },
  ctaJoin: '种下一棵树',
  ctaMember: '个人中心',
  login: '登录',
  menu: '菜单',
  language: {
    label: '语言',
    zh: '简体中文',
    en: 'English',
    /** 切换按钮上的短标：中文界面显示 EN（去英文），英文界面显示 中（回中文） */
    short: 'EN',
  },
};
