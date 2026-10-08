import { NextRequest, NextResponse } from 'next/server';
import { gateHost, isFail } from '@/lib/space/gate';
import { cleanLine } from '@/lib/space/guard';
import { richness } from '@/lib/space/portrait';
import { effectiveVector } from '@/lib/space/recommend';
import { mutateSpace, readSpace, type StyleChoice } from '@/lib/space/store';
import { DIMENSIONS, getTheme, type DimensionKey } from '@/lib/space/themes';
import {
  ACCENTS, KNOBS, KNOB_ORDER, NOTME_BLOCKS, PAPERS, addFeel, cleanKnobs, nudge, optionLabel, ownDiff, themeExact, withFeel,
  type Change, type FeelNote, type KnobKey, type Knobs, type Tune,
} from '@/lib/space/tune';
import { createChatCompletion } from '@/lib/llm';

export const runtime = 'nodejs';
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'private, no-store' };

function fail(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status, headers: NO_STORE });
}

async function body(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const b = await request.json();
    return b && typeof b === 'object' && !Array.isArray(b) ? b : null;
  } catch {
    return null;
  }
}

function cleanLocks(raw: unknown): KnobKey[] {
  return Array.isArray(raw) ? KNOB_ORDER.filter(k => raw.includes(k)) : [];
}

const NOTE_BLOCKS = [...Object.keys(NOTME_BLOCKS), 'say', 'quick'];

function cleanNotes(raw: unknown, at: string): FeelNote[] {
  if (!Array.isArray(raw)) return [];
  const out: FeelNote[] = [];
  for (const n of raw.slice(0, 12)) {
    const o = (n && typeof n === 'object' ? n : {}) as Record<string, unknown>;
    const dim = DIMENSIONS.find(d => d.key === o.dim)?.key;
    const dir = o.dir === 1 || o.dir === -1 ? o.dir : null;
    const block = typeof o.block === 'string' && NOTE_BLOCKS.includes(o.block) ? o.block : null;
    if (!dim || !dir || !block) continue;
    out.push({ at, block, said: cleanLine(o.said, 60), dim, dir });
  }
  return out;
}

/**
 * PUT /api/space/tune?id=… —— 本人或管理员：存下在某一套主题上拨的旋钮。
 * body：{ base: 主题 id, knobs, locks, notes?: { block, said, dim, dir }[] }
 *
 * 调过风格就等于选定了这一套：style.chosen 一并定成 base，免得之后推荐一变，网站换了底、微调对不上。
 * notes 是「这不像我」和一句话调风格里本人说过的偏好，累加到 feel 上（写回画像的审美四维）。
 */
export async function PUT(request: NextRequest) {
  const g = await gateHost(request.nextUrl.searchParams.get('id'));
  if (isFail(g)) return NextResponse.json({ error: g.error }, { status: g.status });
  const b = await body(request);
  if (!b) return fail(400, 'bad-json', '请求格式不对');
  const theme = getTheme(typeof b.base === 'string' ? b.base : null);
  if (!theme) return fail(400, 'bad-base', '不认识这套主题');

  // 和主题本来一模一样的旋钮不存：以后主题本身微调了，这些地方跟着主题走
  const knobs: Knobs = ownDiff(theme.tokens, b.knobs as Knobs);
  const now = new Date().toISOString();
  const notes = cleanNotes(b.notes, now);
  const sparse = !richness(g.node).enough;

  let pinned = false;
  const next = await mutateSpace(g.memberId, cur => {
    const tune: Tune = {
      base: theme.id,
      knobs,
      locks: cleanLocks(b.locks),
      feel: addFeel(cur.tune?.feel ?? {}, notes),
      notes: [...(cur.tune?.notes ?? []), ...notes].slice(-20),
      updatedAt: now,
    };
    if (cur.style?.chosen === theme.id) return { tune };
    pinned = true;
    const style: StyleChoice = {
      mode: cur.style?.mode ?? (sparse ? 'fallback' : 'portrait'),
      test: cur.style?.test ?? {},
      picks: cur.style?.picks ?? [],
      chosen: theme.id,
      savedAt: now,
    };
    return { tune, style };
  });
  if (!next) return fail(500, 'storage-unavailable', '没存上，过一会再试');
  return NextResponse.json({ tune: next.tune, pinned }, { headers: NO_STORE });
}

/** 一句话调风格要调模型：每个人每小时最多 40 次 */
const hits = new Map<string, number[]>();
function allow(memberId: string): boolean {
  const t = Date.now();
  const list = (hits.get(memberId) ?? []).filter(x => t - x < 3_600_000);
  if (list.length >= 40) return false;
  list.push(t);
  hits.set(memberId, list);
  return true;
}

/** 模型没回应时的退路：认几个常见说法，直接按那一维拨一格 */
const WORDS: { re: RegExp; dim: DimensionKey; dir: 1 | -1 }[] = [
  { re: /安静|静一|沉静|低调|收敛|克制|淡一|素一/, dim: 'energy', dir: -1 },
  { re: /精神|活力|活泼|明亮|亮一|热闹|跳/, dim: 'energy', dir: 1 },
  { re: /暖|温柔|温和|秋/, dim: 'warmth', dir: 1 },
  { re: /冷|清冷|清爽|冬|理性/, dim: 'warmth', dir: -1 },
  { re: /书卷|人文|手作|文艺|古典|手写/, dim: 'texture', dir: 1 },
  { re: /利落|现代|简洁|干净|专业|科技/, dim: 'texture', dir: -1 },
  { re: /留白|透气|空一|疏|松/, dim: 'density', dir: -1 },
  { re: /饱满|丰富|满一|紧凑|密/, dim: 'density', dir: 1 },
];

function knobMenu(): string {
  const lines = KNOB_ORDER.map(key => {
    const d = KNOBS[key];
    if (key === 'accent') {
      return `- accent（${d.label}）：任意 "#rrggbb"（会自动收进可用范围）。常用：${ACCENTS.map(a => `${a.name} ${a.hex}`).join('、')}`;
    }
    if (key === 'paper') return `- paper（${d.label}）：${PAPERS.map(p => `"${p.id}" ${p.name}`).join(' | ')}`;
    return `- ${key}（${d.label}）：${d.options.map(o => `${JSON.stringify(o.value)} ${o.label}`).join(' | ')}`;
  });
  return lines.join('\n');
}

/**
 * POST /api/space/tune?id=… —— 一句话调风格。本人或管理员。不存，只给出改法；本人在页面上看过、点保存才算。
 * body：{ say, base, knobs, locks }
 * 返回：{ changes: { key, value, why }[], reply, dims: { dim, dir }[], source: 'ai' | 'rule' }
 *
 * 模型只能在旋钮的档位里挑；返回的每一项都再过一遍 cleanKnobs，锁住的、不认识的、没变化的一律丢掉。
 */
export async function POST(request: NextRequest) {
  const g = await gateHost(request.nextUrl.searchParams.get('id'));
  if (isFail(g)) return NextResponse.json({ error: g.error }, { status: g.status });
  const b = await body(request);
  if (!b) return fail(400, 'bad-json', '请求格式不对');
  const say = cleanLine(b.say, 80);
  if (!say) return fail(400, 'empty', '说一句你想要的感觉');
  const theme = getTheme(typeof b.base === 'string' ? b.base : null);
  if (!theme) return fail(400, 'bad-base', '不认识这套主题');
  if (!allow(g.memberId)) return fail(429, 'too-many', '这一小时调得有点多了，歇一会儿再试；也可以直接在「细调」里拨。');

  const locks = cleanLocks(b.locks);
  const eff = { ...themeExact(theme.tokens), ...cleanKnobs(b.knobs) } as Required<Knobs>;

  // 这个人的审美位置：画像 + 测试 + 本人说过的偏好
  let vectorLine = '（还没有画像）';
  try {
    const rec = await readSpace(g.memberId);
    const sparse = !richness(g.node).enough;
    const v = effectiveVector({
      mode: rec.style?.mode ?? (sparse ? 'fallback' : 'portrait'),
      portrait: rec.result?.portrait ?? null,
      test: rec.style?.test ?? {},
      picks: rec.style?.picks ?? [],
    });
    if (v) {
      const w = withFeel(v.v, rec.tune?.feel);
      vectorLine = DIMENSIONS.map(d => `${d.low}(-2)…${d.high}(+2)：${w[d.key].toFixed(1)}`).join('；');
    }
  } catch {
    /* 读不到画像也能调：只是少一点参照 */
  }

  const current = KNOB_ORDER.map(k => `${k}=${JSON.stringify(eff[k])}（${optionLabel(k, eff[k])}）`).join('，');
  const system = `你是一位审美很好的视觉设计师，在帮「附近森林」的一位成员微调他个人网站的风格。他会用一句话说想要的感觉。
你只能拨下面这些旋钮，每个旋钮只能从给定的档位里选：
${knobMenu()}

规则：
- 一次最多改 3 个旋钮，挑最能回应这句话的；宁少勿多，不要为改而改。
- 锁住的旋钮不能动。
- 每个改动写一句 why（20 字以内），说这一改让页面有什么不同，用他听得懂的话，不用术语。
- reply：一句话回应他（30 字以内，平实，不吹捧）。
- dims：这句话表达的是审美四维里哪一维、往哪边——warmth（清冷 -1 / 温暖 +1）、energy（安静 -1 / 明亮有活力 +1）、texture（利落现代 -1 / 人文手作 +1）、density（疏朗留白 -1 / 丰盈饱满 +1）。最多 2 个；听不出来就给空数组。
- 这句话和网站风格无关、或者做不到时，changes 给空数组，在 reply 里说明能怎么说。
只输出 JSON：{"changes":[{"knob":"weight","value":400,"why":"…"}],"reply":"…","dims":[{"dim":"energy","dir":-1}]}`;
  const user = `现在的主题：${theme.name}（${theme.temperament}）
现在各旋钮：${current}
锁住的：${locks.length ? locks.join('、') : '没有'}
他的审美位置：${vectorLine}
他说：「${say}」`;

  const raw = await createChatCompletion({
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    temperature: 0.4,
    maxTokens: 500,
    responseFormat: { type: 'json_object' },
    timeoutMs: 30000,
  });

  let parsed: Record<string, unknown> | null = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      try { parsed = m ? JSON.parse(m[0]) : null; } catch { parsed = null; }
    }
  }

  if (!parsed) {
    // 退路：认得的说法直接拨；认不得就说清楚
    const hit = WORDS.filter(w => w.re.test(say)).slice(0, 2);
    if (!hit.length) return fail(502, 'llm-failed', 'AI 暂时没有回应。可以先点上面的几个说法，或者在「细调」里拨。');
    let working = { ...eff };
    const changes: Change[] = [];
    for (const h of hit) {
      for (const c of nudge(h.dim, h.dir, working, { locks })) {
        changes.push(c);
        working = { ...working, [c.key]: c.value };
      }
    }
    return NextResponse.json({
      changes, reply: 'AI 暂时没回应，先按字面意思调了一下，看看是不是这个方向。',
      dims: hit.map(h => ({ dim: h.dim, dir: h.dir })), source: 'rule',
    }, { headers: NO_STORE });
  }

  const changes: Change[] = [];
  const list = Array.isArray(parsed.changes) ? parsed.changes : [];
  for (const c of list) {
    if (changes.length >= 3) break;
    const o = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
    const key = KNOB_ORDER.find(k => k === o.knob);
    if (!key || locks.includes(key) || changes.some(x => x.key === key)) continue;
    const value = cleanKnobs({ [key]: o.value })[key];
    if (value === undefined || value === eff[key]) continue;
    const from = optionLabel(key, eff[key]);
    const to = optionLabel(key, value);
    // 前后叫同一个名字（在原色上挪了一点）就不报「近陶土 → 近陶土」，只说调了
    const what = from === to ? `${KNOBS[key].label}调了一点` : `${KNOBS[key].label}从「${from}」换成「${to}」`;
    const why = cleanLine(o.why, 40) || what;
    changes.push({ key, value, why: `${why}（${what}）`, what });
  }
  const dims = (Array.isArray(parsed.dims) ? parsed.dims : [])
    .map(d => (d && typeof d === 'object' ? d : {}) as Record<string, unknown>)
    .map(d => ({ dim: DIMENSIONS.find(x => x.key === d.dim)?.key, dir: Number(d.dir) > 0 ? 1 : Number(d.dir) < 0 ? -1 : 0 }))
    .filter((d): d is { dim: DimensionKey; dir: 1 | -1 } => !!d.dim && d.dir !== 0)
    .slice(0, 2);
  const reply = cleanLine(parsed.reply, 60)
    || (changes.length ? '这样试试看。' : '这句话我没想好怎么落到页面上，换个说法试试？');
  return NextResponse.json({ changes, reply, dims, source: 'ai' }, { headers: NO_STORE });
}
