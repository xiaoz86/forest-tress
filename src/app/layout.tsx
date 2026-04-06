import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "附近森林 · 生态社区",
  description: "让独立的个体彼此连接，流动，让附近生长。一个关于连接、对话、支持、共创与持续生长的生态社区。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700;900&family=Noto+Sans+SC:wght@300;400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
