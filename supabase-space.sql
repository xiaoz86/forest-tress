-- ============================================================
-- 个人网站空间：线上存储（在 Supabase SQL Editor 里执行一次；重复执行也安全）
--
-- 代码里的存储层（src/lib/space/db.ts、store.ts、backend.ts）在生产环境默认用这里的表；
-- 本地开发默认还是 .space-cache/ 里的 JSON 文件（想在本地连 Supabase 试，设 SPACE_STORE=supabase）。
-- 本地已有的数据（17 位成员的 AI 起稿、小 Z 的设置和收款码……；标着 [演示] 的活动和报名默认不搬）
-- 用 scripts/migrate-space-to-supabase.mjs 搬上来：先不加参数预览，再加 --apply；线上已有的不会被覆盖。
-- 本地想试这条路，别直接连线上库：SPACE_STORE=supabase 加 SPACE_SUPABASE_URL / SPACE_SUPABASE_SERVICE_ROLE_KEY
-- 指到测试库（见 src/lib/space/backend.ts）。项目设置里的 API Max rows 保持 ≥ 1000（默认值）。
--
-- 存法：一行一条 jsonb 文档，而不是一个字段一列。
--   代码读写的都是整行对象（src/lib/space/types.ts），字段还在长：一列一列地映射，每加一个字段就要
--   同时改 SQL、类型和映射，漏一处就是线上静默丢字段。查询都在服务端按成员过滤，数据量是几十到几千行。
--
-- 权限：三张表都开 RLS、不写任何 policy——浏览器拿到的 anon / authenticated 角色一行都读不到，
--   只有服务端的 service role 能读写。报名人、预约人、打招呼的人留的联系方式只有空间主人和管理员能看到，
--   这由接口保证（src/lib/space/gate.ts）。
-- ============================================================

-- 六张「表」的每一行：settings（每人的发布与可见性设置）、events（活动）、registrations（报名）、
-- bookings（服务预约）、greetings（打招呼）、outbox（开发环境的待发邮件，线上基本不用）
create table if not exists space_rows (
  tbl text not null check (tbl in ('settings', 'events', 'registrations', 'bookings', 'greetings', 'outbox')),
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (tbl, id)
);

-- 每个人一份空间记录：AI 画像与起稿（result）、风格选择（style）、本人的编辑（edits）、调过的风格（tune）
create table if not exists space_records (
  member_id text primary key,                  -- = node_cards.id（小写）
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 跨实例的互斥锁：名额、口令唯一、短链唯一这类「先查再写」要在同一把锁里做（见 backend.ts withLock）。
-- 一行就是一把正被拿着的锁，做完即删；拿锁的实例中途死掉，过了 expires_at 别人可以清掉重拿。
create table if not exists space_locks (
  key text primary key,
  holder text not null,
  expires_at timestamptz not null
);

alter table space_rows enable row level security;
alter table space_records enable row level security;
alter table space_locks enable row level security;
-- 再保险一层：浏览器用的两个角色连表都摸不到
revoke all on space_rows, space_records, space_locks from anon, authenticated;

-- 私有桶：收款码、付款截图、活动封面。不公开读取，只经过有权限检查的接口往外给。单张 4MB 以内
-- （线上接口跑在 Vercel，请求体超过 4.5MB 进不来；浏览器上传前会先把照片缩到 1600px）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('space-private', 'space-private', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ------------------------------------------------------------
-- 如果之前执行过旧版这份文件（一个字段一列的 space_settings / space_events / space_registrations /
-- space_bookings / space_greetings），那几张表代码从没写过、都是空的，可以删掉。确认是空的再执行：
--   select 'space_settings', count(*) from space_settings union all
--   select 'space_events', count(*) from space_events union all
--   select 'space_registrations', count(*) from space_registrations union all
--   select 'space_bookings', count(*) from space_bookings union all
--   select 'space_greetings', count(*) from space_greetings;
--   drop table if exists space_registrations, space_events, space_bookings, space_greetings, space_settings;
-- ------------------------------------------------------------

-- 还留在进程内存里、多实例下不共享的三处（数量小，暂时够用；访问量起来再换成表或 KV）：
-- 1. 访客提交的限流（src/lib/space/guard.ts）
-- 2. 一句话调风格的次数限制（src/app/api/space/tune/route.ts，每人每小时 40 次）
-- 3. AI 改写一块内容的次数限制（src/app/api/space/rewrite/route.ts，每人每小时 30 次）
--
-- AI 自动起稿：新人走完注册、或轻登记补完资料进森林时自动在后台起稿，空间第一次被打开时也会补
-- （src/lib/space/autoDraft.ts）。线上默认关着：上面这些表建好、数据搬上来、部署之后，
-- 在 Vercel 的环境变量里加 SPACE_AUTO_DRAFT=1 再重新部署。起稿要调模型、十几秒，跑在请求结束之后（after）：
-- Vercel 项目的函数最长时长要够（Fluid compute 默认 300 秒够用；关掉了 Fluid 的话，确认不少于 60 秒）。
