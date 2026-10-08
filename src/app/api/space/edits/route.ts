import { NextRequest, NextResponse } from 'next/server';
import {
  DEFAULT_ORDER, LEARNING_KIND_LABEL, LIMITS_EDIT, effectiveDraft, servicesFromDraft,
  type ChapterKey, type DraftBlock, type LearningItem, type LearningKind, type ServiceFormat, type ServiceItem,
  type SpaceEdits, type ValueEntry,
} from '@/lib/space/edits';
import { gateHost, isFail } from '@/lib/space/gate';
import { clean, cleanLine } from '@/lib/space/guard';
import { stillQuoted, type WorkKind } from '@/lib/space/portrait';
import { mutateSpace, readSpace } from '@/lib/space/store';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const BLOCKS: DraftBlock[] = ['tagline', 'roles', 'values', 'services', 'works'];
const FORMATS: ServiceFormat[] = ['线上', '线下', '线上线下', '未说明'];
const KINDS: WorkKind[] = ['work', 'service', 'activity', 'content'];

function fail(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status, headers: NO_STORE });
}

const shortId = () => Math.random().toString(36).slice(2, 10);

/** GET /api/space/edits?id=… —— 本人或管理员：编辑记录，以及还有哪些 AI 起稿等着确认 */
export async function GET(request: NextRequest) {
  const g = await gateHost(request.nextUrl.searchParams.get('id'));
  if (isFail(g)) return NextResponse.json({ error: g.error }, { status: g.status });
  const rec = await readSpace(g.memberId);
  const eff = effectiveDraft(rec.result?.draft ?? null, rec.edits);
  return NextResponse.json({ edits: rec.edits ?? {}, marks: eff.marks, pending: eff.pending }, { headers: NO_STORE });
}

/**
 * PATCH /api/space/edits?id=…
 * body 是一个操作：
 *   { op: 'confirm' | 'hide' | 'reset', block }            —— AI 起稿块：就这样 / 不要 / 恢复成 AI 起稿
 *   { op: 'set', block, value }                             —— 改成我写的
 *   { op: 'order', value: ChapterKey[] }                   —— 中间三章的顺序
 *   { op: 'cover', x, y }                                  —— 首屏照片焦点（0–100）
 *   { op: 'learning', value: LearningItem[] }              —— 最近在读 / 在听 / 在看 / 在学
 *   { op: 'story', value: string }                         —— 一个生命故事
 */
export async function PATCH(request: NextRequest) {
  const g = await gateHost(request.nextUrl.searchParams.get('id'));
  if (isFail(g)) return NextResponse.json({ error: g.error }, { status: g.status });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'bad-json', '请求格式不对，刷新一下再试');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'bad-json', '请求格式不对，刷新一下再试');

  const op = String(body.op || '');
  const block = String(body.block || '') as DraftBlock;
  const node = g.node;
  const workIds = new Set((node.works || []).map(w => w.id));
  let problem = null as string | null;

  const next = await mutateSpace(g.memberId, cur => {
    const draft = cur.result?.draft ?? null;
    const edits: SpaceEdits = { ...(cur.edits ?? {}) };

    if (op === 'confirm' || op === 'hide' || op === 'reset') {
      if (!BLOCKS.includes(block)) { problem = '不认识这一块'; return {}; }
      if (op === 'reset') {
        delete edits[block];
      } else if (op === 'hide') {
        edits[block] = { state: 'hidden' } as never;
      } else {
        // 确认：把现在显示的 AI 起稿存一份快照——以后重新生成画像，这一块也不变
        const eff = effectiveDraft(draft, { ...edits, [block]: undefined });
        const snapshot: Record<DraftBlock, unknown> = {
          tagline: eff.tagline,
          roles: eff.roles,
          values: eff.values,
          services: servicesFromDraft(draft),
          works: draft?.worksSplit ?? {},
        };
        edits[block] = { state: 'confirmed', value: snapshot[block] } as never;
      }
    } else if (op === 'set') {
      const v = body.value;
      if (block === 'tagline') {
        const text = cleanLine(v, LIMITS_EDIT.tagline);
        if (!text) { problem = '一句话不能是空的；不想要就点「不要」'; return {}; }
        edits.tagline = { state: 'edited', value: text };
      } else if (block === 'roles') {
        const items = (Array.isArray(v) ? v : []).map(x => cleanLine(x, LIMITS_EDIT.role)).filter(Boolean);
        const roles = [...new Set(items)].slice(0, LIMITS_EDIT.roles);
        if (!roles.length) { problem = '至少留一个身份；不想要就点「不要」'; return {}; }
        edits.roles = { state: 'edited', value: roles };
      } else if (block === 'values') {
        const items: ValueEntry[] = [];
        for (const x of Array.isArray(v) ? v : []) {
          const o = (x && typeof x === 'object' ? x : { text: x }) as Record<string, unknown>;
          const text = cleanLine(o.text, LIMITS_EDIT.value);
          if (!text || items.some(i => i.text === text)) continue;
          // 原话引用只在本人资料里还找得到时才保留
          const q = typeof o.quote === 'string' && o.quote.trim() && stillQuoted(node, o.quote) ? o.quote.trim() : null;
          items.push({ text, quote: q });
        }
        if (!items.length) { problem = '至少留一条；不想要就点「不要」'; return {}; }
        edits.values = { state: 'edited', value: items.slice(0, LIMITS_EDIT.values) };
      } else if (block === 'services') {
        const items: ServiceItem[] = [];
        for (const x of Array.isArray(v) ? v : []) {
          if (!x || typeof x !== 'object') continue;
          const o = x as Record<string, unknown>;
          const title = cleanLine(o.title, LIMITS_EDIT.serviceTitle);
          if (!title) continue;
          const format = FORMATS.includes(o.format as ServiceFormat) ? (o.format as ServiceFormat) : '未说明';
          items.push({
            id: typeof o.id === 'string' && /^[\w-]{1,24}$/.test(o.id) ? o.id : shortId(),
            title,
            desc: clean(o.desc, LIMITS_EDIT.serviceDesc),
            format,
            duration: cleanLine(o.duration, LIMITS_EDIT.serviceShort),
            availability: cleanLine(o.availability, LIMITS_EDIT.serviceShort),
            price: cleanLine(o.price, LIMITS_EDIT.serviceShort),
            showPrice: o.showPrice === true,
          });
        }
        edits.services = { state: 'edited', value: items.slice(0, LIMITS_EDIT.services) };
      } else if (block === 'works') {
        const split: Record<string, WorkKind> = {};
        for (const [k, kind] of Object.entries(v && typeof v === 'object' ? (v as Record<string, unknown>) : {})) {
          if (workIds.has(k) && KINDS.includes(kind as WorkKind)) split[k] = kind as WorkKind;
        }
        edits.works = { state: 'edited', value: split };
      } else {
        problem = '不认识这一块';
        return {};
      }
    } else if (op === 'order') {
      const o = (Array.isArray(body.value) ? body.value : []).filter((k): k is ChapterKey => DEFAULT_ORDER.includes(k as ChapterKey));
      if (new Set(o).size !== DEFAULT_ORDER.length) { problem = '章节顺序不完整，刷新一下再试'; return {}; }
      edits.order = o;
    } else if (op === 'cover') {
      const x = Number(body.x);
      const y = Number(body.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) { problem = '位置不对，再点一下照片'; return {}; }
      edits.cover = { x: Math.round(Math.min(100, Math.max(0, x))), y: Math.round(Math.min(100, Math.max(0, y))) };
    } else if (op === 'learning') {
      const items: LearningItem[] = [];
      for (const x of Array.isArray(body.value) ? body.value : []) {
        if (!x || typeof x !== 'object') continue;
        const o = x as Record<string, unknown>;
        const title = cleanLine(o.title, LIMITS_EDIT.learningTitle);
        if (!title) continue;
        const url = cleanLine(o.url, 300);
        items.push({
          id: typeof o.id === 'string' && /^[\w-]{1,24}$/.test(o.id) ? o.id : shortId(),
          kind: (o.kind as LearningKind) in LEARNING_KIND_LABEL ? (o.kind as LearningKind) : 'read',
          title,
          note: cleanLine(o.note, LIMITS_EDIT.learningNote),
          // 只收 http(s) 链接：javascript: 之类的不能进页面
          url: /^https?:\/\/[^\s]+$/i.test(url) ? url : '',
        });
      }
      edits.learning = items.slice(0, LIMITS_EDIT.learning);
    } else if (op === 'story') {
      const text = clean(body.value, LIMITS_EDIT.story);
      if (text) edits.story = text;
      else delete edits.story;
    } else {
      problem = '不认识这个操作';
      return {};
    }
    edits.updatedAt = new Date().toISOString();
    return { edits };
  });

  if (problem) return fail(400, 'invalid', problem);
  if (!next) return fail(500, 'storage-unavailable', '没有存上，过一会再试一次');
  const eff = effectiveDraft(next.result?.draft ?? null, next.edits);
  return NextResponse.json({ edits: next.edits ?? {}, marks: eff.marks, pending: eff.pending }, { headers: NO_STORE });
}
