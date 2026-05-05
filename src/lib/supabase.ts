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
  /** 作品 / 项目集（可选）— 书架式横向滚动展示 */
  works?: Work[];
  created_at?: string;
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
