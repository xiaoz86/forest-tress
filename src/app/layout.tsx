import type { Metadata } from "next";
import { Suspense } from "react";
import { XiaoyaShell } from "@/components/xiaoya/XiaoyaShell";
import { dict } from "@/i18n";
import { getLocale } from "@/lib/locale";
import { isXiaoyaEnabled } from "@/lib/xiaoya/flags";
import "./globals.css";

/**
 * 站点级兜底标题。各页大多有自己的 generateMetadata，
 * 这一份只在没写的页面上生效——但也得跟着语言走。
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = dict(await getLocale()).home;
  return { title: t.metaTitle, description: t.metaDescription };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  /**
   * lang 必须跟着语言走。写死 zh-CN 的话，读屏软件会用中文音库去念
   * 英文内容（听起来像乱码），搜索引擎也会把英文页判成中文页。
   *
   * 这里读 cookie 会让整棵树进入动态渲染。代价很小：全站只有 /launch
   * 和 404 是静态的，其余页面本来就在读 cookie 或标了 force-dynamic。
   */
  const locale = await getLocale();

  return (
    <html lang={locale === "en" ? "en" : "zh-CN"}>
      <head>
        {/*
          Manrope 和 EB Garamond 是拉丁字体，整份也就几十 KB。
          两个 Noto CJK 只作为兜底：中文栈里 PingFang / 微软雅黑排在它们前面，
          绝大多数设备根本不会去下载那些分片（CJK webfont 按 unicode-range
          切成几百片，用到哪片才拉哪片）。
        */}
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600&family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=Noto+Serif+SC:wght@300;400;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        {isXiaoyaEnabled() && (
          <Suspense fallback={null}>
            <XiaoyaShell locale={locale} />
          </Suspense>
        )}
      </body>
    </html>
  );
}
