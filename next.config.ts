import type { NextConfig } from "next";

function supabaseImageBuckets(buckets: string[]) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return [];
  const u = new URL(base);
  return buckets.map(b => ({
    protocol: u.protocol.replace(":", "") as "https" | "http",
    hostname: u.hostname,
    port: u.port,
    pathname: `/storage/v1/object/public/${b}/**`,
    search: "",
  }));
}

const nextConfig: NextConfig = {
  /**
   * 开发时允许从 localhost 之外的地址访问。
   *
   * Next 默认只信任「服务器启动时用的那个 hostname」（也就是 localhost），
   * 从别的源访问会被当成跨源，**dev 专用资源和端点一律拦掉**。
   * 表现非常有迷惑性：页面 HTML 正常渲染、所有 JS chunk 都是 200，
   * 但 HMR WebSocket 连不上，React 不 hydrate，
   * 于是**整页所有按钮和交互全是死的**，而控制台只有 WebSocket 报错。
   *
   * 我们自己就在 127.0.0.1:3000 上踩了一次：星星和 tab 全点不动，
   * 排查了半天才发现和页面代码无关。
   *
   * 只影响开发，生产构建不读这个字段。
   */
  allowedDevOrigins: ["127.0.0.1", "localhost", "0.0.0.0"],

  /**
   * 个人空间首屏用成员照片做背景：原图动辄 4000px、1–2MB，
   * 而 Supabase 免费版对公开对象一律 no-cache、每次整拉（见 .claude 记忆）。
   * 交给 next/image 缩到屏幕需要的尺寸并缓存，Supabase 只在第一次被拉一遍。
   *
   * 头像、作品图的文件名都带上传时间戳，同一个地址的内容不会变，缓存可以放长。
   */
  /**
   * 个人空间的短链：nearby-forest.club/@xiaoz。
   * 用 rewrite 而不是 redirect——地址栏和分享出去的链接一直是短的那个。
   * 名片二维码指向 /c/<成员 id>/<口令>（老名片是 /@xiaoz/k/<口令>，也认）：先记下「扫过我名片」，
   * 再跳到现在的地址（口令不留在地址栏里被二次转发）。
   */
  async rewrites() {
    return [
      // 名片二维码用和短链无关的地址：改了短链，已经印出去的名片照样能扫（card-scan 会跳到现在的短链）
      { source: "/c/:id/:token", destination: "/api/space/card-scan?id=:id&k=:token" },
      { source: "/@:slug/k/:token", destination: "/api/space/card-scan?slug=:slug&k=:token" },
      { source: "/@:slug", destination: "/s/:slug" },
    ];
  },

  /**
   * 这些 UA 拿到「阻塞式」的 metadata（标题、摘要、分享图直接在 <head> 里），而不是流式插到后面。
   * Next 默认名单里没有微信、QQ、微博、钉钉、飞书——个人空间的链接主要就是在这些地方被转发的，
   * 它们读不到流式插入的 og 标签，分享卡就没有标题和图。
   * 写了这项会覆盖默认名单，所以前半段原样抄的是 Next 16 的默认值（next/dist/shared/lib/router/utils/html-bots.js）。
   * 代价：微信内置浏览器的 UA 也带 MicroMessenger，这些用户的页面要等 metadata 算完才开始输出——
   * 个人空间页的 metadata 和页面本身读的是同一份数据，几乎不增加等待。
   */
  htmlLimitedBots: new RegExp(
    "[\\w-]+-Google|Google-[\\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight" +
      "|MicroMessenger|WeChat|QQ\\/|MQQBrowser|Weibo|DingTalk|Lark|Feishu|TelegramBot|Bytespider|YisouSpider",
    "i",
  ),

  images: {
    // 只放行头像和作品图两个桶：放行整个 public/** 会连 160MB 视频的分享桶也能被 /_next/image 反复回源拉
    remotePatterns: supabaseImageBuckets(["avatars", "works"]),
    // 两个桶的上传上限都是 5MB；超过的直接拒，不把大文件读进内存
    maximumResponseBody: 6_000_000,
    // 放行的地址跳转到别处时不跟：remotePatterns 不会对跳转后的地址再校验一遍
    maximumRedirects: 0,
    // 地址带上传时间戳、内容不变，可以缓存；但成员删掉的图，优化过的副本最多还能访问这么久
    minimumCacheTTL: 60 * 60 * 24 * 7,
    // 每一档宽度第一次都要回源拉一次原图，档少一点，Supabase 被整拉的次数就少一点
    deviceSizes: [640, 828, 1080, 1440, 1920],
  },
};

export default nextConfig;
