-- Run this SQL in your Supabase SQL Editor to create the node_cards table
-- https://supabase.com/dashboard → SQL Editor

create table if not exists node_cards (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  city text,
  doing text,
  topics text[] default '{}',
  experience text,
  offer text,
  seeking text,
  product text,
  wechat text,
  email text,
  keywords text[] default '{}',
  avatar_url text default '',
  interests text default '',
  works jsonb default '[]'::jsonb,
  ai_recommendations jsonb default '[]'::jsonb,
  ai_recommendations_at timestamptz,
  created_at timestamptz default now()
);

-- 已部署的库单独执行（幂等）
alter table node_cards add column if not exists keywords text[] default '{}';
alter table node_cards add column if not exists avatar_url text default '';
alter table node_cards add column if not exists interests text default '';
alter table node_cards add column if not exists works jsonb default '[]'::jsonb;
alter table node_cards add column if not exists ai_recommendations jsonb default '[]'::jsonb;
alter table node_cards add column if not exists ai_recommendations_at timestamptz;
-- works 单条结构（jsonb 数组里的对象）：
--   { id: string, title: string, desc?: string, image_url?: string, url?: string, created_at: string }
-- ai_recommendations 单条结构：
--   { id, name, city?, doing?, avatar_url?, matchType, reasons[], aiSummary?, aiCoCreate? }
-- 邮箱大小写不敏感唯一索引（ilike 查询配合用）：
create unique index if not exists node_cards_email_unique
  on node_cards (lower(email))
  where email is not null and email <> '';

-- Enable Row Level Security
alter table node_cards enable row level security;

-- Allow inserts from anonymous users (for the join form)
create policy "Allow anonymous inserts" on node_cards
  for insert with check (true);

-- Only allow authenticated users to read (for admin)
create policy "Allow authenticated reads" on node_cards
  for select using (auth.role() = 'authenticated');
