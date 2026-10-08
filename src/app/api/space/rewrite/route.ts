import { NextRequest, NextResponse } from 'next/server';
import { LIMITS_EDIT } from '@/lib/space/edits';
import { FIELD_LABEL } from '@/lib/space/fields';
import { gateHost, isFail } from '@/lib/space/gate';
import { cleanLine } from '@/lib/space/guard';
import { sourceTexts, stillQuoted } from '@/lib/space/portrait';
import { createChatCompletion } from '@/lib/llm';

export const runtime = 'nodejs';
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'private, no-store' };

type Block = 'tagline' | 'role' | 'value' | 'service';

const WHAT: Record<Block, { name: string; max: number; rule: string }> = {
  tagline: { name: '一句话介绍', max: LIMITS_EDIT.tagline, rule: '8–24 字，放在网站首屏名字下面。说这个人是谁、在做什么，有他自己的气质；不要口号、不要形容词堆砌。' },
  role: { name: '身份标签', max: LIMITS_EDIT.role, rule: '2–8 字，一个身份或角色，比如「正念冥想导师」。只能来自资料里写过的身份。' },
  value: { name: '「我在意的」里的一条', max: LIMITS_EDIT.value, rule: '6–20 字，一件他在意的事，用他自己的说法。必须附一句能在资料里逐字找到的原话（quote，6–30 字）。' },
  service: { name: '一项服务的介绍', max: LIMITS_EDIT.serviceDesc, rule: '20–60 字，说清楚这项服务是给谁的、做什么。只用资料里有的信息，不编价格、时长、形式。' },
};

/** 每个人每小时最多 30 次（改写要调模型，挡住连点） */
const hits = new Map<string, number[]>();
function allow(memberId: string): boolean {
  const t = Date.now();
  const list = (hits.get(memberId) ?? []).filter(x => t - x < 3_600_000);
  if (list.length >= 30) return false;
  list.push(t);
  hits.set(memberId, list);
  return true;
}

/**
 * POST /api/space/rewrite?id=… —— 「再给我两个版本」。本人或管理员。
 * body：{ block: 'tagline' | 'role' | 'value' | 'service', current: string, context?: string（服务的标题）, hint?: string（「更短一点」「更像我说话」） }
 * 返回：{ candidates: { text, quote? }[] }，两个。
 *
 * 只从本人写过的话里改写，不编造经历、身份、数字；「我在意的」必须带一句能在资料里逐字找到的原话，找不到的候选丢掉。
 * 不用「心里的种子」：种子有自己的可见性，不能被改写进首屏或认识层。
 */
export async function POST(request: NextRequest) {
  const g = await gateHost(request.nextUrl.searchParams.get('id'));
  if (isFail(g)) return NextResponse.json({ error: g.error }, { status: g.status });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad-json', message: '请求格式不对' }, { status: 400 });
  }
  const block = String(body?.block || '') as Block;
  if (!(block in WHAT)) return NextResponse.json({ error: 'bad-block', message: '不认识这一块' }, { status: 400 });
  if (!allow(g.memberId)) {
    return NextResponse.json({ error: 'too-many', message: '这一小时换得有点多了，歇一会儿再试；也可以直接自己改。' }, { status: 429 });
  }
  const current = cleanLine(body.current, 200);
  const context = cleanLine(body.context, 40);
  const hint = cleanLine(body.hint, 60);
  const spec = WHAT[block];

  const t = sourceTexts(g.node);
  const lines = (Object.keys(t) as (keyof typeof t)[])
    .filter(k => k !== 'seed' && k !== 'keywords' && t[k])
    .map(k => `【${FIELD_LABEL[k] ?? k}】\n${t[k]}`)
    .join('\n\n');

  const system = `你在帮「附近森林」的一位成员改写他个人网站上的一小段文字。
铁律：只根据下面他自己写的资料；不编造经历、身份、数字、价格、城市、服务形式；第一人称或客观陈述都可以，但语气要平实、像他本人；不吹捧。
要改写的是：${spec.name}。要求：${spec.rule}
给出两个彼此明显不同的版本（一个更贴近他的原话，一个换个角度说），都不要和「现在的版本」一样。
只输出 JSON：{"candidates":[{"text":"…","quote":"原话（只有「我在意的」需要，其余给空字符串）"},{"text":"…","quote":""}]}`;
  const user = `${lines}

现在的版本：${current || '（还没有）'}${context ? `\n这是哪项服务：${context}` : ''}${hint ? `\n他希望：${hint}` : ''}`;

  const raw = await createChatCompletion({
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    temperature: 0.7,
    maxTokens: 600,
    responseFormat: { type: 'json_object' },
    timeoutMs: 45000,
  });
  if (!raw) return NextResponse.json({ error: 'llm-failed', message: 'AI 暂时没有回应，过一会再试；也可以直接自己改。' }, { status: 502 });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    try { parsed = m ? JSON.parse(m[0]) : null; } catch { parsed = null; }
  }
  const list = Array.isArray((parsed as { candidates?: unknown })?.candidates) ? (parsed as { candidates: unknown[] }).candidates : [];
  const candidates: { text: string; quote: string | null }[] = [];
  for (const c of list) {
    const o = (c && typeof c === 'object' ? c : { text: c }) as Record<string, unknown>;
    const text = cleanLine(o.text, spec.max);
    if (!text || text === current || candidates.some(x => x.text === text)) continue;
    let quote: string | null = null;
    if (block === 'value') {
      const q = cleanLine(o.quote, 40);
      // 「我在意的」必须落在他写过的话上：找不到原话的候选不要
      if (!q || !stillQuoted(g.node, q)) continue;
      quote = q;
    }
    candidates.push({ text, quote });
    if (candidates.length === 2) break;
  }
  if (!candidates.length) {
    return NextResponse.json({ error: 'no-candidate', message: '这次没改出合适的版本，再点一次，或者直接自己改。' }, { status: 502 });
  }
  return NextResponse.json({ candidates }, { headers: NO_STORE });
}
