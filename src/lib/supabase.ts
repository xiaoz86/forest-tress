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
  created_at?: string;
};
