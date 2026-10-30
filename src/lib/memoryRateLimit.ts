/**
 * 进程内的滑动窗口限流 + 取客户端 IP。
 *
 * serverless 多实例下不精确（每个实例各数各的），但足以挡住朴素的滥用——
 * 和 phil-coach 其他路由里手写的那几份是同一个思路，新路由共用这一份。
 */

export function createMemoryRateLimiter({
  max,
  windowMs,
  maxKeys = 5_000,
}: {
  max: number;
  windowMs: number;
  maxKeys?: number;
}) {
  const buckets = new Map<string, number[]>();
  /** 记一次并返回是否超限（超限的那次不计入） */
  return function isLimited(key: string, now = Date.now()): boolean {
    const bucket = (buckets.get(key) || []).filter(t => now - t < windowMs);
    if (bucket.length >= max) {
      buckets.set(key, bucket);
      return true;
    }
    bucket.push(now);
    buckets.set(key, bucket);
    if (buckets.size > maxKeys) {
      // 防止 Map 无限增长：粗暴清理最旧的一半
      for (const k of Array.from(buckets.keys()).slice(0, Math.floor(maxKeys / 2))) buckets.delete(k);
    }
    return false;
  };
}

export function clientIp(request: Request): string {
  return clientIpFromHeaders(request.headers);
}

/** 服务端组件里只有 headers()，没有 Request；取法和路由里完全一致（直连识别的票要两边对得上） */
export function clientIpFromHeaders(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const value = forwarded || headers.get('x-real-ip')?.trim() || 'unknown';
  return value.replace(/[\u0000-\u001f\s]/g, '').slice(0, 128) || 'unknown';
}

/**
 * 同一个东西最多用几次（进程内，到期自动忘掉）。
 * /speak 拿它数「同一个签名句子被合成了几次」：正常用法一段最多念几遍，
 * 拿着一个签名反复刷的，到上限就不再合成。多实例下各数各的，只是抬高门槛。
 */
export function createUseCounter({ max, maxKeys = 20_000 }: { max: number; maxKeys?: number }) {
  const uses = new Map<string, { count: number; expiresAt: number }>();
  /** 记一次并返回是否已经超过上限（超过的那次不计入）；expiresAt 之后这条记录作废 */
  return function overLimit(key: string, expiresAt: number, now = Date.now()): boolean {
    const entry = uses.get(key);
    if (entry && entry.expiresAt > now) {
      if (entry.count >= max) return true;
      entry.count += 1;
      return false;
    }
    uses.set(key, { count: 1, expiresAt });
    if (uses.size > maxKeys) {
      for (const [k, v] of uses) {
        if (v.expiresAt <= now) uses.delete(k);
      }
      // 都没过期还是太多：粗暴清掉最旧的一半
      if (uses.size > maxKeys) {
        for (const k of Array.from(uses.keys()).slice(0, Math.floor(maxKeys / 2))) uses.delete(k);
      }
    }
    return false;
  };
}
