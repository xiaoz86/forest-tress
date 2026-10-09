import Image from 'next/image';
import Link from 'next/link';
import { Fragment } from 'react';
import { splitBeauty } from '@/lib/beauty';
import { canOptimize } from '@/lib/space/image';
import type { CoverPhoto } from '@/lib/space/photoMeta';
import { stillQuoted, type PortraitResult, type WorkKind } from '@/lib/space/portrait';
import {
  bandSource, chapterNumber, coverLine, dedupeValues, fold, glyphOf, interestsSentence,
  isDisplayableImage, linkVerb, nameScale, pickPathTitle, splitCredentials, visualLen,
} from '@/lib/space/story';
import { tokensToStyle, type SpaceTheme } from '@/lib/space/themes';
import {
  CoverFocus, LearningEditor, OrderEditor, OriginalLink, RolesEditor, ServicesEditor, StoryEditor, TaglineEditor,
  ValuesEditor, WorksEditor,
} from '@/components/space/edit/EditKit';
import NotMe from '@/components/space/tune/NotMe';
import WorkPeek from '@/components/space/WorkPeek';
import { CopyLink } from '@/components/space/interact/RegistrationActions';
import {
  LEARNING_KIND_LABEL, serviceMeta, type ChapterKey, type DraftBlock, type Effective, type LearningItem,
} from '@/lib/space/edits';
import type { VisibilityKey } from '@/lib/space/types';
import type { NodeCard, Work } from '@/lib/supabase';

/**
 * 一个人的个人网站。服务端组件——联系方式这类字段不会进客户端 payload。
 *
 * 不是一张资料卡，是「一次相遇的延续」（v2 §7.7）：访客先看见这个人所在的画面和他说的一句话，
 * 再一章一章听他讲自己，最后照片回来，停在「打个招呼」上。
 * 层次仍按 v2 §8：名片（封面）→ 认识 → 信任 → 服务与活动（中后部）→ 种子 → 底部连接。
 *
 * 版面上的字只有两种来源：本人写的原话，和单独成行的模板引子。不编造，也不把引子和原话拼成一句。
 * 设计稿：2026-09-27 三个方向评审后的合稿（沉浸式叙事为主，嫁接杂志与小书的做法）。
 */

type Props = {
  node: NodeCard;
  theme: SpaceTheme;
  result: PortraitResult | null;
  /** 预览标注（AI 起稿、可见性）。访客、「假装成访客」和上线版都不渲染 */
  marks: boolean;
  /** 上面有 40px 的预览条，首屏高度要扣掉 */
  bar: boolean;
  /** 资料少档：和风格走看图兜底用同一个判断（richness） */
  sparse: boolean;
  photo: CoverPhoto;
  /** 逐项可见性：这位访客能看到哪些板块、哪项联系方式（SpacePage 按设置和来访者算好） */
  visible: Record<VisibilityKey, boolean>;
  /** 预览标注里每一项「谁能看到」的说法和颜色 */
  audLabel: Record<VisibilityKey, string>;
  audTone: Record<VisibilityKey, 'public' | 'member' | 'tbd'>;
  /** 这位访客能看到的联系方式（看不到的不传进来） */
  contacts: { wechat?: string; email?: string };
  /** 本人填了联系方式、但这位访客看不到时，告诉他怎样才能看到 */
  contactHint: string | null;
  /** 有没有开放报名的活动（决定「服务与活动」入口出不出现） */
  hasEvents: boolean;
  /** AI 起稿和本人编辑合成后「现在显示的」（见 edits.ts）；还没有画像时为 null */
  eff: Effective | null;
  /** 只属于网站的内容：章节顺序、照片焦点、最近在读在听、一个生命故事 */
  extras: { order: ChapterKey[]; cover: { x: number; y: number } | null; learning: LearningItem[]; story: string };
  /** 编辑模式（只给本人）：每一块旁边出现编辑控件 */
  editing: boolean;
  /** 本人在调风格：每一块角上放「这不像我」 */
  tuning?: boolean;
  /** 互动组件，由 SpacePage 传进来：活动报名、打个招呼、每项服务的预约 */
  slots: {
    events?: React.ReactNode;
    greet?: React.ReactNode;
    bookFor?: (serviceTitle: string) => React.ReactNode;
  };
};

const splitList = (s: string | undefined) =>
  (s || '').split(/[、，,；;。\n]+/).map(x => x.trim()).filter(Boolean);

/** 一章正文不到这么多字，不配大标题：大字压着一两行小字，像一个字段名 */
const THIN = 80;
/** 每组条目先放这么多，其余折叠 */
const SHOW = 6;

/** 预览里的块级批注：一行小字，左边一条虚线 */
function Note({ on, children }: { on: boolean; children: React.ReactNode }) {
  return on ? <p className="sp-note">{children}</p> : null;
}

/** 可见性：章标后面一个小圆点加一句话 */
function Vis({ on, tone, children }: { on: boolean; tone: 'public' | 'member' | 'tbd'; children: React.ReactNode }) {
  return on ? <span className="sp-vis" data-tone={tone}>{children}</span> : null;
}

function Photo({ src, alt, sizes, eager }: { src: string; alt: string; sizes: string; eager?: boolean }) {
  return (
    <Image src={src} alt={alt} fill sizes={sizes} quality={75}
      unoptimized={!canOptimize(src)}
      {...(eager ? { loading: 'eager' as const, fetchPriority: 'high' as const } : { loading: 'lazy' as const })} />
  );
}

function ChapterMark({ num, title, children }: { num: string | null; title: string; children?: React.ReactNode }) {
  return (
    <div className="sp-mark">
      {num && <span className="sp-num" aria-hidden>{num}</span>}
      <h2 className="sp-mark-t">{title}</h2>
      {children}
    </div>
  );
}

/** 超过 SHOW 项的组：先放 SHOW 项，其余折叠，折叠里的样子和前面一样 */
function Folded<T>({ items, render, wrap }: {
  items: T[]; render: (x: T, i: number) => React.ReactNode; wrap: (children: React.ReactNode, start: number) => React.ReactNode;
}) {
  return (
    <>
      {wrap(items.slice(0, SHOW).map((x, i) => render(x, i)), 0)}
      {items.length > SHOW && (
        <details className="sp-more"><summary>还有 {items.length - SHOW} 项 ↓</summary>
          {wrap(items.slice(SHOW).map((x, i) => render(x, i + SHOW)), SHOW)}
        </details>
      )}
    </>
  );
}

/**
 * 「公众号：斜杠少年小 Z」→「斜杠少年小 Z」。公众号多半没有网页地址：没填链接时，告诉访客在微信里搜什么
 */
function wechatName(title: string): string | null {
  const m = /^(?:微信)?公众号\s*[:：·\-—]?\s*(.+)$/.exec(title.trim());
  const name = m?.[1].trim().replace(/^[「『《“"]|[」』》”"]$/g, '').trim();
  return name || null;
}

function WechatHint({ w }: { w: Work }) {
  const name = w.url ? null : wechatName(w.title);
  if (!name) return null;
  return (
    <span className="sp-wx">
      在微信里搜「{name}」
      <CopyLink href={name} raw label="复制名字" textClassName="sp-wx-copy" />
    </span>
  );
}

/** 没有链接、但有一张能显示的封面：点开就地看大图（海报上常有二维码） */
const peekImage = (w: Work) => (!w.url && isDisplayableImage(w.image_url) ? w.image_url : null);

function Plate({ w }: { w: Work }) {
  const img = isDisplayableImage(w.image_url) ? w.image_url : null;
  const peek = peekImage(w);
  const body = (
    <>
      {img && (
        <div className="sp-plate-img">
          <Photo src={img} alt="" sizes="(min-width: 1024px) 420px, 100vw" />
        </div>
      )}
      <figcaption>
        <span className="sp-plate-t">{w.title}</span>
        {w.desc && <span className="sp-plate-d">{w.desc}</span>}
        {w.url && <span className="sp-go-link">去看看 ↗</span>}
        {peek && <span className="sp-go-link">看大图 ↗</span>}
      </figcaption>
    </>
  );
  return (
    <figure className={`sp-plate ${img ? '' : 'is-text'}`}>
      {w.url ? <a href={w.url} target="_blank" rel="noreferrer noopener">{body}</a>
        : peek ? <WorkPeek src={peek} title={w.title}>{body}</WorkPeek>
        : body}
      <WechatHint w={w} />
    </figure>
  );
}

function Entry({ w, action, image }: { w: Work; action: string; image?: boolean }) {
  const img = image && isDisplayableImage(w.image_url) ? w.image_url : null;
  const body = (
    <>
      {img && (
        <div className="sp-entry-img"><Photo src={img} alt="" sizes="(min-width: 1024px) 420px, 100vw" /></div>
      )}
      <span className="sp-entry-t">{w.title}</span>
      {w.desc && <span className="sp-entry-d">{w.desc}</span>}
      {w.url && <span className="sp-go-link">{action}</span>}
      {peekImage(w) && <span className="sp-go-link">看图 ↗</span>}
    </>
  );
  const peek = peekImage(w);
  return w.url ? (
    <a className="sp-entry" href={w.url} target="_blank" rel="noreferrer noopener">{body}</a>
  ) : peek ? (
    <div className="sp-entry-wrap">
      <WorkPeek className="sp-entry" src={peek} title={w.title}>{body}</WorkPeek>
      <WechatHint w={w} />
    </div>
  ) : (
    <div className="sp-entry">{body}<WechatHint w={w} /></div>
  );
}

export default function SpaceSite({
  node, theme, result, marks, bar, sparse, photo, visible, audLabel, audTone, contacts, contactHint, hasEvents, slots,
  eff, extras, editing, tuning = false,
}: Props) {
  const t = theme.tokens;
  const draft = result?.draft ?? null;
  const name = node.name.trim();
  const { moment, create } = splitBeauty(node.beauty);
  const works = node.works || [];
  const kindOf = (w: Work): WorkKind => eff?.worksSplit[w.id] ?? 'work';
  const byKind = (k: WorkKind) => works.filter(w => kindOf(w) === k);
  const mark = (b: DraftBlock) => eff?.marks[b] ?? 'none';
  // 预览里只有「还没确认的 AI 起稿」才标 AI；本人确认过、改过的，就是他自己的了
  const aiCls = (b: DraftBlock) => (mark(b) === 'ai' ? 'sp-ai' : undefined);
  const classified = mark('works') === 'ai' && works.length > 0;
  const memberId = node.id || '';
  const avatar = photo !== 'none' && isDisplayableImage(node.avatar_url) ? node.avatar_url : null;
  const coverMode: CoverPhoto = avatar ? photo : 'none';
  // 起稿之后本人又改过资料：起稿里的东西可能对不上了，预览里提醒重新生成
  const stale = !!(result && node.updated_at && new Date(node.updated_at) > new Date(result.generatedAt));

  // ── 封面 ──
  const tagline = eff?.tagline?.trim() || '';
  // 没有起稿时，用星轨关键词顶上「一句话」的位置（v2 §7.2：16 人都有，是现成的原料）；本人说「不要」一句话时就都不放
  const kw = draft?.keywords?.length ? draft.keywords : (node.keywords ?? []);
  const keywords = !tagline && mark('tagline') !== 'hidden' && kw.length ? kw.slice(0, 4).join(' · ') : '';
  const roles = eff?.roles ?? [];
  const doing = node.doing?.trim() || '';
  const { now, expand: doingExpand } = coverLine(doing, roles);

  // ── 第一章：我这个人 ──
  const interests = node.interests?.trim() || '';
  const interestLine = interests ? interestsSentence(interests) : null;
  const topics = (node.topics || []).flatMap(x => splitList(x));
  // 起稿里的原话，按本人现在的资料再核对一遍：删掉的句子不再公开出现
  // （还没确认的 AI 条目整条不要；确认过、改过的条目留着，只去掉对不上的引用）
  const valuesMark = mark('values');
  const liveValues = (eff?.values ?? [])
    .filter(v => valuesMark !== 'ai' || !v.quote || stillQuoted(node, v.quote))
    .map(v => ({ text: v.text, quote: v.quote && stillQuoted(node, v.quote) ? { text: v.quote } : null }));
  const band = bandSource(moment, create, sparse);
  const showCreate = !!create && band?.kind !== 'create';
  const worksText = works.flatMap(w => [w.title, w.desc || '']);
  const shownOnPage = [
    moment, create, doing, interests, node.experience || '', node.seed || '',
    node.seeking || '', node.offer || '', node.product || '', ...worksText,
  ];
  // 资料少档不放还没确认的 AI 价值观：资料太薄，概括出来的多半是空话。
  // 本人改过的照他写的放，不再去重；确认过的和 AI 的照旧去重（确认时看到的就是去重后的）
  const values = valuesMark === 'edited'
    ? liveValues.map(v => ({ text: v.text, quote: v.quote?.text ?? null }))
    : sparse && valuesMark === 'ai' ? [] : dedupeValues(liveValues, tagline, shownOnPage);
  const learning = extras.learning;
  const story = extras.story.trim();

  // ── 第二章：走过的路 ──
  const merged = sparse; // 资料少档：认识层和信任层合成一章「关于我」
  const { creds, rest } = splitCredentials(node.experience || '');
  const extraRoles = roles.slice(4);
  // 合章时没有第二章的大标题，也就不从经验里挑标题（挑走了就没地方放）
  const picked = merged ? { title: null, body: rest.trim() } : pickPathTitle(rest);
  const doingFold = doingExpand ? fold(doing) : null;
  const plates = byKind('work');
  const elsewhere = byKind('content');
  // 薄章：这一章实际会出现的正文不够，挑出来的那句不放成大字，降为第一段
  const pathChars = [...(doingFold ? doing : '')].length + [...picked.body].length;
  const thin = pathChars < THIN && plates.length === 0;
  const pathTitle = !merged && picked.title && !thin ? picked.title : null;
  const pathBodyText = [picked.title && !pathTitle ? picked.title : '', picked.body].filter(Boolean).join('\n');
  const pathBody = pathBodyText ? fold(pathBodyText) : null;

  // ── 第三章：一起做点什么 ──
  const offerRaw = [node.offer?.trim(), node.product?.trim()].filter(Boolean) as string[];
  // 服务单是从「可以提供」拆出来的：本人把那段清空了，还没确认的 AI 服务单也不该再挂着；本人确认过、改过的照常显示
  const services = mark('services') === 'ai' ? (offerRaw.length ? eff?.services ?? [] : []) : eff?.services ?? [];
  const longTerm = byKind('service');
  const activities = byKind('activity');
  const hasOffer = visible.offer
    && (services.length > 0 || offerRaw.length > 0 || longTerm.length > 0 || activities.length > 0 || hasEvents);

  const seed = node.seed?.trim() || '';
  const seeking = node.seeking?.trim() || '';
  // 原文自己就在说「想找 / 希望找到」时，不再加「我也在找——」
  const seekingSaysIt = /^(我)?(也)?(想|希望|正在|一直在|在)?(寻找|找|链接|联结|认识|结识|遇见)/.test(seeking);
  const shownContacts = !!(contacts.wechat || contacts.email);
  // 首屏、页眉、第三章的主行动：开着打招呼就直接打开表单；关了就去看联系方式；都没有就去附近森林找 TA
  const cta = slots.greet
    ? { href: '#greet', label: '打个招呼' }
    : shownContacts || contactHint
      ? { href: '#connect', label: '联系我' }
      : { href: `/creators/${node.id}`, label: '去附近森林找我' };

  // 哪几章会出现：按实际会渲染的内容算，没有内容的整章不渲染，章号按实际顺序连续编
  // 编辑模式下三章都出来：编辑控件要有地方放
  const knowingHas = visible.knowing
    && (editing || !!(interestLine || topics.length || band || showCreate || values.length || learning.length));
  const pathHas = visible.path
    && (editing || !!(pathTitle || pathBody || doingFold || creds.length || extraRoles.length || plates.length || elsewhere.length));
  const offerShown = hasOffer || (marks && visible.offer);
  const chapters: { id: ChapterKey; title: string }[] = [];
  for (const k of extras.order) {
    if (k === 'knowing') {
      if (merged ? knowingHas || pathHas : knowingHas) chapters.push({ id: 'knowing', title: merged ? '关于我' : '我这个人' });
    } else if (k === 'path') {
      if (!merged && pathHas) chapters.push({ id: 'path', title: '走过的路' });
    } else if (offerShown) {
      chapters.push({ id: 'offer', title: '一起做点什么' });
    }
  }
  const numbered = !sparse && chapters.length >= 3;
  const num = (id: string) => {
    const i = chapters.findIndex(c => c.id === id);
    return numbered && i >= 0 ? chapterNumber(i, t.numerals) : null;
  };

  const style = {
    ...tokensToStyle(t),
    '--ns': String(nameScale(name) * t.nameScale),
    // 名字的视觉长度：桌面纸幅窄，按它把名字收进一行
    '--nl': String(Math.max(visualLen(name), 1.5)),
    // 本人点过照片焦点：手机和桌面的裁切都围着这一点
    ...(extras.cover ? { '--fx': `${extras.cover.x}%`, '--fy': `${extras.cover.y}%` } : {}),
  } as React.CSSProperties;

  // 封面给本人的一句提示（预览才有）
  const coverNote = !marks ? null
    : coverMode === 'stamp' ? '照片分辨率偏低，先放成一张小相片；换一张短边 700px 以上的照片就会铺满'
    : coverMode === 'none' && node.avatar_url ? '这张照片的格式浏览器打不开（HEIC），先用名字做封面'
    : (mark('tagline') === 'ai' || mark('roles') === 'ai' || (!tagline && keywords)) ? 'AI 起稿 · 一句话、身份' : null;

  // ── 第一章的片段 ──
  const interestsEl = interestLine ? (
    <p className="sp-head sp-interests"
      data-size={[...interestLine.body].length <= 60 ? 'l' : [...interestLine.body].length <= 120 ? 'm' : 's'}>
      <span className="sp-pre">{interestLine.pre}</span>{interestLine.body}
    </p>
  ) : topics.length ? (
    <p className="sp-head sp-interests" data-size="m">
      <span className="sp-pre">我一直在关注</span>{topics.join('、')}。
    </p>
  ) : null;

  const bandEl = band && (
    <figure className="sp-band" data-kind={band.kind}>
      <div className="sp-band-in">
        <figcaption className="sp-lead">{band.lead}</figcaption>
        <blockquote data-size={[...band.text].length <= 40 ? 'l' : [...band.text].length <= 90 ? 'm' : 's'}>
          {band.text}
        </blockquote>
      </div>
    </figure>
  );

  const valuesLead = values.length === 1 ? '有一件事，我一直很在意——' : '我在意的，大概是这几件事——';

  const afterBandEl = (showCreate || values.length > 0) ? (
    <>
      {showCreate && (
        <div className="sp-block">
          <p className="sp-lead">我想创造、也想守护的——</p>
          <p className="sp-p sp-big">{create}</p>
        </div>
      )}
      {values.length > 0 && (
        <div className="sp-block">
          <Note on={marks && valuesMark === 'ai'}>AI 从你写的话里概括 · 待你确认</Note>
          <p className="sp-lead">{valuesLead}</p>
          <ol className="sp-values">
            {values.map(v => (
              <li key={v.text}>
                <span className={aiCls('values')}>{v.text}</span>
                {v.quote && <small>——我写过：「{v.quote}」</small>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  ) : null;

  const learningEl = learning.length > 0 ? (
    <div className="sp-block">
      <p className="sp-lead">最近在读、在听、在学——</p>
      <ul className="sp-learn">
        {learning.map(it => (
          <li key={it.id}>
            <span className="sp-learn-k">{LEARNING_KIND_LABEL[it.kind]}</span>
            <span className="sp-learn-b">
              {it.url
                ? <a href={it.url} target="_blank" rel="noreferrer noopener">{it.title} ↗</a>
                : <span className="sp-learn-t">{it.title}</span>}
              {it.note && <small>{it.note}</small>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  ) : null;

  // ── 第二章的片段（合章时接在第一章后面） ──
  const pathBodyEl = (
    <>
      {(creds.length > 0 || extraRoles.length > 0) && (
        <ul className="sp-cred">
          {[...extraRoles, ...creds].map(c => <li key={c}>{c}</li>)}
        </ul>
      )}
      {doingFold && (
        <div className="sp-block">
          <p className="sp-lead">展开说说我正在做的——</p>
          <p className="sp-p sp-first">{doingFold.head}</p>
          {doingFold.more && (
            <details className="sp-more"><summary>接着读 ↓</summary><p className="sp-p">{doingFold.more}</p></details>
          )}
        </div>
      )}
      {pathBody && (
        <div className="sp-block">
          {(doingFold || merged) && <p className="sp-lead">一路走来——</p>}
          <p className={`sp-p ${doingFold ? '' : 'sp-first'}`}>{pathBody.head}</p>
          {pathBody.more && (
            <details className="sp-more"><summary>接着读 ↓</summary><p className="sp-p">{pathBody.more}</p></details>
          )}
        </div>
      )}
      {plates.length > 0 && (
        <div className="sp-block">
          <Note on={marks && classified}>分组由 AI 起稿 · 待你确认</Note>
          <p className="sp-lead">我做过的一些东西——</p>
          <Folded items={plates} render={w => <Plate key={w.id} w={w} />}
            wrap={(c) => <div className="sp-plates">{c}</div>} />
        </div>
      )}
      {elsewhere.length > 0 && (
        <div className="sp-block">
          <Note on={marks && classified}>分组由 AI 起稿 · 待你确认</Note>
          <p className="sp-lead">在别处，也能读到、听到我——</p>
          <Folded items={elsewhere} wrap={(c) => <ul className="sp-index">{c}</ul>} render={w => (
            <li key={w.id}>
              {w.url ? (
                <a href={w.url} target="_blank" rel="noreferrer noopener">
                  <span className="sp-index-t">{w.title}</span><span className="sp-dots" aria-hidden />
                  <span className="sp-index-v">{linkVerb(w.title)} ↗</span>
                </a>
              ) : peekImage(w) ? (
                // 没有链接、只有一张海报（公众号、播客常这样）：点开看大图，微信里长按识别二维码
                <WorkPeek src={peekImage(w)!} title={w.title}>
                  <span className="sp-index-t">{w.title}</span><span className="sp-dots" aria-hidden />
                  <span className="sp-index-v">看图 ↗</span>
                </WorkPeek>
              ) : (
                <span className="sp-index-t">{w.title}</span>
              )}
              {w.desc && <small>{w.desc}</small>}
              <WechatHint w={w} />
            </li>
          )} />
        </div>
      )}
      {editing && (
        <>
          <OriginalLink memberId={memberId} what="「正在做」「经历」" />
          <WorksEditor memberId={memberId} mark={mark('works')} works={works.map(w => ({ id: w.id, title: w.title }))}
            split={Object.fromEntries(works.map(w => [w.id, kindOf(w)]))} />
        </>
      )}
    </>
  );

  // ══ 第一章：我这个人（认识层）══ 顺序：日常 → 那一幕（色块）→ 想守护的 → 我在意的 → 最近在读在听
  const knowingChapter = (
    <section id="knowing" className="sp-ch">
            <div className="sp-col">
              <ChapterMark num={num('knowing')} title={merged ? '关于我' : '我这个人'}>
                <Vis on={marks} tone={audTone.knowing}>{audLabel.knowing}</Vis>
                {tuning && <NotMe block="knowing" label="「我这个人」" />}
              </ChapterMark>
              {visible.knowing && interestsEl}
              {editing && <OriginalLink memberId={memberId} what="「兴趣」「美的时刻」「想创造或守护的」" />}
            </div>
            {visible.knowing && bandEl}
            {((visible.knowing && (afterBandEl || learningEl || editing)) || (merged && pathHas)) && (
              <div className="sp-col">
                {visible.knowing && afterBandEl}
                {editing && <ValuesEditor memberId={memberId} mark={valuesMark} value={values} />}
                {visible.knowing && learningEl}
                {editing && <LearningEditor memberId={memberId} value={learning} />}
                {merged && pathHas && pathBodyEl}
              </div>
            )}
          </section>
  );

  // ══ 第二章：走过的路（信任层）══
  const pathChapter = (
    <section id="path" className="sp-ch">
            <div className="sp-col">
              <ChapterMark num={num('path')} title="走过的路">
                <Vis on={marks} tone={audTone.path}>{audLabel.path}</Vis>
                {tuning && <NotMe block="path" label="「走过的路」" />}
              </ChapterMark>
              {pathTitle
                ? <p className="sp-head">{pathTitle}</p>
                : !thin && <p className="sp-head">我是怎么走到这里的</p>}
              {pathBodyEl}
            </div>
          </section>
  );

  // ══ 第三章：一起做点什么（服务与活动，默认在中后部）══
  const offerChapter = (
    <section id="offer" className="sp-ch sp-offer-ch">
            <div className="sp-offer">
              <div className="sp-offer-side">
                <ChapterMark num={num('offer')} title="一起做点什么">
                  <Vis on={marks} tone={audTone.offer}>{audLabel.offer}</Vis>
                  {tuning && <NotMe block="offer" label="「一起做点什么」" />}
                </ChapterMark>
                <p className="sp-head">
                  <span className="sp-line">想和我一起做点什么？</span><span className="sp-line">可以从这里开始。</span>
                </p>
                <p className="sp-dek">{slots.greet ? '不确定哪一件适合你，也可以先来打个招呼。' : '不确定哪一件适合你，也可以先联系我。'}</p>
                <a className="sp-btn sp-btn--quiet" href={cta.href}>{cta.label}</a>
              </div>
              <div className="sp-offer-main">
                {!hasOffer && (
                  <p className="sp-placeholder-box">这里会放你的服务与活动。现在还空着，访客看不到这一章。</p>
                )}
                {editing && (
                  <>
                    <ServicesEditor memberId={memberId} mark={mark('services')} value={eff?.services ?? []} />
                    <OriginalLink memberId={memberId} what="「可以提供」" />
                  </>
                )}
                {services.length > 0 ? (
                  <div className="sp-block">
                    <Note on={marks && mark('services') === 'ai'}>AI 按你写的「可以提供」整理 · 待你确认</Note>
                    <p className="sp-lead">我可以为你做的——</p>
                    <Folded items={services}
                      wrap={(c, start) => <ol className="sp-menu" start={start + 1}>{c}</ol>}
                      render={(s, i) => (
                        <li key={s.id}>
                          <span className="sp-menu-n">{String(i + 1).padStart(2, '0')}</span>
                          <div>
                            <p className={`sp-menu-t ${aiCls('services') ?? ''}`}>{s.title}</p>
                            {s.desc && <p className="sp-menu-d">{s.desc}</p>}
                            {serviceMeta(s) && <p className="sp-menu-meta">{serviceMeta(s)}</p>}
                          </div>
                          {slots.bookFor ? slots.bookFor(s.title) : <a className="sp-menu-a" href="#connect">问问这个 →</a>}
                        </li>
                      )} />
                    {offerRaw.length > 0 && (
                      <details className="sp-more sp-orig"><summary>读我自己写的原话 ↓</summary>
                        {offerRaw.map(x => <p key={x} className="sp-p">{x}</p>)}
                      </details>
                    )}
                  </div>
                ) : offerRaw.length > 0 && mark('services') !== 'hidden' ? (
                  <div className="sp-block">
                    <p className="sp-lead">我可以为你做的——</p>
                    {offerRaw.map(x => <p key={x} className="sp-p">{x}</p>)}
                    {slots.bookFor && <div className="sp-book-any">{slots.bookFor('')}</div>}
                  </div>
                ) : null}
                {hasEvents && <div className="sp-block">{slots.events}</div>}
                {longTerm.length > 0 && (
                  <div className="sp-block">
                    <Note on={marks && classified}>分组由 AI 起稿 · 待你确认</Note>
                    <p className="sp-lead">我也在长期做这些——</p>
                    <Folded items={longTerm} render={w => <Entry key={w.id} w={w} action="看完整介绍 ↗" />}
                      wrap={(c) => <div className="sp-entries" data-line="accent">{c}</div>} />
                  </div>
                )}
                {activities.length > 0 && (
                  <div className="sp-block">
                    <Note on={marks && classified}>分组由 AI 起稿 · 待你确认</Note>
                    <p className="sp-lead">{hasEvents ? '以前办过的——' : '我的活动——'}</p>
                    <Folded items={activities} render={w => <Entry key={w.id} w={w} action="看活动介绍 ↗" image />}
                      wrap={(c) => (
                        <div className="sp-entries sp-acts-grid" data-line="ink" data-one={activities.length === 1 ? '' : undefined}>{c}</div>
                      )} />
                    <Note on={marks && !hasEvents}>在管理页新建一场活动，开放报名后会出现在这一章，访客可以直接报名</Note>
                  </div>
                )}
              </div>
            </div>
          </section>
  );

  return (
    <div className="sp" lang="zh-CN" style={style} data-theme={theme.id} data-edge={t.edge} data-cover={t.cover}
      data-photo={coverMode} data-align={t.coverAlign} data-lede={t.lede ? '' : undefined}
      data-sparse={sparse ? '' : undefined} data-marks={marks ? '' : undefined} data-bar={bar ? '' : undefined}
      data-tuning={tuning ? '' : undefined}>

      {/* ══ 封面（名片层）：照片在上（桌面在右），字在一张纸上 ══ */}
      <header className="sp-cover" id="top">
        {tuning && <NotMe block="cover" label="首屏" />}
        {avatar && coverMode === 'photo' && (
          <div className="sp-cover-amb" aria-hidden>
            <Photo src={avatar} alt="" sizes="64px" />
          </div>
        )}
        <div className="sp-cover-photo">
          {avatar && coverMode === 'photo' ? (
            <Photo src={avatar} alt={`${name} 的照片`} sizes="(min-width: 1024px) 64vw, 100vw" eager />
          ) : avatar && coverMode === 'stamp' ? (
            <span className="sp-stamp"><Photo src={avatar} alt={`${name} 的照片`} sizes="168px" eager /></span>
          ) : (
            <span className="sp-glyph" aria-hidden>{glyphOf(name)}</span>
          )}
        </div>
        <div className="sp-sheet">
          {coverNote && !editing && <p className="sp-cover-note">{coverNote}</p>}
          {editing && avatar && <CoverFocus memberId={memberId} src={`/_next/image?url=${encodeURIComponent(avatar)}&w=828&q=75`} focus={extras.cover} />}
          <h1 className="sp-name">{name}</h1>
          {tagline ? (
            <p className="sp-tagline" data-long={[...tagline].length > 18 ? '' : undefined}><span className={aiCls('tagline')}>{tagline}</span></p>
          ) : keywords ? (
            <p className="sp-tagline" data-long=""><span className="sp-ai">{keywords}</span></p>
          ) : marks && mark('tagline') !== 'hidden' ? (
            <p className="sp-tagline sp-placeholder">（一句话介绍还没写）</p>
          ) : null}
          {editing && <TaglineEditor memberId={memberId} mark={mark('tagline')} value={tagline} />}
          {(node.city || roles.length > 0) && (
            <p className="sp-byline">
              {node.city && <span className="sp-city">{node.city}</span>}
              {roles.length > 0 && (
                <span className={`sp-roles ${aiCls('roles') ?? ''}`}>{roles.slice(0, 4).map(r => <span key={r}>{r}</span>)}</span>
              )}
            </p>
          )}
          {editing && <RolesEditor memberId={memberId} mark={mark('roles')} value={roles} />}
          {now && <p className="sp-now">{now}</p>}
          {editing && <OriginalLink memberId={memberId} what="「正在做」和城市" />}
          <div className="sp-acts">
            <a className="sp-btn" href={cta.href}>{cta.label}</a>
            {hasOffer && <a className="sp-go" href="#offer">服务与活动 ↓</a>}
          </div>
        </div>
      </header>

      {/* ══ 吸顶页眉：封面滚走之后才出现在顶部 ══ */}
      <nav className="sp-run" aria-label="页面导航">
        <a className="sp-run-name" href="#top">{name}</a>
        {!sparse && chapters.length > 1 && (
          <span className="sp-run-toc">
            {chapters.map(c => <a key={c.id} href={`#${c.id}`}>{c.title}</a>)}
          </span>
        )}
        <span className="sp-run-sp" />
        {hasOffer && <a className="sp-run-offer" href="#offer">服务与活动</a>}
        <a className="sp-run-hi" href={cta.href}>{cta.label}</a>
      </nav>

      <main className="sp-story">
        {stale && marks && (
          <p className="sp-stale">你在 AI 起稿之后改过资料：标着 AI 的内容可能对不上了，可以去风格工作室重新生成。</p>
        )}

        {editing && (
          <div className="sp-col"><OrderEditor memberId={memberId} order={extras.order} /></div>
        )}

        {/* ══ 中间三章按本人定的顺序（默认：我这个人 → 走过的路 → 一起做点什么）══ */}
        {chapters.map(c => (
          <Fragment key={c.id}>
            {c.id === 'knowing' ? knowingChapter : c.id === 'path' ? pathChapter : offerChapter}
          </Fragment>
        ))}

        {/* ══ 最后一页：种子 ══ */}
        {(seed || story || editing) && visible.seed && (
          <section id="seed" className="sp-last">
            <div className="sp-col">
              <ChapterMark num={null} title="最后一页">
                <Vis on={marks} tone={audTone.seed}>{audLabel.seed}</Vis>
                {tuning && <NotMe block="seed" label="最后一页" />}
              </ChapterMark>
              {story && (
                <>
                  <p className="sp-lead">有一个对我很重要的故事——</p>
                  <p className="sp-story-text">{story}</p>
                </>
              )}
              {editing && <StoryEditor memberId={memberId} value={story} />}
              {seed && (
                <>
                  <p className="sp-lead">心里还有一颗种子——</p>
                  <p className="sp-seed" data-long={[...seed].length > 140 ? '' : undefined}>{seed}</p>
                </>
              )}
              {editing && <OriginalLink memberId={memberId} what="「心里的种子」" />}
              {(seed || story) && <p className="sp-sign">—— {name}</p>}
            </div>
          </section>
        )}
      </main>

      {/* ══ 尾声（底部连接）：照片回来，停在「打个招呼」══ */}
      <footer id="connect" className="sp-end">
        {tuning && <NotMe block="end" label="尾声" />}
        {avatar && coverMode === 'photo' && (
          <div className="sp-end-amb" aria-hidden><Photo src={avatar} alt="" sizes="64px" /></div>
        )}
        <div className="sp-col sp-end-in">
          {avatar && (
            <span className="sp-end-photo"><Photo src={avatar} alt="" sizes="128px" /></span>
          )}
          <h2 className="sp-lead sp-end-h">如果你读到了这里——</h2>
          {seeking ? (
            <>
              {!seekingSaysIt && <p className="sp-end-k">我也在找——</p>}
              <p className="sp-end-seek" data-long={[...seeking].length > 60 ? '' : undefined}>{seeking}</p>
            </>
          ) : (
            <p className="sp-end-seek">来打个招呼吧。</p>
          )}
          {slots.greet && <div className="sp-greet" id="greet">{slots.greet}</div>}
          {shownContacts ? (
            <div className="sp-contact">
              <p className="sp-end-k">想直接找我，也可以这样——</p>
              <dl>
                {contacts.wechat && (
                  <><dt>微信</dt><dd>{contacts.wechat}<Vis on={marks} tone={audTone.wechat}>{audLabel.wechat}</Vis></dd></>
                )}
                {contacts.email && (
                  <><dt>邮箱</dt><dd>{contacts.email}<Vis on={marks} tone={audTone.email}>{audLabel.email}</Vis></dd></>
                )}
              </dl>
            </div>
          ) : contactHint ? (
            <p className="sp-end-small">{contactHint}<Link href="/#join">加入附近森林</Link></p>
          ) : !slots.greet ? (
            <a className="sp-btn sp-btn--end" href={`/creators/${node.id}`}>去附近森林找我 ↗</a>
          ) : null}
          <p className="sp-colophon">
            在 <a href={`/creators/${node.id}`}>附近森林</a> 生长
            {node.city && <> · 写于{node.city}</>}
            {' · '}版式：{theme.name}
          </p>
        </div>
      </footer>
    </div>
  );
}

