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
  -- 2026-05-08 wizard 表单新加：你生命里的「美」 + 你心里的那颗种子
  beauty text default '',
  seed text default '',
  created_at timestamptz default now()
);

-- 已部署的库单独执行（幂等）
alter table node_cards add column if not exists keywords text[] default '{}';
alter table node_cards add column if not exists avatar_url text default '';
alter table node_cards add column if not exists interests text default '';
alter table node_cards add column if not exists works jsonb default '[]'::jsonb;
alter table node_cards add column if not exists ai_recommendations jsonb default '[]'::jsonb;
alter table node_cards add column if not exists ai_recommendations_at timestamptz;
alter table node_cards add column if not exists beauty text default '';
alter table node_cards add column if not exists seed text default '';
-- works 单条结构（jsonb 数组里的对象）：
--   { id: string, title: string, desc?: string, image_url?: string, url?: string, created_at: string }
-- ai_recommendations 单条结构：
--   { id, name, city?, doing?, avatar_url?, matchType, reasons[], aiSummary?, aiCoCreate? }
-- 邮箱大小写不敏感唯一索引（ilike 查询配合用）：
create unique index if not exists node_cards_email_unique
  on node_cards (lower(email))
  where email is not null and email <> '';

-- 首页「林间呼吸」文案、分类、音频列表配置
create table if not exists meditation_content (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

insert into meditation_content (id, payload, updated_at)
values (
  'forest-breath',
  $$
  {
    "eyebrow": "林间呼吸",
    "title": "好状态，\n从一段呼吸开始",
    "description": "一段呼吸，一次停顿，一个还不急着回答的问题。声音会慢慢放在这里，像夜色里一条安静的小径。",
    "note": "慢慢听见",
    "categories": [
      { "id": "recommended", "label": "推荐" },
      { "id": "breath", "label": "呼吸" },
      { "id": "self", "label": "看见" },
      { "id": "transition", "label": "转场" }
    ],
    "tracks": [
      {
        "id": "settle-breath",
        "title": "安顿呼吸",
        "intention": "从外面的节奏回到身体，让呼吸重新变得清晰。",
        "duration": "8 分钟",
        "stage": "初入林间",
        "categoryId": "breath",
        "mood": "settle"
      },
      {
        "id": "see-yourself",
        "title": "看见此刻的自己",
        "intention": "带着一个温柔的问题，听见内在真正关心的事。",
        "duration": "12 分钟",
        "stage": "自我探索",
        "categoryId": "self",
        "mood": "listen"
      },
      {
        "id": "transition-anxiety",
        "title": "转型期的焦虑",
        "intention": "给正在变化中的自己一点空间，重新感到脚下有地。",
        "duration": "10 分钟",
        "stage": "职业与生命转场",
        "categoryId": "transition",
        "mood": "ground"
      }
    ]
  }
  $$::jsonb,
  now()
)
on conflict (id) do nothing;

-- 冥想音频公开 bucket；应用也会在管理员首次上传时尝试自动创建
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meditations',
  'meditations',
  true,
  83886080,
  array[
    'audio/aac',
    'audio/flac',
    'audio/m4a',
    'audio/mp4',
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
    'audio/webm',
    'audio/x-m4a',
    'video/mp4'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 首页「林间分享」文案、分享列表、视频/图片/海报配置
create table if not exists share_content (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

insert into share_content (id, payload, updated_at)
values (
  'forest-shares',
  $$
  {
    "eyebrow": "林间分享",
    "title": "积极希望，\n从一次围坐开始",
    "intro": "那天，四位创始人聊了一个问题：最近还有什么，让你愿意再往前一点？没有急着给答案，只是把各自正在发生的东西，慢慢说出来。",
    "moreLabel": "更多超级个体的分享",
    "noteEyebrow": "手记",
    "noteTitle": "那个问题被放在中间",
    "noteParagraphs": [
      "“最近，有没有什么让你觉得还有一点希望？”",
      "有人说起一个正在变化的选择，有人说起身体里慢慢松开的紧张，也有人只是安静听着。",
      "回应没有急着变成建议。它只是把对方身上已经亮起来的地方，轻轻还给他。"
    ],
    "footer": "片段还在整理。先把那天留下的气息，放在这里。",
    "shares": [
      {
        "id": "founder-hope",
        "title": "积极希望",
        "kicker": "四位创始人团队的首次分享",
        "author": "四位创始人团队",
        "authorLabel": "首次分享",
        "badgeLabel": "四位创始人团队 · 首次分享",
        "question": "最近，还有什么让你愿意再往前一点？",
        "summary": "四个人围坐下来，从一个很小的问题开始。有人说，有人听，有人把刚刚亮起来的地方轻轻还给对方。",
        "note": "被听见的不是概念，而是一个人正在发生的东西。",
        "tags": ["希望", "聆听", "回应"],
        "mediaKind": "video",
        "featured": true,
        "status": "published"
      }
    ]
  }
  $$::jsonb,
  now()
)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'shares',
  'shares',
  true,
  167772160,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Enable Row Level Security
alter table meditation_content enable row level security;
alter table share_content enable row level security;
alter table node_cards enable row level security;

-- Allow inserts from anonymous users (for the join form)
create policy "Allow anonymous inserts" on node_cards
  for insert with check (true);

-- Only allow authenticated users to read (for admin)
create policy "Allow authenticated reads" on node_cards
  for select using (auth.role() = 'authenticated');
