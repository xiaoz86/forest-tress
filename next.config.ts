import type { NextConfig } from "next";

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
};

export default nextConfig;
