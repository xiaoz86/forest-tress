'use client';

import { useEffect, useRef, useState } from 'react';
import { copyText } from '@/lib/clipboard';

/**
 * 分享一场活动（和林间探索里「分享一支影片」同一套做法）：
 * - 有系统分享面板的先叫它（手机、Mac 上的 Safari / Chrome / Edge：微信、隔空投送、信息……）；
 *   没有的（微信内置浏览器、Firefox 等）直接复制链接
 * - 点过之后把完整链接摆在按钮下面：「复制链接」、长按复制都能走；右上角可以收起
 * 分享的是发起人网站上的这一场（带 ?e= 和锚点），不是一个孤零零的报名表。
 *
 * variant：space 用在个人网站里（跟着主题的颜色，样式在 events.css）；site 用在社区广场和管理页（Tailwind）
 */
export type ShareCopy = {
  share: string; copied: string; ready: string; copy: string; done: string; manual: string; close: string;
  label: (title: string) => string;
};

export const SHARE_ZH: ShareCopy = {
  share: '分享',
  copied: '链接已复制',
  ready: '分享链接已生成',
  copy: '复制链接',
  done: '已复制',
  manual: '复制不了，长按下面这行自己复制',
  close: '收起',
  label: title => `分享「${title}」`,
};

export const SHARE_EN: ShareCopy = {
  share: 'Share',
  copied: 'Link copied',
  ready: 'Share link ready',
  copy: 'Copy link',
  done: 'Copied',
  manual: 'Couldn’t copy—press and hold the link below to copy it',
  close: 'Close',
  label: title => `Share “${title}”`,
};

export default function ShareEvent({ path, title, text, variant = 'site', copy = SHARE_ZH, className }: {
  /** 站内路径（会补上当前域名）或完整地址 */
  path: string;
  title: string;
  text?: string;
  variant?: 'space' | 'site';
  copy?: ShareCopy;
  className?: string;
}) {
  /** idle | ready（链接已生成）| copied（刚复制好，过一会儿回到 ready）| manual（复制失败，把链接摆出来） */
  const [state, setState] = useState<'idle' | 'ready' | 'copied' | 'manual'>('idle');
  const [url, setUrl] = useState('');
  const timer = useRef<number | null>(null);
  const shareBtn = useRef<HTMLButtonElement>(null);

  // 「已复制」只亮一会儿；再点一次就从头算，离开页面时收掉计时器
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  async function copyNow(link: string) {
    if (timer.current) window.clearTimeout(timer.current);
    if (await copyText(link)) {
      setState('copied');
      timer.current = window.setTimeout(() => setState(s => (s === 'copied' ? 'ready' : s)), 2400);
    } else {
      setState('manual');
    }
  }

  async function onShare() {
    const link = new URL(path, window.location.origin).toString();
    setUrl(link);
    setState('ready');
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text, url: link });
        return;
      } catch (err) {
        // 自己点了取消，不是错误，别再接着复制
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }
    await copyNow(link);
  }

  function close() {
    if (timer.current) window.clearTimeout(timer.current);
    setState('idle');
    shareBtn.current?.focus();
  }

  const site = variant === 'site';
  const message = state === 'copied' ? copy.copied : state === 'manual' ? copy.manual : copy.ready;
  return (
    // 外层不占位（display: contents）：按钮跟着所在那一行排，点开后的链接那一块整行铺在下面。
    // relative z-[2]：社区广场那一行整行是一个链接（z-[1]），按钮和链接块要压在它上面才点得到
    <div className={`${site ? 'contents' : 'spe-share'} ${className ?? ''}`}>
      <button
        ref={shareBtn}
        type="button"
        onClick={onShare}
        aria-label={copy.label(title)}
        className={site
          ? `relative z-[2] inline-flex min-h-9 items-center gap-1.5 rounded-full border border-forest-deep/15 px-3 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest ${state === 'copied' ? 'bg-forest/12 text-forest-deep' : 'text-text-secondary hover:bg-forest/[0.07] hover:text-forest-deep'}`
          : `spe-share-btn${state === 'copied' ? ' is-done' : ''}`}
      >
        <IconShare />
        {state === 'copied' ? copy.done : copy.share}
      </button>
      {/* 读屏念的是这一句状态（一直挂着，内容变了才念），不是整块链接 */}
      <span className="sr-only" role="status">{state === 'idle' ? '' : message}</span>
      {state !== 'idle' && (
        <div className={site ? 'relative z-[2] basis-full rounded-xl border border-forest/12 bg-white px-3 py-2.5 text-left' : 'spe-share-panel'}>
          <div className={site ? 'flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5' : 'spe-share-row'}>
            <p className={site ? 'm-0 min-w-0 flex-1 basis-[9rem] text-[12.5px] text-text-secondary' : 'spe-small'} aria-hidden="true">
              {message}
            </p>
            <span className={site ? 'flex shrink-0 items-center gap-1' : 'spe-share-tools'}>
              <button
                type="button"
                onClick={() => copyNow(url)}
                aria-disabled={state === 'copied'}
                className={site
                  ? 'rounded-full border border-forest/20 px-3 py-1 text-[12px] text-forest-deep transition-colors hover:bg-forest/[0.07]'
                  : 'spe-share-copy'}
              >
                {state === 'copied' ? copy.done : copy.copy}
              </button>
              <button
                type="button"
                onClick={close}
                aria-label={copy.close}
                className={site
                  ? 'grid h-8 w-8 place-items-center rounded-full text-[16px] leading-none text-text-secondary transition-colors hover:bg-forest/[0.07] hover:text-forest-deep'
                  : 'spe-share-x'}
              >
                ×
              </button>
            </span>
          </div>
          <p className={site ? 'm-0 mt-1 select-all break-all text-[12.5px] leading-[1.7] text-forest-deep' : 'spe-share-url'}>{url}</p>
        </div>
      )}
    </div>
  );
}

function IconShare() {
  return (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" width="12" height="12" aria-hidden="true">
      <path d="M6 8.2V1.9M6 1.9 3.9 4M6 1.9 8.1 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.4 6.9v2.8h7.2V6.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
