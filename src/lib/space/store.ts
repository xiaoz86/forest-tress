import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { admin, fail, spaceStore, timeout, withLock } from './backend';
import type { StyleVector } from './themes';
import type { SpaceEdits } from './edits';
import type { Tune } from './tune';
import type { PortraitResult } from './portrait';

/**
 * 每个人一份「空间记录」：AI 画像与起稿、风格选择、本人的编辑、调过的风格。
 *
 * - 本地（开发）：一人一份 JSON，放在 .space-cache/（已加入 .gitignore）——画像里有 AI 对一个人的推断，不进仓库
 * - Supabase（线上）：表 space_records，一人一行 jsonb（见 supabase-space.sql、backend.ts）
 */

export type StyleChoice = {
  mode: 'portrait' | 'fallback';
  test: Partial<StyleVector>;
  picks: string[];
  chosen: string | null;
  savedAt: string;
};

export type SpaceRecord = {
  result?: PortraitResult;
  style?: StyleChoice;
  /** 本人对 AI 起稿的确认、改写、隐藏，以及只属于网站的内容（见 edits.ts） */
  edits?: SpaceEdits;
  /** 本人在主题上拨过的旋钮，和亲口说过的审美偏好（见 tune.ts） */
  tune?: Tune;
};

const DIR = path.join(process.cwd(), '.space-cache');
/** id 会拼进文件路径：只认标准 UUID，杜绝 ../ 之类的路径穿越 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isMemberId(id: string): boolean {
  return UUID.test(id);
}

function fileFor(id: string): string {
  if (!isMemberId(id)) throw new Error('invalid-id');
  return path.join(DIR, `${id.toLowerCase()}.json`);
}

/**
 * 只有「文件还不存在」才当作空记录；读坏了、解析不了就抛出去——
 * 否则下一次写入会拿 {} 去合并，把已有的画像和风格选择悄悄覆盖掉。
 */
export async function readSpace(id: string): Promise<SpaceRecord> {
  if (spaceStore() === 'supabase') {
    if (!isMemberId(id)) throw new Error('invalid-id');
    const { data, error } = await admin().from('space_records').select('data').eq('member_id', id.toLowerCase())
      .abortSignal(timeout()).maybeSingle();
    if (error) fail('read record', error);
    return (data?.data as SpaceRecord | undefined) ?? {};
  }
  let raw: string;
  try {
    raw = await fs.readFile(fileFor(id), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
  return JSON.parse(raw) as SpaceRecord;
}

/** 一次读很多人的空间记录（创造者平台这类列表页）：线上一次查询，不是一人一次。读坏的那个人给空记录 */
export async function readSpaces(ids: string[]): Promise<Map<string, SpaceRecord>> {
  const want = [...new Set(ids.filter(isMemberId).map(id => id.toLowerCase()))];
  const out = new Map<string, SpaceRecord>();
  if (!want.length) return out;
  if (spaceStore() === 'supabase') {
    for (let i = 0; i < want.length; i += 200) {
      const { data, error } = await admin().from('space_records').select('member_id, data')
        .in('member_id', want.slice(i, i + 200)).abortSignal(timeout());
      if (error) fail('read records', error);
      for (const r of (data ?? []) as { member_id: string; data: SpaceRecord }[]) out.set(r.member_id, r.data ?? {});
    }
    return out;
  }
  await Promise.all(want.map(async id => {
    try {
      out.set(id, await readSpace(id));
    } catch {
      // 这个人的记录读坏了：当作没有
    }
  }));
  return out;
}

/** 同一个人的写入排队执行：画像和风格可能同时在存，读-改-写交错会丢掉其中一份 */
const queues = new Map<string, Promise<unknown>>();

export async function writeSpace(id: string, patch: Partial<SpaceRecord>): Promise<boolean> {
  const r = await mutateSpace(id, () => patch);
  return r !== null;
}

/**
 * 在同一个排队里「读当前记录 → 算出改动 → 写回」。改动依赖现有内容时（比如编辑记录里改一项）必须用它，
 * 否则两次几乎同时的保存会互相覆盖。fn 返回要合并进去的顶层字段；失败时返回 null。
 */
export async function mutateSpace(
  id: string, fn: (cur: SpaceRecord) => Partial<SpaceRecord>,
): Promise<SpaceRecord | null> {
  const key = id.toLowerCase();
  let next: SpaceRecord = {};
  const run = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
    if (spaceStore() === 'supabase') {
      // 线上多个实例：读-改-写放进同一把锁（fn 只调一次，调用方在 fn 里记的标记才靠得住）
      if (!isMemberId(id)) throw new Error('invalid-id');
      await withLock(`r:${key}`, async () => {
        const cur = await readSpace(key);
        next = { ...cur, ...fn(cur) };
        const { error } = await admin().from('space_records')
          .upsert({ member_id: key, data: next, updated_at: new Date().toISOString() }, { onConflict: 'member_id' })
          .abortSignal(timeout());
        if (error) fail('write record', error);
      });
      return;
    }
    const file = fileFor(id);
    const cur = await readSpace(id);
    next = { ...cur, ...fn(cur) };
    await fs.mkdir(DIR, { recursive: true });
    // 先写临时文件再改名：进程中途退出也不会留下半截 JSON
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(next, null, 2), 'utf8');
    await fs.rename(tmp, file);
  });
  queues.set(key, run);
  try {
    await run;
    return next;
  } catch (err) {
    console.error('[space] write failed', err);
    return null;
  } finally {
    if (queues.get(key) === run) queues.delete(key);
  }
}
