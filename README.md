This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## 小芽 · AI 森林园丁

小芽是附近森林的全站在线向导，负责解释平台使命、产品入口、社区共创方式与公开设计理念。她不读取 PhilCoach 对话、付款资料或其他成员的私人信息，也不会代用户发布、删除或发送内容；需要深入自我探索时会引导到 PhilCoach。

- 全局入口：根布局中的 `src/components/xiaoya/`
- 服务端聊天：`POST /api/xiaoya/chat`，使用 NDJSON 流式响应
- 角色与安全边界：`src/lib/xiaoya/constitution.ts`、`safety.ts`
- 页面感知：`src/lib/xiaoya/pageContext.ts`
- 知识库：`content/xiaoya/**/*.md`，以 frontmatter 标注适用页面和关键词
- 黄金问题：`tests/fixtures/xiaoya-golden.json`

小芽复用已有 `DEEPSEEK_*` 配置，并在未配置 DeepSeek 时沿用 `MOONSHOT_API_KEY` / `KIMI_*` 兜底，不需要新的浏览器端 API Key。可选功能开关如下：

```bash
XIAOYA_ENABLED=true
XIAOYA_RAG_ENABLED=true
XIAOYA_TOOLS_ENABLED=false
XIAOYA_FEEDBACK_ENABLED=false
```

第一版对话只保存在当前浏览器内存中，刷新后清空；服务端只接收最近 12 条消息，不将聊天写入数据库。更新知识时新增或修改 `content/xiaoya/` 内的 Markdown，并维护 `id`、`title`、`summary`、`category`、`pageTypes`、`keywords`、`priority`、`updatedAt` 和 `locale`。

验证小芽：

```bash
npm run test:xiaoya
npm run lint
npx tsc --noEmit
npm run build
```
