export type RateLimitRule = {
  key: string;
  max: number;
  windowMs: number;
};

export type RateLimitResult = {
  limited: boolean;
  retryAfterSeconds: number;
};

export class SlidingWindowRateLimiter {
  private readonly buckets = new Map<string, number[]>();

  consume(rules: RateLimitRule[], now = Date.now()): RateLimitResult {
    const active = rules.map(rule => ({
      ...rule,
      entries: (this.buckets.get(rule.key) || []).filter(time => now - time < rule.windowMs),
    }));

    const blocked = active.find(rule => rule.entries.length >= rule.max);
    if (blocked) {
      this.buckets.set(blocked.key, blocked.entries);
      const oldest = blocked.entries[0] ?? now;
      return {
        limited: true,
        retryAfterSeconds: Math.max(1, Math.ceil((blocked.windowMs - (now - oldest)) / 1000)),
      };
    }

    for (const rule of active) this.buckets.set(rule.key, [...rule.entries, now]);
    if (this.buckets.size > 5000) {
      for (const key of Array.from(this.buckets.keys()).slice(0, 2500)) this.buckets.delete(key);
    }
    return { limited: false, retryAfterSeconds: 0 };
  }

  clear(): void {
    this.buckets.clear();
  }
}

const WINDOW_MS = 10 * 60 * 1000;
const globalLimiter = new SlidingWindowRateLimiter();

export function checkXiaoyaRateLimit(ip: string, memberId: string, now = Date.now()): RateLimitResult {
  const safeIp = ip.slice(0, 128) || 'unknown';
  if (!memberId) {
    return globalLimiter.consume([{ key: `guest-ip:${safeIp}`, max: 10, windowMs: WINDOW_MS }], now);
  }
  return globalLimiter.consume([
    { key: `member:${memberId}`, max: 30, windowMs: WINDOW_MS },
    { key: `member-ip:${safeIp}`, max: 60, windowMs: WINDOW_MS },
  ], now);
}

