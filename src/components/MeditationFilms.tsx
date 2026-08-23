'use client';

import { useCallback, useMemo, useState } from 'react';
import TrackNotes from '@/components/TrackNotes';
import { dict } from '@/i18n';
import type { Locale } from '@/lib/locale';
import type { MeditationCategory, MeditationTrack } from '@/lib/meditations';
import {
  SEASON_ORDER,
  SOLAR_TERMS_CATEGORY_ID,
  findSolarTerm,
  termsOfSeason,
} from '@/lib/solarTerms';

/**
 * 影像 ——「看见」这一组的版式。
 *
 * 这一组不是「视频区」：人物故事、自然观察、冥想练习、创作过程、节气影像、
 * 社区纪录都会往里放，它是附近森林用影像看人和世界的那扇窗。所以这个组件
 * 不假设内容是节气——节气那套只是其中一个专题的形状。
 *
 * 版式照搬引导冥想那一屏：小标签 + 衬线小标题，底下一格一支。
 * 之前试过「一支片摊开占满一行」和「播放器与简介并排」两版，都不对——
 * 那是在替这个专题宣布「就这一支」。做成卡片之后，一支和二十四支是同一套
 * 排法，新的影像进来只是多一格。
 *
 * 每张卡自带播放器（对应引导冥想卡片底下那个 audio），所以不需要
 * 「当前选中哪一支」这种状态：底下那条节气路线是锚点，点了滚到那张卡。
 */

type Props = {
  /**
   * 文案在客户端自己取。
   *
   * 不能像服务端组件那样把字典切片当 props 传进来——字典里为了英文单复数
   * 用了函数，而函数跨不过 server → client 那道序列化边界，页面会直接崩在
   * 「Functions cannot be passed directly to Client Components」。
   * 所以只传 locale 这个字符串，字典在这边查。
   */
  locale: Locale;
  content: { tracks: MeditationTrack[] };
  category: MeditationCategory;
  noteCounts: Record<string, number>;
  loggedIn: boolean;
  /**
   * 此刻大约在第几个节气。一定要服务端按北京时间算好传进来——
   * 让浏览器自己 new Date()，服务端渲染的那一版和水合之后的那一版
   * 会在跨日的那几个小时里落在不同的节气上。
   */
  currentTermSeq: number;
};

/**
 * 微信内置浏览器（X5）默认把 video 抢走全屏播。这几个属性是让它老实待在
 * 页面里的开关，首页那支影片用的是同一套。
 */
const wechatInlineAttrs = {
  'webkit-playsinline': 'true',
  'x5-playsinline': 'true',
  'x5-video-player-type': 'h5',
  'x5-video-player-fullscreen': 'false',
} as const;

/**
 * 把文字放进剪贴板。返回成没成功。
 *
 * 两条路都要留着：clipboard API 要求安全上下文，微信内置浏览器和
 * 某些安卓 webview 里拿不到；老的 execCommand 虽然废弃了，但在那些
 * 地方反而是唯一能用的。两条都失败时由调用方把链接摆出来让人自己复制。
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 继续走下面那条
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    // 不能用 display:none——选不中就复制不了
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);  // iOS 只认这个
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function MeditationFilms({
  locale, content, category, noteCounts, loggedIn, currentTermSeq,
}: Props) {
  // 用 useMemo 包一层：dict() 是个函数调用，直接放在组件体里
  // React Compiler 分析不了，会连带放弃保留下面 useCallback 的记忆化。
  const { t, audioT } = useMemo(() => {
    const d = dict(locale).meditations;
    return { t: d.film, audioT: d.audio };
  }, [locale]);

  const films = useMemo(
    () => content.tracks
      .filter(track => track.categoryId === category.id)
      .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)),
    [content.tracks, category.id],
  );

  const [openNotes, setOpenNotes] = useState('');
  const [counts, setCounts] = useState(noteCounts);

  const bumpCount = useCallback((trackId: string, delta: number) => {
    setCounts(prev => ({ ...prev, [trackId]: Math.max(0, (prev[trackId] || 0) + delta) }));
  }, []);

  const toggleNotes = useCallback((trackId: string) => {
    setOpenNotes(prev => (prev === trackId ? '' : trackId));
  }, []);

  const isSolarTerms = category.id === SOLAR_TERMS_CATEGORY_ID;
  /*
    只有一支的时候，标题就是那一支的名字。
    「具体的影像」这种通用小标题在多支时才有意义（它统的是一组）；
    只有一支还挂着它，等于在片名上面又压了一句什么都没说的话，
    而片名反倒被降到卡片里的小字号去了。
  */
  const single = films.length === 1;

  if (films.length === 0) {
    return (
      <div className="rounded-2xl border border-forest/12 bg-white/60 px-6 py-10 text-ink-soft">
        {t.empty}
      </div>
    );
  }

  const cards = films.map(film => (
    <FilmCard
      key={film.id}
      film={film}
      t={t}
      audioT={audioT}
      locale={locale}
      /* 节气到了的那一支标一下。别的影像专题没有节气，不标 */
      isNow={isSolarTerms && film.seq === currentTermSeq}
      wide={single}
      /* 标题已经升上去当小标题了，卡片里不要再写一遍 */
      hideTitle={single}
      loggedIn={loggedIn}
      noteCount={counts[film.id] || 0}
      notesOpen={openNotes === film.id}
      onToggleNotes={toggleNotes}
      onCountChange={bumpCount}
    />
  ));

  return (
    <div>
      {/* 和引导冥想那一屏同一个头：小标签 + 衬线小标题 */}
      <div className="mb-8">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-forest/45">
          {t.eyebrow}
        </p>
        <h2
          className="text-[1.5rem] font-normal leading-[1.4] tracking-[-0.02em] text-ink"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          {single ? films[0].title : t.listTitle}
        </h2>
      </div>

      {/*
        只有一支的时候不塞进网格：一张卡站在三分之一格里、右边空掉三分之二，
        看着像加载失败。横版把这一行用满，但收在 760px 以内——
        再宽一行正文就长到读不下去了。规则和引导冥想那边一模一样。
      */}
      {single ? (
        <div className="max-w-[760px]">{cards}</div>
      ) : (
        <div
          className={`grid gap-8 max-[420px]:gap-5 ${
            films.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-3'
          }`}
        >
          {cards}
        </div>
      )}

      {isSolarTerms && (
        <SolarTermTrail
          locale={locale}
          t={t}
          films={films}
          currentTermSeq={currentTermSeq}
        />
      )}
    </div>
  );
}

/**
 * 一支影像。结构照着 MeditationTrackCard：封面、一行小字、标题、简介、感悟。
 * 区别只在封面本身就是播放器——影片不需要另配一张装饰图。
 */
function FilmCard({
  film, t, audioT, locale, isNow, wide, hideTitle, loggedIn, noteCount, notesOpen, onToggleNotes, onCountChange,
}: {
  film: MeditationTrack;
  t: ReturnType<typeof dict>['meditations']['film'];
  audioT: ReturnType<typeof dict>['meditations']['audio'];
  locale: Locale;
  isNow: boolean;
  wide: boolean;
  /** 只有一支时标题升成了小标题，这里就别重复了 */
  hideTitle: boolean;
  loggedIn: boolean;
  noteCount: number;
  notesOpen: boolean;
  onToggleNotes: (trackId: string) => void;
  onCountChange: (trackId: string, delta: number) => void;
}) {
  const [failed, setFailed] = useState(false);
  /** idle | copied（复制成功，两秒后消失）| manual（两条路都不通，把链接摆出来） */
  const [share, setShare] = useState<'idle' | 'copied' | 'manual'>('idle');
  const [shareUrl, setShareUrl] = useState('');
  const term = findSolarTerm(film.seq);

  const onShare = async () => {
    /*
      分享的是「这一页 + 这张卡的锚点」，不是影片文件本身。
      发影片地址等于把桶里的对象直接甩出去：没有标题、没有简介，
      也没法从那里走回森林。锚点已经有了（article 上的 id）。
    */
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}#${film.id}`;
    setShareUrl(url);

    // 手机上优先叫系统分享面板。微信内置浏览器没有这个 API，会落到下面。
    if (navigator.share) {
      try {
        await navigator.share({ title: film.title, text: film.intention, url });
        return;
      } catch (err) {
        // 用户自己点了取消，不是错误，别再弹一次复制提示
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }

    if (await copyText(url)) {
      setShare('copied');
      window.setTimeout(() => setShare('idle'), 2400);
      return;
    }
    setShare('manual');
  };
  const meta = [
    term ? t.season[term.season] : film.stage,
    film.duration,
  ].filter(Boolean).join(' · ');

  const cover = film.videoUrl ? (
    <video
      controls
      playsInline
      /*
        preload="none" 不是省事，是省钱：影片按流量计费，页面被打开一次
        就先替访客下掉几十兆是说不过去的。有封面图顶着，不点开也不是黑的。
        （二十四支做齐之后，光封面图也有好几兆，到那时再考虑懒加载。）
      */
      preload="none"
      poster={film.posterUrl}
      controlsList="nodownload"
      onContextMenu={event => event.preventDefault()}
      onError={() => setFailed(true)}
      onPlaying={() => setFailed(false)}
      aria-label={t.watch(film.title)}
      className="block aspect-video w-full rounded-[20px] border border-forest-deep/[0.10] bg-black object-contain"
      {...wechatInlineAttrs}
    >
      <source src={film.videoUrl} type="video/mp4" />
    </video>
  ) : (
    <div className="grid aspect-video w-full place-items-center rounded-[20px] border border-forest/12 bg-white/60 text-[13.5px] text-ink-soft">
      {t.coming}
    </div>
  );

  return (
    <article
      id={film.id}
      className={wide ? 'group scroll-mt-28 sm:flex sm:items-start sm:gap-8' : 'group min-w-0 scroll-mt-28'}
    >
      {/* 横版里给封面一个定宽，它才不会跟着文字一起被拉成一整行那么大 */}
      {wide ? <div className="sm:w-[400px] sm:shrink-0">{cover}</div> : cover}

      <div className={wide ? 'min-w-0 flex-1' : ''}>
        <div
          className={`flex flex-wrap items-center gap-2 text-[12px] font-medium tracking-[0.08em] text-ink-soft ${
            wide ? 'mt-5 sm:mt-1' : 'mt-5'
          }`}
        >
          {/* 正好是此刻这个节气的那一支，标出来——人多半是顺着时节找过来的 */}
          {isNow ? (
            <span className="rounded-full border border-clay/35 bg-clay/[0.09] px-2.5 py-0.5 text-[11px] font-medium tracking-normal text-clay">
              {t.thisTerm}
            </span>
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-mist" />
          )}
          {meta && <span>{meta}</span>}
        </div>

        {!hideTitle && (
          <h3 className="mt-2 text-[clamp(1.05rem,2.2vw,1.3rem)] font-normal leading-[1.45] text-forest-deep">
            {film.title}
          </h3>
        )}

        {film.intention && (
          <p className="mt-2 text-[13.5px] leading-[1.85] text-ink-soft">
            {film.intention}
          </p>
        )}

        {failed && (
          <p className="mt-2 text-[12.5px] text-clay">{t.videoFailed}</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => onToggleNotes(film.id)}
            aria-expanded={notesOpen}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] tabular-nums transition-colors ${
              notesOpen ? 'bg-forest/12 text-forest-deep' : 'text-ink-soft hover:bg-forest/[0.07] hover:text-forest-deep'
            }`}
          >
            <IconNote />
            {noteCount > 0 ? audioT.noteCount(noteCount) : audioT.writeNote}
          </button>

          <button
            type="button"
            onClick={onShare}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] transition-colors ${
              share === 'copied'
                ? 'bg-forest/12 text-forest-deep'
                : 'text-ink-soft hover:bg-forest/[0.07] hover:text-forest-deep'
            }`}
          >
            <IconShare />
            {share === 'copied' ? t.shareCopied : t.share}
          </button>
        </div>

        {/*
          系统面板和剪贴板都不给用（微信里常有）。这时候不能只说一句
          「复制失败」就没了下文——把链接原样摆出来，长按能选中复制。
        */}
        {share === 'manual' && (
          <div className="mt-2 rounded-xl border border-forest/12 bg-white/70 px-3 py-2.5">
            <p className="text-[11.5px] text-ink-soft">{t.shareManual}</p>
            <p className="mt-1 select-all break-all text-[12px] leading-[1.7] text-forest-deep">
              {shareUrl}
            </p>
          </div>
        )}

        {notesOpen && (
          <div className="mt-2 overflow-hidden rounded-xl border border-forest/12">
            <TrackNotes
              locale={locale}
              trackId={film.id}
              loggedIn={loggedIn}
              onCountChange={onCountChange}
            />
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * 一整年的路线。
 *
 * 四行，一季一行。做好的节气点得动，点了滚到那张卡；没做的留在那里但压暗——
 * 留白比藏起来更诚实：人看得到这条路有多长，也看得到现在走到哪。
 */
function SolarTermTrail({
  locale, t, films, currentTermSeq,
}: {
  locale: Locale;
  t: ReturnType<typeof dict>['meditations']['film'];
  films: MeditationTrack[];
  currentTermSeq: number;
}) {
  // seq → 影片。后台可能给同一个节气排了两条，取先出现的那条就好。
  const bySeq = useMemo(() => {
    const map = new Map<number, MeditationTrack>();
    for (const film of films) {
      if (film.seq && !map.has(film.seq)) map.set(film.seq, film);
    }
    return map;
  }, [films]);

  return (
    <section className="mt-14 border-t border-forest/[0.12] pt-7 max-md:mt-10">
      <div className="mb-6 flex items-baseline gap-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-forest/45">
          {t.termsEyebrow}
        </p>
        <h2 className="text-[1.05rem] font-normal text-ink" style={{ fontFamily: 'var(--font-serif)' }}>
          {t.termsTitle}
        </h2>
      </div>

      {/*
        一季一行，六格对齐成一张日历——一年本来就是这个形状。
        用 flex-wrap 按内容自然宽排的话右边会空掉将近一半，
        和上面那排卡片摞在一起，右边缘参差得很难看。
      */}
      <div className="flex flex-col gap-2.5">
        {SEASON_ORDER.map(season => (
          /*
            季节那一列的宽度跟着语言走：中文是一个字（春），英文是
            Spring / Summer 这种六七个字母的词，塞进 2rem 会直接贴到
            第一个节气名上。两个类名都写成字面量，Tailwind 才生成得出来。

            宽度必须是固定值、不能用 auto：四季是四个独立的 grid，
            auto 会让每一行按自己的标签宽度各算各的，节气就对不齐了。
          */
          <div
            key={season}
            className={`grid items-stretch gap-4 max-md:gap-3 ${
              locale === 'en'
                ? 'grid-cols-[3.5rem_minmax(0,1fr)]'
                : 'grid-cols-[2rem_minmax(0,1fr)]'
            }`}
          >
            <span className="flex items-center text-[12px] font-medium tracking-[0.1em] text-forest/50">
              {t.season[season]}
            </span>
            <div className="grid grid-cols-6 gap-2 max-md:grid-cols-3 max-md:gap-1.5">
              {termsOfSeason(season).map(term => {
                const film = bySeq.get(term.seq);
                const ready = Boolean(film?.videoUrl);
                const now = term.seq === currentTermSeq;
                const label = locale === 'en' ? term.en : term.name;

                const inner = (
                  <>
                    {now && (
                      <span
                        aria-hidden="true"
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${ready ? 'bg-clay' : 'bg-clay/60'}`}
                      />
                    )}
                    {label}
                  </>
                );

                /*
                  格子等宽（一年二十四格对齐成日历），但胶囊只包住文字本身。
                  撑满格子的话，两个字要顶着一百三十像素宽的圈，二十四个
                  气球排下来，比它们承载的信息响得多。
                */
                const shared =
                  'flex w-fit items-center justify-center gap-1.5 justify-self-center rounded-full px-3 py-1.5 text-center text-[13px] leading-[1.4] transition-colors';

                if (!ready) {
                  /*
                    还没做的那些不画圈，退成一行安静的字。
                    二十三个空胶囊会和已经做好的那些抢注意力；留着名字就够了。

                    压暗但不能压到看不见：/40 在这个淡绿底上对比度只有 1.7:1，
                    亮一点的屏幕或者眼睛差一点就整片消失了——而这二十四个
                    名字是真内容，不是装饰。/80 是 3.4:1，压得住层级也读得清。
                  */
                  return (
                    <span
                      key={term.seq}
                      title={now ? t.now : t.notYet}
                      className={`${shared} ${now ? 'text-ink-soft' : 'text-ink-soft/80'}`}
                    >
                      {inner}
                    </span>
                  );
                }

                /*
                  锚点，不是切换器：每张卡自带播放器，点了滚过去就行。
                  用 <a href="#id"> 而不是 scrollIntoView，是为了让它在 JS
                  还没跑起来、或者被「在新标签打开」时也照样有意义。
                */
                return (
                  <a
                    key={term.seq}
                    href={`#${film!.id}`}
                    aria-label={t.watch(film!.title)}
                    className={`${shared} border border-forest/25 bg-white/75 font-medium text-forest-deep no-underline hover:border-forest hover:bg-white`}
                  >
                    {inner}
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function IconShare() {
  return (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-3 w-3" aria-hidden="true">
      <path d="M6 8.2V1.9M6 1.9 3.9 4M6 1.9 8.1 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.4 6.9v2.8h7.2V6.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconNote() {
  return (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-3 w-3" aria-hidden="true">
      <path d="M1.8 2.4h8.4v5.4H5.4L2.8 9.9V7.8H1.8z" strokeLinejoin="round" />
    </svg>
  );
}
