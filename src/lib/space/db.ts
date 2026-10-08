import 'server-only';
import { randomBytes, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PAGE, admin, fail, spaceStore, timeout, withLock } from './backend';
import type { Booking, Greeting, OutboxMail, Registration, SpaceEvent, SpaceSettings } from './types';

/**
 * 个人空间互动数据的存储层：设置、活动、报名、预约、打招呼、（开发用的）待发邮件，加上私有图片。
 *
 * 两种存法，接口一样（list / get / insert / update / remove / transact），调用方不用管：
 * - 本地（开发）：一张「表」一个 JSON 文件，放在 .space-cache/tables/（已 gitignore）；图片在 .space-cache/uploads/
 * - Supabase（线上）：表 space_rows 里一行一条 jsonb；图片在私有桶 space-private。见 supabase-space.sql
 * 用哪种见 backend.ts 的 spaceStore()。
 *
 * 写入都是「读整张表 → 在回调里改 → 写回」：需要跨行判断的（名额、口令唯一、短链唯一）都在同一个临界区里。
 * 本地靠进程内排队；线上是多个实例，靠 space_locks 表里的一把锁（backend.ts withLock），写回时只写改了的行。
 */

export type Tables = {
  settings: SpaceSettings;
  events: SpaceEvent;
  registrations: Registration;
  bookings: Booking;
  greetings: Greeting;
  outbox: OutboxMail;
};
export type TableName = keyof Tables;

const ROOT = path.join(process.cwd(), '.space-cache');
const TABLE_DIR = path.join(ROOT, 'tables');
const UPLOAD_DIR = path.join(ROOT, 'uploads');

function assertLocal() {
  if (process.env.NODE_ENV === 'production' && !process.env.SPACE_LOCAL_STORE) {
    throw new Error('space-local-store-in-production');
  }
}

async function readTable<T extends TableName>(name: T): Promise<Tables[T][]> {
  if (spaceStore() === 'supabase') return readRemote(name);
  assertLocal();
  try {
    return JSON.parse(await fs.readFile(path.join(TABLE_DIR, `${name}.json`), 'utf8')) as Tables[T][];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

/** 同一张表的写入排队：读-改-写交错会丢数据 */
const queues = new Map<string, Promise<unknown>>();

/**
 * 在一次排队的读-改-写里改一张表（rows 可以原地改）。需要跨行判断的写入（短链唯一、名额、口令唯一）
 * 必须在这里面做，判断和写入才在同一个临界区里。
 */
export async function transact<T extends TableName, R>(name: T, fn: (rows: Tables[T][]) => R | Promise<R>): Promise<R> {
  return mutate(name, fn);
}

async function mutate<T extends TableName, R>(name: T, fn: (rows: Tables[T][]) => R | Promise<R>): Promise<R> {
  const prev = queues.get(name) ?? Promise.resolve();
  let out!: R;
  const remote = spaceStore() === 'supabase';
  const run = prev.catch(() => {}).then(async () => {
    if (remote) {
      out = await withLock(`t:${name}`, () => mutateRemote(name, fn));
      return;
    }
    const rows = await readTable(name);
    out = await fn(rows);
    await fs.mkdir(TABLE_DIR, { recursive: true });
    const file = path.join(TABLE_DIR, `${name}.json`);
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(rows, null, 2), 'utf8');
    await fs.rename(tmp, file);
  });
  queues.set(name, run);
  try {
    await run;
    return out;
  } finally {
    if (queues.get(name) === run) queues.delete(name);
  }
}

export async function list<T extends TableName>(name: T, where?: (row: Tables[T]) => boolean): Promise<Tables[T][]> {
  const rows = await readTable(name);
  return where ? rows.filter(where) : rows;
}

export async function get<T extends TableName>(name: T, id: string): Promise<Tables[T] | null> {
  if (spaceStore() === 'supabase') {
    const { data, error } = await admin().from('space_rows').select('data').eq('tbl', name).eq('id', id)
      .abortSignal(timeout()).maybeSingle();
    if (error) fail(`get ${name}`, error);
    return (data?.data as Tables[T] | undefined) ?? null;
  }
  return (await readTable(name)).find(r => r.id === id) ?? null;
}

// ── Supabase：space_rows(tbl, id, data jsonb, updated_at) ──

async function readRemote<T extends TableName>(name: T): Promise<Tables[T][]> {
  const out: Tables[T][] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin().from('space_rows').select('data').eq('tbl', name)
      .order('id', { ascending: true }).range(from, from + PAGE - 1).abortSignal(timeout());
    if (error) fail(`list ${name}`, error);
    const page = (data ?? []) as { data: Tables[T] }[];
    for (const r of page) out.push(r.data);
    if (page.length < PAGE) return out;
  }
}

/** 已经在锁里：读整张表 → 回调里改 → 只把改了的行写回、删掉被移走的行 */
async function mutateRemote<T extends TableName, R>(name: T, fn: (rows: Tables[T][]) => R | Promise<R>): Promise<R> {
  const rows = await readRemote(name);
  const before = new Map(rows.map(r => [r.id, JSON.stringify(r)] as const));
  const out = await fn(rows);
  const stamp = new Date().toISOString();
  const seen = new Set<string>();
  const changed: { tbl: string; id: string; data: Tables[T]; updated_at: string }[] = [];
  for (const r of rows) {
    if (typeof r.id !== 'string' || !r.id) throw new Error(`[space-store] ${name}: row without id`);
    if (seen.has(r.id)) throw new Error(`[space-store] ${name}: duplicate id ${r.id}`);
    seen.add(r.id);
    if (before.get(r.id) !== JSON.stringify(r)) changed.push({ tbl: name, id: r.id, data: r, updated_at: stamp });
  }
  const gone = [...before.keys()].filter(id => !seen.has(id));
  const sb = admin();
  for (let i = 0; i < changed.length; i += 500) {
    const { error } = await sb.from('space_rows').upsert(changed.slice(i, i + 500), { onConflict: 'tbl,id' }).abortSignal(timeout());
    if (error) fail(`write ${name}`, error);
  }
  for (let i = 0; i < gone.length; i += 200) {
    const { error } = await sb.from('space_rows').delete().eq('tbl', name).in('id', gone.slice(i, i + 200)).abortSignal(timeout());
    if (error) fail(`delete ${name}`, error);
  }
  return out;
}

export async function insert<T extends TableName>(name: T, row: Tables[T]): Promise<Tables[T]> {
  return mutate(name, rows => {
    if (rows.some(r => r.id === row.id)) throw new Error('duplicate-id');
    rows.push(row);
    return row;
  });
}

/**
 * 在一次排队的读-改-写里完成「检查 + 插入」：名额、口令唯一这类判断必须和插入在同一个临界区里，
 * 否则两个人同时报最后一个名额会都报上。check 返回 null 表示可以插入，返回字符串是拒绝原因。
 */
export async function insertIf<T extends TableName>(
  name: T,
  build: (rows: Tables[T][]) => { row: Tables[T] } | { error: string },
): Promise<{ row: Tables[T] } | { error: string }> {
  return mutate(name, rows => {
    const r = build(rows);
    if ('row' in r) rows.push(r.row);
    return r;
  });
}

export async function update<T extends TableName>(
  name: T, id: string, patch: Partial<Tables[T]> | ((row: Tables[T]) => Partial<Tables[T]>),
): Promise<Tables[T] | null> {
  return mutate(name, rows => {
    const i = rows.findIndex(r => r.id === id);
    if (i < 0) return null;
    const p = typeof patch === 'function' ? patch(rows[i]) : patch;
    rows[i] = { ...rows[i], ...p, id: rows[i].id };
    return rows[i];
  });
}

/** 设置表以成员 id 为主键：没有就按默认值建一条 */
export async function upsert<T extends TableName>(name: T, id: string, make: (cur: Tables[T] | null) => Tables[T]): Promise<Tables[T]> {
  return mutate(name, rows => {
    const i = rows.findIndex(r => r.id === id);
    const next = { ...make(i >= 0 ? rows[i] : null), id } as Tables[T];
    if (i >= 0) rows[i] = next;
    else rows.push(next);
    return next;
  });
}

export async function remove<T extends TableName>(name: T, id: string): Promise<boolean> {
  return mutate(name, rows => {
    const i = rows.findIndex(r => r.id === id);
    if (i < 0) return false;
    rows.splice(i, 1);
    return true;
  });
}

export function newId(): string {
  return randomUUID();
}

/** 给访客的查看口令：链接里带着它就能看自己的报名/预约，不需要登录 */
export function newToken(): string {
  return randomBytes(18).toString('base64url');
}

export function now(): string {
  return new Date().toISOString();
}

// ── 私有上传：收款码、付款截图、活动封面。不放 public/，只经过有权限检查的路由往外给 ──

const EXT_BY_MIME: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MIME_BY_EXT: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
/** 4MB：线上接口跑在 Vercel，请求体超过 4.5MB 进不来；浏览器上传前会先把照片缩小（shrinkImage.ts） */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const FILE_RE = /^[a-z]+\/[A-Za-z0-9_-]{8,80}\.(jpg|png|webp)$/;

/** 线上的私有图片桶：不公开，图片只经过有权限检查的路由往外给 */
const BUCKET = 'space-private';

/** 存一张图，返回文件名（kind/随机名.ext）。kind 只能是固定的几个目录名 */
export async function saveUpload(kind: 'payqr' | 'proof' | 'event', file: File): Promise<string | { error: string }> {
  const remote = spaceStore() === 'supabase';
  if (!remote) assertLocal();
  const ext = EXT_BY_MIME[file.type];
  if (!ext) return { error: 'unsupported-type' };
  if (file.size > MAX_UPLOAD_BYTES) return { error: 'too-large' };
  const buf = Buffer.from(await file.arrayBuffer());
  // 按文件头再核一次：不信浏览器报的 type
  const sig = buf.subarray(0, 12);
  const ok = (ext === 'jpg' && sig[0] === 0xff && sig[1] === 0xd8)
    || (ext === 'png' && sig[0] === 0x89 && sig[1] === 0x50)
    || (ext === 'webp' && sig.subarray(0, 4).toString() === 'RIFF' && sig.subarray(8, 12).toString() === 'WEBP');
  if (!ok) return { error: 'bad-image' };
  const name = `${kind}/${randomBytes(16).toString('base64url')}.${ext}`;
  if (remote) {
    const { error } = await admin().storage.from(BUCKET).upload(name, buf, { contentType: file.type, upsert: false });
    if (error) {
      console.error('[space-store] upload failed', error.message);
      return { error: 'upload-failed' };
    }
    return name;
  }
  await fs.mkdir(path.join(UPLOAD_DIR, kind), { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, name), buf);
  return name;
}

/** 读一张私有图。name 必须是 saveUpload 返回的格式，杜绝路径穿越 */
export async function readUpload(name: string): Promise<{ body: Buffer; type: string } | null> {
  if (!FILE_RE.test(name)) return null;
  const type = MIME_BY_EXT[name.split('.').pop()!];
  if (spaceStore() === 'supabase') {
    const { data, error } = await admin().storage.from(BUCKET).download(name);
    if (error || !data) return null;
    return { body: Buffer.from(await data.arrayBuffer()), type };
  }
  assertLocal();
  try {
    const body = await fs.readFile(path.join(UPLOAD_DIR, name));
    return { body, type };
  } catch {
    return null;
  }
}

export async function deleteUpload(name: string | null | undefined): Promise<void> {
  if (!name || !FILE_RE.test(name)) return;
  if (spaceStore() === 'supabase') {
    const { error } = await admin().storage.from(BUCKET).remove([name]);
    // 删不掉只是留了一张没人引用的图，不影响这次操作
    if (error) console.error('[space-store] delete upload failed', name, error.message);
    return;
  }
  await fs.rm(path.join(UPLOAD_DIR, name), { force: true });
}
