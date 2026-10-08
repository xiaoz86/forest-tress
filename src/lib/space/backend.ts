import 'server-only';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * 个人空间的数据存在哪：本地 JSON 文件（开发时）还是 Supabase（线上）。
 *
 * - SPACE_STORE=supabase / local 明确指定；不指定时，生产环境用 Supabase，开发环境用本地文件（本地跑不碰线上库）
 * - 本地想试 Supabase 这条路：SPACE_STORE=supabase，同时用 SPACE_SUPABASE_URL / SPACE_SUPABASE_SERVICE_ROLE_KEY
 *   指到一个测试库（比如 Docker 里的 Postgres + PostgREST）。只设 SPACE_STORE=supabase 会连到 .env.local 里的线上库——
 *   开发环境里这样会直接报错，除非再设 SPACE_ALLOW_PROD_FROM_DEV=1 表示确实要这样
 * - 表结构见 supabase-space.sql：每张「表」的一行存成一条 jsonb（space_rows），
 *   每个人的画像 / 起稿 / 编辑 / 风格是一条 jsonb（space_records），私有图片放在 space-private 桶里
 *
 * 为什么是 jsonb 文档而不是一列一列的表：调用方的读写都是「整行对象」，字段还在长；
 * 一列一列地映射，每加一个字段就要同时改 SQL、类型和映射，漏一处就是线上静默丢字段。
 */

export type SpaceStore = 'local' | 'supabase';

export function spaceStore(): SpaceStore {
  const v = (process.env.SPACE_STORE || '').trim().toLowerCase();
  if (v === 'supabase' || v === 'local') return v;
  return process.env.NODE_ENV === 'production' ? 'supabase' : 'local';
}

let client: SupabaseClient | null = null;

/**
 * 只在服务端用的 service role 客户端（这几张表开了 RLS、没有任何 policy：只有它读得到）。
 * SPACE_SUPABASE_URL / SPACE_SUPABASE_SERVICE_ROLE_KEY 可以把「空间数据」单独指到另一个库
 * （比如本地测试库），成员资料仍然读主库——测试空间的读写时不碰线上的空间数据。
 */
export function admin(): SupabaseClient {
  if (client) return client;
  // 换库时地址和 key 要一起给：只给地址的话，会把主库的 service role key 发到那个地址去
  if (!!process.env.SPACE_SUPABASE_URL !== !!process.env.SPACE_SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('[space-store] SPACE_SUPABASE_URL 和 SPACE_SUPABASE_SERVICE_ROLE_KEY 要一起设置');
  }
  // 开发环境默认不碰线上库（测试活动会出现在线上的社区广场）
  if (process.env.NODE_ENV !== 'production' && !process.env.SPACE_SUPABASE_URL && process.env.SPACE_ALLOW_PROD_FROM_DEV !== '1') {
    throw new Error('[space-store] 开发环境里 SPACE_STORE=supabase 需要同时设 SPACE_SUPABASE_URL / SPACE_SUPABASE_SERVICE_ROLE_KEY 指到测试库（真要连线上库，设 SPACE_ALLOW_PROD_FROM_DEV=1）');
  }
  const url = process.env.SPACE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SPACE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('space-store-not-configured');
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

/** 每次查询的超时：数据库卡住时让请求失败，而不是一直挂着 */
export const QUERY_TIMEOUT_MS = 8000;
export const timeout = () => AbortSignal.timeout(QUERY_TIMEOUT_MS);

/**
 * PostgREST 一次最多回 1000 行：超过就分页取，不能静默截断（截断了，名额、口令唯一这些判断就错了）。
 * Supabase 项目设置里的 Max rows 要保持 ≥ 1000（默认就是 1000），调小了这里会少读
 */
export const PAGE = 1000;

export function fail(what: string, error: { message?: string; code?: string } | null): never {
  const e = new Error(`[space-store] ${what}: ${error?.message || 'unknown'}`) as Error & { code?: string };
  e.code = error?.code;
  throw e;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * 跨实例的互斥锁。线上是多个 serverless 实例同时在跑，进程里的排队管不到别的实例——
 * 「最后一个名额两个人同时报」「两个人同时抢同一个短链」这类先查再写的判断，必须在同一把锁里。
 *
 * 做法：space_locks 表里 key 是主键，插进去就是拿到了锁（别人再插会撞唯一约束）；做完删掉。
 * 拿锁的实例中途死掉的话，锁带着租期（LEASE_MS），过期了别人可以清掉重拿。
 * 临界区里只有几次数据库读写，远短于租期。
 */
const LEASE_MS = 15_000;
/** 等锁的时间要比租期长：拿锁的实例死掉了，等的人至少能等到它的锁过期、接过来，而不是先放弃报错 */
const WAIT_MS = 20_000;

export async function withLock<R>(key: string, fn: () => Promise<R>): Promise<R> {
  const sb = admin();
  const holder = randomUUID();
  const deadline = Date.now() + WAIT_MS;
  for (let attempt = 0; ; attempt++) {
    const { error } = await sb.from('space_locks')
      .insert({ key, holder, expires_at: new Date(Date.now() + LEASE_MS).toISOString() })
      .abortSignal(timeout());
    if (!error) break;
    if (error.code !== '23505') {
      // 不是「被人占着」的错（比如超时）：这一行可能其实已经插进去了。顺手删掉自己那一把，免得白白占住整个租期
      await sb.from('space_locks').delete().eq('key', key).eq('holder', holder).abortSignal(timeout());
      fail(`lock ${key}`, error);
    }
    // 被人拿着：过期了就清掉（只清过期的那一把），没过期就稍等再试
    await sb.from('space_locks').delete().eq('key', key).lt('expires_at', new Date().toISOString()).abortSignal(timeout());
    if (Date.now() > deadline) throw new Error(`[space-store] lock ${key}: busy`);
    await sleep(Math.min(400, 40 * 2 ** Math.min(attempt, 4)) + Math.random() * 60);
  }
  // 拿着锁的时候每隔一会儿续一次租：临界区里几次查询都赶上网络慢（每次最多等 8 秒）时，
  // 不至于租期先到、被别的实例当成死锁清掉，变成两个人同时在改
  const renew = setInterval(() => {
    void sb.from('space_locks').update({ expires_at: new Date(Date.now() + LEASE_MS).toISOString() })
      .eq('key', key).eq('holder', holder).abortSignal(timeout())
      .then(({ error }) => { if (error) console.error('[space-store] lock renew failed', key, error.message); });
  }, LEASE_MS / 4);
  try {
    return await fn();
  } finally {
    clearInterval(renew);
    // 只删自己那一把：万一租期已过、锁被别人重拿了，不能把别人的删掉。
    // 删不掉就再试两次——留着它，别人要等满租期才拿得到
    for (let i = 0; i < 3; i++) {
      const { error } = await sb.from('space_locks').delete().eq('key', key).eq('holder', holder).abortSignal(timeout());
      if (!error) break;
      if (i === 2) console.error('[space-store] unlock failed', key, error.message);
      else await sleep(150 * (i + 1));
    }
  }
}
