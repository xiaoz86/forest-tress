---
title: 作品 / 项目 模块 · 开发者文档
description: works 字段、API、组件结构、上线步骤
audience: 开发者 / 主理人
---

# 作品 / 项目 模块

把每一个创造者的"作品集"做成可上传、可点跳转、可拖拽编辑的**书架**，并把「加入节点」流程接通——新成员一加入就能生成自己的书架。

---

## 数据模型

`node_cards.works` 是一个 **`jsonb`** 列，存放当前这位创造者的作品数组（最多 12 条，避免无界）。

```sql
alter table node_cards
  add column if not exists works jsonb default '[]'::jsonb;
```

每一条作品的结构（[`Work` type](../src/lib/supabase.ts)）：

```ts
type Work = {
  id: string;            // 客户端生成的 stable id (w_<base36ts><rand>)
  title: string;         // <= 80 chars，必填
  desc?: string;         // <= 240 chars
  image_url?: string;    // Supabase Storage public URL，5MB 内
  url?: string;          // http(s):// 跳转链接
  created_at: string;    // ISO timestamp
};
```

> ✱ 把作品**直接挂在 `node_cards` 上**而不是用单独的 `node_works` 表，原因是：
>
> - 一位创造者通常 < 12 条作品，关系级联无意义
> - 详情页是 `select * from node_cards`，一次查询拿到所有数据，不引入 join
> - 删除创造者时作品自动随节点消失，无外键孤儿问题
> - jsonb 在 Postgres 里查询索引都很成熟，无需额外建模

封面图存在 **Supabase Storage `works` bucket**（首次上传 API 会自动建 bucket，public）。

---

## API 路由

所有变更都在 [`src/app/api/works/route.ts`](../src/app/api/works/route.ts)。

### `POST /api/works` · 创建一条作品

`multipart/form-data`：

| 字段 | 必填 | 说明 |
|---|---|---|
| `nodeId` | ✓ | 创造者节点 id |
| `title` | ✓ | 作品标题 |
| `desc` | | 一两句话描述 |
| `url` | | 必须 `^https?://` |
| `file` | | 封面图 ≤ 5MB / JPG / PNG / WebP / HEIC |

**鉴权**：`nf_member` cookie === `nodeId`（本人）或 cookie ∈ `ADMIN_NODE_IDS`（管理员）。其他返回 `403 forbidden`。

成功 → `{ work: Work, works: Work[] }`。新作品**插到数组开头**，所以最新的在最前。

### `PATCH /api/works?nodeId=...&workId=...` · 部分更新

`multipart/form-data`，**只更新提交了的字段**：

- `title` 提供时不能为空
- `desc` 传空串 → 清空
- `url` 传空串 → 清空；传非空必须 `^https?://`
- `file` 上传新封面 → 旧封面 best-effort 从 Storage 删掉

错误：`work-not-found` / `bad-url` / `bad-file-type` / `nothing-to-update`。

### `DELETE /api/works?nodeId=...&workId=...`

删除作品行，并 best-effort 从 Storage 清理对应封面图。

---

## 加入流程对接

[`src/app/api/join/route.ts`](../src/app/api/join/route.ts) 在 `POST` body 中接受可选的 `works` 数组。

服务端 [`sanitizeWorks()`](../src/app/api/join/route.ts) 做的事：

```
input → filter empty title → trim/cap length → drop non-http(s) urls
      → server-generate id + created_at → cap at 12 entries
```

不允许客户端自己塞 `id` / `created_at` / `image_url`——封面图是加入后的二次操作（避免一次表单提交里同时处理 multipart + 文件 + AI 匹配的复杂度）。

如果数据库还没跑过 `alter table … works` 的库（旧环境），insert 会失败一次，路由会自动**剥掉 works 字段重试一次**，保证基本入会流程不挂。

---

## 前端组件

```
src/components/
├── WorksCarousel.tsx   # 公开展示 — server component
└── WorksEditor.tsx     # 本人 / 管理员可见 — client component
```

### WorksCarousel（展示）

无状态，纯 server component。
书架式横向滚动：3:4 卡片、`snap-x snap-mandatory`、底部一条 gradient "shelf-line"。
没图的卡片用从 5 个温柔渐变里 hash 选一个，标题以 display 字体居中渲染——形成"占位封面"。
有 url 的卡片用 `<a target="_blank">` 包裹整张卡。

### WorksEditor（编辑）

```
[+ 添加作品]
─────────────────────────────────
[缩略图] 标题            📷 ✎ ×
        url 或 desc 预览
─────────────────────────────────
```

每行三个图标：

| | 行为 |
|---|---|
| 📷 | 触发隐藏的 `<input type="file">` → 上传新封面 → `PATCH ?file=...` |
| ✎ | 用当前作品的 title/desc/url 预填创建表单，切换到"编辑模式"，提交时用 `PATCH` 而非 `POST` |
| × | confirm + DELETE |

`router.refresh()` 触发 RSC 重新拉取，无需手动塞 state。

### CreatorDetail 页面对接

[`src/app/creators/[id]/page.tsx`](../src/app/creators/[id]/page.tsx) 中 `WorksSection` 决定显示什么：

| works 数组 | legacy `me.product` | 访客可编辑？ | 显示 |
|---|---|---|---|
| 有 ≥ 1 条 | — | — | `<WorksCarousel>` |
| 空 | 有 | — | 兜底渲染 `me.product` 文本（老用户不会内容丢失） |
| 空 | 空 | ✓ | 友好的"还没作品 · 点 + 添加"提示 |
| 空 | 空 | ✗ | 整段隐藏 |

加 `<WorksEditor>` 的条件：viewer 是本人或管理员。

---

## 加入流程对接（前端）

[`src/components/JoinForm.tsx`](../src/components/JoinForm.tsx) 多了一段：

```jsx
{works.length > 0 && <WorksRowList /* title / desc / url 输入 */ />}
<button>+ 添加你的第一个作品 / 再加一条</button>
```

提交时把 `cleanWorks`（过滤掉空标题的行）合到 `body.works`。
作品集**完全可选**——不填也不影响入会。

---

## 上线 / 部署

1. 在生产 Supabase SQL Editor 跑：
   ```sql
   alter table node_cards add column if not exists works jsonb default '[]'::jsonb;
   ```
2. 推到 `main`，Vercel 自动部署。
3. **不需要手动建 Storage bucket** — `/api/works` 在第一次上传时检查并创建 `works` public bucket（5MB 单文件上限）。

---

## 数据迁移：老用户的 `product` 文本

老用户的 `node_cards.product` 不会被动迁移。
- 如果他们没填新作品 → 详情页继续渲染老的 `product` 文本（fallback）
- 如果他们/管理员加了第一条结构化作品 → 书架接管展示，老文本不再出现（数据仍在 DB 里，可日后选择删除或归档）

短期不必清理，长期可以加个一次性脚本把 `product` 文本里的链接抽出来生成对应的 Work 行——但不是现在的优先级。

---

## 配额与边界

| 边界 | 值 | 在哪里 |
|---|---|---|
| 单条作品标题长度 | 80 | API + 前端 maxLength |
| 单条作品描述长度 | 240 | API + 前端 |
| 单条 URL 长度 | 500 | API |
| 一个节点最多作品数 | 12 | `MAX_WORKS_AT_JOIN` / `MAX_WORKS` |
| 单图大小 | 5MB | API `MAX_BYTES` |
| 图片格式 | JPG / PNG / WebP / HEIC / HEIF | API `ALLOWED_MIME` |

---

## 复制粘贴：本地复现完整流程

```bash
# 1. 拉最新
git pull --ff-only origin main
npm install

# 2. 跑库迁移（一次）
# 在 Supabase SQL Editor 执行：
#   alter table node_cards add column if not exists works jsonb default '[]'::jsonb;

# 3. 启动 dev
npm run dev
# → http://localhost:3000

# 4. 跑一遍：
#    - /#join 加入一个测试节点（带 1-2 条作品）
#    - 跳到 /creators/<新节点id> 看见书架
#    - 在浏览器 DevTools 里手动设 cookie：
#         document.cookie = 'nf_member=<id>; path=/; max-age=31536000'
#    - 刷新，看到 + 添加作品 / 📷 / ✎ / × 行操作
```

---

## 文件清单

新增 / 改动文件：

```
docs/
├── launch-announcement.md          # 用户向发布文章
└── works-feature.md                # 本文件

src/
├── app/
│   ├── api/
│   │   ├── join/route.ts           # +sanitizeWorks() & body.works 接入
│   │   └── works/route.ts          # POST / PATCH / DELETE
│   └── creators/[id]/page.tsx      # WorksSection 接入
├── components/
│   ├── JoinForm.tsx                # +作品集动态行
│   ├── WorksCarousel.tsx           # 书架展示
│   └── WorksEditor.tsx             # 行内编辑器
└── lib/
    └── supabase.ts                 # +Work type

scripts/
├── capture-screenshots.mjs         # puppeteer 截图脚本
└── build-launch-gif.sh             # ffmpeg GIF 拼接

public/launch-screenshots/          # 静态截图 + feature-tour.gif
supabase-setup.sql                  # +alter table 行
```
