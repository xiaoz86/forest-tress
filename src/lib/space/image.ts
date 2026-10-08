/**
 * 成员照片能不能交给 next/image 缩图、能不能让服务端去读图片头。
 *
 * 只认我们自己 Supabase 项目里头像和作品图两个公开桶（和 next.config 的 remotePatterns 一致）。
 * 先用 URL 解析再比：原始字符串前缀比较挡不住 public/../../rest/v1 这类写法。前后端都能用。
 */
const BASE = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL) : null;
  } catch {
    return null;
  }
})();
const BUCKETS = ['avatars', 'works'];

export function canOptimize(url: string | null | undefined): boolean {
  if (!url || !BASE) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.origin !== BASE.origin || u.search || u.username || u.password) return false;
  return BUCKETS.some(b => u.pathname.startsWith(`/storage/v1/object/public/${b}/`));
}
