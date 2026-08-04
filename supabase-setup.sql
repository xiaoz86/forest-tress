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
    "title": "走入正念，\n把注意力带回当下",
    "description": "从走入正念开始，正念生活、情绪、自我关怀和内在自由，会成为几条慢慢展开的小径。每一段声音，都带人回到此刻。",
    "note": "五条小径",
    "categories": [
      {
        "id": "walk-in",
        "label": "走入正念",
        "description": "从暂停、放松和感官唤醒开始，先把注意力轻轻带回当下。",
        "heroTitle": "走入正念",
        "heroSubtitle": "从一段暂停，回到身心的现场",
        "mood": "forest"
      },
      {
        "id": "mindful-life",
        "label": "正念生活",
        "description": "把日常里的片刻，变成可以练习觉察的小路。",
        "heroTitle": "正念生活",
        "heroSubtitle": "在普通一天里，慢慢醒来",
        "mood": "daily"
      },
      {
        "id": "emotion",
        "label": "正念与情绪",
        "description": "在焦虑、压力和波动里，学习先看见情绪，再温柔地安放它。",
        "heroTitle": "正念与情绪",
        "heroSubtitle": "让情绪被看见，也被放下",
        "mood": "emotion"
      },
      {
        "id": "self-care",
        "label": "自我关怀",
        "description": "用更柔软的方式陪伴自己，在身体与心里建立一点安全感。",
        "heroTitle": "自我关怀",
        "heroSubtitle": "把温柔，也留给自己",
        "mood": "care"
      },
      {
        "id": "inner-freedom",
        "label": "疗愈和内在自由",
        "description": "让压抑、紧绷和旧有模式慢慢松动，给内在多一点空间。",
        "heroTitle": "疗愈和内在自由",
        "heroSubtitle": "在松动里，重新获得空间",
        "mood": "healing"
      }
    ],
    "tracks": [
      {
        "id": "pause-into-now",
        "title": "暂停进入当下",
        "intention": "给自己一次短暂停靠，先把呼吸、身体和眼前的环境听见。",
        "duration": "13 分钟",
        "stage": "走入正念",
        "categoryId": "walk-in",
        "mood": "forest"
      },
      {
        "id": "mindful-senses",
        "title": "活在当下的感官唤醒",
        "intention": "透过感官回到此刻，让看见、听见和触碰重新变得清晰。",
        "duration": "11 分钟",
        "stage": "走入正念",
        "categoryId": "walk-in",
        "mood": "daily"
      },
      {
        "id": "conscious-relaxation",
        "title": "有意识放松",
        "intention": "从身体的松开进入正念，把紧绷一点点放下。",
        "duration": "13 分钟",
        "stage": "走入正念",
        "categoryId": "walk-in",
        "mood": "healing"
      },
      {
        "id": "self-compassion-10",
        "title": "10 分钟自我关怀",
        "intention": "以更温柔的语气靠近自己，给内在一个可以停留的位置。",
        "duration": "11 分钟",
        "stage": "走入正念",
        "categoryId": "walk-in",
        "mood": "care"
      }
    ]
  }
  $$::jsonb,
  now()
)
on conflict (id) do nothing;

-- 冥想音频 bucket。必须是私有的：陪伴营的音频要付费才能听，
-- 公开桶给出的是永久链接，转发一次就漏了。取用一律走
-- /api/meditations/stream —— 那里校验资格后现发短时效签名链接。
--
-- 注意下面是 on conflict do update：这段会覆盖已有设置。
-- 把 public 改回 true 等于当场废掉整个付费墙。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meditations',
  'meditations',
  false,
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

-- ============================================================
-- 2026-07-05 phil-coach 知识库（教练之眼的深度弹药）
-- 来源：本地教练知识库的原创综述（书籍卡片/深度笔记/能力库）。
-- 注意：督导笔记与真实案例受保密规范约束，永不入此表。
-- 检索：MVP 用 themes 数组重叠匹配；embedding 列预留给未来 pgvector。
create table if not exists phil_coach_knowledge (
  id uuid default gen_random_uuid() primary key,
  source text not null,            -- 相对路径，如 教练知识库/深度笔记/03-心理学与心智/心流.md#实践工具箱
  category text not null,          -- cards | deep-notes | competency
  title text not null,             -- 书名或文档名（含章节）
  themes text[] default '{}',      -- 主题标签：情绪/选择/心魔/关系/职业/意义/正念/沟通/领导力…
  content text not null,           -- 知识块正文（≤2000 字）
  priority int default 5,          -- 1 最高；同主题命中时的排序
  updated_at timestamptz default now()
);

create index if not exists idx_phil_knowledge_themes on phil_coach_knowledge using gin (themes);

-- ============================================================
-- 2026-07-06 phil-coach 记忆表（已在线上执行；功能暂缓，结构先行）
-- 注册用户明示同意「留住」的对话片段。设计要点：
--   独立表而非 node_cards 加字段：逐条可删、纯追加无竞态、生命周期独立
--   on delete cascade：删号即删记忆，隐私靠结构保证
--   只存「留住的片段+一句话 takeaway」，不存全对话
--   share_to_matching 默认 false：留存与反哺匹配是两次独立同意
create table if not exists phil_coach_memories (
  id uuid default gen_random_uuid() primary key,
  node_id uuid not null references node_cards(id) on delete cascade,
  content text not null,              -- 用户选择留住的那段对话（原文）
  takeaway text default '',           -- 一句话觉察/行动承诺（下次开场衔接用）
  path_id text default '',            -- 来自哪条小径
  share_to_matching boolean default false,  -- 是否同意反哺匹配（单独勾选，默认否）
  created_at timestamptz default now()
);

create index if not exists idx_phil_memories_node
  on phil_coach_memories(node_id, created_at desc);

-- ============================================================
-- 2026-07-12 phil-coach 反馈表（需在 SQL Editor 执行）
-- 体验后的模块反馈 / 咨询真人教练陪伴的留言。
-- node_id 可空（未登录也能反馈）；删号后置空保留反馈内容。
create table if not exists phil_coach_feedback (
  id uuid default gen_random_uuid() primary key,
  node_id uuid references node_cards(id) on delete set null,
  kind text not null default 'feedback',   -- feedback=模块反馈 | coach-inquiry=咨询真人教练
  message text not null,
  contact text default '',                 -- 微信/邮箱等联系方式（选填）
  created_at timestamptz default now()
);

create index if not exists idx_phil_feedback_created
  on phil_coach_feedback(created_at desc);

-- ============================================================
-- 2026-07-12 phil-coach 轻登记（方案A：第一条小径免登记，继续用需留称呼+微信）
-- 登记后种 nf_guest cookie，永远免费使用；主理人收邮件后主动加微信拉入社群。
-- 只记身份与使用时间，不记对话内容（与页面隐私承诺一致）。
create table if not exists phil_coach_guests (
  id uuid default gen_random_uuid() primary key,
  name text not null,                -- 怎么称呼
  contact text not null,             -- 微信号（或邮箱）
  source text default '',            -- 来源归因（?from=community 等）
  created_at timestamptz default now(),
  last_seen timestamptz default now()
);

create index if not exists idx_phil_guests_created
  on phil_coach_guests(created_at desc);

-- ============================================================
-- 2026-07-21 轻登记增加审核流：登记后需主理人在邮件里点击通过，才可继续使用
alter table phil_coach_guests add column if not exists status text not null default 'pending';
alter table phil_coach_guests add column if not exists approved_at timestamptz;

-- ============================================================
-- 2026-08-03 陪伴营付费与解锁（21 天睡眠陪伴营）
--
-- 第一版不接商户号：钱走微信/支付宝收款码，网站只管开权限。
-- 用户点解锁 → 建一条 pending 单并拿到四位口令 → 付款时把口令写在备注里
-- → 主理人对着收款记录搜口令 → 一键置为 paid。
-- 将来接了支付，改的只是「谁把 status 写成 paid」，表结构不用动。
create table if not exists program_orders (
  id uuid default gen_random_uuid() primary key,
  member_id text not null,                  -- nf_member cookie 里那个节点 id
  program_id text not null,                 -- 对应 meditation category id，如 'sleep'
  code text not null,                       -- 四位口令，付款备注里填这个
  status text not null default 'pending',   -- pending | claimed | paid | rejected
  amount_cents int not null default 6800,
  note text default '',                     -- 主理人备注（驳回原因等）
  created_at timestamptz default now(),
  confirmed_at timestamptz,
  confirmed_by text                         -- 哪个管理员点的确认
);

-- 口令只在「待确认」之间保证唯一；单子结掉之后可以循环使用，
-- 所以是部分唯一索引，不是普通 unique。
create unique index if not exists idx_program_orders_pending_code
  on program_orders(code) where status = 'pending';

create index if not exists idx_program_orders_member
  on program_orders(member_id, program_id);

create index if not exists idx_program_orders_created
  on program_orders(created_at desc);

-- 开 RLS 且不加任何 policy = 只有服务端（service role key）能读写。
-- 这是购买凭证，绝不能让浏览器直接查——否则谁都能给自己插一条 paid。
alter table program_orders enable row level security;

-- ============================================================
-- 2026-08-03 听后感悟（每段音频下的公开留言）
--
-- 这批内容是失眠、焦虑、自我接纳——写感悟等于在公开场合谈自己的状态。
-- 所以匿名是一等公民而不是补丁：anonymous=true 时读接口永不下发
-- author_name，但库里仍然留着，主理人才能在需要时追溯和下架。
create table if not exists meditation_notes (
  id uuid default gen_random_uuid() primary key,
  track_id text not null,
  program_id text not null default '',      -- 冗余，方便按专题聚合
  member_id text not null,                  -- node_cards.id
  author_name text not null default '',     -- 写下时的快照：改名不改写历史
  anonymous boolean not null default false,
  body text not null,
  status text not null default 'visible',   -- visible | hidden（主理人下架）
  created_at timestamptz default now()
);

create index if not exists idx_meditation_notes_track
  on meditation_notes(track_id, created_at desc);

create index if not exists idx_meditation_notes_member
  on meditation_notes(member_id, created_at desc);

-- 和 program_orders 一样：开 RLS 不加 policy = 只有服务端能读写。
-- 浏览器直连的话，匿名那层就等于没有——谁都能查出 author_name。
alter table meditation_notes enable row level security;

-- 2026-08-04 「我已完成付款」：用户自助确认后立刻放行，主理人事后核对。
-- 个人收款码没有回调，服务器无从知道钱到没到；与其让每个人付完干等，
-- 不如先给，核对不上再撤。status 多一档 claimed（介于 pending 和 paid 之间）。
alter table program_orders add column if not exists claimed_at timestamptz;

-- 2026-08-04 付款截图：claim 时必须上传，存私有桶，只有主理人能看。
-- 注意它不是「验证」——伪造截图的工具满地都是，OCR 分辨不出来。
-- 它的作用是威慑（伪造凭证的心理成本远高于点一个按钮）和证据
-- （主理人手里有金额/时间/备注可以和收款记录对照）。
alter table program_orders add column if not exists proof_path text;
