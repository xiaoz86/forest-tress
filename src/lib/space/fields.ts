/** 画像引用的资料字段及其中文名。前后端都用，所以单独放，不能引入服务端依赖。 */

export type SourceField =
  | 'doing' | 'topics' | 'keywords' | 'experience' | 'offer' | 'seeking'
  | 'product' | 'interests' | 'moment' | 'create' | 'seed' | 'works';

export const FIELD_LABEL: Record<SourceField, string> = {
  doing: '正在做',
  topics: '关注的议题',
  keywords: '星轨关键词',
  experience: '经验与独特性',
  offer: '可以提供',
  seeking: '正在寻找',
  product: '产品 / 项目',
  interests: '兴趣爱好',
  moment: '一个美的时刻',
  create: '想创造或守护的',
  seed: '心里的种子',
  works: '作品',
};

/** V2 §7.2 的门槛：「人味」四项填了不到 2 项，风格先走看图兜底 */
export const HUMAN_FIELDS: SourceField[] = ['interests', 'moment', 'create', 'seed'];
