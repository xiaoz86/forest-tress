import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type NodeCard = {
  id?: string;
  name: string;
  city: string;
  doing: string;
  topics: string[];
  experience: string;
  offer: string;
  seeking: string;
  product: string;
  wechat: string;
  email: string;
  /** AI 生成的展示关键词（5-8 个）。可能为空，调用方需有规则兜底。 */
  keywords?: string[];
  /** 个人形象照公开 URL（可选）。来自 Supabase Storage public bucket */
  avatar_url?: string;
  /** 兴趣爱好（可选）— 自由文本，例如：徒步、烘焙、摄影、爵士乐 */
  interests?: string;
  /** 你生命里的「美」（可选）— wizard step 4 收集，融合「时刻」与「想创造/守护的美」 */
  beauty?: string;
  /** 你心里的那颗种子（可选）— wizard step 5 收集，一个梦想 / 念头 / 还没开始的计划 */
  seed?: string;
  /** 作品 / 项目集（可选）— 书架式横向滚动展示 */
  works?: Work[];
  /**
   * AI 为 TA 生成的「连接推荐」结果。仅本人 + 管理员可见。
   * 结构对应 lib/match.ts 的 MatchedNode（不含被推荐成员的隐私字段，存的是裁剪后的快照）。
   */
  ai_recommendations?: AIRecommendation[];
  /** AI 推荐生成时间（ISO） — 让用户知道现在看到的是什么时候的快照 */
  ai_recommendations_at?: string;
  created_at?: string;
  /** 走验证码登录成功时盖上——「这个邮箱确实是本人的」的唯一凭据 */
  email_verified_at?: string | null;
};

/**
 * 持久化存储的 AI 推荐快照。
 * 不直接复用 MatchedNode，是为了：
 * 1) 避免存到对方的私密字段（联系方式之类）
 * 2) 让本表行不依赖被推荐成员的最新状态（被删除/改名也不影响展示）
 */
export type AIRecommendation = {
  /** 被推荐成员的节点 id */
  id: string;
  name: string;
  city?: string;
  doing?: string;
  avatar_url?: string;
  matchType: '同频' | '互补' | '同城';
  reasons: string[];
  /** AI 给出的「为何匹配」一句话 */
  aiSummary?: string;
  /** AI 给出的「可能共创什么」一句话 */
  aiCoCreate?: string;
};

export type Work = {
  /** 客户端生成的 stable id（用于删除/排序） */
  id: string;
  title: string;
  /** 一两句话描述（可选） */
  desc?: string;
  /** 封面图公开 URL（可选）。来自 Supabase Storage 'works' bucket */
  image_url?: string;
  /** 点击跳转的链接（公众号 / 播客 / 商品页 等） */
  url?: string;
  created_at: string;
};
