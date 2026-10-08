/**
 * 个人网站的「讲法」：把注册资料排成一段向下走的叙事时用到的纯函数。
 *
 * 前后端都能用，不引任何服务端依赖。这里只重排、挑选本人写过的话，不改写、不编造——
 * 模板语（「工作之外，我喜欢——」这类引子）永远单独成行或明确加在前面，不和原文拼成别人的话。
 *
 * 所有按长度截断的地方都按「字」（码点）算，不按 UTF-16 下标——成员常用 🌿🎵，切在中间会出乱码。
 */

/** 占一个全角宽度的字：汉字、韩文、假名、全角符号、emoji */
const WIDE = /[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Extended_Pictographic}　-〿！-｠￠-￦]/u;

/** 名字的视觉长度：全角字算 1，其余算 0.56 */
export function visualLen(s: string): number {
  let n = 0;
  for (const ch of s) n += WIDE.test(ch) ? 1 : 0.56;
  return n;
}

/** 名字越长，首屏字号越小 */
export function nameScale(name: string): number {
  const v = visualLen(name.trim());
  return v <= 5 ? 1 : v <= 8 ? 0.82 : 0.64;
}

/** 没有照片时的水印：名字的第一个字，拉丁字母转大写 */
export function glyphOf(name: string): string {
  return ([...name.trim()][0] ?? '').toUpperCase();
}

/** 去掉空白和标点，用来判断「两句话是不是同一句」 */
export function norm(s: string): string {
  return s.replace(/[\s\p{P}\p{S}]/gu, '');
}

const SENTENCE = /(?<=[。！？!?；;])|\n+/;

/**
 * 在 max 字以内收住一句话：优先停在逗号，其次顿号、冒号，都没有才硬切。
 * 手机上首屏「正在做」两行约 44 字。
 */
export function lead(s: string, max = 44): string {
  const first = s.trim().split(SENTENCE)[0].trim();
  const cps = [...first];
  if (cps.length <= max) return first;
  const head = cps.slice(0, max + 1).join('');
  for (const marks of [/[，,]/g, /[、：:]/g]) {
    const cut = Math.max(-1, ...[...head.matchAll(marks)].map(m => m.index ?? -1));
    if (cut >= 12) return head.slice(0, cut) + '…';
  }
  return cps.slice(0, max).join('') + '…';
}

/**
 * 首屏「正在做」放哪一句，以及第二章还要不要整段展开。
 *
 * 第一句如果是「我是一名 XX」而 XX 已经在身份行里，就换下一句——同一组头衔在首屏说两遍，
 * 正是资料卡的味道。整段只有首屏这一句时，第二章不再重复。
 */
export function coverLine(doing: string, roles: string[]): { now: string; expand: boolean } {
  const t = doing.trim();
  if (!t) return { now: '', expand: false };
  const sentences = t.split(SENTENCE).map(x => x.trim()).filter(Boolean);
  let pick = 0;
  const r = roles.map(norm).filter(x => x.length >= 2);
  if (sentences.length > 1 && /^我是(一名|一个|一位)/.test(sentences[0]) && r.some(x => norm(sentences[0]).includes(x))) {
    pick = 1;
  }
  const now = lead(sentences[pick]);
  return { now, expand: norm(now) !== norm(t) };
}

/**
 * 从「经验」里认出资历行：一行里用「｜」隔开 3 段以上、每段都不长——
 * 这是证书和身份的清单，排成一条资历带，不当正文读。
 */
export function splitCredentials(text: string): { creds: string[]; rest: string } {
  const creds: string[] = [];
  const rest: string[] = [];
  for (const line of text.split(/\n+/)) {
    const parts = line.split(/[｜|]/).map(x => x.trim()).filter(Boolean);
    if (parts.length >= 3 && parts.every(x => [...x].length <= 20)) creds.push(...parts);
    else if (line.trim()) rest.push(line.trim());
  }
  return { creds, rest: rest.join('\n') };
}

/** 清单项的开头：- • 1. 1、 (1) ① */
const LIST_ITEM = /^\s*(?:[-–—•·*●○▪]|\d+\s*[.．、)）]|[（(]\d+[)）]|[①-⑳])/;
/** 接着上一句说的开头：拿出来单独读不通 */
const CONTINUES = /^(也|还|并|并且|同时|以及|而且|但|但是|所以|及|和|与|或|而|边)/;

/**
 * 信任层的标题用本人写过的一句话。很保守：只考虑最后一句，而且它得能单独成立——
 * 10–32 字、不是清单里的一项、不是接着上一句说的半句、拿掉它之后前文不停在逗号上。
 * 整段是清单或几行短句排比时，不挑标题（挑走一条，清单就缺一条、排比就散了）。
 */
export function pickPathTitle(text: string): { title: string | null; body: string } {
  const t = text.trim();
  const none = { title: null, body: t };
  if (!t) return none;
  const lines = t.split(/\n+/).map(x => x.trim()).filter(Boolean);
  if (lines.filter(l => LIST_ITEM.test(l)).length >= 2) return none;
  if (lines.length >= 3 && lines.every(l => [...l].length <= 24)) return none;
  const segs = t.split(SENTENCE).map(x => x.trim()).filter(Boolean);
  const last = segs[segs.length - 1];
  if (!last || LIST_ITEM.test(last) || CONTINUES.test(last)) return none;
  const bare = last.replace(/[。；;！!？?，,、]+$/, '');
  const n = [...bare].length;
  if (n < 10 || n > 32) return none;
  const at = t.lastIndexOf(last);
  const body = (t.slice(0, at) + t.slice(at + last.length)).replace(/\n{2,}/g, '\n').trim();
  if (/[，,、：:]$/.test(body)) return none;
  return { title: bare, body };
}

/**
 * 兴趣排成一句话：原文一字不动，只在前面加「工作之外，我喜欢」（原文自己带了动词就只加「工作之外，我」）。
 * 多行原文用逗号接起来；句尾先去掉逗号顿号，再补句号。只有标点时返回 null。
 */
export function interestsSentence(text: string): { pre: string; body: string } | null {
  let t = '';
  for (const line of text.split(/\n+/).map(x => x.trim()).filter(Boolean)) {
    t = !t ? line : /[。！？!?；;，,、.…]$/.test(t) ? t + line : `${t}，${line}`;
  }
  t = t.replace(/[，,、；;：:\s]+$/, '');
  if (!norm(t)) return null;
  const body = /[。！？!?.…]$/.test(t) ? t : `${t}。`;
  if (/^我/.test(t)) return { pre: '工作之外，', body };
  if (/^(喜欢|爱|热爱|在|正在|平时|经常|常常|偶尔|会|也|没|不|最近|一直)/.test(t)) return { pre: '工作之外，我', body };
  return { pre: '工作之外，我喜欢', body };
}

export type ValueItem = { text: string; quote?: { text: string; field?: string } | null };

export type Band = { kind: 'moment' | 'create'; lead: string; text: string };

/**
 * 「那一幕」色块放哪句话：美的时刻 > 想创造或守护的。资料少档只用美的时刻。
 *
 * 只用这两个问题的回答——它们本来就是为了「被引用」写的一整句话。
 * 不从别的字段里截一段放进色块：截出来的半句离开上下文，意思会变
 * （「热衷于……支持生命发展和创新的人」截成「支持生命发展和创新」，读起来就成了一句价值观）。
 */
export function bandSource(moment: string, create: string, sparse: boolean): Band | null {
  if (moment.trim()) return { kind: 'moment', lead: '有一个时刻，让我觉得「这就是美」——', text: moment.trim() };
  if (sparse) return null;
  if (create.trim()) return { kind: 'create', lead: '我想创造、也想守护的——', text: create.trim() };
  return null;
}

/**
 * 「我在意的」去重：和一句话介绍说的是同一件事的不要；
 * 概括本身就是页面上某段原文的照抄（那不是概括）的不要；
 * 原话已经出现在页面上的，只留概括、不再重复引一遍。
 */
export function dedupeValues(
  values: ValueItem[], tagline: string, shown: string[],
): { text: string; quote: string | null }[] {
  const t = norm(tagline);
  const page = shown.map(norm).filter(Boolean);
  const out: { text: string; quote: string | null }[] = [];
  for (const v of values) {
    const q = v.quote?.text?.trim() || '';
    const nt = norm(v.text);
    if (!nt) continue;
    if (t && (t.includes(nt) || (q && t.includes(norm(q))))) continue;
    if (page.some(p => p.includes(nt))) continue;
    if (out.some(o => norm(o.text) === nt)) continue;
    const onPage = !!q && page.some(p => p.includes(norm(q)));
    out.push({ text: v.text, quote: q && !onPage ? q : null });
  }
  return out;
}

/** 「在别处」一行的动词：播客去听，文字去读，其余去看 */
export function linkVerb(title: string): string {
  if (/播客|电台|podcast/i.test(title)) return '去听';
  if (/公众号|文章|专栏|博客|小报童|newsletter|substack/i.test(title)) return '去读';
  return '去看';
}

/** 过长的段落在 limit 字以内最后一个句号处切开，后半段折叠 */
export function fold(text: string, limit = 200, trigger = 240): { head: string; more: string | null } {
  const t = text.trim();
  const cps = [...t];
  if (cps.length <= trigger) return { head: t, more: null };
  const win = cps.slice(0, limit).join('');
  let cut = Math.max(win.lastIndexOf('。'), win.lastIndexOf('！'), win.lastIndexOf('？'), win.lastIndexOf('\n'));
  if (cut < win.length * 0.4) cut = Math.max(win.lastIndexOf('，'), win.lastIndexOf('；'));
  if (cut < win.length * 0.4) return { head: win, more: cps.slice(limit).join('') };
  return { head: t.slice(0, cut + 1).trim(), more: t.slice(cut + 1).trim() || null };
}

const HAN = ['一', '二', '三', '四', '五', '六'];

export function chapterNumber(i: number, style: 'latin' | 'han'): string {
  return style === 'han' ? HAN[i] ?? String(i + 1) : String(i + 1).padStart(2, '0');
}

/** 浏览器大多不认 HEIC，next/image 也缩不了：这种图当作没有 */
export function isDisplayableImage(url: string | null | undefined): url is string {
  return !!url && !/\.(heic|heif)(\?|#|$)/i.test(url);
}
