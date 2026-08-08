// 不要加 as const：那会把每个值锁成字面量类型，英文字典就一个字都赋不进去。
//
// 只收「页面框架」的文字。眉标题（eyebrow）、每条分享的标题、简介、标签
// 都存在 Supabase 的 share_content 里，主理人自己编辑——那些走
// content-en.json 那条对照表（scripts/translate-content.mjs 生成），
// 不在这里翻。
export const shares = {
  metaTitle: '林间分享 · 附近森林',
  metaDescription: '附近森林里超级个体的作品、产品、活动与体验片段。',

  heroTitle: '更多超级个体的分享',
  heroLede: '有些价值，需要先被人真实地进入。这里会慢慢放下有温度的超级个体带来的作品、产品、活动和体验。',

  submitCta: '带来我的分享',
  backHome: '回到首页',
  manage: '管理分享',
};
