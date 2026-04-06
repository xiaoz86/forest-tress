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
  created_at?: string;
};
